//! An optional outside speech-to-text engine for the voice assistant: a Python that already has a Whisper model on the
//! GPU (PyTorch). Luna starts it once and keeps it loaded; requests and answers are one JSON line each. Only Luna's own
//! script (luna_voice_server.py, built in and written to voice-engine/) is run, with the Python the user chose.
use serde_json::Value;
use std::io::{BufRead, BufReader, Write};
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{channel, Receiver};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager};

const NO_WINDOW: u32 = 0x0800_0000;

struct Engine {
    python: String,
    child: Child,
    stdin: ChildStdin,
    lines: Receiver<String>,
}
#[derive(Default)]
pub struct VoiceEngine(Mutex<Option<Engine>>);

fn script(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("voice-engine").join("luna_voice_server.py"))
}

/// The engine's next answer line (a JSON object), or an error after `wait`.
fn answer(e: &Engine, wait: Duration) -> Result<Value, String> {
    let line = e.lines.recv_timeout(wait).map_err(|_| "the speech engine did not answer".to_string())?;
    let v: Value = serde_json::from_str(&line).map_err(|_| format!("speech engine: {}", line.chars().take(200).collect::<String>()))?;
    if let Some(err) = v.get("error").and_then(|x| x.as_str()) {
        return Err(format!("speech engine: {err}"));
    }
    Ok(v)
}

fn start(app: &AppHandle, python: &str) -> Result<Engine, String> {
    let py = PathBuf::from(python);
    let name = py.file_name().and_then(|n| n.to_str()).unwrap_or("").to_ascii_lowercase();
    if !(name == "python.exe" || name == "pythonw.exe") || !py.is_file() {
        return Err("choose a python.exe".into());
    }
    // the script ships inside Luna and is (re)written to its folder, so it always matches this build
    let script = script(app)?;
    let body = include_str!("luna_voice_server.py");
    if std::fs::read_to_string(&script).ok().as_deref() != Some(body) {
        std::fs::create_dir_all(script.parent().ok_or("no folder")?).map_err(|e| e.to_string())?;
        std::fs::write(&script, body).map_err(|e| format!("could not write the speech engine script: {e}"))?;
    }
    let mut child = Command::new(&py)
        .arg("-u")
        .arg(&script)
        .env("HF_HUB_OFFLINE", "1")
        .env("PYTHONIOENCODING", "utf-8")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .creation_flags(NO_WINDOW)
        .spawn()
        .map_err(|e| format!("could not start the speech engine: {e}"))?;
    let stdin = child.stdin.take().ok_or("no stdin")?;
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let (tx, lines) = channel();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if tx.send(line).is_err() {
                break;
            }
        }
    });
    let mut e = Engine { python: python.to_string(), child, stdin, lines };
    // loading the model onto the GPU takes a while the first time
    if let Err(err) = answer(&e, Duration::from_secs(180)) {
        let _ = e.child.kill();
        return Err(err);
    }
    Ok(e)
}

fn ready<'a>(app: &AppHandle, slot: &'a mut Option<Engine>, python: &str) -> Result<&'a mut Engine, String> {
    let alive = slot.as_mut().is_some_and(|e| e.python == python && matches!(e.child.try_wait(), Ok(None)));
    if !alive {
        if let Some(mut old) = slot.take() {
            let _ = old.child.kill();
        }
        *slot = Some(start(app, python)?);
    }
    Ok(slot.as_mut().unwrap())
}

/// Starts the engine (loads the model) ahead of the first question.
#[tauri::command]
pub async fn voice_engine_warm(app: AppHandle, python: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<VoiceEngine>();
        let mut slot = state.0.lock().map_err(|_| "busy")?;
        ready(&app, &mut slot, &python).map(|_| ())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// A 16 kHz WAV recording (made by voice_clip) as text.
#[tauri::command]
pub async fn voice_engine_transcribe(app: AppHandle, python: String, path: String, lang: String) -> Result<String, String> {
    if !lang.chars().all(|c| c.is_ascii_lowercase()) || lang.len() > 3 {
        return Err("bad language".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<VoiceEngine>();
        let mut slot = state.0.lock().map_err(|_| "busy")?;
        let e = ready(&app, &mut slot, &python)?;
        let req = serde_json::json!({ "path": path, "lang": lang }).to_string();
        let sent = writeln!(e.stdin, "{req}").and_then(|_| e.stdin.flush());
        if sent.is_err() {
            *slot = None;
            return Err("the speech engine stopped".into());
        }
        let v = answer(e, Duration::from_secs(60))?;
        Ok(v.get("text").and_then(|t| t.as_str()).unwrap_or("").trim().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Stops the engine (frees the GPU memory).
#[tauri::command]
pub fn voice_engine_stop(app: AppHandle) {
    if let Ok(mut slot) = app.state::<VoiceEngine>().0.lock() {
        if let Some(mut e) = slot.take() {
            let _ = e.child.kill();
        }
    }
}

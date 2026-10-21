//! mpv runs as a child process drawing into our window (`--wid`), driven over
//! its JSON IPC named pipe. Every mpv event is forwarded to the UI as `mpv`.

use serde_json::{json, Value};
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::windows::named_pipe::ClientOptions;
use tokio::sync::mpsc;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub struct Mpv {
    tx: mpsc::UnboundedSender<Value>,
    child: Mutex<Option<Child>>,
}

impl Mpv {
    pub fn command(&self, args: Value) {
        let _ = self.tx.send(json!({ "command": args }));
    }

    pub fn kill(&self) {
        if let Some(mut c) = self.child.lock().unwrap().take() {
            let _ = c.kill();
        }
    }
}

#[link(name = "user32")]
unsafe extern "system" {
    fn FindWindowExW(parent: isize, after: isize, class: *const u16, title: *const u16) -> isize;
    fn EnableWindow(hwnd: isize, enable: i32) -> i32;
}

fn disable_child(parent: isize) -> bool {
    let class: Vec<u16> = "mpv\0".encode_utf16().collect();
    let child = unsafe { FindWindowExW(parent, 0, class.as_ptr(), std::ptr::null()) };
    if child == 0 {
        return false;
    }
    unsafe { EnableWindow(child, 0) };
    true
}

pub fn mpv_exe(resource_dir: Option<PathBuf>) -> PathBuf {
    if let Some(dir) = resource_dir {
        let p = dir.join("mpv").join("mpv.exe");
        if p.exists() {
            return p;
        }
    }
    // The source folder is only a fallback while developing; a release build doesn't carry it.
    #[cfg(debug_assertions)]
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    // A release build: beside the exe, else the project's own mpv when the exe sits in the
    // project folder (the copy in its root), found from the exe's place, not a built-in path.
    #[cfg(not(debug_assertions))]
    let dir = {
        let here = std::env::current_exe().ok().and_then(|p| p.parent().map(|d| d.to_path_buf())).unwrap_or_default();
        let project = here.join("app").join("src-tauri");
        if !here.join("mpv").join("mpv.exe").exists() && project.join("mpv").join("mpv.exe").exists() { project } else { here }
    };
    dir.join("mpv").join("mpv.exe")
}

/// yt-dlp next to mpv: the folder build (`yt-dlp\yt-dlp.exe`, starts in ~0.4 s) when it is there,
/// else the one-file build (unpacks itself on every start, ~1.1 s per song).
pub fn ytdlp_exe(mpv: &std::path::Path) -> PathBuf {
    let dir = mpv.with_file_name("yt-dlp").join("yt-dlp.exe");
    if dir.exists() { dir } else { mpv.with_file_name("yt-dlp.exe") }
}

/// Starts mpv idle inside `hwnd` so that opening a file later is instant.
pub fn start(app: AppHandle, exe: PathBuf, hwnd: isize, fonts: PathBuf) -> Mpv {
    let pipe = format!(r"\\.\pipe\modernplayer-{}", std::process::id());
    let ytdlp = ytdlp_exe(&exe);
    let child = Command::new(&exe)
        .arg(format!("--sub-fonts-dir={}", fonts.display()))
        .arg(format!("--script-opts=ytdl_hook-ytdl_path={}", ytdlp.display()))
        .args([
            format!("--wid={hwnd}"),
            format!("--input-ipc-server={pipe}"),
            "--idle=yes".into(),
            "--force-window=yes".into(),
            "--keep-open=yes".into(),
            "--osc=no".into(),
            "--osd-level=0".into(),
            "--input-default-bindings=no".into(),
            "--input-vo-keyboard=no".into(),
            "--cursor-autohide=no".into(),
            // 4K/HDR: GPU decoding, modern renderer, HDR passthrough on HDR
            // screens and tone mapping to SDR everywhere else.
            "--hwdec=auto-safe".into(),
            "--vo=gpu-next".into(),
            "--gpu-api=d3d11".into(),
            "--target-colorspace-hint=yes".into(),
            "--tone-mapping=auto".into(),
            "--hdr-compute-peak=yes".into(),
            "--sub-auto=fuzzy".into(),
            "--slang=tr,tur,en,eng".into(),
            // Newer mpv defaults to a light-grey checkerboard behind the picture; use black bars.
            "--background=color".into(),
            "--background-color=#000000".into(),
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn();
    let spawn_err = child.as_ref().err().map(|e| e.to_string());
    let child = child.ok();

    let (tx, mut rx) = mpsc::unbounded_channel::<Value>();

    tauri::async_runtime::spawn(async move {
        if let Some(e) = spawn_err {
            let _ = app.emit("mpv-error", tr!("Video motoru (mpv) başlatılamadı: {}", "The video engine (mpv) couldn't start: {}", e));
            return;
        }
        // mpv needs a moment to create the pipe; if it never does (crashed at start), give up.
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(20);
        let client = loop {
            match ClientOptions::new().open(&pipe) {
                Ok(c) => break c,
                Err(_) if std::time::Instant::now() < deadline => tokio::time::sleep(std::time::Duration::from_millis(15)).await,
                Err(_) => {
                    let _ = app.emit("mpv-error", tr!("Video motoru (mpv) yanıt vermiyor", "The video engine (mpv) isn't responding"));
                    return;
                }
            }
        };
        let (read, mut write) = tokio::io::split(client);

        tauri::async_runtime::spawn(async move {
            while let Some(msg) = rx.recv().await {
                if write.write_all(format!("{msg}\n").as_bytes()).await.is_err() {
                    break;
                }
            }
        });

        // mpv's video window must never take keyboard focus or clicks from the UI.
        for _ in 0..200 {
            if disable_child(hwnd) {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(25)).await;
        }

        let _ = app.emit("mpv-ready", ());
        let mut lines = BufReader::new(read).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if let Ok(v) = serde_json::from_str::<Value>(&line) {
                if v.get("event").is_some() {
                    if v["name"] == "sub-text" {
                        crate::forward_sub_text(&app, v["data"].as_str().unwrap_or(""));
                    } else if v["name"] == "time-pos" {
                        crate::pgs::set_time(v["data"].as_f64().unwrap_or(0.0));
                        crate::forward_pgs(&app);
                    } else if v["name"] == "sub-delay" {
                        crate::pgs::set_delay(v["data"].as_f64().unwrap_or(0.0));
                        crate::forward_pgs(&app);
                    }
                    let _ = app.emit("mpv", v);
                }
            }
        }
    });

    Mpv { tx, child: Mutex::new(child) }
}

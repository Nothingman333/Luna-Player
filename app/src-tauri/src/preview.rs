//! Seek-bar hover previews. A second, hidden mpv keeps the current video open and
//! paused with `--vo=image`; every seek renders exactly one small JPEG. That is
//! ~60-80 ms per frame even on 4K HEVC, versus ~900 ms for starting mpv per frame.

use serde_json::json;
use tokio::io::{AsyncReadExt, AsyncWriteExt, WriteHalf};
use tokio::net::windows::named_pipe::{ClientOptions, NamedPipeClient};
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::{Duration, Instant};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

struct Worker {
    child: Child,
    // Async (overlapped) pipe: with a plain synchronous handle a pending read blocks every write.
    pipe: WriteHalf<NamedPipeClient>,
    out: PathBuf,
    file: Option<String>,
    /// Number of the last JPEG mpv wrote (it keeps counting even after we delete them).
    n: u32,
}

static WORKER: Mutex<Option<Worker>> = Mutex::new(None);

fn spawn(mpv_exe: &Path) -> Result<Worker, String> {
    let id = std::process::id();
    let pipe_name = format!(r"\\.\pipe\luna-preview-{id}");
    let out = std::env::temp_dir().join(format!("luna-preview-{id}"));
    let _ = std::fs::remove_dir_all(&out);
    std::fs::create_dir_all(&out).map_err(|e| e.to_string())?;
    let child = Command::new(mpv_exe)
        .args([
            "--no-config", "--idle=yes", "--pause", "--keep-open=always", "--force-window=no",
            "--ao=null", "--aid=no", "--sid=no", "--hr-seek=no", "--hwdec=auto-copy-safe",
            "--vo=image", "--vo-image-format=jpg", "--vo-image-jpeg-quality=75", "--vf=scale=320:-2",
            "--demuxer-readahead-secs=0", "--cache=no", "--really-quiet",
        ])
        .arg(format!("--input-ipc-server={pipe_name}"))
        .arg(format!("--vo-image-outdir={}", out.display()))
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| e.to_string())?;
    let pipe = tauri::async_runtime::block_on(async move {
        let start = Instant::now();
        let client = loop {
            match ClientOptions::new().open(&pipe_name) {
                Ok(c) => break c,
                Err(_) if start.elapsed() < Duration::from_secs(5) => tokio::time::sleep(Duration::from_millis(10)).await,
                Err(e) => return Err(tr!("Önizleme başlatılamadı: {}", "Couldn't start the preview: {}", e)),
            }
        };
        let (mut read, write) = tokio::io::split(client);
        // Keep draining mpv's replies and events so its side of the pipe never fills up.
        tauri::async_runtime::spawn(async move {
            let mut buf = [0u8; 4096];
            while matches!(read.read(&mut buf).await, Ok(n) if n > 0) {}
        });
        Ok(write)
    })?;
    Ok(Worker { child, pipe, out, file: None, n: 0 })
}

fn newest_index(dir: &Path) -> u32 {
    std::fs::read_dir(dir)
        .map(|it| {
            it.flatten()
                .filter_map(|e| e.path().file_stem()?.to_str()?.parse::<u32>().ok())
                .max()
                .unwrap_or(0)
        })
        .unwrap_or(0)
}

impl Worker {
    fn send(&mut self, cmd: serde_json::Value) -> Result<(), String> {
        let line = format!("{}
", json!({ "command": cmd }));
        tauri::async_runtime::block_on(self.pipe.write_all(line.as_bytes())).map_err(|e| e.to_string())
    }

    /// Sends `cmd` and returns the JPEG that mpv renders because of it.
    fn render(&mut self, cmd: serde_json::Value, timeout: Duration) -> Result<Vec<u8>, String> {
        let before = self.n.max(newest_index(&self.out));
        self.send(cmd)?;
        let target = self.out.join(format!("{:08}.jpg", before + 1));
        let start = Instant::now();
        while start.elapsed() < timeout {
            if let Ok(b) = std::fs::read(&target) {
                // Complete once the JPEG end marker is there.
                if b.ends_with(&[0xFF, 0xD9]) {
                    self.n = before + 1;
                    for i in 1..=before + 1 {
                        let _ = std::fs::remove_file(self.out.join(format!("{i:08}.jpg")));
                    }
                    return Ok(b);
                }
            }
            std::thread::sleep(Duration::from_millis(4));
        }
        self.n = newest_index(&self.out);
        Err(tr!("Kare alınamadı", "Couldn't grab a frame"))
    }
}

/// JPEG bytes of the frame near `secs` in `file`.
pub fn frame(mpv_exe: &Path, file: &str, secs: u32) -> Result<Vec<u8>, String> {
    let mut guard = WORKER.lock().unwrap();
    let alive = guard.as_mut().is_some_and(|w| matches!(w.child.try_wait(), Ok(None)));
    if !alive {
        *guard = Some(spawn(mpv_exe)?);
    }
    let w = guard.as_mut().unwrap();
    if w.file.as_deref() != Some(file) {
        w.file = None;
        // Open straight at the wanted second: the first rendered frame is the answer.
        let b = w.render(json!(["loadfile", file, "replace", -1, format!("start={secs}")]), Duration::from_secs(20));
        if b.is_ok() {
            w.file = Some(file.to_string());
        }
        return b;
    }
    w.render(json!(["seek", secs, "absolute+keyframes"]), Duration::from_secs(8))
}

/// Closes the open video so it can be deleted or renamed.
pub fn release() {
    if let Some(w) = WORKER.lock().unwrap().as_mut() {
        if w.file.take().is_some() {
            let _ = w.send(json!(["stop"]));
        }
    }
}

pub fn shutdown() {
    if let Some(mut w) = WORKER.lock().unwrap().take() {
        let _ = w.child.kill();
        let _ = std::fs::remove_dir_all(&w.out);
    }
}

#[cfg(test)]
mod tests {
    #[test]
    #[ignore]
    fn timing() {
        let exe = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("mpv").join("mpv.exe");
        let file = std::env::var("LUNA_TEST_VIDEO").unwrap();
        for secs in [0u32, 300, 1500, 2600, 4100, 4150, 300] {
            let t = std::time::Instant::now();
            let b = super::frame(&exe, &file, secs).unwrap();
            println!("{secs}s: {} ms, {} bytes", t.elapsed().as_millis(), b.len());
        }
        super::shutdown();
    }
}

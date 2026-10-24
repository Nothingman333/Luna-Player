//! One isolated, headless mpv for metadata. Requests are serialized; a timeout discards the child.
use serde_json::{json, Value};
use std::{path::{Path, PathBuf}, process::{Child, Command, Stdio}, sync::Mutex, time::Duration};
use std::os::windows::process::CommandExt;
use tokio::{io::{AsyncBufReadExt, AsyncWriteExt, BufReader}, net::windows::named_pipe::{ClientOptions, NamedPipeClient}};

static WORKER: Mutex<Option<Worker>> = Mutex::new(None);
static GENERATION: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
struct Worker { child: Child, pipe: BufReader<NamedPipeClient>, exe: PathBuf, id: u64, started: bool }
impl Drop for Worker { fn drop(&mut self) { let _ = self.child.kill(); let _ = self.child.wait(); } }
impl Worker {
    async fn start(exe: &Path) -> Result<Self, String> {
        let generation = GENERATION.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let name = format!(r"\\.\pipe\luna-probe-{}-{generation}", std::process::id());
        let child = Command::new(exe).args(["--no-config", "--idle=yes", "--pause=yes", "--keep-open=always", "--force-window=no", "--vo=null", "--ao=null", "--hwdec=no", "--no-terminal", "--sub-auto=no", "--audio-file-auto=no", "--ytdl=no"])
            .arg(format!("--input-ipc-server={name}")).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).creation_flags(0x08000000).spawn().map_err(|e| e.to_string())?;
        // Own the child before connecting, including on cancellation/timeout.
        let mut child = ChildGuard(Some(child));
        let pipe = loop {
            match ClientOptions::new().open(&name) {
                Ok(pipe) => break pipe,
                Err(_) => tokio::time::sleep(Duration::from_millis(20)).await,
            }
        };
        Ok(Self { child: child.0.take().ok_or("Probe process unavailable")?, pipe: BufReader::new(pipe), exe: exe.to_path_buf(), id: 0, started: false })
    }
    async fn read(&mut self) -> Result<Value, String> {
        let mut line = String::new();
        if self.pipe.read_line(&mut line).await.map_err(|e| e.to_string())? == 0 { return Err("Metadata process disconnected".into()); }
        let v: Value = serde_json::from_str(&line).map_err(|e| e.to_string())?;
        if v["event"] == "playback-restart" { self.started = true; }
        if v["event"] == "end-file" && v["reason"] == "error" { return Err("Metadata file could not be opened".into()); }
        Ok(v)
    }
    async fn request(&mut self, command: Value) -> Result<Value, String> {
        self.id += 1;
        let id = self.id;
        self.pipe.get_mut().write_all(format!("{}\n", json!({"command":command,"request_id":id})).as_bytes()).await.map_err(|e| e.to_string())?;
        loop {
            let v = self.read().await?;
            if v["request_id"].as_u64() == Some(id) {
                return if v["error"] == "success" { Ok(v["data"].clone()) } else { Err(v["error"].as_str().unwrap_or("Metadata request failed").to_string()) };
            }
        }
    }
    async fn get(&mut self, key: &str) -> Value { self.request(json!(["get_property",key])).await.unwrap_or(Value::Null) }
    async fn probe(&mut self, file: &str) -> Result<crate::files::MediaInfo, String> {
        // Drain the previous stop before starting a new file.
        self.request(json!(["stop"])).await?;
        self.started = false;
        self.request(json!(["loadfile",file,"replace"])).await?;
        while !self.started { self.read().await?; }
        let info = crate::files::MediaInfo {
            width: self.get("width").await.as_u64().unwrap_or(0) as u32,
            height: self.get("height").await.as_u64().unwrap_or(0) as u32,
            codec: self.get("current-tracks/video/codec").await.as_str().unwrap_or("").into(),
            gamma: self.get("video-params/gamma").await.as_str().unwrap_or("").into(),
            dolby_vision: !self.get("current-tracks/video/dolby-vision-profile").await.is_null(),
            audio_codec: self.get("current-tracks/audio/codec").await.as_str().unwrap_or("").into(),
            channels: self.get("current-tracks/audio/demux-channel-count").await.as_u64().unwrap_or(0) as u32,
            duration: self.get("duration").await.as_f64().unwrap_or(0.0),
            size: std::fs::metadata(file).map(|m| m.len()).unwrap_or(0),
        };
        self.request(json!(["stop"])).await?; // Release the media handle before rename/delete.
        Ok(info)
    }
}
struct ChildGuard(Option<Child>);
impl Drop for ChildGuard { fn drop(&mut self) { if let Some(child) = self.0.as_mut() { let _ = child.kill(); let _ = child.wait(); } } }

pub fn probe(exe: &Path, file: &str) -> Result<crate::files::MediaInfo, String> {
    let mut slot = WORKER.lock().unwrap_or_else(|e| e.into_inner());
    tauri::async_runtime::block_on(async {
        let result = tokio::time::timeout(Duration::from_secs(30), async {
            let dead = slot.as_mut().is_some_and(|w| w.exe != exe || w.child.try_wait().ok().flatten().is_some());
            if dead { *slot = None; }
            if slot.is_none() { *slot = Some(Worker::start(exe).await?); }
            slot.as_mut().ok_or("Metadata worker unavailable")?.probe(file).await
        }).await.map_err(|_| "Metadata probe timed out".to_string()).and_then(|r| r);
        if result.is_err() { *slot = None; }
        result
    })
}
pub fn shutdown() { *WORKER.lock().unwrap_or_else(|e| e.into_inner()) = None; }

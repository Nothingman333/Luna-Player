//! mpv runs as a child process drawing into our window (`--wid`), driven over
//! its JSON IPC named pipe. Every mpv event is forwarded to the UI as `mpv`.

use serde_json::{json, Value};
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::windows::named_pipe::ClientOptions;
use tokio::sync::mpsc;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub struct Mpv {
    tx: mpsc::UnboundedSender<Request>,
    child: Arc<Mutex<Option<Child>>>,
    stopped: Arc<AtomicBool>,
}

impl Mpv {
    pub async fn command(&self, args: Value) -> Result<Value, String> {
        let (reply, result) = tokio::sync::oneshot::channel();
        self.tx.send(Request { args, reply }).map_err(|_| "Video engine is unavailable".to_string())?;
        tokio::time::timeout(std::time::Duration::from_secs(30), result).await
            .map_err(|_| "mpv command timed out".to_string())?
            .map_err(|_| "mpv disconnected".to_string())?
    }
    pub fn kill(&self) {
        self.stopped.store(true, Ordering::SeqCst);
        if let Some(mut child) = self.child.lock().unwrap_or_else(|e| e.into_inner()).take() {
            let _ = child.kill(); let _ = child.wait();
        }
    }
}
pub(super) struct Request {
    pub(super) args: Value,
    pub(super) reply: tokio::sync::oneshot::Sender<Result<Value, String>>,
}

#[link(name = "user32")]
unsafe extern "system" {
    fn FindWindowExW(parent: isize, after: isize, class: *const u16, title: *const u16) -> isize;
    fn EnableWindow(hwnd: isize, enable: i32) -> i32;
}

pub(super) fn disable_child(parent: isize) -> bool {
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

/// Own the process and the IPC stream in one task, so reconnects never leave an old writer alive.
pub fn start(app: AppHandle, exe: PathBuf, hwnd: isize, fonts: PathBuf) -> Mpv {
    let child = Arc::new(Mutex::new(None::<Child>));
    let stopped = Arc::new(AtomicBool::new(false));
    let (tx, mut rx) = mpsc::unbounded_channel::<Request>();
    let handle = Mpv { tx, child: child.clone(), stopped: stopped.clone() };
    if let Some(path)=std::env::var_os("LUNA_LIBMPV_DLL").filter(|s|!s.is_empty()) {
        crate::libmpv_backend::start(app,PathBuf::from(path),hwnd,fonts,exe,rx,stopped);
        return handle;
    }
    tauri::async_runtime::spawn(async move {
        let mut replay = Replay::default();
        let mut failures = 0u32;
        let mut generation = 0u64;
        while !stopped.load(Ordering::SeqCst) {
            generation += 1;
            let began = std::time::Instant::now();
            let pipe = format!(r"\\.\pipe\modernplayer-{}-{generation}", std::process::id());
            let ytdlp = ytdlp_exe(&exe);
            let spawned = Command::new(&exe)
                .arg(format!("--sub-fonts-dir={}", fonts.display()))
                .arg(format!("--script-opts=ytdl_hook-ytdl_path={}", ytdlp.display()))
                .args([
                    format!("--wid={hwnd}"), format!("--input-ipc-server={pipe}"),
                    "--no-config".into(), "--audio-client-name=Luna Player".into(), "--title=Luna Player".into(), "--idle=yes".into(), "--force-window=yes".into(),
                    "--prefetch-playlist=yes".into(), "--keep-open=yes".into(), "--osc=no".into(), "--osd-level=0".into(),
                    "--fullscreen=no".into(), "--input-default-bindings=no".into(), "--input-vo-keyboard=no".into(),
                    "--cursor-autohide=no".into(), "--hwdec=auto-safe".into(),
                    "--vo=gpu-next".into(), "--gpu-api=d3d11".into(),
                    "--target-colorspace-hint=auto".into(), "--tone-mapping=auto".into(),
                    "--hdr-compute-peak=yes".into(), "--sub-auto=fuzzy".into(),
                    "--slang=tr,tur,en,eng".into(), "--background=color".into(),
                    "--background-color=#000000".into(), "--screenshot-directory=~~desktop/".into(),
                ]).creation_flags(CREATE_NO_WINDOW).spawn();
            let result: Result<Value, String> = async {
                let spawned = spawned.map_err(|e| format!("mpv: {e}"))?;
                {
                    let mut guard = child.lock().unwrap_or_else(|e| e.into_inner());
                    if stopped.load(Ordering::SeqCst) { let mut c=spawned; let _=c.kill(); let _=c.wait(); return Ok(Value::Null); }
                    *guard = Some(spawned);
                }
                let deadline = std::time::Instant::now() + std::time::Duration::from_secs(20);
                let client = loop {
                    if stopped.load(Ordering::SeqCst) { return Ok(Value::Null); }
                    match ClientOptions::new().open(&pipe) {
                        Ok(client) => break client,
                        Err(_) if std::time::Instant::now() < deadline => tokio::time::sleep(std::time::Duration::from_millis(25)).await,
                        Err(_) => return Err("mpv IPC connection timed out".into()),
                    }
                };
                let (read, mut write) = tokio::io::split(client);
                // The same observers/settings are restored before the last file is reopened.
                if generation > 1 {
                    for args in replay.commands() {
                        write.write_all(format!("{}\n",json!({"command":args})).as_bytes()).await.map_err(|e|e.to_string())?;
                    }
                }
                for _ in 0..200 {
                    if disable_child(hwnd) || stopped.load(Ordering::SeqCst) { break; }
                    tokio::time::sleep(std::time::Duration::from_millis(25)).await;
                }
                let _ = app.emit("mpv-ready", ());
                let mut lines = BufReader::new(read).lines();
                let mut pending = std::collections::HashMap::<u64, tokio::sync::oneshot::Sender<Result<Value,String>>>::new();
                let mut next_id = 1u64;
                let mut recover_file = generation > 1 && replay.file.is_some();
                let mut last_time: Option<(std::time::Instant,f64)> = None;
                let mut connected = true;
                while connected && !stopped.load(Ordering::SeqCst) {
                    tokio::select! {
                        request = rx.recv() => {
                            let Some(request) = request else { return Ok(Value::Null); };
                            if request.args[0] == "loadfile" || request.args[0] == "stop" { recover_file = false; }
                            pending.retain(|_,reply| !reply.is_closed());
                            next_id = next_id.wrapping_add(1);
                            let message = json!({"command":request.args,"request_id":next_id});
                            if let Err(error)=write.write_all(format!("{message}\n").as_bytes()).await {
                                let _=request.reply.send(Err(error.to_string()));
                                connected=false;
                            } else {
                                replay.command(&request.args);
                                pending.insert(next_id,request.reply);
                            }
                        }
                        line = lines.next_line() => {
                            let Ok(Some(line)) = line else { break; };
                            let Ok(mut value)=serde_json::from_str::<Value>(&line) else { continue; };
                            if let Some(id)=value["request_id"].as_u64() {
                                if let Some(reply)=pending.remove(&id) {
                                    let result=if value["error"]=="success" {Ok(value["data"].clone())} else {Err(value["error"].as_str().unwrap_or("mpv command failed").to_string())};
                                    let _=reply.send(result);
                                }
                            }
                            if value.get("event").is_none() {continue;}
                            if value["event"]=="file-loaded" {
                                let pid=child.lock().ok().and_then(|c|c.as_ref().map(|c|c.id())).unwrap_or(0);
                                if pid!=0 { std::thread::spawn(move||brand_audio_session(pid)); }
                            }
                            if value["event"]=="file-loaded" && recover_file {
                                recover_file=false;
                                value["luna_recovered"]=json!(true);
                                for args in [json!(["seek",replay.time,"absolute"]),json!(["set_property","pause",replay.paused])] {
                                    if write.write_all(format!("{}\n",json!({"command":args})).as_bytes()).await.is_err() {connected=false;break;}
                                }
                            }
                            let recovering = recover_file;
                            if value["event"]=="property-change" {
                                match value["name"].as_str().unwrap_or("") {
                                    "path" => {if let Some(path)=value["data"].as_str() {if let Some(file)=replay.queued.remove(path) {replay.file=Some(file);replay.time=0.0;}}},
                                    "sub-text" => crate::forward_sub_text(&app,value["data"].as_str().unwrap_or("")),
                                    "pause" if !recovering => {if let Some(paused)=value["data"].as_bool(){replay.paused=paused;}},
                                    "time-pos" => {
                                        let time=value["data"].as_f64().unwrap_or(0.0);
                                        if !recovering { replay.time=time; }
                                        crate::pgs::set_time(time);
                                        crate::forward_pgs(&app);
                                        // PGS keeps every timestamp. UI receives at most 5/s, plus seeks/clears immediately.
                                        if let Some((instant, previous))=last_time {
                                            if value["data"].is_number() && (time-previous).abs()<1.0 && instant.elapsed()<std::time::Duration::from_millis(200) {continue;}
                                        }
                                        last_time=Some((std::time::Instant::now(),time));
                                    },
                                    "sub-delay" => {crate::pgs::set_delay(value["data"].as_f64().unwrap_or(0.0));crate::forward_pgs(&app);},
                                    _ => (),
                                }
                            }
                            if value["event"]=="start-file" || value["event"]=="seek" {last_time=None;}
                            let _=app.emit("mpv",value);
                        }
                    }
                }
                for (_, reply) in pending {let _=reply.send(Err("mpv disconnected; playback recovery started".into()));}
                if stopped.load(Ordering::SeqCst) {Ok(Value::Null)} else {Err("mpv disconnected".into())}
            }.await;
            if let Some(mut c)=child.lock().unwrap_or_else(|e|e.into_inner()).take() {let _=c.kill();let _=c.wait();}
            if stopped.load(Ordering::SeqCst) || result.is_ok() {break;}
            if began.elapsed()>std::time::Duration::from_secs(60) {failures=0;}
            failures+=1;
            let _=app.emit("mpv-error",if failures<=3 {
                tr!("Video motoru durdu; yeniden başlatılıyor ({}/3).", "The video engine stopped; restarting ({}/3).", failures)
            } else {tr!("Video motoru yeniden başlatılamadı. Luna'yı yeniden açın.", "The video engine could not recover. Reopen Luna.")});
            if failures>3 {break;}
            tokio::time::sleep(std::time::Duration::from_millis(300*failures as u64)).await;
        }
    });
    handle
}

#[derive(Default)]
struct Replay {
    observers: std::collections::BTreeMap<u64,Value>,
    properties: std::collections::BTreeMap<String,Value>,
    file: Option<Value>,
    queued: std::collections::BTreeMap<String,Value>,
    filters: std::collections::BTreeMap<(String,String),Value>,
    time: f64,
    paused: bool,
}
impl Replay {
    fn command(&mut self,args:&Value) {
        match args[0].as_str().unwrap_or("") {
            "observe_property" => {if let Some(id)=args[1].as_u64(){self.observers.insert(id,args.clone());}},
            "unobserve_property" => {if let Some(id)=args[1].as_u64(){self.observers.remove(&id);}},
            "set_property" => {if let Some(name)=args[1].as_str(){
                if matches!(name,"af"|"vf") {self.filters.retain(|(kind,_),_|kind!=name);}
                self.properties.insert(name.to_string(),args.clone());
            }},
            "af" | "vf" => {
                let kind=args[0].as_str().unwrap_or("").to_string();
                let spec=args[2].as_str().unwrap_or("");
                let label=spec.split(':').next().unwrap_or("").to_string();
                if args[1]=="remove" {self.filters.remove(&(kind,label));}
                else {self.filters.insert((kind,label),args.clone());}
            },
            "loadfile" if args[2].as_str().is_none_or(|mode|mode=="replace") => {self.queued.clear();self.file=Some(args.clone());self.time=0.0;},
            "loadfile" if args[2]=="append" => {if let Some(path)=args[1].as_str() {let mut file=args.clone();file[2]=json!("replace");self.queued.insert(path.to_string(),file);}},
            "playlist-clear" => {self.queued.clear();},
            "stop" => {self.queued.clear();self.file=None;self.time=0.0;},
            _ => (),
        }
    }
    fn commands(&self)->Vec<Value> {
        self.observers.values().chain(self.properties.values()).chain(self.filters.values()).cloned().chain(self.file.iter().cloned()).collect()
    }
}

#[cfg(test)]
mod recovery_tests {
    use super::*;
    #[test]
    fn stop_clears_recovery_and_removed_observers_stay_removed() {
        let mut r=Replay::default();
        r.command(&json!(["observe_property",1,"time-pos"]));r.command(&json!(["unobserve_property",1]));
        r.command(&json!(["loadfile","film.mkv","replace"]));r.time=42.0;
        assert_eq!(r.commands().last().unwrap()[1],"film.mkv");
        r.command(&json!(["stop"]));assert!(r.commands().is_empty());assert_eq!(r.time,0.0);
    }
}

// Match only this owned playback process; never rename another application's session.
fn brand_audio_session(pid:u32){
 use windows::{core::{Interface,PCWSTR},Win32::{Media::Audio::{MMDeviceEnumerator,IMMDeviceEnumerator,IAudioSessionManager2,IAudioSessionControl2,eRender,DEVICE_STATE_ACTIVE},System::Com::{CoInitializeEx,CoUninitialize,CoCreateInstance,COINIT_MULTITHREADED,CLSCTX_ALL}}};
 unsafe{
  if CoInitializeEx(None,COINIT_MULTITHREADED).is_err(){return;}
  let name:Vec<u16>="Luna Player\0".encode_utf16().collect();
  let icon:Vec<u16>=std::env::current_exe().unwrap_or_default().to_string_lossy().encode_utf16().chain(Some(0)).collect();
  for _ in 0..4{
   let result=(||->windows::core::Result<()>{
    let devices:IMMDeviceEnumerator=CoCreateInstance(&MMDeviceEnumerator,None,CLSCTX_ALL)?;
    let endpoints=devices.EnumAudioEndpoints(eRender,DEVICE_STATE_ACTIVE)?;
    for d in 0..endpoints.GetCount()?{
     let Ok(endpoint)=endpoints.Item(d)else{continue;};
     let Ok(manager)=endpoint.Activate::<IAudioSessionManager2>(CLSCTX_ALL,None)else{continue;};
     let Ok(sessions)=manager.GetSessionEnumerator()else{continue;};
     for i in 0..sessions.GetCount()?{let session=sessions.GetSession(i)?;let control:IAudioSessionControl2=session.cast()?;if control.GetProcessId()?==pid{session.SetDisplayName(PCWSTR(name.as_ptr()),std::ptr::null())?;session.SetIconPath(PCWSTR(icon.as_ptr()),std::ptr::null())?;}}
    }Ok(())
   })();let _=result;std::thread::sleep(std::time::Duration::from_millis(300));
  }CoUninitialize();
 }
}

/// Reposition the existing decoder's child window; never reload a playing stream.
pub fn dock_rect(parent:isize,rect:Option<[i32;4]>)->Result<(),String>{
    crate::video_host::dock(parent,rect)
}

//! Rolling local-file transcription. Seek/stop cancels the active Whisper job and rejects stale chunks.
use std::{path::{Path,PathBuf},sync::{Arc,Mutex,atomic::{AtomicBool,AtomicU64,Ordering}},collections::BTreeSet,time::{Duration,Instant}};
use serde::Serialize;
use serde_json::json;
use tauri::{Emitter,Manager};
use std::os::windows::process::CommandExt;
#[derive(Clone)]struct Session{generation:u64,cancel:Arc<AtomicBool>,epoch:Arc<AtomicU64>,job_epoch:Arc<AtomicU64>,job:Arc<AtomicU64>}
static CURRENT:Mutex<Option<Session>>=Mutex::new(None);
static NEXT:AtomicU64=AtomicU64::new(1);
static JOB:AtomicU64=AtomicU64::new(1_000_000_000_000);
#[derive(Clone,Default,Serialize)]pub struct Status{running:bool,path:String,generation:u64,error:String}
static STATUS:Mutex<Status>=Mutex::new(Status{running:false,path:String::new(),generation:0,error:String::new()});
fn status(app:&tauri::AppHandle){let _=app.emit_to("main","live-caption-status",STATUS.lock().unwrap_or_else(|e|e.into_inner()).clone());}
fn stale(session:&Session,epoch:u64)->bool{session.cancel.load(Ordering::SeqCst)||session.epoch.load(Ordering::SeqCst)!=epoch}
fn extract(exe:&Path,input:&str,start:f64,path:&Path,session:&Session,epoch:u64)->Result<(),String>{
    let mut child=std::process::Command::new(exe).args(["--no-config","--no-video","--no-sub","--no-terminal","--oac=pcm_s16le","--of=wav","--audio-samplerate=16000","--audio-channels=mono"])
        .arg(format!("--start={start:.3}")).arg("--length=8").arg(format!("--o={}",path.display())).arg("--").arg(input)
        .stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null()).creation_flags(0x08000000).spawn().map_err(|e|e.to_string())?;
    let deadline=Instant::now()+Duration::from_secs(30);loop{
        if stale(session,epoch)||Instant::now()>deadline{let _=child.kill();let _=child.wait();return Err("Live caption extraction cancelled/timed out".into());}
        match child.try_wait(){Ok(Some(code))=>return if code.success(){Ok(())}else{Err("Live caption audio extraction failed".into())},Ok(None)=>std::thread::sleep(Duration::from_millis(40)),Err(e)=>{let _=child.kill();let _=child.wait();return Err(e.to_string());}}
    }
}
struct Folder(PathBuf);
impl Drop for Folder{fn drop(&mut self){if let (Some(parent),Ok(path))=(self.0.parent(),self.0.canonicalize()){if parent.canonicalize().is_ok_and(|root|path.starts_with(root)){let _=std::fs::remove_dir_all(&self.0);}}}}
#[tauri::command]pub fn live_caption_status()->Status{STATUS.lock().unwrap_or_else(|e|e.into_inner()).clone()}
#[tauri::command]
pub async fn live_caption_start(app:tauri::AppHandle,input:String,engine:String,model:String,lang:String)->Result<Status,String>{
    if !Path::new(&input).is_file()||!Path::new(&engine).is_file()||!Path::new(&model).is_file(){return Err("Select a local playing file, Whisper executable and downloaded model".into());}
    let player=crate::MPV.get().ok_or("Video engine unavailable")?;
    if player.command(json!(["get_property","path"])).await?.as_str()!=Some(input.as_str()){return Err("Start live captions for the currently playing local file".into());}
    let mut slot=CURRENT.lock().unwrap_or_else(|e|e.into_inner());if slot.is_some(){return Err("Stop the current live caption session first".into());}
    let generation=NEXT.fetch_add(1,Ordering::SeqCst);let session=Session{generation,cancel:Arc::new(AtomicBool::new(false)),epoch:Arc::new(AtomicU64::new(0)),job_epoch:Arc::new(AtomicU64::new(0)),job:Arc::new(AtomicU64::new(0))};
    let parent=app.path().app_cache_dir().map_err(|e|e.to_string())?.join("live-captions");std::fs::create_dir_all(&parent).map_err(|e|e.to_string())?;
    let nonce=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e|e.to_string())?.as_nanos();let folder=parent.join(format!("{}-{generation}-{nonce}",std::process::id()));std::fs::create_dir(&folder).map_err(|e|e.to_string())?;
    *slot=Some(session.clone());drop(slot);
    *STATUS.lock().unwrap_or_else(|e|e.into_inner())=Status{running:true,path:input.clone(),generation,error:String::new()};status(&app);
    tauri::async_runtime::spawn(async move{
        let _folder=Folder(folder.clone());let mut done=BTreeSet::new();let mut seen_epoch=0;
        let result:Result<(),String>=async{
            while !session.cancel.load(Ordering::SeqCst){
                if player.command(json!(["get_property","path"])).await?.as_str()!=Some(input.as_str()){return Ok(());}
                let time=player.command(json!(["get_property","time-pos"])).await?.as_f64().unwrap_or(0.0);let duration=player.command(json!(["get_property","duration"])).await?.as_f64().unwrap_or(0.0);
                let epoch=session.epoch.load(Ordering::SeqCst);if epoch!=seen_epoch{done.clear();seen_epoch=epoch;}
                let chunk=(time.max(0.0)/8.0).floor() as u64;
                let next=(chunk..=chunk+2).find(|n|!done.contains(n)&&(*n as f64*8.0)<duration);
                let Some(next)=next else{tokio::time::sleep(Duration::from_millis(250)).await;continue;};let start=next as f64*8.0;
                let wav=folder.join(format!("{next}-{epoch}.wav"));let exe=crate::mpv_exe(&app);let file=input.clone();let output=wav.clone();let cancel=session.clone();
                let extraction=crate::blocking(move||extract(&exe,&file,start,&output,&cancel,epoch)).await;
                if stale(&session,epoch){let _=std::fs::remove_file(&wav);continue;}extraction?;
                let job=JOB.fetch_add(1,Ordering::SeqCst);session.job_epoch.store(epoch,Ordering::SeqCst);session.job.store(job,Ordering::SeqCst);
                let srt=crate::studio::whisper_run(app.clone(),job,wav.to_string_lossy().into_owned(),engine.clone(),model.clone(),lang.clone(),false,Some(8.0),None,Some(false),Some("fast".into())).await;
                session.job.store(0,Ordering::SeqCst);let _=std::fs::remove_file(&wav);
                if stale(&session,epoch){continue;}
                let text=srt?;
                let _=app.emit_to("main","live-caption",json!({"generation":generation,"epoch":epoch,"path":input,"offset":start,"text":text}));
                done.insert(next);done.retain(|n|n.saturating_add(8)>=chunk&&*n<=chunk+8);
            }Ok(())
        }.await;
        let mut current=CURRENT.lock().unwrap_or_else(|e|e.into_inner());if current.as_ref().is_some_and(|s|s.generation==generation){*current=None;*STATUS.lock().unwrap_or_else(|e|e.into_inner())=Status{running:false,path:input,generation,error:result.err().unwrap_or_default()};drop(current);status(&app);}
    });
    Ok(STATUS.lock().unwrap_or_else(|e|e.into_inner()).clone())
}
pub fn seek(){if let Some(session)=CURRENT.lock().unwrap_or_else(|e|e.into_inner()).as_ref(){session.epoch.fetch_add(1,Ordering::SeqCst);crate::studio::studio_cancel(session.job.load(Ordering::SeqCst));}}
#[tauri::command]pub fn live_caption_stop(app:tauri::AppHandle){shutdown();status(&app);}
pub fn shutdown(){if let Some(session)=CURRENT.lock().unwrap_or_else(|e|e.into_inner()).take(){session.cancel.store(true,Ordering::SeqCst);crate::studio::studio_cancel(session.job.load(Ordering::SeqCst));}STATUS.lock().unwrap_or_else(|e|e.into_inner()).running=false;}

pub fn job_cancelled(id:u64)->bool{if id<1_000_000_000_000{return false;}CURRENT.lock().unwrap_or_else(|e|e.into_inner()).as_ref().is_none_or(|s|s.job.load(Ordering::SeqCst)!=id||s.cancel.load(Ordering::SeqCst)||s.epoch.load(Ordering::SeqCst)!=s.job_epoch.load(Ordering::SeqCst))}

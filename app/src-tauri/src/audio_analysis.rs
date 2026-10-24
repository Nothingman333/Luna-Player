//! Explicit local audio analysis. No microphone capture or automatic remote recognition.
use std::{path::{Path,PathBuf},process::{Command,Stdio},sync::{Mutex,Arc,atomic::{AtomicBool,AtomicU64,Ordering}},time::{Duration,Instant},collections::HashMap,io::Read};
use std::os::windows::process::CommandExt;
use serde::{Serialize,Deserialize};
use serde_json::Value;
use tauri::Manager;
use rusty_chromaprint::{Configuration,FingerprintCompressor,match_fingerprints};
use base64::{Engine,engine::general_purpose::{URL_SAFE_NO_PAD}};
static JOBS:Mutex<Option<HashMap<u64,Arc<AtomicBool>>>>=Mutex::new(None);
static NEXT:AtomicU64=AtomicU64::new(1);
struct Job(u64,Arc<AtomicBool>);
impl Job{fn new(id:u64)->Result<Self,String>{let mut jobs=JOBS.lock().unwrap_or_else(|e|e.into_inner());let jobs=jobs.get_or_insert_with(HashMap::new);if jobs.len()>=2||jobs.contains_key(&id){return Err("Audio analysis already running".into());}let cancel=Arc::new(AtomicBool::new(false));jobs.insert(id,cancel.clone());Ok(Self(id,cancel))}fn check(&self)->Result<(),String>{if self.1.load(Ordering::SeqCst){Err("Cancelled".into())}else{Ok(())}}}
impl Drop for Job{fn drop(&mut self){if let Some(jobs)=JOBS.lock().unwrap_or_else(|e|e.into_inner()).as_mut(){jobs.remove(&self.0);}}}
#[tauri::command]pub fn audio_analysis_cancel(id:u64){if let Some(job)=JOBS.lock().unwrap_or_else(|e|e.into_inner()).as_ref().and_then(|m|m.get(&id)){job.store(true,Ordering::SeqCst);}}
pub fn shutdown(){if let Some(jobs)=JOBS.lock().unwrap_or_else(|e|e.into_inner()).as_ref(){for job in jobs.values(){job.store(true,Ordering::SeqCst);}}}
struct Temp(PathBuf);
impl Drop for Temp{fn drop(&mut self){let _=std::fs::remove_file(&self.0);}}
fn temp(app:&tauri::AppHandle,extension:&str)->Result<Temp,String>{let folder=app.path().app_cache_dir().map_err(|e|e.to_string())?.join("audio-analysis");std::fs::create_dir_all(&folder).map_err(|e|e.to_string())?;Ok(Temp(folder.join(format!("{}-{}.{}",std::process::id(),NEXT.fetch_add(1,Ordering::SeqCst),extension))))}
fn run(mut command:Command,job:&Job,seconds:u64,output:Option<&Path>,limit:u64)->Result<(),String>{
    job.check()?;let mut child=command.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).creation_flags(0x08000000).spawn().map_err(|e|e.to_string())?;let deadline=Instant::now()+Duration::from_secs(seconds);
    loop{if job.check().is_err()||Instant::now()>deadline||output.and_then(|p|p.metadata().ok()).is_some_and(|m|m.len()>limit){let _=child.kill();let _=child.wait();return Err("Audio task cancelled or exceeded its limit".into());}match child.try_wait(){Ok(Some(code))=>return if code.success(){Ok(())}else{Err("Audio tool failed; check the selected executable and file".into())},Ok(None)=>std::thread::sleep(Duration::from_millis(50)),Err(e)=>{let _=child.kill();let _=child.wait();return Err(e.to_string());}}}
}
fn extract(app:&tauri::AppHandle,input:&str,start:f64,seconds:f64,job:&Job)->Result<Temp,String>{
    if !Path::new(input).is_file()||!start.is_finite()||start<0.0||!seconds.is_finite()||!(1.0..=600.0).contains(&seconds){return Err("Select a local media file and a 1–600 second window".into());}
    let wav=temp(app,"wav")?;let mut command=Command::new(crate::mpv_exe(app));command.args(["--no-config","--no-video","--no-sub","--no-terminal","--ytdl=no","--oac=pcm_s16le","--of=wav","--audio-samplerate=11025","--audio-channels=mono"]).arg(format!("--start={start:.3}")).arg(format!("--length={seconds:.3}")).arg(format!("--o={}",wav.0.display())).arg("--").arg(input);run(command,job,120,Some(&wav.0),16_000_000)?;Ok(wav)
}
fn fingerprint(app:&tauri::AppHandle,input:&str,start:f64,seconds:f64,job:&Job)->Result<Vec<u32>,String>{
    job.check()?;let meta=std::fs::metadata(input).map_err(|e|e.to_string())?;let stamp=meta.modified().ok().and_then(|t|t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d|d.as_nanos()).unwrap_or(0).to_string();let key=crate::stable_cache::key(&[input.as_bytes(),&meta.len().to_le_bytes(),stamp.as_bytes(),&start.to_le_bytes(),&seconds.to_le_bytes(),b"chromaprint-test2-v1"]);
    let folder=app.path().app_cache_dir().map_err(|e|e.to_string())?.join("fingerprints");std::fs::create_dir_all(&folder).map_err(|e|e.to_string())?;let cache=folder.join(format!("{key}.json"));
    if cache.metadata().is_ok_and(|m|m.len()<1_000_000){if let Ok(data)=std::fs::read(&cache){if let Ok(fp)=serde_json::from_slice::<Vec<u32>>(&data){if !fp.is_empty()&&fp.len()<10000{return Ok(fp);}}}}
    let wav=extract(app,input,start,seconds,job)?;let samples=crate::audio_fingerprint::wav_samples(&std::fs::read(&wav.0).map_err(|e|e.to_string())?)?;job.check()?;let result=crate::audio_fingerprint::calculate(&samples)?;job.check()?;
    if result.is_empty(){return Err("Not enough audio for a fingerprint".into());}let _=std::fs::write(cache,serde_json::to_vec(&result).map_err(|e|e.to_string())?);Ok(result)
}
#[derive(Deserialize)]pub struct Window{path:String,start:f64,seconds:f64}
#[derive(Serialize)]pub struct Match{start1:f64,end1:f64,start2:f64,end2:f64,score:f64}
#[tauri::command]pub async fn audio_match(app:tauri::AppHandle,id:u64,first:Window,second:Window)->Result<Vec<Match>,String>{let job=Job::new(id)?;crate::blocking(move||{let a=fingerprint(&app,&first.path,first.start,first.seconds,&job)?;let b=fingerprint(&app,&second.path,second.start,second.seconds,&job)?;job.check()?;let config=Configuration::preset_test2();let matches=match_fingerprints(&a,&b,&config).map_err(|e|e.to_string())?;job.check()?;Ok(matches.into_iter().filter(|s|s.duration(&config)>=15.0&&s.duration(&config)<=120.0&&s.score<=8.0).map(|s|Match{start1:first.start+s.start1(&config)as f64,end1:first.start+s.end1(&config)as f64,start2:second.start+s.start2(&config)as f64,end2:second.start+s.end2(&config)as f64,score:s.score}).collect())}).await}
#[tauri::command]pub async fn audio_identify(app:tauri::AppHandle,id:u64,input:String,client_key:String)->Result<Value,String>{
    if client_key.is_empty()||client_key.len()>200{return Err("Enter your AcoustID application key".into());}let job=Job::new(id)?;let app2=app.clone();let (fp,duration,job)=crate::blocking(move||{let duration=crate::files::probe(&crate::mpv_exe(&app2),&input)?.duration;let fp=fingerprint(&app2,&input,0.0,120.0,&job)?;let config=Configuration::preset_test2();let compressed=URL_SAFE_NO_PAD.encode(FingerprintCompressor::from(&config).compress(&fp));Ok((compressed,duration,job))}).await?;job.check()?;
    static RATE:tokio::sync::Mutex<()>=tokio::sync::Mutex::const_new(());let _rate=RATE.lock().await;job.check()?;tokio::time::sleep(Duration::from_millis(350)).await;job.check()?;
    let response=reqwest::Client::builder().timeout(Duration::from_secs(25)).build().map_err(|e|e.to_string())?.post("https://api.acoustid.org/v2/lookup").form(&[("client",client_key),("duration",format!("{duration:.0}")),("fingerprint",fp),("meta","recordings+releasegroups".into())]).send().await.map_err(|_|"AcoustID request failed")?.error_for_status().map_err(|_|"AcoustID service error")?;
    let mut response=response;let mut bytes=Vec::new();while let Some(chunk)=response.chunk().await.map_err(|_|"AcoustID response failed")?{job.check()?;if bytes.len()+chunk.len()>4_000_000{return Err("Recognition response too large".into());}bytes.extend_from_slice(&chunk);}if bytes.len()>4_000_000{return Err("Recognition response too large".into());}job.check()?;let value:Value=serde_json::from_slice(&bytes).map_err(|e|e.to_string())?;if value["status"]!="ok"{return Err("AcoustID rejected the request; check the application key".into());}Ok(value)
}
#[tauri::command]pub async fn audio_songrec(app:tauri::AppHandle,id:u64,input:String,start:f64,exe:String)->Result<Value,String>{
    if !Path::new(&exe).is_absolute()||!Path::new(&exe).is_file()||!exe.to_lowercase().ends_with(".exe"){return Err("Choose a SongRec command-line executable".into());}let job=Job::new(id)?;
    crate::blocking(move||{let wav=extract(&app,&input,start,20.0,&job)?;let output=temp(&app,"json")?;let file=std::fs::File::create(&output.0).map_err(|e|e.to_string())?;let mut command=Command::new(exe);command.args(["audio-file-to-recognized-song"]).arg(&wav.0).stdout(file);
        // Own stdout separately: run() deliberately silences general tools.
        let mut child=command.stdin(Stdio::null()).stderr(Stdio::null()).creation_flags(0x08000000).spawn().map_err(|e|e.to_string())?;let deadline=Instant::now()+Duration::from_secs(60);loop{if job.check().is_err()||Instant::now()>deadline||output.0.metadata().is_ok_and(|m|m.len()>4_000_000){let _=child.kill();let _=child.wait();return Err("Recognition cancelled or exceeded its limit".into());}match child.try_wait(){Ok(Some(code))if code.success()=>break,Ok(Some(_))=>return Err("SongRec could not recognize the sample".into()),Ok(None)=>std::thread::sleep(Duration::from_millis(50)),Err(e)=>{let _=child.kill();let _=child.wait();return Err(e.to_string());}}}job.check()?;let mut bytes=Vec::new();std::fs::File::open(&output.0).map_err(|e|e.to_string())?.take(4_000_001).read_to_end(&mut bytes).map_err(|e|e.to_string())?;if bytes.len()>4_000_000{return Err("Recognition response too large".into());}serde_json::from_slice(&bytes).map_err(|e|e.to_string())}).await
}
#[tauri::command]pub async fn audio_demucs(app:tauri::AppHandle,id:u64,input:String,exe:String,output:String)->Result<String,String>{
    let _=app;if !Path::new(&input).is_file()||!Path::new(&exe).is_absolute()||!Path::new(&exe).is_file()||!exe.to_lowercase().ends_with(".exe")||!Path::new(&output).is_dir(){return Err("Choose a local file, Demucs executable and output folder".into());}let output=Path::new(&output).join(format!("Luna-Demucs-{}-{}",std::process::id(),NEXT.fetch_add(1,Ordering::SeqCst))).to_string_lossy().into_owned();std::fs::create_dir(&output).map_err(|e|e.to_string())?;let job=Job::new(id)?;crate::blocking(move||{let mut command=Command::new(exe);command.args(["--two-stems=vocals","-n","htdemucs","-o"]).arg(&output).arg("--").arg(&input);run(command,&job,3600,None,0)?;let stem=Path::new(&input).file_stem().ok_or("Missing filename")?;let result=Path::new(&output).join("htdemucs").join(stem).join("no_vocals.wav");if !result.is_file(){return Err("Demucs completed without an instrumental file".into());}Ok(result.to_string_lossy().into_owned())}).await
}


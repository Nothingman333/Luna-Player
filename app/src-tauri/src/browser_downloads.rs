//! Native session download records. URL and filename never act as record identifiers.
use std::{path::PathBuf,sync::{Mutex,atomic::{AtomicU64,Ordering}}};
use tauri::{AppHandle,Manager,Webview,Emitter};
use serde::Serialize;
static NEXT:AtomicU64=AtomicU64::new(1);
#[derive(Clone,Serialize)]
#[serde(rename_all="camelCase")]
pub struct Download{pub id:u64,pub tab:u32,pub url:String,pub path:String,pub name:String,pub state:String,pub bytes:Option<u64>,pub total:Option<u64>,pub can_resume:bool,#[serde(skip)]last_event:Option<std::time::Instant>}
#[derive(Default)]pub struct Downloads(pub Mutex<Vec<Download>>);
fn changed(app:&AppHandle){let _=app.emit_to("main","luna-downloads-changed",());}
pub fn start(app:&AppHandle,tab:u32,url:&str,destination:&mut PathBuf)->Result<u64,String>{
 let state=app.state::<Downloads>();let mut rows=state.0.lock().map_err(|e|e.to_string())?;
 if rows.iter().filter(|r|(matches!(r.state.as_str(),"running"|"paused")||r.can_resume)).count()>=32{return Err("Aynı anda en fazla 32 indirme".into());}
 let name=destination.file_name().and_then(|s|s.to_str()).unwrap_or("download");
 let name:String=name.chars().filter(|c|!c.is_control()&&!matches!(*c,'\u{202a}'..='\u{202e}'|'\u{2066}'..='\u{2069}')&&!"<>:\"/\\|?*".contains(*c)).take(180).collect();let name=name.trim_end_matches([' ','.']);
 let name=if name.is_empty(){"download"}else{name};let device=name.split('.').next().unwrap_or("").to_ascii_uppercase();let reserved=matches!(device.as_str(),"CON"|"PRN"|"AUX"|"NUL")||(device.len()==4&&(device.starts_with("COM")||device.starts_with("LPT"))&&device.as_bytes()[3].is_ascii_digit());let fixed;if reserved{fixed=format!("download-{name}");}else{fixed=name.to_string();}let name=fixed.as_str();let folder=app.path().download_dir().map_err(|e|e.to_string())?;std::fs::create_dir_all(&folder).map_err(|e|e.to_string())?;
 let id=NEXT.fetch_add(1,Ordering::Relaxed);let mut target=folder.join(name);let stem=std::path::Path::new(name).file_stem().and_then(|s|s.to_str()).unwrap_or("download");let ext=std::path::Path::new(name).extension().and_then(|s|s.to_str()).map(|e|format!(".{e}")).unwrap_or_default();
 let mut n=1;while target.exists()||rows.iter().any(|r|r.path==target.to_string_lossy()){target=folder.join(format!("{stem} ({id}-{n}){ext}"));n+=1;if n>1000{return Err("Benzersiz dosya adı oluşturulamadı".into());}}
 *destination=target.clone();let path=target.to_string_lossy().to_string();let name=target.file_name().unwrap().to_string_lossy().to_string();
 rows.insert(0,Download{id,tab,url:url.into(),path,name,state:"running".into(),bytes:Some(0),total:None,can_resume:false,last_event:None});
 // Keep in-flight rows even when the history limit is reached.
 while rows.len()>200{if let Some(i)=rows.iter().rposition(|r|!matches!(r.state.as_str(),"running"|"paused")&&!r.can_resume){rows.remove(i);}else{break;}}
 drop(rows);changed(app);Ok(id)
}

use webview2_com::Microsoft::Web::WebView2::Win32::*;
struct NativeDownload{operation:ICoreWebView2DownloadOperation,bytes_token:i64,state_token:i64}
thread_local!{static OPERATIONS:std::cell::RefCell<std::collections::HashMap<u64,NativeDownload>>=std::cell::RefCell::new(std::collections::HashMap::new());}
fn update(app:&AppHandle,id:u64,operation:&ICoreWebView2DownloadOperation,force:bool)->windows_core::Result<()>{
 let(mut received,mut total,mut state,mut reason,mut resume)=(0,0,COREWEBVIEW2_DOWNLOAD_STATE::default(),COREWEBVIEW2_DOWNLOAD_INTERRUPT_REASON::default(),windows_core::BOOL::default());
 unsafe{operation.BytesReceived(&mut received)?;operation.TotalBytesToReceive(&mut total)?;operation.State(&mut state)?;let _=operation.InterruptReason(&mut reason);let _=operation.CanResume(&mut resume);}
 let terminal=state==COREWEBVIEW2_DOWNLOAD_STATE_COMPLETED||(state==COREWEBVIEW2_DOWNLOAD_STATE_INTERRUPTED&&!resume.as_bool());
 let store=app.state::<Downloads>();if let Ok(mut rows)=store.0.lock(){if let Some(row)=rows.iter_mut().find(|r|r.id==id){
  row.bytes=Some(received.max(0) as u64);row.total=if total>0{Some(total as u64)}else{None};row.can_resume=resume.as_bool();
  row.state=if state==COREWEBVIEW2_DOWNLOAD_STATE_COMPLETED{"done"}else if state==COREWEBVIEW2_DOWNLOAD_STATE_IN_PROGRESS{"running"}else if reason==COREWEBVIEW2_DOWNLOAD_INTERRUPT_REASON_USER_PAUSED{"paused"}else if reason==COREWEBVIEW2_DOWNLOAD_INTERRUPT_REASON_USER_CANCELED{"cancelled"}else{"failed"}.into();
  if force||row.last_event.is_none_or(|at|at.elapsed()>=std::time::Duration::from_millis(250)){row.last_event=Some(std::time::Instant::now());changed(app);}
 }}
 if terminal{if let Some(native)=OPERATIONS.with(|ops|ops.borrow_mut().remove(&id)){unsafe{let _=native.operation.remove_BytesReceivedChanged(native.bytes_token);let _=native.operation.remove_StateChanged(native.state_token);}}}
 Ok(())
}
pub fn watch(view:&Webview,app:AppHandle,tab:u32)->Result<(),String>{
 view.with_webview(move|platform|{
  let failure_app=app.clone();
  use windows_core::Interface;
  let result=(||->windows_core::Result<()>{unsafe{
   let core=platform.controller().CoreWebView2()?.cast::<ICoreWebView2_4>()?;
   let callback=webview2_com::DownloadStartingEventHandler::create(Box::new(move|_,args|{
    let Some(args)=args else{return Ok(())};let op=args.DownloadOperation()?;
    let(mut uri,mut dest)=(windows_core::PWSTR::null(),windows_core::PWSTR::null());op.Uri(&mut uri)?;args.ResultFilePath(&mut dest)?;
    let url=webview2_com::take_pwstr(uri);let mut destination=PathBuf::from(webview2_com::take_pwstr(dest));
    let id=match start(&app,tab,&url,&mut destination){Ok(id)=>id,Err(e)=>{args.SetCancel(true)?;crate::browser::event(&app,tab,"download-rejected",e);return Ok(())}};
    if let Err(e)=args.SetResultFilePath(&windows_core::HSTRING::from(destination.as_path())).and_then(|_|args.SetHandled(true)){
     let _=args.SetCancel(true);if let Ok(mut rows)=app.state::<Downloads>().0.lock(){if let Some(row)=rows.iter_mut().find(|r|r.id==id){row.state="failed".into();}}changed(&app);return Err(e);
    }
    let(mut bytes_token,mut state_token)=(0,0);let notify=app.clone();
    let bytes=webview2_com::BytesReceivedChangedEventHandler::create(Box::new(move|op,_|{if let Some(op)=op{update(&notify,id,&op,false)?;}Ok(())}));
    let notify=app.clone();let state=webview2_com::StateChangedEventHandler::create(Box::new(move|op,_|{if let Some(op)=op{update(&notify,id,&op,true)?;}Ok(())}));
    if let Err(e)=op.add_BytesReceivedChanged(&bytes,&mut bytes_token).and_then(|_|op.add_StateChanged(&state,&mut state_token)){
     let _=op.remove_BytesReceivedChanged(bytes_token);let _=args.SetCancel(true);if let Ok(mut rows)=app.state::<Downloads>().0.lock(){if let Some(row)=rows.iter_mut().find(|r|r.id==id){row.state="failed".into();}}changed(&app);return Err(e);
    }
    OPERATIONS.with(|ops|ops.borrow_mut().insert(id,NativeDownload{operation:op.clone(),bytes_token,state_token}));
    update(&app,id,&op,true)?;crate::browser::event(&app,tab,"download-start",String::new());Ok(())
   }));let mut token=0;core.add_DownloadStarting(&callback,&mut token)?;Ok(())
  }})();if let Err(e)=result{crate::browser::event(&failure_app,tab,"download-rejected",format!("İndirme desteği başlatılamadı: {e}"));}
 }).map_err(|e|e.to_string())
}
#[tauri::command]
pub async fn browser_downloads(app:AppHandle,caller:Webview,action:String,id:Option<u64>,reveal:Option<bool>)->Result<Vec<Download>,String>{
 if caller.label()!="main"{return Err("Luna ana penceresi gerekli".into());}
 if matches!(action.as_str(),"pause"|"resume"|"cancel"){
  let id=id.ok_or("İndirme kimliği eksik")?;let (tx,rx)=tokio::sync::oneshot::channel();let command=action.clone();
  app.run_on_main_thread(move||{let result=(||->Result<(),String>{let op=OPERATIONS.with(|ops|ops.borrow().get(&id).map(|n|n.operation.clone())).ok_or("İndirme artık etkin değil")?;
   unsafe{match command.as_str(){"pause"=>op.Pause(),"resume"=>op.Resume(),_=>op.Cancel()}.map_err(|e|e.to_string())?;}Ok(())})();let _=tx.send(result);
  }).map_err(|e|e.to_string())?;
  tokio::time::timeout(std::time::Duration::from_secs(10),rx).await.map_err(|_|"İndirme işlemi zaman aşımına uğradı")?.map_err(|e|e.to_string())??;
 }
 let state=app.state::<Downloads>();let mut rows=state.0.lock().map_err(|e|e.to_string())?;
 match action.as_str(){
  "list"|"pause"|"resume"|"cancel"=>{},
  "clear"=>rows.retain(|r|matches!(r.state.as_str(),"running"|"paused")||r.can_resume),
  "forget"=>{let i=rows.iter().position(|r|Some(r.id)==id).ok_or("İndirme bulunamadı")?;if matches!(rows[i].state.as_str(),"running"|"paused")||rows[i].can_resume{return Err("Süren indirme listeden silinemez".into());}rows.remove(i);},
  "open"=>{let row=rows.iter().find(|r|Some(r.id)==id&&r.state=="done").ok_or("Tamamlanmış indirme bulunamadı")?;let p=std::path::Path::new(&row.path);if !p.is_file(){return Err("İndirilen dosya taşınmış veya silinmiş".into());}
   // Unknown, active-content and executable types are only revealed, never launched.
   let ext=p.extension().and_then(|s|s.to_str()).unwrap_or("").to_ascii_lowercase();let safe=matches!(ext.as_str(),"mp4"|"mkv"|"webm"|"mp3"|"flac"|"wav"|"ogg"|"jpg"|"jpeg"|"png"|"webp"|"gif"|"txt"|"pdf"|"epub");
   let mut cmd=std::process::Command::new("explorer.exe");if reveal.unwrap_or(false)||!safe{cmd.arg(format!("/select,{}",p.display()));}else{cmd.arg(p);}
   use std::os::windows::process::CommandExt;cmd.creation_flags(0x08000000).spawn().map_err(|e|e.to_string())?;
  },_=>return Err("Geçersiz indirme işlemi".into())
 }Ok(rows.clone())
}

/// Component teardown/reload must not leave native tabs and download callbacks orphaned.
pub async fn abort_tab(app:&AppHandle,tab:u32)->Result<(),String>{
 let app=app.clone();let(tx,rx)=tokio::sync::oneshot::channel();let notify=app.clone();
 app.run_on_main_thread(move||{
  let ids=notify.state::<Downloads>().0.lock().map(|rows|rows.iter().filter(|r|r.tab==tab&&(matches!(r.state.as_str(),"running"|"paused")||r.can_resume)).map(|r|r.id).collect::<Vec<_>>()).unwrap_or_default();
  for id in &ids{let native=OPERATIONS.with(|ops|ops.borrow_mut().remove(id));if let Some(native)=native{unsafe{let _=native.operation.remove_BytesReceivedChanged(native.bytes_token);let _=native.operation.remove_StateChanged(native.state_token);let _=native.operation.Cancel();}}}
  if let Ok(mut rows)=notify.state::<Downloads>().0.lock(){for row in rows.iter_mut().filter(|r|ids.contains(&r.id)){row.state="cancelled".into();row.can_resume=false;}}
  changed(&notify);let _=tx.send(());
 }).map_err(|e|e.to_string())?;
 tokio::time::timeout(std::time::Duration::from_secs(10),rx).await.map_err(|_|"Sekme indirmeleri kapatılamadı")?.map_err(|e|e.to_string())?;Ok(())
}

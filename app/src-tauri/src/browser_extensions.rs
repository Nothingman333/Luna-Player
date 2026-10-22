//! Extension package preparation and actual WebView2 profile management.
use std::{collections::{HashMap,HashSet},path::PathBuf,sync::{Arc,Mutex,atomic::{AtomicBool,AtomicU64,Ordering}}};
use tauri::{AppHandle,Manager,Webview};
use serde_json::{Value,json};
use crate::extension_package::{self as package,Preview};
#[derive(Default)]pub struct Extensions{pending:Mutex<HashMap<String,PathBuf>>,attempted:Mutex<HashSet<String>>,busy:AtomicBool}
static NEXT:AtomicU64=AtomicU64::new(1);
fn trusted(caller:&Webview)->Result<(),String>{if caller.label()=="main"{Ok(())}else{Err("Luna ana penceresi gerekli".into())}}
struct Guard<'a>(&'a AtomicBool);impl Drop for Guard<'_>{fn drop(&mut self){self.0.store(false,Ordering::SeqCst);}}
fn lock(state:&Extensions)->Result<Guard<'_>,String>{if state.busy.swap(true,Ordering::SeqCst){Err("Başka bir eklenti işlemi sürüyor".into())}else{Ok(Guard(&state.busy))}}
async fn runtime_version(app:&AppHandle)->Result<String,String>{
 let view=app.get_webview("main").ok_or("Luna penceresi kapandı")?;let(tx,rx)=tokio::sync::oneshot::channel();
 view.with_webview(move|platform|{use windows_core::Interface;use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2_2;
  let result=(||->windows_core::Result<String>{unsafe{let env=platform.controller().CoreWebView2()?.cast::<ICoreWebView2_2>()?.Environment()?;let mut version=windows_core::PWSTR::null();env.BrowserVersionString(&mut version)?;Ok(webview2_com::take_pwstr(version).split_whitespace().next().unwrap_or("").to_string())}})().map_err(|e|e.to_string());let _=tx.send(result);
 }).map_err(|e|e.to_string())?;
 tokio::time::timeout(std::time::Duration::from_secs(10),rx).await.map_err(|_|"WebView2 sürümü okunamadı")?.map_err(|e|e.to_string())?
}
#[tauri::command]
pub async fn browser_extension_prepare(app:AppHandle,caller:Webview,source:String,kind:String)->Result<Preview,String>{
 trusted(&caller)?;let state=app.state::<Extensions>();let _guard=lock(&state)?;
 if state.pending.lock().map_err(|e|e.to_string())?.len()>=8{return Err("Önce bekleyen eklenti önizlemesini kapat.".into());}
 let token=format!("{:x}-{:x}",std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e|e.to_string())?.as_nanos(),NEXT.fetch_add(1,Ordering::Relaxed));
 let root=app.path().app_local_data_dir().map_err(|e|e.to_string())?.join("web-extension-packages");std::fs::create_dir_all(&root).map_err(|e|e.to_string())?;
 let dest=root.join(&token);std::fs::create_dir(&dest).map_err(|e|e.to_string())?;
 let result=async{
  let (data,origin,expected)=if kind=="store"{
   let id=package::store_id(&source)?;let version=runtime_version(&app).await?;
   let client=reqwest::Client::builder().timeout(std::time::Duration::from_secs(45)).redirect(reqwest::redirect::Policy::custom(|attempt|{
    let allowed=attempt.url().scheme()=="https"&&matches!(attempt.url().host_str(),Some("update.googleapis.com"|"clients2.google.com"|"clients2.googleusercontent.com"));
    if attempt.previous().len()>5||!allowed{attempt.error("Mağaza yönlendirmesi reddedildi")}else{attempt.follow()}
   })).build().map_err(|e|e.to_string())?;
   let mut response=client.get("https://clients2.google.com/service/update2/crx").query(&[("response","redirect"),("prodversion",version.as_str()),("acceptformat","crx3"),("x",&format!("id={id}&installsource=ondemand&uc"))]).send().await.map_err(|e|e.to_string())?.error_for_status().map_err(|e|format!("Mağaza paketi alınamadı: {e}"))?;
   if response.content_length().is_some_and(|n|n>package::PACKAGE_LIMIT){return Err("Mağaza paketi 32 MB sınırını aşıyor".into());}
   let mut data=Vec::new();while let Some(chunk)=response.chunk().await.map_err(|e|e.to_string())?{if data.len()+chunk.len()>package::PACKAGE_LIMIT as usize{return Err("Mağaza paketi çok büyük".into());}data.extend_from_slice(&chunk);}
   (Some(data),format!("https://chromewebstore.google.com/detail/{id}"),Some(id))
  }else if kind=="file"{let path=PathBuf::from(&source);let data=package::bounded_read(&path,package::PACKAGE_LIMIT)?;(Some(data),"Yerel ZIP/CRX paketi".into(),None)}
  else if kind=="folder"{(None,"Yerel eklenti klasörü".into(),None)}else{return Err("Geçersiz kaynak türü".into());};
  let target=dest.clone();let tok=token.clone();
  tauri::async_runtime::spawn_blocking(move||{let signed=data.as_ref().is_some_and(|data|data.starts_with(b"Cr24"));let bytes=if let Some(data)=data{package::unpack(&data,&target,expected.as_deref())?}else{package::copy_folder(std::path::Path::new(&source),&target)?};package::preview(&target,tok,origin,bytes,signed)}).await.map_err(|e|e.to_string())?
 }.await;
 match result{Ok(preview)=>{state.pending.lock().map_err(|e|e.to_string())?.insert(token,dest);Ok(preview)},Err(e)=>{let _=trash::delete(&dest);Err(e)}}
}
type Answer=Arc<Mutex<Option<tokio::sync::oneshot::Sender<Result<Value,String>>>>>;
fn answer(tx:&Answer,v:Result<Value,String>){if let Ok(mut tx)=tx.lock(){if let Some(tx)=tx.take(){let _=tx.send(v);}}}
unsafe fn describe(e:&webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2BrowserExtension)->windows_core::Result<Value>{
 let(mut id,mut name,mut enabled)=(windows_core::PWSTR::null(),windows_core::PWSTR::null(),Default::default());
 unsafe{e.Id(&mut id)?;e.Name(&mut name)?;e.IsEnabled(&mut enabled)?;}
 Ok(json!({"id":webview2_com::take_pwstr(id),"name":webview2_com::take_pwstr(name),"enabled":enabled.as_bool()}))
}
async fn runtime(app:&AppHandle,action:String,id:String,path:Option<PathBuf>,enabled:bool)->Result<Value,String>{
 let view=app.webviews().into_values().find(|v|v.label().starts_with("luna-web-")).ok_or("Eklentileri yönetmek için önce Luna içinde bir web sekmesi aç.")?;
 let(tx,rx)=tokio::sync::oneshot::channel();let tx:Answer=Arc::new(Mutex::new(Some(tx)));let fail=tx.clone();
 view.with_webview(move|platform|{
  use windows_core::Interface;
  use webview2_com::Microsoft::Web::WebView2::Win32::{ICoreWebView2_13,ICoreWebView2Profile7};
  let result=(||->windows_core::Result<()>{unsafe{
   let profile=platform.controller().CoreWebView2()?.cast::<ICoreWebView2_13>()?.Profile()?.cast::<ICoreWebView2Profile7>()?;
   if action=="install"{
    let path=path.ok_or_else(||windows_core::Error::from(windows_core::HRESULT(0x80070057u32 as i32)))?;let done=tx.clone();
    let callback=webview2_com::ProfileAddBrowserExtensionCompletedHandler::create(Box::new(move|status,extension|{let result=status.and_then(|_|unsafe{describe(&extension.ok_or_else(||windows_core::Error::from(windows_core::HRESULT(0x80004005u32 as i32)))?)}).map_err(|e|format!("WebView2 eklentiyi yükleyemedi: {e}"));answer(&done,result);Ok(())}));
    profile.AddBrowserExtension(&windows_core::HSTRING::from(path.as_path()),&callback)?;
   }else{
    let done=tx.clone();let callback=webview2_com::ProfileGetBrowserExtensionsCompletedHandler::create(Box::new(move|status,list|{
     let result=(||->windows_core::Result<Option<Value>>{status?;let list=list.ok_or_else(||windows_core::Error::from(windows_core::HRESULT(0x80004005u32 as i32)))?;let mut count=0;unsafe{list.Count(&mut count)?;}
      let mut rows=Vec::new();for i in 0..count{let item=unsafe{list.GetValueAtIndex(i)?};let row=unsafe{describe(&item)?};
       if action!="list"&&row["id"].as_str()==Some(&id){let done=done.clone();
        if action=="remove"{let handler=webview2_com::BrowserExtensionRemoveCompletedHandler::create(Box::new(move|status|{answer(&done,status.map(|_|Value::Null).map_err(|e|e.to_string()));Ok(())}));unsafe{item.Remove(&handler)?;}}
        else if action=="enable"{let handler=webview2_com::BrowserExtensionEnableCompletedHandler::create(Box::new(move|status|{answer(&done,status.map(|_|Value::Null).map_err(|e|e.to_string()));Ok(())}));unsafe{item.Enable(enabled,&handler)?;}}
        return Ok(None);
       }rows.push(row);
      }if action=="list"{Ok(Some(json!(rows)))}else{Err(windows_core::Error::from(windows_core::HRESULT(0x80070002u32 as i32)))}
     })();match result{Ok(Some(v))=>answer(&done,Ok(v)),Ok(None)=>{},Err(e)=>answer(&done,Err(e.to_string()))}Ok(())
    }));profile.GetBrowserExtensions(&callback)?;
   }Ok(())
  }})();if let Err(e)=result{answer(&fail,Err(format!("WebView2 eklenti desteği kullanılamıyor. WebView2 Runtime güncellemesini kontrol et: {e}")));}
 }).map_err(|e|e.to_string())?;
 tokio::time::timeout(std::time::Duration::from_secs(20),rx).await.map_err(|_|"Eklenti işlemi zaman aşımına uğradı; sonucu görmek için listeyi yenile.".to_string())?.map_err(|e|e.to_string())?
}
#[tauri::command]
pub async fn browser_extension_manage(app:AppHandle,caller:Webview,action:String,id:Option<String>,enabled:Option<bool>)->Result<Value,String>{
 trusted(&caller)?;let state=app.state::<Extensions>();let _guard=lock(&state)?;
 if !matches!(action.as_str(),"list"|"enable"|"remove"|"install"|"discard"){return Err("Geçersiz işlem".into());}
 let id=id.unwrap_or_default();
 if action=="discard"{if let Some(path)=state.pending.lock().map_err(|e|e.to_string())?.remove(&id){if !state.attempted.lock().map_err(|e|e.to_string())?.remove(&id){let _=trash::delete(path);}}return Ok(Value::Null);}
 let path=if action=="install"{Some(state.pending.lock().map_err(|e|e.to_string())?.get(&id).cloned().ok_or("Önizleme süresi doldu; paketi yeniden seç.")?)}else{None};
 if action=="install"{state.attempted.lock().map_err(|e|e.to_string())?.insert(id.clone());}
 let result=runtime(&app,action.clone(),id.clone(),path,enabled.unwrap_or(false)).await;
 if action=="install"&&result.is_ok(){state.pending.lock().map_err(|e|e.to_string())?.remove(&id);state.attempted.lock().map_err(|e|e.to_string())?.remove(&id);}
 // On an uncertain install result keep its immutable source: a late WebView2 callback may have installed it.
 result
}

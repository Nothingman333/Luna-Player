//! Network filtering for remote webviews only. Never evaluates filter-list code in Luna's UI.
use adblock::{Engine, lists::{FilterSet, ParseOptions}, request::Request};
use serde::{Deserialize, Serialize};
use std::{collections::HashSet, path::PathBuf, sync::{LazyLock, Mutex}, time::{Duration, SystemTime}};
use tauri::{AppHandle, Manager, Webview};
use webview2_com::Microsoft::Web::WebView2::Win32::*;
use windows_core::{HSTRING, Interface, PWSTR};
const LISTS: [&str;2] = ["https://easylist.to/easylist/easylist.txt", "https://easylist.to/easylist/easyprivacy.txt"];
const BUILTIN: &str = "||doubleclick.net^\n||google-analytics.com^\n||googlesyndication.com^\n||adservice.google.com^\n";
#[derive(Default,Serialize,Deserialize)]
struct Preferences { disabled: HashSet<String> }
struct State { engine: Engine, prefs: Preferences, blocked: u64, complete: bool, error: bool }
static STATE: LazyLock<Mutex<State>> = LazyLock::new(|| Mutex::new(State {engine:compile(BUILTIN.to_string()),prefs:Preferences::default(),blocked:0,complete:false,error:false}));
fn compile(text: String) -> Engine { let mut set=FilterSet::new(false);set.add_filter_list(text,ParseOptions::default());Engine::new_with_filter_set(set) }
fn dir(app:&AppHandle)->Result<PathBuf,String>{Ok(app.path().app_local_data_dir().map_err(|e|e.to_string())?.join("adblock"))}
fn atomic(path:&std::path::Path,bytes:&[u8])->Result<(),String>{let tmp=path.with_extension("tmp");std::fs::write(&tmp,bytes).map_err(|e|e.to_string())?;std::fs::rename(tmp,path).map_err(|e|e.to_string())}
fn origin(url:&str)->Option<String>{let u=tauri::Url::parse(url).ok()?;if !matches!(u.scheme(),"http"|"https")||!u.username().is_empty()||u.password().is_some(){return None;}Some(u.origin().ascii_serialization())}

pub fn start(app:AppHandle){
    tauri::async_runtime::spawn(async move {
        let Ok(dir)=dir(&app) else{return};
        let cache=dir.clone();
        let _=tauri::async_runtime::spawn_blocking(move||{
            let _=std::fs::create_dir_all(&cache);
            let mut state=STATE.lock().unwrap_or_else(|e|e.into_inner());
            if let Ok(bytes)=std::fs::read(cache.join("engine-0.13.bin")){if bytes.len()<=64*1024*1024&&state.engine.deserialize(&bytes).is_ok(){state.complete=true;}}
            if let Ok(text)=std::fs::read_to_string(cache.join("sites.json")){if let Ok(prefs)=serde_json::from_str::<Preferences>(&text){state.prefs=Preferences{disabled:prefs.disabled.into_iter().filter(|s|origin(s).as_ref()==Some(s)).take(200).collect()};}}
        }).await;
        loop {
            let fresh=std::fs::metadata(dir.join("engine-0.13.bin")).and_then(|m|m.modified()).ok().and_then(|t|SystemTime::now().duration_since(t).ok()).is_some_and(|age|age<Duration::from_secs(7*86400));
            if !fresh {if refresh(&dir).await.is_err(){STATE.lock().unwrap_or_else(|e|e.into_inner()).error=true;}}
            tokio::time::sleep(Duration::from_secs(86400)).await;
        }
    });
}
async fn refresh(dir:&std::path::Path)->Result<(),String>{
    let client=reqwest::Client::builder().timeout(Duration::from_secs(45)).build().map_err(|e|e.to_string())?;
    let mut all=String::from(BUILTIN);
    for url in LISTS {
        let mut response=client.get(url).send().await.map_err(|e|e.to_string())?.error_for_status().map_err(|e|e.to_string())?;
        let mut bytes=Vec::new();
        while let Some(chunk)=response.chunk().await.map_err(|e|e.to_string())?{if bytes.len()+chunk.len()>20*1024*1024{return Err("Filter list exceeds limit".into());}bytes.extend_from_slice(&chunk);}
        let text=String::from_utf8(bytes).map_err(|e|e.to_string())?;
        if !text.starts_with("[Adblock")||text.lines().count()<1000{return Err("Invalid filter subscription".into());}
        all.push('\n');all.push_str(&text);
    }
    let path=dir.join("engine-0.13.bin");
    tauri::async_runtime::spawn_blocking(move||{
        let engine=compile(all);atomic(&path,&engine.serialize())?;
        let mut state=STATE.lock().unwrap_or_else(|e|e.into_inner());state.engine=engine;state.complete=true;state.error=false;Ok(())
    }).await.map_err(|e|e.to_string())?
}
fn blocked(url:&str,source:&str,kind:&str,method:&str)->bool{
    let Some(site)=origin(source)else{return false};
    let Ok(request)=Request::new(url,source,kind,method)else{return false};
    let mut state=STATE.lock().unwrap_or_else(|e|e.into_inner());
    if state.prefs.disabled.contains(&site){return false;}
    let matched=state.engine.check_network_request(&request).should_block();
    if matched{state.blocked=state.blocked.saturating_add(1);}matched
}
pub fn watch(view:&Webview)->Result<(),String>{
    view.with_webview(move|platform|{
        let result=(||->windows_core::Result<()>{unsafe{
            let core=platform.controller().CoreWebView2()?;
            let environment=core.cast::<ICoreWebView2_2>()?.Environment()?;
            core.AddWebResourceRequestedFilter(&HSTRING::from("*"),COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL)?;
            let handler=webview2_com::WebResourceRequestedEventHandler::create(Box::new(move|sender,args|{
                let (Some(core),Some(args))=(sender,args)else{return Ok(())};
                let mut context=COREWEBVIEW2_WEB_RESOURCE_CONTEXT::default();args.ResourceContext(&mut context)?;
                // Never replace the top document with a blocked response.
                if context==COREWEBVIEW2_WEB_RESOURCE_CONTEXT_DOCUMENT{return Ok(());}
                let request=args.Request()?;
                let (mut uri,mut source,mut method)=(PWSTR::null(),PWSTR::null(),PWSTR::null());
                request.Uri(&mut uri)?;core.Source(&mut source)?;request.Method(&mut method)?;
                let (uri,source,method)=(webview2_com::take_pwstr(uri),webview2_com::take_pwstr(source),webview2_com::take_pwstr(method));
                let kind=match context{COREWEBVIEW2_WEB_RESOURCE_CONTEXT_SCRIPT=>"script",COREWEBVIEW2_WEB_RESOURCE_CONTEXT_IMAGE=>"image",COREWEBVIEW2_WEB_RESOURCE_CONTEXT_STYLESHEET=>"stylesheet",COREWEBVIEW2_WEB_RESOURCE_CONTEXT_FONT=>"font",COREWEBVIEW2_WEB_RESOURCE_CONTEXT_MEDIA=>"media",COREWEBVIEW2_WEB_RESOURCE_CONTEXT_XML_HTTP_REQUEST|COREWEBVIEW2_WEB_RESOURCE_CONTEXT_FETCH=>"xmlhttprequest",COREWEBVIEW2_WEB_RESOURCE_CONTEXT_WEBSOCKET=>"websocket",_=>"other"};
                if blocked(&uri,&source,kind,&method){let response=environment.CreateWebResourceResponse(None,403,&HSTRING::from("Blocked by Luna"),&HSTRING::from("Content-Length: 0\r\nCache-Control: no-store"))?;args.SetResponse(&response)?;}
                Ok(())
            }));let mut token=0;core.add_WebResourceRequested(&handler,&mut token)?;Ok(())
        }})();if result.is_err(){/* Older runtimes keep browsing; status is surfaced in site preferences. */ STATE.lock().unwrap_or_else(|e|e.into_inner()).error=true;}
    }).map_err(|e|e.to_string())
}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct Status{enabled:bool,blocked:u64,complete:bool,error:bool}
#[tauri::command]
pub async fn browser_adblock(app:AppHandle,caller:Webview,site:String,enabled:Option<bool>)->Result<Status,String>{
    if caller.label()!="main"{return Err("Main Luna window required".into());}
    let site=origin(&site).ok_or("HTTP site required")?;
    let dir=dir(&app)?;
    crate::blocking(move||{
        let mut state=STATE.lock().unwrap_or_else(|e|e.into_inner());
        if let Some(on)=enabled{
            let mut disabled=state.prefs.disabled.clone();if on{disabled.remove(&site);}else{if disabled.len()>=200&&!disabled.contains(&site){return Err("Site preference limit reached".into());}disabled.insert(site.clone());}
            std::fs::create_dir_all(&dir).map_err(|e|e.to_string())?;
            atomic(&dir.join("sites.json"),&serde_json::to_vec(&Preferences{disabled:disabled.clone()}).map_err(|e|e.to_string())?)?;state.prefs.disabled=disabled;
        }
        Ok(Status{enabled:!state.prefs.disabled.contains(&site),blocked:state.blocked,complete:state.complete,error:state.error})
    }).await
}

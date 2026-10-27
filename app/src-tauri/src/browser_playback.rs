//! UI-thread frame handles; no remote page receives a native command bridge.
use std::{cell::RefCell,collections::{BTreeMap,BTreeSet},sync::Mutex};
use tauri::Webview;use windows_core::{Interface,HSTRING};
use webview2_com::{Microsoft::Web::WebView2::Win32::*,ExecuteScriptCompletedHandler,FrameCreatedEventHandler,FrameChildFrameCreatedEventHandler,FrameDOMContentLoadedEventHandler};
static HELD:Mutex<BTreeSet<u32>>=Mutex::new(BTreeSet::new());
thread_local!{static FRAMES:RefCell<BTreeMap<u32,Vec<ICoreWebView2Frame2>>>=RefCell::new(BTreeMap::new());}
pub fn held(id:u32)->bool{HELD.lock().is_ok_and(|s|s.contains(&id))}
fn script(id:u32)->HSTRING{HSTRING::from(format!("{};window.__lunaHoldMedia({});",include_str!("../../src/browserHold.js"),held(id)))}
fn apply(id:u32,frame:&ICoreWebView2Frame2){let done=ExecuteScriptCompletedHandler::create(Box::new(|_,_|Ok(())));let _=unsafe{frame.ExecuteScript(&script(id),&done)};}
fn watch(id:u32,frame:ICoreWebView2Frame){
 let Ok(f)=frame.cast::<ICoreWebView2Frame2>()else{return};
 let added=FRAMES.with(|all|{let mut all=all.borrow_mut();let rows=all.entry(id).or_default();rows.retain(|f|{let mut gone=Default::default();unsafe{f.IsDestroyed(&mut gone)}.is_ok()&&!bool::from(gone)});if rows.len()>=64||rows.iter().any(|r|r==&f){return false}rows.push(f.clone());true});if !added{return}
 let callback=FrameDOMContentLoadedEventHandler::create(Box::new(move|sender,_|{if let Some(sender)=sender{if let Ok(f)=sender.cast::<ICoreWebView2Frame2>(){apply(id,&f);}}Ok(())}));let mut token=0;let _=unsafe{f.add_DOMContentLoaded(&callback,&mut token)};
 if let Ok(children)=frame.cast::<ICoreWebView2Frame7>(){let callback=FrameChildFrameCreatedEventHandler::create(Box::new(move|_,args|{if let Some(args)=args{watch(id,unsafe{args.Frame()?});}Ok(())}));let _=unsafe{children.add_FrameCreated(&callback,&mut token)};}
 apply(id,&f);
}
pub fn attach(core:&ICoreWebView2,id:u32){if let Ok(frames)=core.cast::<ICoreWebView2_4>(){let callback=FrameCreatedEventHandler::create(Box::new(move|_,args|{if let Some(args)=args{watch(id,unsafe{args.Frame()?});}Ok(())}));let mut token=0;let _=unsafe{frames.add_FrameCreated(&callback,&mut token)};}}
pub fn control(view:&Webview,id:u32,on:bool)->Result<(),String>{if let Ok(mut set)=HELD.lock(){if on{set.insert(id);}else{set.remove(&id);}}
 view.with_webview(move|platform|{if let Ok(core)=unsafe{platform.controller().CoreWebView2()}{let done=ExecuteScriptCompletedHandler::create(Box::new(|_,_|Ok(())));let _=unsafe{core.ExecuteScript(&script(id),&done)};FRAMES.with(|all|{if let Some(rows)=all.borrow().get(&id){for f in rows{apply(id,f);}}});}}).map_err(|e|e.to_string())
}
pub fn close(view:&Webview,id:u32){if let Ok(mut set)=HELD.lock(){set.remove(&id);}let _=view.with_webview(move|_|{FRAMES.with(|all|{all.borrow_mut().remove(&id);});});}

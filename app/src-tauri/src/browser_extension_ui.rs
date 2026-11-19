//! Toolbar UI metadata comes only from installed extension packages; no site IPC.
use tauri::{AppHandle,Manager};
use serde_json::{Value,json};
use std::path::{Path,PathBuf};
fn root(app:&AppHandle)->Result<PathBuf,String>{Ok(app.path().app_local_data_dir().map_err(|e|e.to_string())?.join("web-extension-packages"))}
pub fn remember(app:&AppHandle,id:&str,path:&Path)->Result<(),String>{
 if !valid_id(id){return Err("Geçersiz eklenti kimliği".into());}
 let base=root(app)?;let path=path.canonicalize().map_err(|e|e.to_string())?;if !path.starts_with(base.canonicalize().map_err(|e|e.to_string())?){return Err("Geçersiz eklenti konumu".into());}
 std::fs::write(base.join(format!("installed-{id}.json")),serde_json::to_vec(&path.to_string_lossy()).map_err(|e|e.to_string())?).map_err(|e|e.to_string())
}
fn valid_id(id:&str)->bool{id.len()==32&&id.bytes().all(|c|(b'a'..=b'p').contains(&c))}
fn package(app:&AppHandle,row:&Value)->Option<PathBuf>{
 let base=root(app).ok()?;let id=row["id"].as_str()?;if !valid_id(id){return None;}
 if let Ok(data)=crate::extension_package::bounded_read(&base.join(format!("installed-{id}.json")),8192){if let Ok(path)=serde_json::from_slice::<String>(&data){let path=PathBuf::from(path).canonicalize().ok()?;if path.starts_with(base.canonicalize().ok()?){return Some(path);}}}
 // Read the existing profile's recorded package path for installs made before toolbar support.
 let profile=app.path().app_local_data_dir().ok()?.join("web-profile/EBWebView/Default");
 for file in ["Secure Preferences","Preferences"]{if let Ok(data)=crate::extension_package::bounded_read(&profile.join(file),16*1024*1024){if let Ok(prefs)=serde_json::from_slice::<Value>(&data){if let Some(path)=prefs.pointer(&format!("/extensions/settings/{id}/path")).and_then(Value::as_str){if let Ok(path)=PathBuf::from(path).canonicalize(){if path.starts_with(base.canonicalize().ok()?){return Some(path);}}}}}}
 // Only an unambiguous localized name is used as the last upgrade fallback.
 let mut matches=Vec::new();for entry in std::fs::read_dir(&base).ok()?.take(256).flatten(){let path=entry.path();if !entry.file_type().ok()?.is_dir(){continue;}
  if let Some(m)=manifest(&path){let mut name=m["name"].as_str().unwrap_or("").to_string();if name.starts_with("__MSG_")&&name.ends_with("__")&&name.len()>8{if let Some(locale)=m["default_locale"].as_str().filter(|v|v.len()<30&&v.bytes().all(|c|c.is_ascii_alphanumeric()||c==b'_'||c==b'-')){if let Ok(data)=crate::extension_package::bounded_read(&path.join("_locales").join(locale).join("messages.json"),1024*1024){if let Ok(messages)=serde_json::from_slice::<Value>(&data){let key=&name[6..name.len()-2];if let Some(value)=messages.as_object().and_then(|v|v.iter().find(|(k,_)|k.eq_ignore_ascii_case(key))).and_then(|(_,v)|v["message"].as_str()){name=value.into();}}}}}if Some(name.as_str())==row["name"].as_str(){matches.push(path);}}
 }
 if matches.len()==1{matches.pop()}else{None}
}
fn manifest(path:&Path)->Option<Value>{serde_json::from_slice(&crate::extension_package::bounded_read(&path.join("manifest.json"),1024*1024).ok()?).ok()}
fn resource(path:&Path,value:&str)->Option<PathBuf>{
 if value.is_empty()||value.len()>2048||value.contains(['\\','?', '#', ':']){return None;}
 let relative=Path::new(value);if relative.components().any(|c|!matches!(c,std::path::Component::Normal(_))){return None;}
 let target=path.join(relative).canonicalize().ok()?;target.starts_with(path.canonicalize().ok()?).then_some(target)
}
fn popup_page(m:&Value)->Option<&str>{m.pointer("/action/default_popup").or_else(||m.pointer("/browser_action/default_popup")).or_else(||m.pointer("/page_action/default_popup")).or_else(||m.pointer("/options_ui/page")).or_else(||m.get("options_page")).and_then(Value::as_str)}
/// Chrome manifests may declare the toolbar icon only at 19/38 px, or as a plain string. Look at every action
/// shape first and only then fall back to the package-level `icons` table; ignoring that made pinned extensions
/// show a letter instead of their real icon.
fn icon_value(m:&Value)->Option<&str>{
 const KEYS:[&str;8]=["64","48","32","128","38","24","19","16"];
 let sources:Vec<&Value>=[m.pointer("/action/default_icon"),m.pointer("/browser_action/default_icon"),m.pointer("/page_action/default_icon"),m.get("icons")].into_iter().flatten().collect();
 for source in &sources{if let Some(value)=source.as_str().filter(|value|!value.is_empty()){return Some(value);}}
 for key in KEYS{for source in &sources{if let Some(value)=source.get(key).and_then(Value::as_str){return Some(value);}}}
 None
}
pub fn enrich(app:&AppHandle,rows:&mut Value){
 for row in rows.as_array_mut().into_iter().flatten(){let Some(path)=package(app,row)else{continue};let Some(m)=manifest(&path)else{continue};row["popup"]=json!(popup_page(&m).and_then(|v|resource(&path,v)).is_some());
  row["version"]=json!(m["version"].as_str().unwrap_or(""));row["description"]=json!(localize(&path,&m,m["description"].as_str().unwrap_or("")).chars().take(300).collect::<String>());
  row["worker"]=json!(m.pointer("/background/service_worker").is_some()||m.pointer("/background/page").is_some()||m.pointer("/background/scripts").is_some());
  if let Some(file)=icon_value(&m).and_then(|v|resource(&path,v)){let mime=match file.extension().and_then(|v|v.to_str()).unwrap_or("").to_ascii_lowercase().as_str(){"png"=>"image/png","jpg"|"jpeg"=>"image/jpeg","webp"=>"image/webp",_=>continue};if let Ok(data)=crate::extension_package::bounded_read(&file,256*1024){use base64::Engine;row["icon"]=json!(format!("data:{mime};base64,{}",base64::engine::general_purpose::STANDARD.encode(data)));}}
 }
}
/// Resolves `__MSG_key__` from the package's Turkish, then default locale; plain text is returned as is.
fn localize(path:&Path,m:&Value,text:&str)->String{
 let Some(key)=text.strip_prefix("__MSG_").and_then(|v|v.strip_suffix("__")).filter(|v|!v.is_empty())else{return text.to_string()};
 let default=m["default_locale"].as_str().filter(|v|v.len()<30&&v.bytes().all(|c|c.is_ascii_alphanumeric()||c==b'_'||c==b'-'));
 for locale in ["tr"].into_iter().chain(default){
  let Ok(data)=crate::extension_package::bounded_read(&path.join("_locales").join(locale).join("messages.json"),1024*1024)else{continue};
  let Ok(messages)=serde_json::from_slice::<Value>(&data)else{continue};
  if let Some(v)=messages.as_object().and_then(|v|v.iter().find(|(k,_)|k.eq_ignore_ascii_case(key))).and_then(|(_,v)|v["message"].as_str()){return v.to_string();}
 }
 text.to_string()
}
fn strings(v:&Value)->Vec<String>{v.as_array().into_iter().flatten().filter_map(|v|v.as_str()).map(str::to_string).collect()}
fn folder_size(path:&Path)->u64{
 let(mut total,mut stack,mut seen)=(0u64,vec![path.to_path_buf()],0usize);
 while let Some(dir)=stack.pop(){let Ok(entries)=std::fs::read_dir(&dir)else{continue};for entry in entries.flatten(){seen+=1;if seen>20000{return total;}let Ok(kind)=entry.file_type()else{continue};if kind.is_dir(){stack.push(entry.path());}else if kind.is_file(){total+=entry.metadata().map(|m|m.len()).unwrap_or(0);}}}
 total
}
fn options_page(m:&Value)->Option<&str>{m.pointer("/options_ui/page").or_else(||m.get("options_page")).and_then(Value::as_str)}
/// Everything Chrome's extension "Details" page shows that the package itself can tell us.
pub fn details(app:&AppHandle,row:&Value)->Result<Value,String>{
 let path=package(app,row).ok_or("Eklentinin paket klasörü bulunamadı")?;let m=manifest(&path).ok_or("Eklenti manifesti okunamadı")?;
 let hosts_like=|p:&str|p.contains("://")||p=="<all_urls>";
 let mut permissions=strings(&m["permissions"]);let mut hosts=strings(&m["host_permissions"]);
 hosts.extend(permissions.iter().filter(|p|hosts_like(p)).cloned());permissions.retain(|p|!hosts_like(p));
 let mut optional=strings(&m["optional_permissions"]);optional.extend(strings(&m["optional_host_permissions"]));
 let mut sites:Vec<String>=m["content_scripts"].as_array().into_iter().flatten().flat_map(|s|strings(&s["matches"])).collect();sites.sort();sites.dedup();
 let commands:Vec<Value>=m["commands"].as_object().into_iter().flatten().take(64).map(|(name,c)|{
  let key=c.pointer("/suggested_key/windows").or_else(||c.pointer("/suggested_key/default")).or_else(||c.get("suggested_key").filter(|v|v.is_string())).and_then(Value::as_str).unwrap_or("");
  let description=match name.as_str(){"_execute_action"|"_execute_browser_action"|"_execute_page_action"=>"Uzantıyı etkinleştir".to_string(),_=>localize(&path,&m,c["description"].as_str().unwrap_or(name))};
  json!({"name":name,"description":description,"key":key})
 }).collect();
 let worker=m.pointer("/background/service_worker").and_then(Value::as_str).map(str::to_string).or_else(||m.pointer("/background/page").and_then(Value::as_str).map(str::to_string)).or_else(||m.pointer("/background/scripts").map(|v|strings(v).join(", ")).filter(|v|!v.is_empty()));
 let store=path.join("_metadata").join("verified_contents.json").is_file()||m.get("update_url").and_then(Value::as_str).is_some_and(|u|u.contains("clients2.google.com"));
 let id=row["id"].as_str().unwrap_or("");
 Ok(json!({
  "id":id,"name":row["name"],"enabled":row["enabled"],"icon":row.get("icon").cloned().unwrap_or(Value::Null),
  "version":m["version"].as_str().unwrap_or(""),"versionName":m["version_name"].as_str().unwrap_or(""),
  "description":localize(&path,&m,m["description"].as_str().unwrap_or("")),"manifestVersion":m["manifest_version"].as_u64().unwrap_or(2),
  "permissions":permissions,"hosts":hosts,"optional":optional,"sites":sites,"commands":commands,
  "homepage":m["homepage_url"].as_str().filter(|u|u.starts_with("https://")||u.starts_with("http://")).unwrap_or(""),
  "author":m["author"].as_str().or_else(||m.pointer("/author/email").and_then(Value::as_str)).unwrap_or(""),
  "minimumChrome":m["minimum_chrome_version"].as_str().unwrap_or(""),"incognito":m["incognito"].as_str().unwrap_or(""),
  "worker":worker,"options":options_page(&m).and_then(|v|resource(&path,v)).is_some(),"popup":popup_page(&m).and_then(|v|resource(&path,v)).is_some(),
  "source":if store{"store"}else{"local"},"storeUrl":if store{format!("https://chromewebstore.google.com/detail/{id}")}else{String::new()},
  "path":path.to_string_lossy(),"bytes":folder_size(&path),
 }))
}
pub fn reveal(app:&AppHandle,row:&Value)->Result<(),String>{
 let path=package(app,row).ok_or("Eklentinin paket klasörü bulunamadı")?;
 use std::os::windows::process::CommandExt;
 std::process::Command::new("explorer.exe").arg(&path).creation_flags(0x08000000).spawn().map_err(|e|e.to_string())?;Ok(())
}
const OPTIONS_LABEL:&str="luna-extension-options";
/// The extension's own options page in a normal Luna window on the shared web profile, like Chrome's "Extension options".
pub fn options(app:&AppHandle,row:&Value)->Result<(),String>{
 let id=row["id"].as_str().filter(|id|valid_id(id)).ok_or("Geçersiz eklenti")?;
 if row["enabled"].as_bool()!=Some(true){return Err("Önce eklentiyi etkinleştir.".into());}
 let path=package(app,row).ok_or("Eklentinin paket klasörü bulunamadı")?;let m=manifest(&path).ok_or("Eklenti manifesti okunamadı")?;
 let page=options_page(&m).filter(|v|resource(&path,v).is_some()).ok_or("Bu eklentinin ayar sayfası yok")?;
 let url=tauri::Url::parse(&format!("chrome-extension://{id}/{page}")).map_err(|e|e.to_string())?;
 if let Some(old)=app.get_webview_window(OPTIONS_LABEL){let _=old.destroy();}
 let host=id.to_string();let profile=app.path().app_local_data_dir().map_err(|e|e.to_string())?.join("web-profile");
 let title=format!("{} · {}",row["name"].as_str().unwrap_or("Eklenti"),"Seçenekler");
 tauri::WebviewWindowBuilder::new(app,OPTIONS_LABEL,tauri::WebviewUrl::External(url)).title(title).inner_size(960.0,720.0).center().data_directory(profile).browser_extensions_enabled(true).on_navigation(move|url|url.scheme()=="chrome-extension"&&url.host_str()==Some(host.as_str())).on_new_window(|_,_|tauri::webview::NewWindowResponse::Deny).on_download(|_,_|false).on_permission_request(|_,_|tauri::webview::PermissionResponse::Deny).build().map_err(|e|e.to_string())?;
 Ok(())
}
#[derive(serde::Deserialize)]
pub struct PopupAnchor{pub x:f64,pub y:f64,pub width:f64,pub height:f64}
const POPUP_LABEL:&str="luna-extension-popup";
static LAST_CLOSED:std::sync::Mutex<Option<(String,std::time::Instant)>>=std::sync::Mutex::new(None);
/// Closes the open toolbar popup, if any. Remembers which one closed so a click on its own icon toggles it off.
pub fn close_popup(app:&AppHandle){
 if let Some(view)=app.get_webview(POPUP_LABEL){
  let ext=view.url().ok().and_then(|u|u.host_str().map(str::to_string)).unwrap_or_default();
  if let Ok(mut last)=LAST_CLOSED.lock(){*last=Some((ext,std::time::Instant::now()));}
  let _=view.close();
 }
}
/// Chrome-style extension popup as a child of Luna's own window, beside the tab webviews: extensions ask for the
/// active tab of their window, and a separate popup window only ever found itself ("about:"). The popup closes when
/// focus leaves it (a click on the page or on Luna) or when its icon is clicked again.
pub fn popup(app:&AppHandle,row:&Value,anchor:PopupAnchor,page:Option<String>)->Result<(),String>{
 let id=row["id"].as_str().filter(|id|valid_id(id)).ok_or("Geçersiz eklenti")?;
 if row["enabled"].as_bool()!=Some(true){return Err("Önce eklentiyi etkinleştir.".into());}
 let path=package(app,row).ok_or("Eklentinin arayüz dosyası bulunamadı; eklenti yöneticisinden kontrol et.")?;
 let m=manifest(&path).ok_or("Eklenti manifesti okunamadı")?;
 let file=popup_page(&m).filter(|v|resource(&path,v).is_some()).ok_or("Bu eklenti açılabilir bir pencere veya ayar sayfası sunmuyor; arka planda çalışır.")?;
 let url=tauri::Url::parse(&format!("chrome-extension://{id}/{file}")).map_err(|e|e.to_string())?;
 let open_id=app.get_webview(POPUP_LABEL).and_then(|v|v.url().ok()).and_then(|u|u.host_str().map(str::to_string));
 close_popup(app);
 if open_id.as_deref()==Some(id){return Ok(());}
 if let Ok(last)=LAST_CLOSED.lock(){if last.as_ref().is_some_and(|(ext,at)|ext==id&&at.elapsed()<std::time::Duration::from_millis(450)){return Ok(());}}
 let main=crate::main_window(app).ok_or("Luna penceresi kapalı")?;
 let scale=main.scale_factor().map_err(|e|e.to_string())?;
 let area=main.inner_size().map_err(|e|e.to_string())?;
 let (aw,ah)=(area.width as i32,area.height as i32);
 let margin=(8.0*scale).round() as i32;
 let width=((400.0*scale).round() as i32).min((aw-margin*2).max(240));
 let height=((560.0*scale).round() as i32).min((ah-margin*2).max(240));
 let mut x=((anchor.x+anchor.width)*scale).round() as i32-width;
 let mut y=((anchor.y+anchor.height)*scale).round() as i32+margin/2;
 if y+height>ah-margin{y=(ah-height-margin).max(margin);}
 x=x.clamp(margin,(aw-width-margin).max(margin));
 let host=id.to_string();let profile=app.path().app_local_data_dir().map_err(|e|e.to_string())?.join("web-profile");
 let page=page.filter(|p|p.starts_with("http://")||p.starts_with("https://")||p.starts_with("file:")).unwrap_or_default();
 let shim=include_str!("../../src/browserExtensionPopup.js").replace("__LUNA_PAGE__",&serde_json::to_string(&page).map_err(|e|e.to_string())?);
 let builder=tauri::webview::WebviewBuilder::new(POPUP_LABEL,tauri::WebviewUrl::External(url)).data_directory(profile).browser_extensions_enabled(true).disable_drag_drop_handler().focused(true).initialization_script(&shim).on_navigation(move|url|url.scheme()=="chrome-extension"&&url.host_str()==Some(host.as_str())).on_new_window(|_,_|tauri::webview::NewWindowResponse::Deny).on_download(|_,_|false).on_permission_request(|_,_|tauri::webview::PermissionResponse::Deny);
 let view=main.add_child(builder,tauri::PhysicalPosition::new(x,y),tauri::PhysicalSize::new(width as u32,height as u32)).map_err(|e|e.to_string())?;
 crate::browser::dlog(app,&format!("extension popup {id} at {x},{y} {width}x{height} page={}",!page.is_empty()));
 let closer=app.clone();let opened=std::time::Instant::now();
 view.with_webview(move|platform|{
  #[link(name="user32")]
  unsafe extern "system"{fn SetWindowPos(hwnd:isize,after:isize,x:i32,y:i32,width:i32,height:i32,flags:u32)->i32;}
  // Like the assistant bubble: lift its own child container above the tab pages, or it opens hidden behind them.
  let mut hwnd=Default::default();
  unsafe{if platform.controller().ParentWindow(&mut hwnd).is_ok(){let _=SetWindowPos(hwnd.0 as isize,0,0,0,0,0,0x0013);}}
  let app=closer.clone();
  let handler=webview2_com::FocusChangedEventHandler::create(Box::new(move|_,_|{
   // The click that opened it can still settle focus on Luna; only a later focus change closes the popup.
   if opened.elapsed()<std::time::Duration::from_millis(500){return Ok(());}
   // Close outside this UI-thread callback; a short delay lets a click on the same icon see LAST_CLOSED.
   let app=app.clone();tauri::async_runtime::spawn(async move{tokio::time::sleep(std::time::Duration::from_millis(60)).await;crate::browser::dlog(&app,"extension popup closed: focus left");close_popup(&app);});Ok(())
  }));
  let mut token=0i64;unsafe{let _=platform.controller().add_LostFocus(&handler,&mut token);let _=platform.controller().MoveFocus(webview2_com::Microsoft::Web::WebView2::Win32::COREWEBVIEW2_MOVE_FOCUS_REASON_PROGRAMMATIC);}
 }).map_err(|e|e.to_string())?;
 Ok(())
}
#[cfg(test)]
mod tests{
 use super::*;
 #[test]
 fn toolbar_icon_uses_action_sizes_and_falls_back_to_package_icons(){
  let dark=json!({"action":{"default_icon":{"19":"icons/dr_active_19.png","38":"icons/dr_active_38.png"}},"icons":{"16":"icons/dr_16.png","48":"icons/dr_48.png"}});
  assert_eq!(icon_value(&dark),Some("icons/dr_48.png"));
  let only_large=json!({"action":{"default_icon":{"19":"a.png","38":"b.png"}},"icons":{"128":"c.png"}});
  assert_eq!(icon_value(&only_large),Some("c.png"));
  assert_eq!(icon_value(&json!({"action":{"default_icon":"icon.png"}})),Some("icon.png"));
  assert_eq!(icon_value(&json!({"icons":{"32":"icon32.png"}})),Some("icon32.png"));
  assert_eq!(icon_value(&json!({})),None);
 }
}

//! Explicit developer capture and readable report export. Credentials never enter telemetry.
use std::{fs, num::NonZeroU32, path::PathBuf, sync::Mutex, time::{Duration, Instant}};
use base64::{engine::general_purpose::STANDARD, Engine};
use ring::{pbkdf2, rand::{SecureRandom, SystemRandom}};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Webview};

#[derive(Default)]
struct Session { token: String, failures: u32, retry: Option<Instant> }
static SESSION: Mutex<Session> = Mutex::new(Session {token:String::new(),failures:0,retry:None});
fn dev_origin_ok(scheme:&str,host:Option<&str>,port:Option<u16>,development:bool)->bool{matches!((scheme,host),("tauri",Some("localhost"))|("http"|"https",Some("tauri.localhost"))) || (development && scheme=="http" && matches!(host,Some("localhost"|"127.0.0.1")) && port==Some(1420))}
fn trusted(caller:&Webview)->Result<(),String>{let url=caller.url().map_err(|_|"Developer origin unavailable")?;if caller.label()=="main"&&dev_origin_ok(url.scheme(),url.host_str(),url.port(),cfg!(debug_assertions)){Ok(())}else{Err("Developer tools require Luna's local main UI".into())}}
fn random<const N:usize>()->Result<[u8;N],String>{let mut b=[0;N];SystemRandom::new().fill(&mut b).map_err(|_|"Random generator failed")?;Ok(b)}
fn auth_path(app:&AppHandle)->Result<PathBuf,String>{Ok(app.path().app_local_data_dir().map_err(|e|e.to_string())?.join("developer-auth.json"))}
// Only the owner's developer password opens the tools (PBKDF2 verifiers; the password itself is never stored).
const BUILTIN_SALT:[u8;16]=[81,43,66,219,247,147,82,70,161,161,249,23,133,131,89,105];
const BUILTIN:[[u8;32];2]=[[122,41,111,62,210,183,238,121,201,237,95,146,217,236,86,143,128,232,232,33,143,175,46,138,195,187,59,161,68,183,208,176],[88,101,67,38,142,83,175,215,90,210,179,161,116,219,40,137,42,92,166,167,117,93,182,249,205,34,53,59,136,254,63,196]];
fn rounds()->NonZeroU32{NonZeroU32::new(600_000).unwrap()}
fn valid(session:&Session,token:&str)->bool{!token.is_empty()&&session.token==token}
fn authorize(token:&str)->Result<(),String>{let s=SESSION.lock().map_err(|_|"Developer lock unavailable")?;if valid(&s,token){Ok(())}else{Err("Developer session locked or expired".into())}}
#[tauri::command]
pub fn dev_auth_status(app:AppHandle,caller:Webview)->Result<bool,String>{trusted(&caller)?;let _=auth_path(&app)?;Ok(true)}
#[tauri::command]
pub fn dev_unlock(app:AppHandle,caller:Webview,password:String,setup:bool)->Result<String,String>{
 trusted(&caller)?;
 if password.len()>1024{return Err("Password too long".into())}
 let mut s=SESSION.lock().map_err(|_|"Developer lock unavailable")?;
 if s.retry.is_some_and(|t|Instant::now()<t){return Err("Please wait before trying again".into())}
 if setup{return Err("Developer password setup is disabled".into())}
 let _=&app;
 if !BUILTIN.iter().any(|v|pbkdf2::verify(pbkdf2::PBKDF2_HMAC_SHA256,rounds(),&BUILTIN_SALT,password.as_bytes(),v).is_ok()){s.failures+=1;s.retry=Some(Instant::now()+Duration::from_secs(if s.failures>=5{30}else{1}));return Err("Incorrect developer password".into())}
 // Remember this computer: a random key sealed for this Windows user (DPAPI) lets the next start resume without the
 // password. The password itself is never stored; Lock deletes the key.
 if let Ok(path)=remember_path(&app){if let Ok(sealed)=seal(&[REMEMBER_MAGIC,&random::<32>()?].concat()){let _=fs::write(path,sealed);}}
 let token=STANDARD.encode(random::<32>()?);s.token=token.clone();s.failures=0;s.retry=None;Ok(token)
}
const REMEMBER_MAGIC:&[u8]=b"luna-dev-remember-v1";
fn remember_path(app:&AppHandle)->Result<PathBuf,String>{Ok(app.path().app_local_data_dir().map_err(|e|e.to_string())?.join("developer-remember.bin"))}
/// Resumes a remembered developer session on this computer and Windows user, or returns None (password needed).
#[tauri::command]
pub fn dev_resume(app:AppHandle,caller:Webview)->Result<Option<String>,String>{
 trusted(&caller)?;
 let Ok(sealed)=fs::read(remember_path(&app)?) else {return Ok(None)};
 match unseal(&sealed){Ok(plain) if plain.len()==REMEMBER_MAGIC.len()+32&&plain.starts_with(REMEMBER_MAGIC)=>{},_=>return Ok(None)}
 let mut s=SESSION.lock().map_err(|_|"Developer lock unavailable")?;
 if s.token.is_empty(){s.token=STANDARD.encode(random::<32>()?);}
 Ok(Some(s.token.clone()))
}
#[cfg(not(windows))]fn seal(_: &[u8])->Result<Vec<u8>,String>{Err("Remember requires Windows".into())}
#[cfg(not(windows))]fn unseal(_: &[u8])->Result<Vec<u8>,String>{Err("Remember requires Windows".into())}
#[cfg(windows)]#[repr(C)]struct Blob{len:u32,data:*mut u8}
#[cfg(windows)]#[link(name="crypt32")]unsafe extern "system"{fn CryptProtectData(input:*const Blob,desc:*const u16,entropy:*const Blob,reserved:*const u8,prompt:*const u8,flags:u32,out:*mut Blob)->i32;fn CryptUnprotectData(input:*const Blob,desc:*mut *mut u16,entropy:*const Blob,reserved:*const u8,prompt:*const u8,flags:u32,out:*mut Blob)->i32;}
#[cfg(windows)]#[link(name="kernel32")]unsafe extern "system"{fn LocalFree(h:*mut u8)->*mut u8;}
#[cfg(windows)]fn dpapi(data:&[u8],protect:bool)->Result<Vec<u8>,String>{
 let input=Blob{len:data.len() as u32,data:data.as_ptr() as *mut u8};let mut out=Blob{len:0,data:std::ptr::null_mut()};
 // 1 = CRYPTPROTECT_UI_FORBIDDEN
 let ok=unsafe{if protect{CryptProtectData(&input,std::ptr::null(),std::ptr::null(),std::ptr::null(),std::ptr::null(),1,&mut out)}else{CryptUnprotectData(&input,std::ptr::null_mut(),std::ptr::null(),std::ptr::null(),std::ptr::null(),1,&mut out)}};
 if ok==0||out.data.is_null(){return Err("Protected storage unavailable".into())}
 let v=unsafe{std::slice::from_raw_parts(out.data,out.len as usize).to_vec()};unsafe{LocalFree(out.data);}Ok(v)
}
#[cfg(windows)]fn seal(data:&[u8])->Result<Vec<u8>,String>{dpapi(data,true)}
#[cfg(windows)]fn unseal(data:&[u8])->Result<Vec<u8>,String>{dpapi(data,false)}
#[tauri::command]
pub fn dev_lock(app:AppHandle,caller:Webview,token:String,forget:Option<bool>)->Result<(),String>{trusted(&caller)?;let mut s=SESSION.lock().map_err(|_|"Developer lock unavailable")?;if s.token==token{*s=Session::default();if forget.unwrap_or(false){if let Ok(path)=remember_path(&app){let _=fs::remove_file(path);}}}Ok(())}
#[tauri::command]
pub fn dev_capture(app:AppHandle,caller:Webview,token:String,desktop:bool)->Result<String,String>{trusted(&caller)?;authorize(&token)?;capture(&app,desktop).map(|b|STANDARD.encode(b))}

#[tauri::command]
pub fn dev_copy_image(caller:Webview,token:String,png:String)->Result<(),String>{
 trusted(&caller)?;authorize(&token)?;
 if png.len()>64_000_000{return Err("Image too large".into())}
 let bytes=STANDARD.decode(png).map_err(|_|"Invalid image")?;
 #[cfg(windows)]let owner=caller.window().hwnd().map_err(|e|e.to_string())?.0 as isize;
 #[cfg(not(windows))]let owner=0;
 copy_image(&bytes,owner)
}
#[cfg(not(windows))]
fn copy_image(_: &[u8],_:isize)->Result<(),String>{Err("Clipboard image requires Windows".into())}
#[cfg(windows)]
fn copy_image(bytes:&[u8],owner:isize)->Result<(),String>{
 let mut decoder=png::Decoder::new(std::io::Cursor::new(bytes));decoder.set_transformations(png::Transformations::EXPAND|png::Transformations::STRIP_16);
 let mut reader=decoder.read_info().map_err(|e|e.to_string())?;
 let (w,h)=(reader.info().width,reader.info().height);if w==0||h==0||u64::from(w)*u64::from(h)>64_000_000{return Err("Clipboard image dimensions exceed limit".into())}
 let mut data=vec![0;reader.output_buffer_size()];let info=reader.next_frame(&mut data).map_err(|e|e.to_string())?;
 let channels=match info.color_type{png::ColorType::Rgba=>4,png::ColorType::Rgb=>3,png::ColorType::Grayscale=>1,png::ColorType::GrayscaleAlpha=>2,_=>return Err("Unsupported PNG format".into())};
 let mut dib=vec![0u8;40+w as usize*h as usize*4];dib[0..4].copy_from_slice(&40u32.to_le_bytes());dib[4..8].copy_from_slice(&(w as i32).to_le_bytes());dib[8..12].copy_from_slice(&(-(h as i32)).to_le_bytes());dib[12..14].copy_from_slice(&1u16.to_le_bytes());dib[14..16].copy_from_slice(&32u16.to_le_bytes());
 for(src,dst)in data[..info.buffer_size()].chunks_exact(channels).zip(dib[40..].chunks_exact_mut(4)){if channels>=3{dst.copy_from_slice(&[src[2],src[1],src[0],255]);}else{dst.copy_from_slice(&[src[0],src[0],src[0],255]);}}
 #[link(name="user32")]unsafe extern "system"{fn OpenClipboard(h:isize)->i32;fn EmptyClipboard()->i32;fn SetClipboardData(format:u32,data:isize)->isize;fn CloseClipboard()->i32;}
 #[link(name="kernel32")]unsafe extern "system"{fn GlobalAlloc(flags:u32,size:usize)->isize;fn GlobalLock(h:isize)->*mut u8;fn GlobalUnlock(h:isize)->i32;fn GlobalFree(h:isize)->isize;}
 unsafe{let mem=GlobalAlloc(0x42,dib.len());if mem==0{return Err("Clipboard allocation failed".into())}let ptr=GlobalLock(mem);if ptr.is_null(){GlobalFree(mem);return Err("Clipboard memory unavailable".into())}std::ptr::copy_nonoverlapping(dib.as_ptr(),ptr,dib.len());GlobalUnlock(mem);let mut opened=false;for _ in 0..6{if OpenClipboard(owner)!=0{opened=true;break;}std::thread::sleep(Duration::from_millis(40));}if !opened{GlobalFree(mem);return Err("Clipboard is busy".into())}if EmptyClipboard()==0||SetClipboardData(8,mem)==0{CloseClipboard();GlobalFree(mem);return Err("Cannot copy image".into())}CloseClipboard();}Ok(())
}

#[tauri::command]
pub fn dev_save_report(app:AppHandle,caller:Webview,token:String,directory:String,note:String,png:Option<String>,logs:String,context:serde_json::Value)->Result<String,String>{
 trusted(&caller)?;authorize(&token)?;
 if note.len()>64_000||logs.len()>2_000_000||context.to_string().len()>512_000{return Err("Report exceeds size limit".into())}
 let image=if let Some(value)=png{if value.len()>64_000_000{return Err("Image too large".into())}let b=STANDARD.decode(value).map_err(|_|"Invalid screenshot")?;if b.len()<24||&b[..8]!=b"\x89PNG\r\n\x1a\n"{return Err("Screenshot must be PNG".into())}let w=u32::from_be_bytes(b[16..20].try_into().unwrap());let h=u32::from_be_bytes(b[20..24].try_into().unwrap());if w==0||h==0||u64::from(w)*u64::from(h)>64_000_000{return Err("Screenshot dimensions exceed limit".into())}Some(b)}else{None};
 let root=PathBuf::from(directory);if !root.is_absolute()||!root.is_dir(){return Err("Choose an existing report folder".into())}
 let name=format!("Luna-dev-{}-{}",chrono::Local::now().format("%Y%m%d-%H%M%S"),STANDARD.encode(random::<6>()?).replace(['+','/'],"_"));let dir=root.join(name);fs::create_dir(&dir).map_err(|e|e.to_string())?;
 if let Some(b)=image{fs::write(dir.join("screenshot.png"),b).map_err(|e|e.to_string())?;}
 let metadata=serde_json::json!({"format":1,"created":chrono::Utc::now().to_rfc3339(),"context":context,"note":note,"screenshot":dir.join("screenshot.png").exists()});
 fs::write(dir.join("report.json"),serde_json::to_vec_pretty(&metadata).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
 fs::write(dir.join("report.md"),format!("# Luna developer report\n\n{}\n\n{}\n\nCapture: screenshot.png (when present)\nLogs: events.log, native.log\n",chrono::Utc::now().to_rfc3339(),note)).map_err(|e|e.to_string())?;
 fs::write(dir.join("events.log"),logs).map_err(|e|e.to_string())?;
 let log=app.path().app_local_data_dir().map_err(|e|e.to_string())?.join("luna-debug.log");
 if let Ok(data)=fs::read(log){let start=data.len().saturating_sub(4_000_000);fs::write(dir.join("native.log"),&data[start..]).map_err(|e|e.to_string())?;}
 Ok(dir.to_string_lossy().into_owned())
}

#[cfg(not(windows))]
fn capture(_: &AppHandle,_:bool)->Result<Vec<u8>,String>{Err("Screen capture requires Windows".into())}
// Browser tabs make the main window a multi-webview window. Resolve the trusted main
// view and then its owning Window; get_webview_window would return None after adding tabs.
#[cfg(windows)]
fn capture(app:&AppHandle,desktop:bool)->Result<Vec<u8>,String>{
 #[repr(C)]struct Rect{left:i32,top:i32,right:i32,bottom:i32}
 #[repr(C)]struct Header{size:u32,width:i32,height:i32,planes:u16,bits:u16,compression:u32,image:u32,x:i32,y:i32,used:u32,important:u32}
 #[link(name="user32")]unsafe extern "system"{fn GetDC(h:isize)->isize;fn ReleaseDC(h:isize,dc:isize)->i32;fn GetSystemMetrics(i:i32)->i32;fn GetWindowRect(h:isize,r:*mut Rect)->i32;}
 #[link(name="gdi32")]unsafe extern "system"{fn CreateCompatibleDC(dc:isize)->isize;fn DeleteDC(dc:isize)->i32;fn CreateCompatibleBitmap(dc:isize,w:i32,h:i32)->isize;fn SelectObject(dc:isize,obj:isize)->isize;fn DeleteObject(obj:isize)->i32;fn BitBlt(dst:isize,x:i32,y:i32,w:i32,h:i32,src:isize,sx:i32,sy:i32,rop:u32)->i32;fn GetDIBits(dc:isize,bmp:isize,start:u32,lines:u32,bits:*mut u8,info:*mut Header,usage:u32)->i32;}
 let mut r=Rect{left:0,top:0,right:0,bottom:0};
 unsafe {
  if desktop{r.left=GetSystemMetrics(76);r.top=GetSystemMetrics(77);r.right=r.left+GetSystemMetrics(78);r.bottom=r.top+GetSystemMetrics(79);}else{let win=app.get_webview("main").ok_or("Luna main view unavailable")?.window();let hwnd=win.hwnd().map_err(|e|e.to_string())?.0 as isize;if GetWindowRect(hwnd,&mut r)==0{return Err("Cannot get Luna window bounds".into())}}
  let (w,h)=(r.right-r.left,r.bottom-r.top);if w<=0||h<=0||(w as u64)*(h as u64)>32_000_000{return Err("Capture dimensions exceed limit".into())}
  let dc=GetDC(0);if dc==0{return Err("Cannot access screen".into())}let mem=CreateCompatibleDC(dc);if mem==0{ReleaseDC(0,dc);return Err("Cannot create capture context".into())}let bmp=CreateCompatibleBitmap(dc,w,h);if bmp==0{DeleteDC(mem);ReleaseDC(0,dc);return Err("Cannot allocate capture image".into())}let old=SelectObject(mem,bmp);
  let copied=BitBlt(mem,0,0,w,h,dc,r.left,r.top,0x40CC0020);SelectObject(mem,old);
  let mut rgba=vec![0u8;w as usize*h as usize*4];let mut info=Header{size:40,width:w,height:-h,planes:1,bits:32,compression:0,image:0,x:0,y:0,used:0,important:0};let lines=if copied!=0{GetDIBits(dc,bmp,0,h as u32,rgba.as_mut_ptr(),&mut info,0)}else{0};DeleteObject(bmp);DeleteDC(mem);ReleaseDC(0,dc);if lines!=h{return Err("Screen capture failed".into())}
  for p in rgba.chunks_exact_mut(4){p.swap(0,2);p[3]=255;}
  let mut bytes=Vec::new();{let mut enc=png::Encoder::new(&mut bytes,w as u32,h as u32);enc.set_color(png::ColorType::Rgba);enc.set_depth(png::BitDepth::Eight);let mut writer=enc.write_header().map_err(|e|e.to_string())?;writer.write_image_data(&rgba).map_err(|e|e.to_string())?;}Ok(bytes)
 }
}
#[cfg(test)]mod tests{
 use super::*;
  #[cfg(windows)]#[test]fn remember_key_round_trips(){let data=[REMEMBER_MAGIC,&[7u8;32]].concat();let sealed=seal(&data).unwrap();assert_ne!(sealed,data);assert_eq!(unseal(&sealed).unwrap(),data);assert!(unseal(b"not sealed").is_err());}
 #[test]fn password_and_session(){let salt=[17;16];let mut hash=[0;32];pbkdf2::derive(pbkdf2::PBKDF2_HMAC_SHA256,rounds(),&salt,b"synthetic-test-password",&mut hash);assert!(pbkdf2::verify(pbkdf2::PBKDF2_HMAC_SHA256,rounds(),&salt,b"synthetic-test-password",&hash).is_ok());assert!(pbkdf2::verify(pbkdf2::PBKDF2_HMAC_SHA256,rounds(),&salt,b"wrong",&hash).is_err());let mut s=Session{token:"synthetic-token".into(),..Default::default()};assert!(valid(&s,"synthetic-token"));assert!(!valid(&s,""));assert!(!valid(&s,"other"));s.token.clear();assert!(!valid(&s,"synthetic-token"));}
}

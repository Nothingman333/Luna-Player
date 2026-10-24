//! AnkiConnect v6 on the user's loopback interface. Text is escaped before entering card HTML.
use serde::Deserialize;
use serde_json::{json,Value};
use std::{path::{Path,PathBuf},time::{Duration,Instant},process::{Command,Stdio}};
use std::os::windows::process::CommandExt;
use tauri::Manager;
static ADD:tokio::sync::Mutex<()>=tokio::sync::Mutex::const_new(());
async fn request(action:&str,params:Value,key:&str)->Result<Value,String>{
    let client=reqwest::Client::builder().timeout(Duration::from_secs(10)).redirect(reqwest::redirect::Policy::none()).build().map_err(|e|e.to_string())?;
    let mut body=json!({"action":action,"version":6,"params":params});if !key.is_empty(){body["key"]=json!(key);}
    let response=client.post("http://127.0.0.1:8765").json(&body).send().await.map_err(|_|"AnkiConnect is unavailable. Start Anki and enable the AnkiConnect add-on.".to_string())?.error_for_status().map_err(|e|e.to_string())?;
    let raw=response.bytes().await.map_err(|e|e.to_string())?;if raw.len()>2*1024*1024{return Err("Anki response exceeds limit".into());}
    let response:Value=serde_json::from_slice(&raw).map_err(|e|e.to_string())?;
    if let Some(error)=response["error"].as_str(){return Err(error.to_string());}Ok(response["result"].clone())
}
fn escape(text:&str)->String{text.replace('&',"&amp;").replace('<',"&lt;").replace('>',"&gt;").replace('"',"&quot;").replace('\'',"&#39;").replace('\n',"<br>")}
#[derive(Deserialize)]
#[serde(rename_all="camelCase")]
pub struct Card{deck:String,front:String,back:String,title:String,path:String,start:f64,end:f64,frame:bool,audio:bool}
struct TempAudio(PathBuf);
impl Drop for TempAudio{fn drop(&mut self){let _=std::fs::remove_file(&self.0);}}
fn audio(exe:&Path,input:&str,start:f64,end:f64,out:&Path)->Result<Vec<u8>,String>{
    let mut child=Command::new(exe).args(["--no-config","--no-video","--no-sub","--no-terminal","--of=mp3","--oac=libmp3lame","--oacopts=b=128k"])
        .arg(format!("--start={start:.3}")).arg(format!("--length={:.3}",end-start)).arg(format!("--o={}",out.display())).arg(input)
        .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).creation_flags(0x08000000).spawn().map_err(|e|e.to_string())?;
    let until=Instant::now()+Duration::from_secs(30);
    loop{match child.try_wait(){Ok(Some(status))=>{if !status.success(){return Err("Audio clip encoder failed".into());}break;},Ok(None)if Instant::now()<until=>std::thread::sleep(Duration::from_millis(30)),_=>{let _=child.kill();let _=child.wait();return Err("Audio clip timed out".into());}}}
    let bytes=std::fs::read(out).map_err(|e|e.to_string())?;if bytes.len()>4*1024*1024{return Err("Anki audio clip exceeds limit".into());}Ok(bytes)
}
#[tauri::command]
pub async fn anki_decks()->Result<Value,String>{let key=crate::secrets::get("ankiKey").unwrap_or_default();request("deckNames",json!({}),&key).await}
#[tauri::command]
pub async fn anki_add(app:tauri::AppHandle,card:Card)->Result<i64,String>{
    let _lock=ADD.lock().await;
    if card.front.trim().is_empty()||card.front.len()>8000||card.back.len()>16000||card.title.len()>500||card.deck.trim().is_empty()||card.deck.len()>200{return Err("Invalid card fields".into());}
    if (card.audio||card.frame)&&(!Path::new(&card.path).is_file()||!card.start.is_finite()||!card.end.is_finite()||card.start<0.0||card.end>86400.0||card.end<=card.start||card.end-card.start>30.0){return Err("Media cards need a local file and a clip of up to 30 seconds".into());}
    let key=crate::secrets::get("ankiKey").unwrap_or_default();
    let models=request("modelNames",json!({}),&key).await?;
    if !models.as_array().is_some_and(|m|m.iter().any(|m|m=="Luna Media")){
        request("createModel",json!({"modelName":"Luna Media","inOrderFields":["Front","Back"],"css":".card{font-family:Arial,sans-serif;font-size:24px;text-align:center}img{max-width:100%}","cardTemplates":[{"Name":"Luna","Front":"{{Front}}","Back":"{{FrontSide}}<hr id=answer>{{Back}}"}]}),&key).await?;
    }
    let fields=request("modelFieldNames",json!({"modelName":"Luna Media"}),&key).await?;
    if fields!=json!(["Front","Back"]){return Err("Existing Luna Media model has different fields; it was not changed".into());}
    request("createDeck",json!({"deck":card.deck}),&key).await?;
    let mut back=escape(&card.back);if !card.title.is_empty(){back.push_str(&format!("<br><small>{}</small>",escape(&card.title)));}
    let folder=app.path().app_cache_dir().map_err(|e|e.to_string())?.join("anki");std::fs::create_dir_all(&folder).map_err(|e|e.to_string())?;
    let nonce=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e|e.to_string())?.as_nanos();
    if card.frame{
        let exe=crate::mpv_exe(&app);let input=card.path.clone();let cache=folder.clone();let time=(card.start+card.end)/2.0;
        let bytes=crate::blocking(move||{let file=crate::files::still(&exe,&input,time,&cache)?;let bytes=std::fs::read(file).map_err(|e|e.to_string())?;if bytes.len()>4*1024*1024{return Err("Anki frame exceeds limit".into());}Ok(bytes)}).await?;
        let name=format!("luna-{nonce}.jpg");request("storeMediaFile",json!({"filename":name,"data":crate::shell_core::b64_encode(&bytes)}),&key).await?;back.push_str(&format!("<br><img src=\"{name}\">"));
    }
    if card.audio{
        let file=folder.join(format!("luna-{nonce}.mp3"));let exe=crate::mpv_exe(&app);let input=card.path.clone();let(start,end)=(card.start,card.end);
        let bytes=crate::blocking(move||{let _keep=TempAudio(file.clone());audio(&exe,&input,start,end,&file)}).await?;
        let name=format!("luna-{nonce}.mp3");request("storeMediaFile",json!({"filename":name,"data":crate::shell_core::b64_encode(&bytes)}),&key).await?;back.push_str(&format!("<br>[sound:{name}]"));
    }
    request("addNote",json!({"note":{"deckName":card.deck,"modelName":"Luna Media","fields":{"Front":escape(card.front.trim()),"Back":back},"options":{"allowDuplicate":false,"duplicateScope":"deck"},"tags":["LunaPlayer"]}}),&key).await?.as_i64().ok_or("Anki did not return a note ID".into())
}

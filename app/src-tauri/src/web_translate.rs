//! Chrome-style page translation: the page's text rows go to Google Translate, like Chrome's own translate bar.
//! Only Luna's main window may call it; sites never reach this command.
use tauri::Webview;
const LANGS:[&str;8]=["tr","en","de","fr","es","it","ru","pt"];
#[tauri::command]
pub async fn web_translate(caller:Webview,texts:Vec<String>,target:String)->Result<Vec<String>,String>{
 if caller.label()!="main"{return Err("Luna ana penceresi gerekli".into());}
 // Named `texts` so the debug log's privacy filter keeps page text out of luna-debug.log.
 let rows=texts;
 if !LANGS.contains(&target.as_str()){return Err("Desteklenmeyen hedef dil".into());}
 if rows.is_empty(){return Ok(Vec::new());}
 if rows.len()>128||rows.iter().map(|r|r.len()).sum::<usize>()>30_000{return Err("Çeviri parçası çok büyük".into());}
 let client=reqwest::Client::builder().timeout(std::time::Duration::from_secs(20)).redirect(reqwest::redirect::Policy::none()).build().map_err(|e|e.to_string())?;
 let form:Vec<(&str,&str)>=rows.iter().map(|r|("q",r.as_str())).collect();
 let reply:serde_json::Value=client.post("https://translate.googleapis.com/translate_a/t").query(&[("client","gtx"),("sl","auto"),("tl",target.as_str())]).form(&form).send().await.map_err(|e|format!("Google Çeviri'ye ulaşılamadı: {e}"))?.error_for_status().map_err(|e|format!("Google Çeviri yanıt vermedi: {e}"))?.json().await.map_err(|e|e.to_string())?;
 // Reply: [[translation, detected language], …] in request order.
 let list=reply.as_array().filter(|v|v.len()==rows.len()).ok_or("Google Çeviri beklenmeyen bir yanıt verdi")?;
 list.iter().zip(&rows).map(|(item,original)|Ok(item.get(0).and_then(|v|v.as_str()).or_else(||item.as_str()).unwrap_or(original).to_string())).collect()
}

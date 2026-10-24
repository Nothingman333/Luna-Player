//! Syncplay line protocol: TLS upgrade, room handshake, pause/seek synchronization and chat.
use serde::{Deserialize,Serialize};
use serde_json::{json,Value};
use std::{sync::{Mutex,atomic::{AtomicU64,Ordering}},time::{Duration,SystemTime}};
use tokio::{io::{AsyncRead,AsyncWrite,AsyncWriteExt,AsyncBufRead,AsyncBufReadExt,BufReader},net::TcpStream,sync::mpsc};
use tauri::Emitter;
static LOCAL:AtomicU64=AtomicU64::new(0);
static GENERATION:AtomicU64=AtomicU64::new(0);
static SESSION:Mutex<Option<mpsc::Sender<Value>>>=Mutex::new(None);
static CONNECT:tokio::sync::Mutex<()>=tokio::sync::Mutex::const_new(());
#[derive(Clone,Default,Serialize)]
pub struct Status{connected:bool,server:String,room:String,username:String,tls:bool,error:String,users:Value,chat:Vec<Value>}
static STATUS:Mutex<Status>=Mutex::new(Status{connected:false,server:String::new(),room:String::new(),username:String::new(),tls:false,error:String::new(),users:Value::Null,chat:Vec::new()});
#[derive(Deserialize)]
#[serde(rename_all="camelCase")]
pub struct Config{host:String,port:u16,username:String,room:String,password:String,allow_plain:bool,path:String}
trait Io:AsyncRead+AsyncWrite+Unpin+Send{}impl<T:AsyncRead+AsyncWrite+Unpin+Send>Io for T{}
type Stream=Box<dyn Io>;
fn trusted(caller:&tauri::Webview)->Result<(),String>{if caller.label()=="main"{Ok(())}else{Err("Main Luna window required".into())}}
fn timestamp()->f64{SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).unwrap_or_default().as_secs_f64()}
async fn read<R:AsyncBufRead+Unpin>(reader:&mut R,bytes:&mut Vec<u8>)->Result<Value,String>{
    loop{let buffer=reader.fill_buf().await.map_err(|e|e.to_string())?;if buffer.is_empty(){return Err("Syncplay server disconnected".into());}let n=buffer.iter().position(|b|*b==b'\n').map_or(buffer.len(),|i|i+1);if bytes.len()+n>65536{return Err("Syncplay message exceeds limit".into());}let done=buffer[n-1]==b'\n';bytes.extend_from_slice(&buffer[..n]);reader.consume(n);if done{break;}}
    serde_json::from_slice(&std::mem::take(bytes)).map_err(|e|e.to_string())
}
async fn write<W:AsyncWrite+Unpin>(writer:&mut W,value:Value)->Result<(),String>{writer.write_all(format!("{value}\r\n").as_bytes()).await.map_err(|e|e.to_string())}
fn changed(app:&tauri::AppHandle){let status=STATUS.lock().unwrap_or_else(|e|e.into_inner()).clone();let _=app.emit_to("main","syncplay",status);}
pub fn local_command(args:&Value){if args[0]=="seek"||args[0]=="revert-seek"||matches!(args[0].as_str(),Some("set_property"|"cycle"|"cycle-values"|"set"))&&args[1]=="pause"{LOCAL.fetch_add(1,Ordering::SeqCst);}}
#[tauri::command]pub fn syncplay_status(caller:tauri::Webview)->Result<Status,String>{trusted(&caller)?;Ok(STATUS.lock().unwrap_or_else(|e|e.into_inner()).clone())}
#[tauri::command]
pub async fn syncplay_connect(app:tauri::AppHandle,caller:tauri::Webview,config:Config)->Result<Status,String>{
    trusted(&caller)?;let _lock=CONNECT.lock().await;
    if SESSION.lock().unwrap_or_else(|e|e.into_inner()).is_some(){return Err("Disconnect the current Syncplay session first".into());}
    if config.host.is_empty()||config.host.len()>253||config.port==0||config.username.trim().is_empty()||config.username.len()>100||config.room.trim().is_empty()||config.room.len()>200||config.password.len()>200{return Err("Invalid Syncplay connection settings".into());}
    let engine=crate::MPV.get().ok_or("Video engine unavailable")?;
    if engine.command(json!(["get_property","path"])).await?.as_str()!=Some(config.path.as_str()){return Err("The playing file changed; reopen the room settings".into());}
    let (stream,tls)=tokio::time::timeout(Duration::from_secs(20),async{
        let tcp=TcpStream::connect((config.host.as_str(),config.port)).await.map_err(|e|e.to_string())?;let _=tcp.set_nodelay(true);
        let mut reader=BufReader::new(tcp);write(reader.get_mut(),json!({"TLS":{"startTLS":"send"}})).await?;let mut pending=Vec::new();let answer=read(&mut reader,&mut pending).await?;
        let stream:Stream=if answer["TLS"]["startTLS"].as_str()==Some("true"){
            if !reader.buffer().is_empty(){return Err("Unexpected data before TLS upgrade".into());}
            let roots=rustls::RootCertStore::from_iter(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
            let tls=rustls::ClientConfig::builder().with_root_certificates(roots).with_no_client_auth();
            let host=rustls::pki_types::ServerName::try_from(config.host.clone()).map_err(|_|"Invalid TLS server name")?;
            Box::new(tokio_rustls::TlsConnector::from(std::sync::Arc::new(tls)).connect(host,reader.into_inner()).await.map_err(|e|e.to_string())?)
        }else{if !config.allow_plain{return Err("This server did not enable TLS. Enable unencrypted connection explicitly for a trusted server.".into());}Box::new(reader.into_inner())};
        Ok::<_,String>((stream,answer["TLS"]["startTLS"].as_str()==Some("true")))
    }).await.map_err(|_|"Syncplay connection timed out")??;
    let mut reader=BufReader::new(stream);
    let mut pending=Vec::new();
    let mut hello=json!({"username":config.username.trim(),"room":{"name":config.room.trim()},"version":"1.2.255","realversion":"1.7.4","features":{"chat":true,"sharedPlaylists":false,"readiness":true,"managedRooms":false,"clientName":"Luna Player"}});
    if !config.password.is_empty(){use md5::{Md5,Digest};hello["password"]=json!(format!("{:x}",Md5::digest(config.password.as_bytes())));}
    write(reader.get_mut(),json!({"Hello":hello})).await?;
    let response=tokio::time::timeout(Duration::from_secs(15),read(&mut reader,&mut pending)).await.map_err(|_|"Syncplay room handshake timed out")??;
    if response.get("Hello").is_none(){return Err(response["Error"]["message"].as_str().unwrap_or("Syncplay room handshake failed").chars().take(500).collect());}
    let duration=engine.command(json!(["get_property","duration"])).await?.as_f64().unwrap_or(0.0);
    let filename=std::path::Path::new(&config.path).file_name().map(|s|s.to_string_lossy().to_string()).unwrap_or_else(||"Luna stream".into());
    write(reader.get_mut(),json!({"Set":{"file":{"name":filename,"duration":duration,"size":std::fs::metadata(&config.path).map(|m|m.len()).unwrap_or(0)},"ready":{"isReady":true,"manuallyInitiated":true}}})).await?;
    write(reader.get_mut(),json!({"List":null})).await?;
    let (tx,mut rx)=mpsc::channel::<Value>(32);let generation=GENERATION.fetch_add(1,Ordering::SeqCst)+1;
    *SESSION.lock().unwrap_or_else(|e|e.into_inner())=Some(tx);
    *STATUS.lock().unwrap_or_else(|e|e.into_inner())=Status{connected:true,server:format!("{}:{}",config.host,config.port),room:response["Hello"]["room"]["name"].as_str().unwrap_or(&config.room).to_string(),username:response["Hello"]["username"].as_str().unwrap_or(&config.username).to_string(),tls,..Default::default()};changed(&app);
    tauri::async_runtime::spawn(async move{
        let mut sent=LOCAL.load(Ordering::SeqCst);let mut client_ignore=0u64;let mut first=true;let mut rtt=0.0;
        let result:Result<(),String>=async{
            loop{
                tokio::select!{
                    outgoing=rx.recv()=>{let Some(outgoing)=outgoing else{return Ok(())};write(reader.get_mut(),outgoing).await?;},
                    incoming=tokio::time::timeout(Duration::from_secs(60),read(&mut reader,&mut pending))=>{
                        let incoming=incoming.map_err(|_|"Syncplay server stopped responding")??;
                        if let Some(error)=incoming.get("Error"){return Err(error["message"].as_str().unwrap_or("Syncplay error").chars().take(500).collect());}
                        if let Some(users)=incoming.get("List"){STATUS.lock().unwrap_or_else(|e|e.into_inner()).users=users.clone();changed(&app);}
                        if incoming.get("Set").is_some(){write(reader.get_mut(),json!({"List":null})).await?;}
                        if let Some(chat)=incoming.get("Chat"){
                            let mut status=STATUS.lock().unwrap_or_else(|e|e.into_inner());status.chat.push(json!({"username":chat["username"].as_str().unwrap_or("").chars().take(100).collect::<String>(),"message":chat["message"].as_str().unwrap_or("").chars().take(1000).collect::<String>()}));if status.chat.len()>100{status.chat.remove(0);}drop(status);changed(&app);
                        }
                        let Some(state)=incoming.get("State")else{continue;};
                        let server_ignore=state["ignoringOnTheFly"]["server"].as_u64().unwrap_or(0);
                        if server_ignore>0||state["ignoringOnTheFly"]["client"].as_u64()==Some(client_ignore){client_ignore=0;}
                        if let Some(sent_at)=state["ping"]["clientLatencyCalculation"].as_f64(){let measured=(timestamp()-sent_at).clamp(0.0,5.0);rtt=if rtt==0.0{measured}else{rtt*0.85+measured*0.15};}
                        let _guard=crate::MPV_TRANSACTION.lock().await;
                        if GENERATION.load(Ordering::SeqCst)!=generation{return Ok(());}
                        if engine.command(json!(["get_property","path"])).await?.as_str()!=Some(config.path.as_str()){return Err("Playing media changed; join again for the new file".into());}
                        let mut position=engine.command(json!(["get_property","time-pos"])).await?.as_f64().unwrap_or(0.0);
                        let mut paused=engine.command(json!(["get_property","pause"])).await?.as_bool().unwrap_or(true);
                        let revision=LOCAL.load(Ordering::SeqCst);let local_change=revision!=sent;
                        if !local_change&&client_ignore==0{
                            if let (Some(remote),Some(remote_pause))=(state["playstate"]["position"].as_f64(),state["playstate"]["paused"].as_bool()){
                                if remote.is_finite()&&(0.0..=172800.0).contains(&remote){
                                    let server_rtt=state["ping"]["serverRtt"].as_f64().unwrap_or(0.0);let target=remote+if remote_pause{0.0}else{((rtt-server_rtt)/2.0).clamp(0.0,2.0)};
                                    if remote_pause&&!paused{engine.command(json!(["set_property","pause",true])).await?;paused=true;}
                                    if first||state["playstate"]["doSeek"]==true||(position-target).abs()>1.0{engine.command(json!(["seek",target,"absolute+exact"])).await?;position=target;}
                                    if !remote_pause&&paused{engine.command(json!(["set_property","pause",false])).await?;paused=false;}first=false;
                                }
                            }
                        }
                        if local_change{client_ignore=client_ignore.wrapping_add(1).max(1);sent=revision;}
                        let mut reply=json!({"playstate":{"position":position,"paused":paused,"doSeek":local_change},"ping":{"clientLatencyCalculation":timestamp(),"clientRtt":rtt}});
                        if let Some(latency)=state["ping"]["latencyCalculation"].as_f64(){reply["ping"]["latencyCalculation"]=json!(latency);}
                        if client_ignore>0{reply["ignoringOnTheFly"]["client"]=json!(client_ignore);}if server_ignore>0{reply["ignoringOnTheFly"]["server"]=json!(server_ignore);}
                        drop(_guard);write(reader.get_mut(),json!({"State":reply})).await?;
                    }
                }
            }
        }.await;
        if GENERATION.load(Ordering::SeqCst)==generation{
            SESSION.lock().unwrap_or_else(|e|e.into_inner()).take();let mut status=STATUS.lock().unwrap_or_else(|e|e.into_inner());status.connected=false;status.error=result.err().unwrap_or_default();drop(status);changed(&app);
        }
    });
    Ok(STATUS.lock().unwrap_or_else(|e|e.into_inner()).clone())
}
#[tauri::command]pub fn syncplay_disconnect(app:tauri::AppHandle,caller:tauri::Webview)->Result<(),String>{trusted(&caller)?;shutdown();changed(&app);Ok(())}
#[tauri::command]pub fn syncplay_chat(caller:tauri::Webview,message:String)->Result<(),String>{trusted(&caller)?;let message=message.trim();if message.is_empty()||message.len()>1000{return Err("Chat must contain 1–1000 bytes".into());}SESSION.lock().unwrap_or_else(|e|e.into_inner()).as_ref().ok_or("Not connected")?.try_send(json!({"Chat":message})).map_err(|_|"Syncplay connection is busy".into())}
pub fn shutdown(){GENERATION.fetch_add(1,Ordering::SeqCst);SESSION.lock().unwrap_or_else(|e|e.into_inner()).take();STATUS.lock().unwrap_or_else(|e|e.into_inner()).connected=false;}

//! Jellyfin, OpenSubsonic and Audiobookshelf sources. Server credentials never enter playback URLs.
use serde::{Deserialize,Serialize};
use serde_json::Value;
use std::{collections::BTreeMap,sync::{Arc,Mutex,OnceLock,atomic::{AtomicU64,Ordering}},time::Duration};
use tokio::{io::{AsyncReadExt,AsyncWriteExt},net::{TcpListener,TcpStream}};
use ring::rand::{SecureRandom,SystemRandom};
#[derive(Clone,Deserialize)]
pub struct Profile{pub id:u8,pub kind:String,pub base:String,pub username:String}
#[derive(Clone)]struct Source{profile:Profile,base:reqwest::Url,secret:String}
#[derive(Clone)]struct Target{source:Source,url:reqwest::Url}
struct Relay{port:u16,nonce:String,targets:Arc<Mutex<BTreeMap<u64,Target>>>,abort:tokio::task::AbortHandle}
static RELAY:OnceLock<Relay>=OnceLock::new();
static START:tokio::sync::Mutex<()>=tokio::sync::Mutex::const_new(());
static NEXT:AtomicU64=AtomicU64::new(1);
#[derive(Serialize)]#[serde(rename_all="camelCase")]
pub struct Item{id:String,title:String,artist:String,album:String,kind:String,duration:f64,cover:Option<String>,library:Option<String>,track:Option<usize>}
fn trusted(caller:&tauri::Webview)->Result<(),String>{if caller.label()=="main"{Ok(())}else{Err("Main Luna window required".into())}}
async fn source(app:tauri::AppHandle,id:u8)->Result<Source,String>{
    crate::blocking(move||{
        let raw=crate::database::read_value(&app,"mediaSources")?.unwrap_or_else(||"[]".into());let profiles:Vec<Profile>=serde_json::from_str(&raw).map_err(|_|"Invalid media sources")?;
        let profile=profiles.into_iter().find(|p|p.id==id).ok_or("Media source not configured")?;
        if !matches!(profile.kind.as_str(),"jellyfin"|"subsonic"|"audiobookshelf"){return Err("Invalid media source type".into());}
        let mut base=reqwest::Url::parse(&profile.base).map_err(|_|"Invalid media server URL")?;
        if !matches!(base.scheme(),"https"|"http")||base.host_str().is_none()||!base.username().is_empty()||base.password().is_some()||base.query().is_some()||base.fragment().is_some(){return Err("Use an HTTP(S) server URL without credentials or query parameters".into());}
        if !base.path().ends_with('/'){base.set_path(&format!("{}/",base.path()));}
        let secret=crate::secrets::get(&format!("mediaSourceSecret{id}")).unwrap_or_default();if secret.is_empty(){return Err("Server token/password is missing".into());}Ok(Source{profile,base,secret})
    }).await
}
fn url(source:&Source,path:&str,pairs:&[(&str,&str)])->Result<reqwest::Url,String>{
    let mut url=source.base.join(path).map_err(|_|"Invalid server endpoint")?;
    if url.origin()!=source.base.origin(){return Err("Cross-origin media URLs are not allowed".into());}
    url.query_pairs_mut().extend_pairs(pairs.iter().copied());
    if source.profile.kind=="subsonic"{
        use md5::{Md5,Digest};let mut random=[0u8;8];SystemRandom::new().fill(&mut random).map_err(|_|"Random source unavailable")?;let salt=random.iter().map(|b|format!("{b:02x}")).collect::<String>();let token=format!("{:x}",Md5::digest(format!("{}{salt}",source.secret)));
        url.query_pairs_mut().extend_pairs([("u",source.profile.username.as_str()),("t",&token),("s",&salt),("v","1.16.1"),("c","LunaPlayer"),("f","json")]);
    }Ok(url)
}
fn request(target:&Target)->Result<reqwest::RequestBuilder,String>{
    let origin=target.source.base.origin();
    let client=reqwest::Client::builder().connect_timeout(Duration::from_secs(10)).read_timeout(Duration::from_secs(30)).redirect(reqwest::redirect::Policy::custom(move|attempt|if attempt.previous().len()<5&&attempt.url().origin()==origin{attempt.follow()}else{attempt.stop()})).build().map_err(|e|e.to_string())?;
    let mut request=client.get(target.url.clone());
    if target.source.profile.kind=="jellyfin"{request=request.header("X-Emby-Token",&target.source.secret);}else if target.source.profile.kind=="audiobookshelf"{request=request.bearer_auth(&target.source.secret);}Ok(request)
}
async fn json(source:&Source,path:&str,pairs:&[(&str,&str)])->Result<Value,String>{
    let target=Target{source:source.clone(),url:url(source,path,pairs)?};let mut response=request(&target)?.timeout(Duration::from_secs(25)).send().await.map_err(|_|"Media server request failed")?;
    if !response.status().is_success(){return Err(format!("Media server returned HTTP {}",response.status().as_u16()));}
    let mut bytes=Vec::new();while let Some(chunk)=response.chunk().await.map_err(|_|"Media server response interrupted")?{if bytes.len()+chunk.len()>8*1024*1024{return Err("Media catalog response exceeds limit".into());}bytes.extend_from_slice(&chunk);}
    let value:Value=serde_json::from_slice(&bytes).map_err(|_|"Invalid media catalog JSON")?;
    if source.profile.kind=="subsonic"&&value["subsonic-response"]["status"]!="ok"{return Err("OpenSubsonic rejected the request; check username and password".into());}Ok(value)
}
async fn relay(target:Target)->Result<String,String>{
    let _lock=START.lock().await;
    if RELAY.get().is_none(){
        let listener=TcpListener::bind((std::net::Ipv4Addr::LOCALHOST,0)).await.map_err(|e|e.to_string())?;let port=listener.local_addr().map_err(|e|e.to_string())?.port();
        let mut bytes=[0u8;32];SystemRandom::new().fill(&mut bytes).map_err(|_|"Random source unavailable")?;let nonce=bytes.iter().map(|b|format!("{b:02x}")).collect::<String>();let expected=nonce.clone();let targets=Arc::new(Mutex::new(BTreeMap::<u64,Target>::new()));let routes=targets.clone();
        let task=tokio::spawn(async move{while let Ok((socket,_))=listener.accept().await{let routes=routes.clone();let nonce=expected.clone();tauri::async_runtime::spawn(async move{let _=serve(socket,routes,&nonce).await;});}});
        let _=RELAY.set(Relay{port,nonce,targets,abort:task.abort_handle()});
    }
    let server=RELAY.get().ok_or("Media relay unavailable")?;let id=NEXT.fetch_add(1,Ordering::Relaxed);let mut targets=server.targets.lock().unwrap_or_else(|e|e.into_inner());while targets.len()>=1024{targets.pop_first();}targets.insert(id,target);Ok(format!("http://127.0.0.1:{}/{}/{id}",server.port,server.nonce))
}
async fn serve(mut socket:TcpStream,targets:Arc<Mutex<BTreeMap<u64,Target>>>,nonce:&str)->Result<(),String>{
    let mut head=Vec::new();tokio::time::timeout(Duration::from_secs(10),async{
        loop{let mut byte=[0u8;1];if socket.read(&mut byte).await.map_err(|e|e.to_string())?==0{return Err("Closed request".to_string());}head.push(byte[0]);if head.len()>16384{return Err("Request too large".into());}if head.ends_with(b"\r\n\r\n"){break;}}Ok(())
    }).await.map_err(|_|"Request timed out")??;
    let head=std::str::from_utf8(&head).map_err(|_|"Invalid request")?;let mut lines=head.split("\r\n");let first=lines.next().unwrap_or("").split_whitespace().collect::<Vec<_>>();if first.len()!=3||!matches!(first[0],"GET"|"HEAD"){return Err("Invalid method".into());}
    let path=first[1].split('?').next().unwrap_or("").split('/').collect::<Vec<_>>();if path.len()!=3||path[1]!=nonce{return Err("Unknown media route".into());}let id=path[2].parse::<u64>().map_err(|_|"Invalid media ID")?;let target=targets.lock().unwrap_or_else(|e|e.into_inner()).get(&id).cloned().ok_or("Expired media route")?;
    let mut upstream=request(&target)?;for line in lines{if let Some((key,value))=line.split_once(':'){if key.eq_ignore_ascii_case("range"){let value=value.trim();if value.len()>80||!value.starts_with("bytes=")||!value[6..].bytes().all(|b|b.is_ascii_digit()||b==b'-'){return Err("Invalid range".into());}upstream=upstream.header(reqwest::header::RANGE,value);}}}
    let mut response=upstream.send().await.map_err(|_|"Media stream failed")?;let code=response.status().as_u16();if !matches!(code,200|206|416){socket.write_all(b"HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").await.map_err(|e|e.to_string())?;return Ok(());}
    let mut headers=format!("HTTP/1.1 {code} {}\r\nConnection: close\r\n",if code==206{"Partial Content"}else if code==416{"Range Not Satisfiable"}else{"OK"});for name in ["content-type","content-length","content-range","accept-ranges"]{if let Some(value)=response.headers().get(name).and_then(|v|v.to_str().ok()){headers.push_str(&format!("{name}: {value}\r\n"));}}headers.push_str("\r\n");socket.write_all(headers.as_bytes()).await.map_err(|e|e.to_string())?;
    if first[0]!="HEAD"{while let Some(bytes)=response.chunk().await.map_err(|_|"Media stream interrupted")?{socket.write_all(&bytes).await.map_err(|e|e.to_string())?;}}let _=socket.shutdown().await;Ok(())
}
fn text(value:&Value,key:&str)->String{value[key].as_str().unwrap_or("").chars().take(1000).collect()}
#[tauri::command]
pub async fn source_browse(app:tauri::AppHandle,caller:tauri::Webview,profile:u8,query:String,library:Option<String>)->Result<Vec<Item>,String>{
    trusted(&caller)?;if query.len()>500{return Err("Query too long".into());}let source=source(app,profile).await?;let mut out=Vec::new();
    match source.profile.kind.as_str(){
        "jellyfin"=>{let value=json(&source,"Items",&[("Recursive","true"),("IncludeItemTypes","Movie,Episode,Audio,AudioBook"),("Limit","200"),("SearchTerm",&query)]).await?;
            for item in value["Items"].as_array().into_iter().flatten().take(200){let id=text(item,"Id");if id.is_empty(){continue;}let kind=if matches!(item["Type"].as_str(),Some("Audio"|"AudioBook")){"audio"}else{"video"};let cover=if item["ImageTags"]["Primary"].is_string(){Some(relay(Target{source:source.clone(),url:url(&source,&format!("Items/{}/Images/Primary",urlencoding::encode(&id)),&[("maxWidth","400")])?}).await?)}else{None};out.push(Item{id,title:text(item,"Name"),artist:item["Artists"].as_array().map(|a|a.iter().filter_map(Value::as_str).collect::<Vec<_>>().join(", ")).unwrap_or_default(),album:text(item,"Album"),kind:kind.into(),duration:item["RunTimeTicks"].as_f64().unwrap_or(0.0)/10000000.0,cover,library:None,track:None});}}
        "subsonic"=>{let value=if query.trim().is_empty(){json(&source,"rest/getRandomSongs.view",&[("size","200")]).await?}else{json(&source,"rest/search3.view",&[("query",&query),("songCount","200"),("albumCount","0"),("artistCount","0")]).await?};let root=&value["subsonic-response"];let rows=if query.trim().is_empty(){&root["randomSongs"]["song"]}else{&root["searchResult3"]["song"]};
            for item in rows.as_array().into_iter().flatten().take(200){let id=text(item,"id");if id.is_empty(){continue;}let cover_id=text(item,"coverArt");let cover=if cover_id.is_empty(){None}else{Some(relay(Target{source:source.clone(),url:url(&source,"rest/getCoverArt.view",&[("id",&cover_id),("size","400")])?}).await?)};out.push(Item{id,title:text(item,"title"),artist:text(item,"artist"),album:text(item,"album"),kind:"audio".into(),duration:item["duration"].as_f64().unwrap_or(0.0),cover,library:None,track:None});}}
        _=>{if library.is_none(){let value=json(&source,"api/libraries",&[]).await?;for item in value["libraries"].as_array().into_iter().flatten().take(100){out.push(Item{id:text(item,"id"),title:text(item,"name"),artist:String::new(),album:String::new(),kind:"library".into(),duration:0.0,cover:None,library:None,track:None});}}
            else{let library=library.unwrap();if library.len()>200{return Err("Invalid library ID".into());}let value=if query.trim().is_empty(){json(&source,&format!("api/libraries/{}/items",urlencoding::encode(&library)),&[("limit","200"),("expanded","1")]).await?}else{json(&source,&format!("api/libraries/{}/search",urlencoding::encode(&library)),&[("q",&query),("limit","200")]).await?};let rows=if query.trim().is_empty(){value["results"].as_array().cloned().unwrap_or_default()}else{value["book"].as_array().into_iter().flatten().map(|i|i["libraryItem"].clone()).collect()};for item in rows.into_iter().take(200){let id=text(&item,"id");if id.is_empty(){continue;}let cover=Some(relay(Target{source:source.clone(),url:url(&source,&format!("api/items/{}/cover",urlencoding::encode(&id)),&[])?}).await?);out.push(Item{id,title:text(&item["media"]["metadata"],"title"),artist:text(&item["media"]["metadata"],"authorName"),album:String::new(),kind:"book".into(),duration:item["media"]["duration"].as_f64().unwrap_or(0.0),cover,library:Some(library.clone()),track:None});}}}
    }Ok(out)
}
#[tauri::command]
pub async fn source_stream(app:tauri::AppHandle,caller:tauri::Webview,profile:u8,id:String,kind:String,track:Option<usize>)->Result<Value,String>{
    trusted(&caller)?;if id.is_empty()||id.len()>256{return Err("Invalid media ID".into());}let source=source(app,profile).await?;
    let endpoint=match source.profile.kind.as_str(){
        "jellyfin"=>url(&source,&format!("{}/{}/stream",if kind=="video"{"Videos"}else{"Audio"},urlencoding::encode(&id)),&[("static","true")])?,
        "subsonic"=>url(&source,"rest/stream.view",&[("id",&id)])?,
        _=>{let value=json(&source,&format!("api/items/{}",urlencoding::encode(&id)),&[("expanded","1")]).await?;let rows=value["media"]["tracks"].as_array().ok_or("No audiobook tracks found")?;let row=rows.get(track.unwrap_or(0)).ok_or("Audiobook track missing")?;let path=row["contentUrl"].as_str().ok_or("Audiobook stream URL missing")?;url(&source,path,&[])?}
    };
    Ok(serde_json::json!({"url":relay(Target{source,url:endpoint}).await?}))
}
#[tauri::command]
pub async fn source_tracks(app:tauri::AppHandle,caller:tauri::Webview,profile:u8,id:String)->Result<Vec<Item>,String>{
    trusted(&caller)?;if id.len()>256{return Err("Invalid audiobook ID".into());}let source=source(app,profile).await?;
    if source.profile.kind!="audiobookshelf"{return Err("Audiobookshelf source required".into());}
    let value=json(&source,&format!("api/items/{}",urlencoding::encode(&id)),&[("expanded","1")]).await?;
    let rows=value["media"]["tracks"].as_array().ok_or("No audiobook tracks found")?;
    let title=text(&value["media"]["metadata"],"title");let artist=text(&value["media"]["metadata"],"authorName");
    let cover=relay(Target{source:source.clone(),url:url(&source,&format!("api/items/{}/cover",urlencoding::encode(&id)),&[])?}).await?;
    Ok(rows.iter().enumerate().take(2000).map(|(index,row)|Item{id:id.clone(),title:row["title"].as_str().unwrap_or(&title).to_string(),artist:artist.clone(),album:title.clone(),kind:"book".into(),duration:row["duration"].as_f64().unwrap_or(0.0),cover:Some(cover.clone()),library:None,track:Some(index)}).collect())
}
pub fn shutdown(){if let Some(relay)=RELAY.get(){relay.abort.abort();relay.targets.lock().unwrap_or_else(|e|e.into_inner()).clear();}}

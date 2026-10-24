//! Opt-in local stdio MCP sessions. The selected executable is launched directly, without a shell.
use rmcp::{ServiceExt, RoleClient, service::RunningService, transport::TokioChildProcess, model::{CallToolRequestParams, PaginatedRequestParams}};
use serde::{Deserialize, Serialize};
use serde_json::{Value, Map};
use std::{collections::{BTreeMap,HashSet}, sync::{Arc,Mutex}, time::Duration};
type Client=RunningService<RoleClient,()>;
struct Session{client:Arc<Client>,tools:HashSet<String>}
static SESSIONS:Mutex<BTreeMap<u8,Session>>=Mutex::new(BTreeMap::new());
static CONNECT:tokio::sync::Mutex<()>=tokio::sync::Mutex::const_new(());
#[derive(Deserialize)]
pub struct Config{pub id:u8,pub exe:String,pub args:Vec<String>,pub cwd:Option<String>,pub env:BTreeMap<String,String>}
#[derive(Serialize)]
pub struct Connected{pub id:u8,pub tools:Vec<Value>}
fn trusted(caller:&tauri::Webview)->Result<(),String>{if caller.label()=="main"{Ok(())}else{Err("Main Luna window required".into())}}
fn client(id:u8)->Result<Arc<Client>,String>{let sessions=SESSIONS.lock().unwrap_or_else(|e|e.into_inner());let session=sessions.get(&id).ok_or("MCP server is not connected")?;if session.client.is_closed(){return Err("MCP server disconnected".into());}Ok(session.client.clone())}
#[tauri::command]
pub async fn mcp_connect(caller:tauri::Webview,config:Config)->Result<Connected,String>{
    trusted(&caller)?;let _lock=CONNECT.lock().await;
    if !(1..=8).contains(&config.id)||config.args.len()>64||config.args.iter().any(|s|s.len()>8192||s.contains('\0'))||config.env.len()>64{return Err("Invalid MCP configuration".into());}
    let exe=std::path::Path::new(&config.exe);
    if !exe.is_absolute()||!exe.is_file()||!exe.extension().is_some_and(|ext|ext.eq_ignore_ascii_case("exe")){return Err("Choose an existing absolute .exe path".into());}
    if SESSIONS.lock().unwrap_or_else(|e|e.into_inner()).contains_key(&config.id){return Err("Disconnect this MCP server first".into());}
    let mut command=tokio::process::Command::new(exe);command.args(config.args).env_clear().kill_on_drop(true).creation_flags(0x08000000).stderr(std::process::Stdio::null());
    for key in ["SystemRoot","WINDIR","PATH","TEMP","TMP","USERPROFILE","APPDATA","LOCALAPPDATA"]{if let Some(value)=std::env::var_os(key){command.env(key,value);}}
    for (key,value) in config.env{if key.is_empty()||key.len()>128||key.contains(['=','\0'])||value.len()>32768||value.contains('\0'){return Err("Invalid server environment".into());}command.env(key,value);}
    if let Some(cwd)=config.cwd.filter(|s|!s.is_empty()){let path=std::path::Path::new(&cwd);if !path.is_absolute()||!path.is_dir(){return Err("Invalid server working directory".into());}command.current_dir(path);}
    let transport=TokioChildProcess::new(command).map_err(|e|e.to_string())?;
    let client=tokio::time::timeout(Duration::from_secs(25),().serve(transport)).await.map_err(|_|"MCP initialization timed out")?.map_err(|e|e.to_string())?;
    let client=Arc::new(client);
    let discovered=tokio::time::timeout(Duration::from_secs(25),async{
        let(mut cursor,mut seen,mut tools,mut names)=(None,HashSet::new(),Vec::new(),HashSet::new());
        for _ in 0..8{
            let page=client.list_tools(cursor.clone().map(|cursor|PaginatedRequestParams::default().with_cursor(Some(cursor)))).await.map_err(|e|e.to_string())?;
            for tool in page.tools{if tools.len()>=1000{return Err("MCP tool limit exceeded".into());}names.insert(tool.name.to_string());tools.push(serde_json::to_value(tool).map_err(|e|e.to_string())?);}
            cursor=page.next_cursor;
            if cursor.is_none(){return Ok((tools,names));}
            if !seen.insert(cursor.clone()){return Err("MCP pagination repeated a cursor".into());}
        }Err("MCP pagination limit exceeded".into())
    }).await.map_err(|_|"MCP tool discovery timed out".to_string()).and_then(|r|r);
    let (tools,names)=match discovered{Ok(result)=>result,Err(error)=>{client.cancellation_token().cancel();return Err(error);}};
    if serde_json::to_vec(&tools).map_err(|e|e.to_string())?.len()>8*1024*1024{client.cancellation_token().cancel();return Err("MCP tool catalog exceeds limit".into());}
    SESSIONS.lock().unwrap_or_else(|e|e.into_inner()).insert(config.id,Session{client,tools:names});
    Ok(Connected{id:config.id,tools})
}
#[tauri::command]
pub async fn mcp_call(caller:tauri::Webview,id:u8,name:String,arguments:Map<String,Value>)->Result<Value,String>{
    trusted(&caller)?;
    if serde_json::to_vec(&arguments).map_err(|e|e.to_string())?.len()>1024*1024{return Err("MCP arguments exceed limit".into());}
    if !SESSIONS.lock().unwrap_or_else(|e|e.into_inner()).get(&id).is_some_and(|s|s.tools.contains(&name)){return Err("Tool was not advertised by this MCP server".into());}
    let client=client(id)?;
    let result=tokio::time::timeout(Duration::from_secs(60),client.call_tool(CallToolRequestParams::new(name).with_arguments(arguments))).await.map_err(|_|"MCP tool timed out")?.map_err(|e|e.to_string())?;
    let value=serde_json::to_value(result).map_err(|e|e.to_string())?;
    if serde_json::to_vec(&value).map_err(|e|e.to_string())?.len()>8*1024*1024{return Err("MCP result exceeds limit".into());}Ok(value)
}
#[tauri::command]
pub fn mcp_disconnect(caller:tauri::Webview,id:u8)->Result<(),String>{trusted(&caller)?;if let Some(session)=SESSIONS.lock().unwrap_or_else(|e|e.into_inner()).remove(&id){session.client.cancellation_token().cancel();}Ok(())}
pub fn shutdown(){for(_,session)in std::mem::take(&mut *SESSIONS.lock().unwrap_or_else(|e|e.into_inner())){session.client.cancellation_token().cancel();}}

//! Only generated image files in Luna's own cache. No recursive deletion or arbitrary paths.
use std::{path::{Path, PathBuf}, sync::Mutex};
use tauri::{AppHandle, Manager, Webview};
static LOCK: Mutex<()> = Mutex::new(());
#[derive(serde::Serialize, Default)]
pub struct CacheInfo { bytes: u64, files: usize, removed: usize, failed: usize }
fn ordinary(meta: &std::fs::Metadata) -> bool {
    #[cfg(windows)] { use std::os::windows::fs::MetadataExt; if meta.file_attributes() & 0x400 != 0 { return false; } }
    !meta.file_type().is_symlink()
}
fn images(root: &Path) -> Vec<(PathBuf,u64,std::time::SystemTime)> {
    let mut out=Vec::new();
    for name in ["covers","thumbs","previews"] {
        let dir=root.join(name);
        let Ok(meta)=std::fs::symlink_metadata(&dir) else {continue};
        if !meta.is_dir() || !ordinary(&meta) {continue;}
        let Ok(entries)=std::fs::read_dir(&dir) else {continue};
        for entry in entries.flatten() {
            let path=entry.path();let Ok(meta)=std::fs::symlink_metadata(&path) else {continue};
            let ext=path.extension().and_then(|s|s.to_str()).unwrap_or("").to_ascii_lowercase();
            if meta.is_file() && ordinary(&meta) && matches!(ext.as_str(),"jpg"|"jpeg"|"png"|"webp"|"img") {
                out.push((path,meta.len(),meta.modified().unwrap_or(std::time::UNIX_EPOCH)));
            }
        }
    }
    out
}
fn manage(root:&Path, limit: Option<u64>) -> Result<CacheInfo,String> {
    let _guard=LOCK.lock().map_err(|e|e.to_string())?;
    let mut list=images(root);list.sort_by_key(|(_,_,at)|*at);
    let mut result=CacheInfo{bytes:list.iter().map(|(_,n,_)|n).sum(),files:list.len(),..Default::default()};
    if let Some(limit)=limit {
        for (path,size,_) in list {
            if result.bytes<=limit {break;}
            // Recheck reparse points immediately before removing an individual cached file.
            let valid=std::fs::symlink_metadata(&path).is_ok_and(|m|m.is_file()&&ordinary(&m));
            if valid && std::fs::remove_file(&path).is_ok(){result.bytes=result.bytes.saturating_sub(size);result.files=result.files.saturating_sub(1);result.removed+=1;}else{result.failed+=1;}
        }
    }
    Ok(result)
}
fn policy(app:&AppHandle)->Option<PathBuf>{app.path().app_local_data_dir().ok().map(|p|p.join("image-cache-limit.json"))}
pub fn enforce(app:&AppHandle) {
    let limit=policy(app).and_then(|p|std::fs::read_to_string(p).ok()).and_then(|s|s.parse::<u64>().ok()).filter(|n|matches!(*n,128|256|512|1024));
    if let (Some(mb),Ok(root))=(limit,app.path().app_cache_dir()){let _=manage(&root,Some(mb*1024*1024));}
}
#[tauri::command]
pub async fn cache_tools(app:AppHandle, caller:Webview, action:String, limit_mb:Option<u64>)->Result<CacheInfo,String>{
    if caller.label()!="main" {return Err("Only Luna UI can manage the cache".into());}
    let root=app.path().app_cache_dir().map_err(|e|e.to_string())?;
    let policy_path=policy(&app).ok_or("No app data directory")?;
    tauri::async_runtime::spawn_blocking(move||{
        match action.as_str(){
            "stats"=>manage(&root,None),
            "clear"=>manage(&root,Some(0)),
            "limit"=>{
                let mb=limit_mb.ok_or("Missing cache limit")?;
                if !matches!(mb,0|128|256|512|1024){return Err("Invalid cache limit".into());}
                std::fs::create_dir_all(policy_path.parent().ok_or("No policy parent")?).map_err(|e|e.to_string())?;
                std::fs::write(&policy_path,mb.to_string()).map_err(|e|e.to_string())?;
                manage(&root,if mb==0 {None}else{Some(mb*1024*1024)})
            },
            _=>Err("Unknown cache action".into()),
        }
    }).await.map_err(|e|e.to_string())?
}

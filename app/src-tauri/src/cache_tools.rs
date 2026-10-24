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
/// Image files directly in `dir`; with `nested`, also one level of ordinary sub-folders (seek-bar previews
/// are kept per video in `previews/<hash>/<second>.jpg`, so a flat listing never counted or cleared them).
fn images_in(dir:&Path,nested:bool,out:&mut Vec<(PathBuf,u64,std::time::SystemTime)>) {
    let Ok(meta)=std::fs::symlink_metadata(dir) else {return};
    if !meta.is_dir() || !ordinary(&meta) {return;}
    let Ok(entries)=std::fs::read_dir(dir) else {return};
    for entry in entries.flatten() {
        let path=entry.path();let Ok(meta)=std::fs::symlink_metadata(&path) else {continue};
        if nested && meta.is_dir() && ordinary(&meta) {images_in(&path,false,out);continue;}
        let ext=path.extension().and_then(|s|s.to_str()).unwrap_or("").to_ascii_lowercase();
        if meta.is_file() && ordinary(&meta) && matches!(ext.as_str(),"jpg"|"jpeg"|"png"|"webp"|"img") {
            out.push((path,meta.len(),meta.modified().unwrap_or(std::time::UNIX_EPOCH)));
        }
    }
}
fn images(root: &Path) -> Vec<(PathBuf,u64,std::time::SystemTime)> {
    let mut out=Vec::new();
    // "stills" holds the large frames made for shared cards; it was never limited or cleared before.
    for name in ["covers","thumbs","previews","stills"] {
        images_in(&root.join(name),name=="previews",&mut out);
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
            if valid && std::fs::remove_file(&path).is_ok(){
                result.bytes=result.bytes.saturating_sub(size);result.files=result.files.saturating_sub(1);result.removed+=1;
                // an emptied per-video preview folder goes too (remove_dir only removes an empty folder)
                if let Some(parent)=path.parent().filter(|p|p.parent().and_then(|g|g.file_name()).is_some_and(|n|n=="previews")) {let _=std::fs::remove_dir(parent);}
            }else{result.failed+=1;}
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

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn nested_previews_and_stills_are_counted_and_cleared() {
        let root=std::env::temp_dir().join(format!("luna-cache-{}",std::process::id()));
        let _=std::fs::remove_dir_all(&root);
        for (dir,file) in [("covers","a.jpg"),("previews/0123","5.jpg"),("stills","s.jpg"),("previews","note.txt")] {
            std::fs::create_dir_all(root.join(dir)).unwrap();std::fs::write(root.join(dir).join(file),b"1234").unwrap();
        }
        let info=manage(&root,None).unwrap();
        assert_eq!(info.files,3);assert_eq!(info.bytes,12);
        let info=manage(&root,Some(0)).unwrap();
        assert_eq!((info.removed,info.files),(3,0));
        assert!(!root.join("previews/0123").exists());
        assert!(root.join("previews/note.txt").exists());
        let _=std::fs::remove_dir_all(&root);
    }
}

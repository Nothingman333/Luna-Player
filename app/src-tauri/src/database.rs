//! Transactional application storage. Browser storage and JSON backups remain migration inputs.
use rusqlite::{params, Connection};
use serde_json::Value;
use std::{collections::BTreeMap, path::Path, sync::Mutex, time::Duration};
use tauri::Manager;
static WRITE: Mutex<()> = Mutex::new(());

fn allowed(key: &str) -> bool {
    !key.is_empty() && key.len() <= 32768 && key != "__seed" && ![
        "syncplayPassword", "ankiKey", "geminiKey", "tmdbKey", "osKey", "openaiKey", "claudeKey", "customAiKey", "listenbrainzToken", "lastfmKey", "lastfmSecret", "lastfmSession", "traktSecret", "traktToken", "traktRefresh",
    ].contains(&key) && !(1..=8).any(|i| key == format!("aiProfileKey{i}") || key == format!("mcpEnv{i}") || key == format!("mediaSourceSecret{i}"))
}
fn connection(path: &Path) -> Result<Connection, String> {
    if let Some(parent) = path.parent() { std::fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.busy_timeout(Duration::from_secs(5)).map_err(|e| e.to_string())?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
        CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY NOT NULL,value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS migration(name TEXT PRIMARY KEY NOT NULL);
        CREATE VIRTUAL TABLE IF NOT EXISTS search USING fts5(key UNINDEXED,text,tokenize='unicode61 remove_diacritics 2');").map_err(|e| e.to_string())?;
    Ok(conn)
}
fn put(conn: &Connection, key: &str, value: Option<&str>) -> Result<(), String> {
    if !allowed(key) { return Ok(()); }
    let before: Option<String> = conn.query_row("SELECT value FROM kv WHERE key=?1", [key], |row| row.get(0)).ok();
    if before.as_deref() == value { return Ok(()); }
    conn.execute("DELETE FROM search WHERE key=?1", [key]).map_err(|e| e.to_string())?;
    if let Some(value) = value {
        conn.execute("INSERT INTO kv(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params![key,value]).map_err(|e| e.to_string())?;
        // Catalog JSON is projected to text. Credentials and conversations are never indexed.
        if key == "meta" || key.starts_with("bookDetails") || key == "musicTracks" || key.starts_with("film:") || key.starts_with("book:") {
            let mut text = String::new();
            fn collect(v: &Value, out: &mut String) { match v { Value::String(s) => {out.push_str(s);out.push(' ');}, Value::Array(a) => for v in a {collect(v,out)}, Value::Object(o) => for (k,v) in o {out.push_str(k);out.push(' ');collect(v,out)}, _ => () } }
            if let Ok(v) = serde_json::from_str::<Value>(value) { collect(&v,&mut text); }
            if !text.is_empty() { conn.execute("INSERT INTO search(key,text) VALUES(?1,?2)", params![key,text]).map_err(|e| e.to_string())?; }
        }
    } else { conn.execute("DELETE FROM kv WHERE key=?1", [key]).map_err(|e| e.to_string())?; }
    Ok(())
}
fn open_state(path: &Path, legacy: BTreeMap<String,String>, seed: BTreeMap<String,String>, force: bool) -> Result<BTreeMap<String,String>,String> {
    let mut conn = connection(path)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let migrated = tx.query_row("SELECT count(*) FROM migration WHERE name='webview-v1'", [], |r| r.get::<_,i64>(0)).map_err(|e| e.to_string())? > 0;
    if !migrated {
        for (k,v) in &legacy { put(&tx,k,Some(v))?; }
        tx.execute("INSERT INTO migration(name) VALUES('webview-v1')", []).map_err(|e| e.to_string())?;
    }
    for (k,v) in &seed {
        let exists = tx.query_row("SELECT EXISTS(SELECT 1 FROM kv WHERE key=?1)", [k], |r| r.get::<_,bool>(0)).map_err(|e| e.to_string())?;
        if force || !exists { put(&tx,k,Some(v))?; }
    }
    tx.commit().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT key,value FROM kv ORDER BY key").map_err(|e| e.to_string())?;
    stmt.query_map([], |row| Ok((row.get::<_,String>(0)?,row.get::<_,String>(1)?))).map_err(|e| e.to_string())?.collect::<Result<BTreeMap<_,_>,_>>().map_err(|e| e.to_string())
}
fn path(app: &tauri::AppHandle) -> Result<std::path::PathBuf,String> { Ok(app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("luna-library.sqlite3")) }

pub fn read_value(app:&tauri::AppHandle,key:&str)->Result<Option<String>,String>{
    use rusqlite::OptionalExtension;
    connection(&path(app)?)?.query_row("SELECT value FROM kv WHERE key=?1",[key],|row|row.get(0)).optional().map_err(|e|e.to_string())
}

/// Backup restore must not reload the renderer before SQLite commits the restored snapshot.
pub fn save_snapshot(path: &Path, json: &str) -> Result<(), String> {
    let data: BTreeMap<String,String> = serde_json::from_str(json).map_err(|e|e.to_string())?;
    let _lock=WRITE.lock().unwrap_or_else(|e|e.into_inner());
    let mut conn=connection(path)?;
    let tx=conn.transaction().map_err(|e|e.to_string())?;
    let keys = {
        let mut stmt=tx.prepare("SELECT key FROM kv").map_err(|e|e.to_string())?;
        stmt.query_map([],|r|r.get::<_,String>(0)).map_err(|e|e.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?
    };
    for key in keys { if !data.contains_key(&key) {put(&tx,&key,None)?;} }
    for (key,value) in &data {put(&tx,key,Some(value))?;}
    tx.commit().map_err(|e|e.to_string())
}

#[tauri::command]
pub async fn database_open(app: tauri::AppHandle, legacy: BTreeMap<String,String>, seed: BTreeMap<String,String>, force: bool) -> Result<BTreeMap<String,String>,String> {
    let path = path(&app)?;
    crate::blocking(move || { let _lock=WRITE.lock().unwrap_or_else(|e|e.into_inner());open_state(&path,legacy,seed,force) }).await
}
#[tauri::command]
pub async fn database_apply(app: tauri::AppHandle, changes: BTreeMap<String,Option<String>>) -> Result<(),String> {
    let path=path(&app)?;
    crate::blocking(move || {
        let _lock=WRITE.lock().unwrap_or_else(|e|e.into_inner());
        let mut conn=connection(&path)?; let tx=conn.transaction().map_err(|e|e.to_string())?;
        for (k,v) in changes { put(&tx,&k,v.as_deref())?; }
        tx.commit().map_err(|e|e.to_string())
    }).await
}
#[tauri::command]
pub async fn database_replace(app: tauri::AppHandle, json: String) -> Result<(),String> {
    let path=path(&app)?;
    crate::blocking(move || save_snapshot(&path,&json)).await
}
#[tauri::command]
pub async fn database_search(app: tauri::AppHandle, query: String) -> Result<Vec<String>,String> {
    if query.len() > 512 { return Err("Search query is too long".into()); }
    let terms: Vec<String> = query.split_whitespace().take(16).map(|s|format!("\"{}\"*",s.replace('"',"\"\""))).collect();
    if terms.is_empty() { return Ok(vec![]); }
    let path=path(&app)?;
    crate::blocking(move || {
        let conn=connection(&path)?;
        let mut stmt=conn.prepare("SELECT key FROM search WHERE search MATCH ?1 ORDER BY rank LIMIT 50").map_err(|e|e.to_string())?;
        stmt.query_map([terms.join(" AND ")],|row|row.get::<_,String>(0)).map_err(|e|e.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())
    }).await
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn migration_is_transactional_and_never_overwrites_later_values() {
        let p=std::env::temp_dir().join(format!("luna-db-test-{}.sqlite3",std::process::id()));
        let _=std::fs::remove_file(&p);
        let state=open_state(&p,BTreeMap::from([("meta".into(),"{\"Film\":\"Arrival\"}".into()),("geminiKey".into(),"never store".into())]),BTreeMap::new(),false).unwrap();
        assert!(!state.contains_key("geminiKey"));
        let conn=connection(&p).unwrap();put(&conn,"meta",Some("new")).unwrap();drop(conn);
        let state=open_state(&p,BTreeMap::from([("meta".into(),"old".into())]),BTreeMap::new(),false).unwrap();assert_eq!(state["meta"],"new");
        let _=std::fs::remove_file(&p);
    }
}

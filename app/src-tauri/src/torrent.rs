//! Magnet links and .torrent files: download in the background with librqbit and
//! stream the video to mpv over librqbit's local HTTP API while it downloads.

use librqbit::api::Api;
use librqbit::http_api::{HttpApi, HttpApiOptions};
use librqbit::{AddTorrent, AddTorrentOptions, Session};
use serde::Serialize;
use serde_json::Value;
use std::path::PathBuf;
use std::sync::Arc;
use librqbit_dualstack_sockets::BindOpts;
use librqbit_dualstack_sockets::socket::MaybeDualstackSocket;
use tokio::sync::OnceCell;

const VIDEO_EXT: &[&str] = &["mkv", "mp4", "avi", "mov", "wmv", "webm", "m4v", "ts", "m2ts", "mpg", "mpeg"];

struct Engine {
    session: Arc<Session>,
    api: Api,
    port: u16,
}

static ENGINE: OnceCell<Engine> = OnceCell::const_new();

async fn engine(default_dir: PathBuf) -> Result<&'static Engine, String> {
    ENGINE
        .get_or_try_init(|| async move {
            std::fs::create_dir_all(&default_dir).map_err(|e| e.to_string())?;
            let session = Session::new(default_dir).await.map_err(|e| e.to_string())?;
            // Local-only, read-only HTTP API: mpv reads the stream from it.
            let addr: std::net::SocketAddr = "127.0.0.1:0".parse().unwrap();
            let opts = BindOpts { request_dualstack: false, ..Default::default() };
            let listener = MaybeDualstackSocket::bind_tcp(addr, opts).map_err(|e| e.to_string())?;
            let port = listener.bind_addr().port();
            let api = Api::new(session.clone(), None, None);
            let http = HttpApi::new(api.clone(), Some(HttpApiOptions { read_only: true, ..Default::default() }));
            tokio::spawn(http.make_http_api_and_run(listener, None));
            Ok(Engine { session, api, port })
        })
        .await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TFile {
    pub idx: usize,
    pub name: String,
    pub len: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Added {
    pub id: usize,
    pub name: String,
    pub files: Vec<TFile>,
    /// The biggest video file; what we play.
    pub video_idx: Option<usize>,
    pub url: Option<String>,
    /// Where that file is being written on disk.
    pub local_path: Option<String>,
}

fn is_video(name: &str) -> bool {
    name.rsplit('.').next().is_some_and(|x| VIDEO_EXT.contains(&x.to_lowercase().as_str()))
}

/// `source` is a magnet link, an http(s) .torrent URL or a local .torrent file.
pub async fn add(source: String, out_dir: String) -> Result<Added, String> {
    let out = PathBuf::from(&out_dir);
    let eng = engine(out.clone()).await?;
    let add = if source.starts_with("magnet:") || source.starts_with("http://") || source.starts_with("https://") {
        AddTorrent::from_url(source.clone())
    } else {
        AddTorrent::from_bytes(std::fs::read(&source).map_err(|e| tr!("Torrent dosyası okunamadı: {}", "Couldn't read the torrent file: {}", e))?)
    };
    let opts = AddTorrentOptions { overwrite: true, output_folder: Some(out_dir.clone()), ..Default::default() };
    let handle = eng
        .session
        .add_torrent(add, Some(opts))
        .await
        .map_err(|e| tr!("Torrent eklenemedi: {:#}", "Couldn't add the torrent: {:#}", e))?
        .into_handle()
        .ok_or(tr!("Torrent eklenemedi", "Couldn't add the torrent"))?;

    // Streaming only works once the torrent has finished checking its files and is live.
    for _ in 0..600 {
        if handle.live().is_some() {
            break;
        }
        if let Some(e) = handle.stats().error {
            return Err(tr!("Torrent hatası: {}", "Torrent error: {}", e));
        }
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }

    let id = handle.id();
    let name = handle.name().unwrap_or_else(|| "Torrent".into());
    let files: Vec<TFile> = handle
        .with_metadata(|m| {
            m.file_infos
                .iter()
                .enumerate()
                .map(|(idx, f)| TFile { idx, name: f.relative_filename.to_string_lossy().into_owned(), len: f.len })
                .collect()
        })
        .map_err(|e| e.to_string())?;
    let video_idx = files.iter().filter(|f| is_video(&f.name)).max_by_key(|f| f.len).map(|f| f.idx);
    let folder = handle.output_folder().to_path_buf();
    Ok(Added {
        id,
        name,
        url: video_idx.map(|i| format!("http://127.0.0.1:{}/torrents/{id}/stream/{i}", eng.port)),
        local_path: video_idx.map(|i| folder.join(&files[i].name).to_string_lossy().into_owned()),
        files,
        video_idx,
    })
}

/// Progress of every torrent, as librqbit reports it (bytes, speeds, peers…).
pub fn list() -> Vec<Value> {
    let Some(eng) = ENGINE.get() else { return vec![] };
    eng.session.with_torrents(|it| {
        it.map(|(id, h)| {
            let mut v = serde_json::to_value(h.stats()).unwrap_or(Value::Null);
            if let Value::Object(o) = &mut v {
                o.insert("id".into(), id.into());
                o.insert("name".into(), h.name().unwrap_or_default().into());
            }
            v
        })
        .collect()
    })
}

/// Which parts of file `idx` are already downloaded, as merged [start, end] fractions of the file.
pub fn haves(id: usize, idx: usize) -> Result<Vec<(f64, f64)>, String> {
    let eng = ENGINE.get().ok_or(tr!("Torrent motoru çalışmıyor", "The torrent engine isn't running"))?;
    let h = eng.session.get(id.into()).ok_or(tr!("Torrent bulunamadı", "Torrent not found"))?;
    let (off, len, plen) = h
        .with_metadata(|m| {
            let f = &m.file_infos[idx];
            (f.offset_in_torrent, f.len, m.info.lengths().default_piece_length() as u64)
        })
        .map_err(|e| e.to_string())?;
    if len == 0 {
        return Ok(vec![]);
    }
    let (bf, _) = eng.api.api_dump_haves(id.into()).map_err(|e| e.to_string())?;
    let mut out: Vec<(f64, f64)> = vec![];
    for i in (off / plen)..=((off + len - 1) / plen) {
        if !bf.get(i as usize).is_some_and(|b| *b) {
            continue;
        }
        let a = (i * plen).max(off) - off;
        let b = ((i + 1) * plen).min(off + len) - off;
        let (a, b) = (a as f64 / len as f64, b as f64 / len as f64);
        match out.last_mut() {
            Some(last) if (a - last.1).abs() < 1e-9 => last.1 = b,
            _ => out.push((a, b)),
        }
    }
    Ok(out)
}

pub async fn pause(id: usize, pause: bool) -> Result<(), String> {
    let eng = ENGINE.get().ok_or(tr!("Torrent motoru çalışmıyor", "The torrent engine isn't running"))?;
    let h = eng.session.get(id.into()).ok_or(tr!("Torrent bulunamadı", "Torrent not found"))?;
    if pause { eng.session.pause(&h).await } else { eng.session.unpause(&h).await }.map_err(|e| e.to_string())
}

pub async fn remove(id: usize, delete_files: bool) -> Result<(), String> {
    let eng = ENGINE.get().ok_or(tr!("Torrent motoru çalışmıyor", "The torrent engine isn't running"))?;
    eng.session.delete(id.into(), delete_files).await.map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    /// Streams the first bytes of Big Buck Bunny (Creative Commons) through the local HTTP API.
    #[tokio::test(flavor = "multi_thread")]
    #[ignore]
    async fn stream_big_buck_bunny() {
        let out = std::env::temp_dir().join("luna-torrent-test");
        let magnet = "magnet:?xt=urn:btih:dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c&dn=Big+Buck+Bunny&tr=udp%3A%2F%2Fexplodie.org%3A6969&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&tr=wss%3A%2F%2Ftracker.webtorrent.dev&ws=https%3A%2F%2Fwebtorrent.io%2Ftorrents%2F";
        let added = tokio::time::timeout(std::time::Duration::from_secs(120), super::add(magnet.into(), out.to_string_lossy().into()))
            .await.expect("metadata timeout").expect("add failed");
        println!("name={} video={:?} url={:?}", added.name, added.video_idx, added.url);
        let url = added.url.expect("no video");
        let res = tokio::time::timeout(std::time::Duration::from_secs(120), async {
            reqwest::Client::new().get(&url).header("Range", "bytes=0-65535").send().await.unwrap().bytes().await.unwrap()
        }).await.expect("stream timeout");
        println!("got {} bytes: {}", res.len(), String::from_utf8_lossy(&res[..200.min(res.len())]));
        assert!(res.len() > 1000);
    }
}
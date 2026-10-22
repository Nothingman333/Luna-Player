//! Subtitle search and download on OpenSubtitles (by file hash and by name),
//! and a small cue-time parser so the UI can draw the subtitle timeline.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

const API: &str = "https://api.opensubtitles.com/api/v1";
const UA: &str = "LunaPlayer v0.2.0";

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Hit {
    pub file_id: i64,
    pub language: String,
    pub release: String,
    pub file_name: String,
    pub downloads: i64,
    pub rating: f64,
    pub hash_match: bool,
    pub hearing_impaired: bool,
    pub machine_translated: bool,
    pub ai_translated: bool,
    pub fps: f64,
    pub uploader: String,
}

/// What we know about the video, to search by name when the hash finds nothing.
#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Query {
    pub title: Option<String>,
    pub year: Option<u32>,
    pub season: Option<u32>,
    pub episode: Option<u32>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Found {
    pub file: String,
    pub language: String,
    pub release: String,
    pub hash_match: bool,
}

/// OpenSubtitles hash: file size + u64 sum of the first and last 64 KiB.
pub fn movie_hash(path: &Path) -> std::io::Result<String> {
    const CHUNK: u64 = 65536;
    let mut f = File::open(path)?;
    let size = f.metadata()?.len();
    let mut hash = size;
    let mut sum = |f: &mut File| -> std::io::Result<()> {
        let mut buf = vec![0u8; CHUNK.min(size) as usize];
        f.read_exact(&mut buf)?;
        for c in buf.chunks_exact(8) {
            hash = hash.wrapping_add(u64::from_le_bytes(c.try_into().unwrap()));
        }
        Ok(())
    };
    sum(&mut f)?;
    f.seek(SeekFrom::Start(size.saturating_sub(CHUNK)))?;
    sum(&mut f)?;
    Ok(format!("{hash:016x}"))
}

fn query_from_name(path: &Path) -> String {
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
    stem.replace(['.', '_', '-'], " ")
}

/// How many times a request is tried before its error is shown (OpenSubtitles fails now and then and works on the next try).
const TRIES: u32 = 4;
/// A failure worth another try (the network, the server, an error page), or one that won't change (key, daily limit).
enum Fail {
    Again(String),
    Stop(String),
}
fn msg(f: Fail) -> String {
    match f {
        Fail::Again(m) | Fail::Stop(m) => m,
    }
}
async fn pause(attempt: u32) {
    tokio::time::sleep(std::time::Duration::from_millis(700 * (attempt as u64 + 1))).await;
}

async fn request(http: &reqwest::Client, key: &str, params: &[(&str, String)]) -> Result<Vec<Value>, String> {
    let mut last = String::new();
    for attempt in 0..TRIES {
        match request_once(http, key, params).await {
            Ok(v) => return Ok(v),
            Err(Fail::Stop(m)) => return Err(m),
            Err(Fail::Again(m)) => last = m,
        }
        if attempt + 1 < TRIES {
            pause(attempt).await;
        }
    }
    Err(last)
}

async fn request_once(http: &reqwest::Client, key: &str, params: &[(&str, String)]) -> Result<Vec<Value>, Fail> {
    let res = http
        .get(format!("{API}/subtitles"))
        .header("Api-Key", key)
        .header("User-Agent", UA)
        .query(params)
        .send()
        .await
        .map_err(|e| Fail::Again(tr!("OpenSubtitles'a ulaşılamadı: {}", "Couldn't reach OpenSubtitles: {}", e)))?;
    match res.status().as_u16() {
        200 => {}
        401 | 403 => return Err(Fail::Stop(tr!("OpenSubtitles API anahtarı geçersiz", "The OpenSubtitles API key is invalid"))),
        429 => return Err(Fail::Again(tr!("OpenSubtitles çok fazla istek dedi, biraz sonra tekrar dene", "OpenSubtitles says too many requests; try again a bit later"))),
        s => return Err(Fail::Again(tr!("OpenSubtitles arama hatası ({})", "OpenSubtitles search error ({})", s))),
    }
    let v: Value = res.json().await.map_err(|e| Fail::Again(e.to_string()))?;
    Ok(v["data"].as_array().cloned().unwrap_or_default())
}

fn to_hit(v: &Value) -> Option<Hit> {
    let a = &v["attributes"];
    let file = &a["files"][0];
    Some(Hit {
        file_id: file["file_id"].as_i64()?,
        language: a["language"].as_str().unwrap_or("").to_string(),
        release: a["release"].as_str().unwrap_or("").to_string(),
        file_name: file["file_name"].as_str().unwrap_or("").to_string(),
        downloads: a["download_count"].as_i64().unwrap_or(0),
        rating: a["ratings"].as_f64().unwrap_or(0.0),
        hash_match: a["moviehash_match"].as_bool().unwrap_or(false),
        hearing_impaired: a["hearing_impaired"].as_bool().unwrap_or(false),
        machine_translated: a["machine_translated"].as_bool().unwrap_or(false),
        ai_translated: a["ai_translated"].as_bool().unwrap_or(false),
        fps: a["fps"].as_f64().unwrap_or(0.0),
        uploader: a["uploader"]["name"].as_str().unwrap_or("").to_string(),
    })
}

/// Hash matches first (they are in sync with this exact file), then by name.
pub async fn search(video: &str, key: &str, langs: &str, q: Query) -> Result<Vec<Hit>, String> {
    let path = Path::new(video);
    let http = reqwest::Client::new();
    let mut hits: Vec<Hit> = Vec::new();

    if let Ok(hash) = movie_hash(path) {
        for v in request(&http, key, &[("moviehash", hash), ("languages", langs.into())]).await? {
            hits.extend(to_hit(&v));
        }
    }
    let mut params = vec![
        ("query", q.title.clone().unwrap_or_else(|| query_from_name(path))),
        ("languages", langs.to_string()),
    ];
    if let (Some(s), Some(e)) = (q.season, q.episode) {
        params.push(("season_number", s.to_string()));
        params.push(("episode_number", e.to_string()));
    } else if let Some(y) = q.year {
        params.push(("year", y.to_string()));
    }
    match request(&http, key, &params).await {
        Ok(l) => {
            for v in l {
                if let Some(h) = to_hit(&v) {
                    if !hits.iter().any(|x| x.file_id == h.file_id) {
                        hits.push(h);
                    }
                }
            }
        }
        // nothing from the file's hash either: say why (a wrong key, the daily limit…), not "none found"
        Err(e) if hits.is_empty() => return Err(e),
        Err(_) => {}
    }

    let order: Vec<&str> = langs.split(',').collect();
    hits.sort_by_key(|h| {
        let lang = order.iter().position(|l| *l == h.language).unwrap_or(99);
        (!h.hash_match, lang, h.machine_translated || h.ai_translated, -h.downloads)
    });
    Ok(hits)
}

/// Downloads one subtitle next to the video (or into the cache if that folder is read-only).
fn looks_like_html(b: &[u8]) -> bool {
    let head = String::from_utf8_lossy(&b[..b.len().min(512)]).trim_start_matches('\u{feff}').trim_start().to_ascii_lowercase();
    b.is_empty() || head.starts_with("<!doctype html") || head.starts_with("<html") || head.starts_with("<?xml")
}

pub async fn download(video: &str, key: &str, hit_id: i64, language: &str, cache: PathBuf) -> Result<String, String> {
    let http = reqwest::Client::new();
    let mut last = Fail::Again(String::new());
    let mut bytes = None;
    for attempt in 0..TRIES {
        match fetch_once(&http, key, hit_id).await {
            Ok(b) => {
                bytes = Some(b);
                break;
            }
            Err(Fail::Stop(m)) => return Err(m),
            Err(f) => last = f,
        }
        if attempt + 1 < TRIES {
            pause(attempt).await;
        }
    }
    let Some(bytes) = bytes else { return Err(msg(last)) };
    save(video, language, cache, &bytes)
}

/// One try at a subtitle file: the download link, then the file.
async fn fetch_once(http: &reqwest::Client, key: &str, hit_id: i64) -> Result<Vec<u8>, Fail> {
    let res = http
        .post(format!("{API}/download"))
        .header("Api-Key", key)
        .header("User-Agent", UA)
        .json(&json!({ "file_id": hit_id }))
        .send()
        .await
        .map_err(|e| Fail::Again(e.to_string()))?;
    let status = res.status().as_u16();
    let dl: Value = res.json().await.unwrap_or(Value::Null);
    let Some(link) = dl["link"].as_str() else {
        return Err(match status {
            406 | 429 => Fail::Stop(tr!("Bugünkü ücretsiz indirme hakkın doldu (OpenSubtitles sınırı)", "You've used today's free downloads (OpenSubtitles limit)")),
            401 | 403 => Fail::Stop(tr!("OpenSubtitles API anahtarı geçersiz", "The OpenSubtitles API key is invalid")),
            _ => Fail::Again(dl["message"].as_str().map(str::to_string).unwrap_or_else(|| tr!("İndirme reddedildi", "Download refused"))),
        });
    };
    let bytes = http
        .get(link)
        .send()
        .await
        .map_err(|e| Fail::Again(e.to_string()))?
        .error_for_status()
        .map_err(|e| Fail::Again(tr!("Altyazı indirilemedi: {}", "Couldn't download the subtitle: {}", e)))?
        .bytes()
        .await
        .map_err(|e| Fail::Again(e.to_string()))?;
    // an error page served with a success code is still not a subtitle
    if looks_like_html(&bytes) {
        return Err(Fail::Again(tr!("Altyazı yerine bir hata sayfası geldi", "Got an error page instead of a subtitle")));
    }
    Ok(bytes.to_vec())
}

/// The subtitle beside the video (or in Luna's cache when that folder can't be written).
fn save(video: &str, language: &str, cache: PathBuf, bytes: &[u8]) -> Result<String, String> {
    save_named(video, language, "srt", cache, bytes)
}

/// Writes a new subtitle file "<video stem>.<language>.<ext>" beside the video, numbered when the
/// name is taken (never overwriting the user's files), through a temporary file so a crash can't
/// leave half a subtitle. Falls back to Luna's cache when the video's folder is read-only.
pub fn save_named(video: &str, language: &str, ext: &str, cache: PathBuf, bytes: &[u8]) -> Result<String, String> {
    let path = Path::new(video);
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("video");
    // the language code comes from the server or the UI: only letters and "-" go into the file name
    let language: String = language.chars().filter(|c| c.is_ascii_alphabetic() || *c == '-').take(8).collect();
    let language = if language.is_empty() { "sub".to_string() } else { language };
    let ext: String = ext.chars().filter(|c| c.is_ascii_alphanumeric()).take(4).collect();
    let ext = if ext.is_empty() { "srt".to_string() } else { ext };
    let write_new = |target: &Path| -> std::io::Result<()> {
        let name = target.file_name().and_then(|n| n.to_str()).unwrap_or("subtitle");
        let tmp = target.with_file_name(format!(".{name}.luna-tmp"));
        let res = std::fs::write(&tmp, bytes).and_then(|_| std::fs::rename(&tmp, target));
        if res.is_err() {
            let _ = std::fs::remove_file(&tmp);
        }
        res
    };
    let mut name = format!("{stem}.{language}.{ext}");
    // Don't overwrite a different subtitle the user already has.
    let mut n = 2;
    while path.with_file_name(&name).exists() {
        name = format!("{stem}.{language}.{n}.{ext}");
        n += 1;
    }
    let beside = path.with_file_name(&name);
    if !video.contains("://") && write_new(&beside).is_ok() {
        return Ok(beside.to_string_lossy().into_owned());
    }
    std::fs::create_dir_all(&cache).map_err(|e| e.to_string())?;
    // the cache is shared by every video, so the name carries which video it belongs to
    let id = {
        use std::hash::{Hash, Hasher};
        let mut h = std::collections::hash_map::DefaultHasher::new();
        video.to_lowercase().hash(&mut h);
        h.finish()
    };
    let safe: String = name.chars().map(|c| if r#"\/:*?"<>|"#.contains(c) || c.is_control() { '_' } else { c }).collect();
    let p = cache.join(format!("{id:016x}-{safe}"));
    write_new(&p).map_err(|e| e.to_string())?;
    Ok(p.to_string_lossy().into_owned())
}

/// Automatic mode: best result, downloaded.
pub async fn find(video: &str, key: &str, langs: &str, q: Query, cache: PathBuf) -> Result<Found, String> {
    let hits = search(video, key, langs, q).await?;
    let best = hits.first().ok_or(tr!("Altyazı bulunamadı", "No subtitles found"))?;
    let file = download(video, key, best.file_id, &best.language, cache).await?;
    Ok(Found { file, language: best.language.clone(), release: best.release.clone(), hash_match: best.hash_match })
}

fn parse_time(s: &str) -> Option<f64> {
    let s = s.trim().replace(',', ".");
    let parts: Vec<&str> = s.split(':').collect();
    let (h, m, sec) = match parts.as_slice() {
        [h, m, s] => (h.parse::<f64>().ok()?, m.parse::<f64>().ok()?, s.parse::<f64>().ok()?),
        [m, s] => (0.0, m.parse::<f64>().ok()?, s.parse::<f64>().ok()?),
        _ => return None,
    };
    Some(h * 3600.0 + m * 60.0 + sec)
}

/// A subtitle file's text: UTF-16 (with its byte order mark, as Notepad saves it) or UTF-8.
pub fn decode_text(raw: &[u8]) -> String {
    let utf16 = |b: &[u8], le: bool| {
        let units: Vec<u16> = b.chunks_exact(2).map(|c| if le { u16::from_le_bytes([c[0], c[1]]) } else { u16::from_be_bytes([c[0], c[1]]) }).collect();
        String::from_utf16_lossy(&units)
    };
    match raw {
        [0xFF, 0xFE, rest @ ..] => utf16(rest, true),
        [0xFE, 0xFF, rest @ ..] => utf16(rest, false),
        _ => String::from_utf8_lossy(raw).into_owned(),
    }
}

/// Start/end seconds of every cue in an SRT, VTT or ASS/SSA file.
pub fn cues(file: &str) -> Result<Vec<(f64, f64)>, String> {
    let raw = std::fs::read(file).map_err(|e| e.to_string())?;
    let text = decode_text(&raw);
    let mut out = Vec::new();
    for line in text.lines() {
        if let Some((a, b)) = line.split_once("-->") {
            let b = b.split_whitespace().next().unwrap_or("");
            if let (Some(s), Some(e)) = (parse_time(a), parse_time(b)) {
                out.push((s, e));
            }
        } else if let Some(rest) = line.strip_prefix("Dialogue:") {
            let f: Vec<&str> = rest.splitn(4, ',').collect();
            if f.len() >= 3 {
                if let (Some(s), Some(e)) = (parse_time(f[1]), parse_time(f[2])) {
                    out.push((s, e));
                }
            }
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    #[test]
    fn html_is_not_a_subtitle() {
        use super::looks_like_html as h;
        assert!(h(b"<!DOCTYPE html><html><body>403</body></html>"));
        assert!(h(b"  <html>"));
        assert!(h(b""));
        assert!(!h(b"1\r\n00:00:01,000 --> 00:00:02,000\r\nHello\r\n"));
        assert!(!h("\u{feff}1\n00:00:01,000 --> 00:00:02,000\nMerhaba\n".as_bytes()));
    }
}

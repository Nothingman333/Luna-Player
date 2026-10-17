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

async fn request(http: &reqwest::Client, key: &str, params: &[(&str, String)]) -> Result<Vec<Value>, String> {
    let res = http
        .get(format!("{API}/subtitles"))
        .header("Api-Key", key)
        .header("User-Agent", UA)
        .query(params)
        .send()
        .await
        .map_err(|e| format!("OpenSubtitles'a ulaşılamadı: {e}"))?;
    match res.status().as_u16() {
        200 => {}
        401 | 403 => return Err("OpenSubtitles API anahtarı geçersiz".into()),
        429 => return Err("OpenSubtitles çok fazla istek dedi, biraz sonra tekrar dene".into()),
        s => return Err(format!("OpenSubtitles arama hatası ({s})")),
    }
    let v: Value = res.json().await.map_err(|e| e.to_string())?;
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
    for v in request(&http, key, &params).await.unwrap_or_default() {
        if let Some(h) = to_hit(&v) {
            if !hits.iter().any(|x| x.file_id == h.file_id) {
                hits.push(h);
            }
        }
    }

    let order: Vec<&str> = langs.split(',').collect();
    hits.sort_by_key(|h| {
        let lang = order.iter().position(|l| *l == h.language).unwrap_or(99);
        (!h.hash_match, lang, h.machine_translated || h.ai_translated, -h.downloads)
    });
    Ok(hits)
}

/// Downloads one subtitle next to the video (or into the cache if that folder is read-only).
pub async fn download(video: &str, key: &str, hit_id: i64, language: &str, cache: PathBuf) -> Result<String, String> {
    let http = reqwest::Client::new();
    let res = http
        .post(format!("{API}/download"))
        .header("Api-Key", key)
        .header("User-Agent", UA)
        .json(&json!({ "file_id": hit_id }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = res.status().as_u16();
    let dl: Value = res.json().await.unwrap_or(Value::Null);
    let Some(link) = dl["link"].as_str() else {
        return Err(match status {
            406 | 429 => "Bugünkü ücretsiz indirme hakkın doldu (OpenSubtitles sınırı)".into(),
            401 | 403 => "OpenSubtitles API anahtarı geçersiz".into(),
            _ => dl["message"].as_str().unwrap_or("İndirme reddedildi").to_string(),
        });
    };
    let bytes = http
        .get(link)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;

    let path = Path::new(video);
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("video");
    let mut name = format!("{stem}.{language}.srt");
    // Don't overwrite a different subtitle the user already has.
    let mut n = 2;
    while path.with_file_name(&name).exists() {
        name = format!("{stem}.{language}.{n}.srt");
        n += 1;
    }
    let beside = path.with_file_name(&name);
    if std::fs::write(&beside, &bytes).is_ok() {
        return Ok(beside.to_string_lossy().into_owned());
    }
    std::fs::create_dir_all(&cache).map_err(|e| e.to_string())?;
    let p = cache.join(&name);
    std::fs::write(&p, &bytes).map_err(|e| e.to_string())?;
    Ok(p.to_string_lossy().into_owned())
}

/// Automatic mode: best result, downloaded.
pub async fn find(video: &str, key: &str, langs: &str, q: Query, cache: PathBuf) -> Result<Found, String> {
    let hits = search(video, key, langs, q).await?;
    let best = hits.first().ok_or("Altyazı bulunamadı")?;
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

/// Start/end seconds of every cue in an SRT, VTT or ASS/SSA file.
pub fn cues(file: &str) -> Result<Vec<(f64, f64)>, String> {
    let raw = std::fs::read(file).map_err(|e| e.to_string())?;
    let text = String::from_utf8_lossy(&raw);
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

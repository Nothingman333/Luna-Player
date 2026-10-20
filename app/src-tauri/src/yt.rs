//! YouTube through yt-dlp (shipped next to mpv): finding a song's video and reading a link's title.
//! mpv plays the links itself with the same yt-dlp.

use serde::Serialize;
use serde_json::Value;
use std::os::windows::process::CommandExt;
use std::path::Path;
use std::process::Command;

#[cfg(test)]
mod tests {
    #[test]
    fn clock_reads_lengths() {
        assert_eq!(super::clock("5:08"), Some(308.0));
        assert_eq!(super::clock("1:02:03"), Some(3723.0));
        assert_eq!(super::clock("live"), None);
    }
    /// cargo test yt_api -- --ignored --nocapture
    #[tokio::test]
    #[ignore]
    async fn yt_api() {
        for q in ["Pink Floyd Have a Cigar", "KLEAVE ENTITY 096", "Barış Manço Dönence"] {
            let t = std::time::Instant::now();
            let l = super::search_api(q, 3).await.unwrap();
            println!("{q}: {:?} {:?}", t.elapsed(), l.iter().map(|h| (&h.title, &h.channel, h.duration)).collect::<Vec<_>>());
        }
    }
}

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Serialize)]
pub struct Hit {
    pub url: String,
    pub title: String,
    pub channel: String,
    pub duration: Option<f64>,
    pub thumb: Option<String>,
}

fn run(ytdlp: &Path, args: &[&str]) -> Result<Value, String> {
    if !ytdlp.exists() {
        return Err(tr!("yt-dlp bulunamadı", "yt-dlp is missing"));
    }
    let out = Command::new(ytdlp)
        .args(["--no-warnings", "--socket-timeout", "10", "-J"])
        .args(args)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        let line = err.lines().rev().find(|l| l.contains("ERROR")).unwrap_or("").replace("ERROR: ", "");
        return Err(if line.is_empty() { tr!("Bağlantı okunamadı", "Couldn't read the link") } else { line });
    }
    serde_json::from_slice(&out.stdout).map_err(|e| e.to_string())
}

fn hit(e: &Value) -> Option<Hit> {
    let url = e["webpage_url"].as_str().or(e["url"].as_str())?;
    let url = if url.starts_with("http") { url.to_string() } else { format!("https://www.youtube.com/watch?v={url}") };
    Some(Hit {
        title: e["title"].as_str().unwrap_or("").to_string(),
        channel: e["channel"].as_str().or(e["uploader"].as_str()).unwrap_or("").to_string(),
        duration: e["duration"].as_f64(),
        thumb: e["thumbnails"].as_array().and_then(|t| t.last()).and_then(|t| t["url"].as_str()).map(String::from)
            .or_else(|| e["thumbnail"].as_str().map(String::from)),
        url,
    })
}

/// "5:08" / "1:02:03" → seconds.
fn clock(s: &str) -> Option<f64> {
    s.split(':').try_fold(0f64, |n, p| p.trim().parse::<f64>().ok().map(|x| n * 60.0 + x))
}

fn renderers<'a>(v: &'a Value, out: &mut Vec<&'a Value>) {
    match v {
        Value::Object(m) => {
            if let Some(r) = m.get("videoRenderer") {
                out.push(r);
            }
            for x in m.values() {
                renderers(x, out);
            }
        }
        Value::Array(a) => a.iter().for_each(|x| renderers(x, out)),
        _ => {}
    }
}

/// The first `n` YouTube results straight from YouTube's own search service: about four times faster
/// than starting yt-dlp for every song (most of its two seconds is the program starting).
pub async fn search_api(query: &str, n: u32) -> Result<Vec<Hit>, String> {
    static HTTP: std::sync::OnceLock<reqwest::Client> = std::sync::OnceLock::new();
    let http = HTTP.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36")
            .timeout(std::time::Duration::from_secs(12))
            .build()
            .unwrap_or_default()
    });
    // params: videos only
    let body = serde_json::json!({
        "context": { "client": { "clientName": "WEB", "clientVersion": "2.20250101.00.00", "hl": "en" } },
        "query": query,
        "params": "EgIQAQ%3D%3D",
    });
    let v: Value = http
        .post("https://www.youtube.com/youtubei/v1/search?prettyPrint=false")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    if v.get("contents").is_none() {
        return Err("no contents".into());
    }
    let mut found = Vec::new();
    renderers(&v, &mut found);
    Ok(found
        .into_iter()
        .filter_map(|r| {
            let id = r["videoId"].as_str()?;
            Some(Hit {
                url: format!("https://www.youtube.com/watch?v={id}"),
                title: r["title"]["runs"][0]["text"].as_str().unwrap_or("").to_string(),
                channel: r["ownerText"]["runs"][0]["text"].as_str().unwrap_or("").to_string(),
                duration: r["lengthText"]["simpleText"].as_str().and_then(clock),
                thumb: r["thumbnail"]["thumbnails"].as_array().and_then(|t| t.last()).and_then(|t| t["url"].as_str()).map(String::from),
            })
        })
        .take(n as usize)
        .collect())
}

/// The first `n` YouTube results for a search.
pub fn search(ytdlp: &Path, query: &str, n: u32) -> Result<Vec<Hit>, String> {
    let v = run(ytdlp, &["--flat-playlist", &format!("ytsearch{n}:{query}")])?;
    Ok(v["entries"].as_array().map(|l| l.iter().filter_map(hit).collect()).unwrap_or_default())
}

/// What a link is: one video, or the videos of a playlist.
pub fn info(ytdlp: &Path, url: &str) -> Result<Vec<Hit>, String> {
    let v = run(ytdlp, &["--flat-playlist", "--playlist-end", "200", url])?;
    match v["entries"].as_array() {
        Some(l) => Ok(l.iter().filter_map(hit).collect()),
        None => Ok(hit(&v).into_iter().collect()),
    }
}

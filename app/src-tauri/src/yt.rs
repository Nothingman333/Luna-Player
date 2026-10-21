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

/// yt-dlp updates itself once a week (YouTube changes often; an old copy stops finding songs).
/// Quietly in the background, a while after Luna starts; `stamp` remembers when it last ran.
/// A copy in a folder Luna can't write to (installed for all users) just stays as it is.
pub fn update_weekly(ytdlp: std::path::PathBuf, stamp: std::path::PathBuf) {
    std::thread::spawn(move || {
        const WEEK: u64 = 7 * 24 * 3600;
        let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
        let last: u64 = std::fs::read_to_string(&stamp).ok().and_then(|s| s.trim().parse().ok()).unwrap_or(0);
        if !ytdlp.exists() || now.saturating_sub(last) < WEEK {
            return;
        }
        std::thread::sleep(std::time::Duration::from_secs(90));
        let ok = Command::new(&ytdlp)
            .args(["-U", "--no-warnings"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .is_ok_and(|o| o.status.success());
        // a failure (offline) is tried again next start; done: a week from now
        if ok {
            if let Some(dir) = stamp.parent() {
                let _ = std::fs::create_dir_all(dir);
            }
            let _ = std::fs::write(&stamp, now.to_string());
        }
    });
}

#[derive(Serialize)]
pub struct Stream {
    pub url: String,
    pub ua: Option<String>,
}

/// The audio's own address for a link (or "ytsearch1:…"), found ahead of time so the song starts
/// at once when its turn comes (mpv would otherwise start yt-dlp then, a few seconds).
pub fn stream(ytdlp: &Path, url: &str) -> Result<Stream, String> {
    let v = run(ytdlp, &["-f", "bestaudio/best", "--no-playlist", url])?;
    // a search gives a list of one
    let v = v["entries"].as_array().and_then(|l| l.first()).unwrap_or(&v);
    let url = v["url"].as_str().filter(|u| u.starts_with("http")).ok_or(tr!("Ses adresi bulunamadı", "No audio address found"))?;
    Ok(Stream { url: url.to_string(), ua: v["http_headers"]["User-Agent"].as_str().map(String::from) })
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

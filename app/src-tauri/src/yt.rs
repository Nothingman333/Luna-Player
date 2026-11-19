//! YouTube through yt-dlp (shipped next to mpv): finding a song's video and reading a link's title.
//! mpv plays the links itself with the same yt-dlp.

use serde::Serialize;
use serde_json::Value;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;

#[cfg(test)]
mod tests {
    #[test]
    fn a_link_is_never_read_as_an_option() {
        assert_eq!(super::with_url(&["-f", "x"], "--exec=calc"), vec!["-f", "x", "--", "--exec=calc"]);
        assert_eq!(super::with_url(&[], "-o"), vec!["--", "-o"]);
    }
    #[test]
    fn caption_entities_decode_once() {
        assert_eq!(super::vtt_text(" Tom &amp; Jerry &#39;n&#39; &quot;me&quot; "), "Tom & Jerry 'n' \"me\"");
        assert_eq!(super::vtt_text("a &amp;lt; b"), "a &lt; b");
    }
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
    /// on a playlist's songs: the list's own name
    #[serde(skip_serializing_if = "Option::is_none")]
    pub list: Option<String>,
}

/// `url` goes after `--`: a link that begins with a dash must never be read as a yt-dlp option (`--exec=…`, `-o`…).
fn with_url<'a>(opts: &[&'a str], url: &'a str) -> Vec<&'a str> {
    let mut v = opts.to_vec();
    v.push("--");
    v.push(url);
    v
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

/// A video's subtitles as plain text (Turkish, English, else the spoken language; made-up auto captions too),
/// so the assistant can summarise a YouTube page from what is said rather than from the page around it.
pub fn transcript(ytdlp: &Path, url: &str) -> Result<String, String> {
    if !ytdlp.exists() {
        return Err(tr!("yt-dlp bulunamadı", "yt-dlp is missing"));
    }
    // A run cut short (app closed or killed while yt-dlp was working) can leave its folder behind: such leftovers
    // older than 15 minutes are removed on the next call. A finished run removes its own folder right away.
    if let Ok(entries) = std::fs::read_dir(std::env::temp_dir()) {
        for e in entries.flatten() {
            let old = e.metadata().and_then(|m| m.modified()).ok().and_then(|t| t.elapsed().ok()).is_some_and(|age| age.as_secs() > 15 * 60);
            if old && e.file_name().to_string_lossy().starts_with("luna-subs-") && e.path().is_dir() { let _ = std::fs::remove_dir_all(e.path()); }
        }
    }
    let dir = std::env::temp_dir().join(format!("luna-subs-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0)));
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let out_tpl = dir.join("t.%(ext)s").to_string_lossy().to_string();
    let args = with_url(&["--no-warnings", "--socket-timeout", "10", "--ignore-errors", "--skip-download", "--no-playlist", "--write-subs", "--write-auto-subs",
        "--sub-langs", ".*-orig,en", "--sub-format", "vtt", "-o", &out_tpl], url);
    let _ = Command::new(ytdlp).args(&args).creation_flags(CREATE_NO_WINDOW).output().map_err(|e| e.to_string());
    let files: Vec<PathBuf> = std::fs::read_dir(&dir).map(|r| r.flatten().map(|e| e.path()).filter(|p| p.extension().is_some_and(|x| x == "vtt")).collect()).unwrap_or_default();
    // the spoken language's own captions first (what is really said); English after. Turkish ("tr") is not asked for:
    // on most videos it is YouTube's machine translation, which answers HTTP 429 and then no subtitles come at all.
    let rank = |p: &PathBuf| { let n = p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(); if n.ends_with("-orig.vtt") { 0 } else if n.ends_with(".en.vtt") { 1 } else { 2 } };
    let best = files.iter().min_by_key(|p| rank(p)).cloned();
    let raw = best.and_then(|p| std::fs::read_to_string(p).ok());
    let _ = std::fs::remove_dir_all(&dir);
    let raw = raw.ok_or_else(|| tr!("Bu videonun altyazısı yok", "This video has no subtitles"))?;
    let mut text = String::new();
    let mut last = String::new();
    for line in raw.lines() {
        let l = line.trim();
        if l.is_empty() || l.starts_with("WEBVTT") || l.starts_with("Kind:") || l.starts_with("Language:") || l.starts_with("NOTE") || l.contains("-->") || l.chars().all(|c| c.is_ascii_digit()) { continue; }
        // auto captions carry word timings in <...> tags and repeat each line while it scrolls
        let mut clean = String::new(); let mut tag = false;
        for c in l.chars() { match c { '<' => tag = true, '>' => tag = false, _ if !tag => clean.push(c), _ => {} } }
        let clean = vtt_text(&clean);
        if clean.is_empty() || clean == last { continue; }
        text.push_str(&clean); text.push('\n');
        last = clean;
        if text.len() > 60_000 { break; }
    }
    if text.trim().is_empty() { return Err(tr!("Bu videonun altyazısı yok", "This video has no subtitles")); }
    Ok(text)
}

/// A caption line's entities decoded once: "&amp;" last, so a caption that shows "&lt;" literally
/// (written "&amp;lt;") is not decoded a second time into "<".
fn vtt_text(s: &str) -> String {
    s.replace("&nbsp;", " ").replace("&gt;", ">").replace("&lt;", "<").replace("&quot;", "\"").replace("&#39;", "'").replace("&apos;", "'")
        .replace("&amp;", "&").trim().to_string()
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
        list: None,
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
                list: None,
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
    let v = run(ytdlp, &with_url(&["-f", "bestaudio/best", "--no-playlist"], url))?;
    // a search gives a list of one
    let v = v["entries"].as_array().and_then(|l| l.first()).unwrap_or(&v);
    let url = v["url"].as_str().filter(|u| u.starts_with("http")).ok_or(tr!("Ses adresi bulunamadı", "No audio address found"))?;
    Ok(Stream { url: url.to_string(), ua: v["http_headers"]["User-Agent"].as_str().map(String::from) })
}

/// The picture of a YouTube song whose sound is already playing: a video-only stream (up to 1080p, no AV1 so every
/// GPU decodes it), added beside the sound instead of opening the song again.
pub fn video_stream(ytdlp: &Path, url: &str) -> Result<Stream, String> {
    let v = run(ytdlp, &with_url(&["-f", "bestvideo[height<=?1080][vcodec^=avc1]/bestvideo[height<=?1080][vcodec^=vp9]/bestvideo[height<=?1080]", "--no-playlist"], url))?;
    let v = v["entries"].as_array().and_then(|l| l.first()).unwrap_or(&v);
    let url = v["url"].as_str().filter(|u| u.starts_with("https://")).ok_or(tr!("Video adresi bulunamadı", "No video address found"))?;
    Ok(Stream { url: url.to_string(), ua: v["http_headers"]["User-Agent"].as_str().map(String::from) })
}

/// What a page's media is, for "Luna'da oynat" from any site: sound only or a picture, how long, and whose.
#[derive(Serialize)]
pub struct Probe {
    pub audio: bool,
    pub duration: Option<f64>,
    pub title: String,
    pub channel: String,
    pub site: String,
    pub thumb: Option<String>,
    /// a talk site (its shows are podcasts, even when they are filmed)
    pub podcast: bool,
    /// the file's own address (to measure a sound that doesn't say how long it is)
    #[serde(skip)]
    pub direct: Option<String>,
}

pub fn probe(ytdlp: &Path, url: &str) -> Result<Probe, String> {
    let v = run(ytdlp, &with_url(&["--no-playlist"], url))?;
    let v = v["entries"].as_array().and_then(|l| l.first()).unwrap_or(&v);
    let none = |x: &Value| x.as_str().is_none_or(|c| c == "none");
    // sound only: the chosen stream has no picture and no format of the page has one either
    let formats = v["formats"].as_array();
    let audio = none(&v["vcodec"]) && formats.is_none_or(|f| f.iter().all(|x| none(&x["vcodec"]) || x["vcodec"].is_null() && x["ext"].as_str().is_some_and(|e| ["mp3", "m4a", "aac", "ogg", "opus", "wav", "flac"].contains(&e))))
        || v["ext"].as_str().is_some_and(|e| ["mp3", "m4a", "aac", "ogg", "opus", "wav", "flac"].contains(&e));
    let s = |k: &str| v[k].as_str().unwrap_or("").to_string();
    Ok(Probe {
        audio,
        duration: v["duration"].as_f64(),
        title: s("title"),
        channel: [s("series"), s("channel"), s("uploader"), s("playlist_title")].into_iter().find(|x| !x.is_empty()).unwrap_or_default(),
        site: s("extractor_key"),
        thumb: v["thumbnail"].as_str().map(String::from),
        podcast: false,
        direct: v["url"].as_str().filter(|u| u.starts_with("http")).map(String::from),
    })
}

/// The first `n` YouTube results for a search.
pub fn search(ytdlp: &Path, query: &str, n: u32) -> Result<Vec<Hit>, String> {
    let v = run(ytdlp, &["--flat-playlist", &format!("ytsearch{n}:{query}")])?;
    Ok(v["entries"].as_array().map(|l| l.iter().filter_map(hit).collect()).unwrap_or_default())
}

/// What a link is: one video, or the videos of a playlist.
pub fn info(ytdlp: &Path, url: &str) -> Result<Vec<Hit>, String> {
    let v = run(ytdlp, &with_url(&["--flat-playlist", "--playlist-end", "200"], url))?;
    match v["entries"].as_array() {
        Some(l) => {
            let name = v["title"].as_str().map(str::to_string).filter(|t| !t.is_empty());
            Ok(l.iter().filter_map(hit).map(|mut h| { h.list = name.clone(); h }).collect())
        }
        None => Ok(hit(&v).into_iter().collect()),
    }
}

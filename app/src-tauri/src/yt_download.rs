//! Saves a YouTube video (or a whole playlist) or its sound to disk with the bundled yt-dlp (the add-on's "İndir" choices).
//! Without ffmpeg next to yt-dlp, YouTube's HD picture and sound come as separate streams that can't be joined,
//! so a video then falls back to the best single-file stream (usually 360p); sound-only (m4a) always works.

use serde::Serialize;
use std::io::{BufRead, BufReader};
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Serialize, Clone)]
pub struct Progress {
    pub id: String,
    pub title: String,
    pub percent: f64,
    pub state: &'static str, // "run" | "done" | "error"
    pub file: Option<String>,
    pub error: Option<String>,
    pub kind: String,
    /// for a whole list: which item is downloading and how many there are
    pub item: Option<(u32, u32)>,
}

pub fn ffmpeg_next_to(ytdlp: &Path) -> Option<PathBuf> {
    let dir = ytdlp.parent()?;
    [dir.join("ffmpeg.exe"), dir.join("ffmpeg").join("ffmpeg.exe")].into_iter().find(|p| p.exists())
}

const YT_HOSTS: [&str; 4] = ["www.youtube.com", "youtube.com", "m.youtube.com", "music.youtube.com"];

/// Only YouTube watch / short links (one video, never a whole playlist).
pub fn checked(url: &str) -> Option<String> {
    let u = url::Url::parse(url).ok()?;
    let host = u.host_str()?.to_ascii_lowercase();
    let ok = u.scheme() == "https"
        && (YT_HOSTS.contains(&host.as_str()) && (u.path() == "/watch" && u.query_pairs().any(|(k, _)| k == "v") || u.path().starts_with("/shorts/"))
            || host == "youtu.be" && u.path().len() > 1);
    ok.then(|| url.to_string())
}

/// A YouTube link that names a playlist (a /playlist page, or a video opened inside a list) → the list's own address.
pub fn checked_list(url: &str) -> Option<String> {
    let u = url::Url::parse(url).ok()?;
    let host = u.host_str()?.to_ascii_lowercase();
    let list = u.query_pairs().find(|(k, _)| k == "list").map(|(_, v)| v.to_string())?;
    let ok = u.scheme() == "https"
        && YT_HOSTS.contains(&host.as_str())
        && !list.is_empty()
        && list.len() <= 64
        && list.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
    ok.then(|| format!("https://www.youtube.com/playlist?list={list}"))
}

pub fn format_for(kind: &str, height: u32, ffmpeg: bool) -> Vec<String> {
    if kind == "audio" {
        return vec!["-f".into(), "bestaudio[ext=m4a]/bestaudio".into()];
    }
    let h = height.clamp(144, 2160);
    if ffmpeg {
        vec!["-f".into(), format!("bv*[height<={h}][ext=mp4]+ba[ext=m4a]/bv*[height<={h}]+ba/b[height<={h}]"), "--merge-output-format".into(), "mp4".into()]
    } else {
        vec!["-f".into(), format!("b[height<={h}][vcodec!=none][acodec!=none]/b[vcodec!=none][acodec!=none]")]
    }
}

/// "3/12 45.2%" → (Some((3, 12)), 45.2); a single video prints "NA/NA 45.2%".
fn parse_progress(p: &str) -> (Option<(u32, u32)>, f64) {
    let mut parts = p.split_whitespace();
    let pos = parts.next().and_then(|s| s.split_once('/')).and_then(|(i, n)| Some((i.parse().ok()?, n.parse().ok()?)));
    let pct = parts.next().unwrap_or("0").trim_end_matches('%').parse().unwrap_or(0.0);
    (pos, pct)
}

#[allow(clippy::too_many_arguments)]
pub fn start(app: AppHandle, ytdlp: PathBuf, url: String, kind: String, height: u32, dir: PathBuf, title: String, playlist: bool) -> Result<String, String> {
    let url = if playlist {
        checked_list(&url).ok_or("Bu bağlantıda bir YouTube oynatma listesi yok")?
    } else {
        checked(&url).ok_or("Yalnız tek bir YouTube videosu indirilebilir")?
    };
    if !ytdlp.exists() {
        return Err("yt-dlp bulunamadı".into());
    }
    let dir = dir.join(if kind == "audio" { "Luna Müzik" } else { "Luna Video" });
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let id = format!("{:x}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0));
    let ffmpeg = ffmpeg_next_to(&ytdlp);
    let mut cmd = Command::new(&ytdlp);
    // UTF-8 output: otherwise "Luna Müzik" comes back garbled, reading stops, and yt-dlp's next write fails (Errno 22)
    cmd.env("PYTHONIOENCODING", "utf-8").env("PYTHONUTF8", "1").args(["--encoding", "utf-8"]);
    cmd.args(["--no-warnings", "--newline", "--restrict-filenames", "--socket-timeout", "15"])
        .arg(if playlist { "--yes-playlist" } else { "--no-playlist" })
        .args(format_for(&kind, height, ffmpeg.is_some()))
        .args(["--progress-template", if playlist { "download:LUNA %(info.playlist_index)s/%(info.n_entries)s %(progress._percent_str)s" } else { "download:LUNA NA/NA %(progress._percent_str)s" }])
        .args(["--print", "after_move:LUNAFILE %(filepath)s"])
        .arg("-o")
        .arg(dir.join(if playlist { "%(playlist_title).80B/%(playlist_index)03d %(title).100B [%(id)s].%(ext)s" } else { "%(title).120B [%(id)s].%(ext)s" }));
    if playlist {
        // a private or removed video in the list is skipped; the rest still comes down
        cmd.arg("--ignore-errors");
    }
    if let Some(f) = &ffmpeg {
        cmd.arg("--ffmpeg-location").arg(f);
    }
    cmd.arg("--").arg(&url).stdout(Stdio::piped()).stderr(Stdio::piped()).creation_flags(CREATE_NO_WINDOW);
    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    let out = child.stdout.take();
    let err = child.stderr.take();
    let tid = id.clone();
    std::thread::spawn(move || {
        let send = |p: Progress| { let _ = app.emit("yt-download", p); };
        let base = |percent: f64, state: &'static str| Progress { id: tid.clone(), title: title.clone(), percent, state, file: None, error: None, kind: kind.clone(), item: None };
        send(base(0.0, "run"));
        let mut file = None;
        let mut last = -1.0f64;
        if let Some(out) = out {
            // read every line to the end, even one that isn't valid UTF-8, so the pipe never closes early
            for line in BufReader::new(out).split(b'\n').map_while(Result::ok).map(|b| String::from_utf8_lossy(&b).trim_end_matches('\r').to_string()) {
                if let Some(p) = line.strip_prefix("LUNA ") {
                    let (pos, pct) = parse_progress(p);
                    let v = match pos { Some((i, n)) if n > 0 => ((i.max(1) - 1) as f64 + pct / 100.0) / n as f64 * 100.0, _ => pct };
                    if (v - last).abs() >= 2.0 || v >= 100.0 {
                        last = v;
                        let mut r = base(v, "run");
                        r.item = pos;
                        send(r);
                    }
                } else if let Some(f) = line.strip_prefix("LUNAFILE ") {
                    let f = PathBuf::from(f.trim());
                    // a whole list ends as its folder
                    let f = if playlist { f.parent().map(Path::to_path_buf).unwrap_or(f) } else { f };
                    file = Some(f.to_string_lossy().to_string());
                }
            }
        }
        let mut msg = String::new();
        if let Some(e) = err { for l in BufReader::new(e).lines().map_while(Result::ok) { if l.contains("ERROR") { msg = l.replace("ERROR: ", ""); } } }
        // with --ignore-errors one skipped video makes the exit code non-zero; a list that saved files still counts as done
        let ok = child.wait().map(|s| s.success()).unwrap_or(false) || playlist && file.is_some();
        let mut done = base(100.0, if ok { "done" } else { "error" });
        done.file = file;
        if !ok { done.error = Some(if msg.is_empty() { "İndirme tamamlanamadı".into() } else { msg.chars().take(300).collect() }); }
        send(done);
    });
    Ok(id)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_single_youtube_videos() {
        assert!(checked("https://www.youtube.com/watch?v=abc").is_some());
        assert!(checked("https://youtu.be/abc").is_some());
        assert!(checked("https://music.youtube.com/watch?v=abc&list=x").is_some());
        for bad in ["https://www.youtube.com/playlist?list=x", "http://www.youtube.com/watch?v=a", "https://evil.com/watch?v=a", "file:///c:/x"] {
            assert!(checked(bad).is_none(), "{bad}");
        }
        assert_eq!(checked_list("https://www.youtube.com/watch?v=a&list=PL_x-1&index=4").as_deref(), Some("https://www.youtube.com/playlist?list=PL_x-1"));
        assert!(checked_list("https://www.youtube.com/watch?v=a").is_none());
        assert!(checked_list("https://evil.com/playlist?list=PL1").is_none());
        assert_eq!(parse_progress("3/12 50.0%"), (Some((3, 12)), 50.0));
        assert_eq!(parse_progress("NA/NA 7.5%"), (None, 7.5));
        assert!(format_for("video", 1080, false)[1].contains("acodec!=none"));
        assert!(format_for("video", 720, true)[1].contains("height<=720"));
    }
}

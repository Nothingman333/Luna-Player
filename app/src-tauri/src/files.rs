//! File-level helpers for the library: media info, thumbnails, folder browsing,
//! "show in Explorer" and delete-to-Recycle-Bin.

use serde::Serialize;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
pub const VIDEO_EXT: &[&str] = &[
    "mkv", "mp4", "avi", "mov", "wmv", "webm", "m4v", "ts", "m2ts", "flv", "mpg", "mpeg",
];

pub fn is_video(p: &Path) -> bool {
    p.extension()
        .and_then(|x| x.to_str())
        .is_some_and(|x| VIDEO_EXT.contains(&x.to_lowercase().as_str()))
}

fn mpv_com(mpv_exe: &Path) -> PathBuf {
    mpv_exe.with_file_name("mpv.com")
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MediaInfo {
    pub width: u32,
    pub height: u32,
    pub codec: String,
    pub gamma: String,
    pub dolby_vision: bool,
    pub audio_codec: String,
    pub channels: u32,
    pub duration: f64,
    pub size: u64,
}

/// Reads the real stream properties by letting mpv open the file without output.
pub fn probe(mpv_exe: &Path, file: &str) -> Result<MediaInfo, String> {
    let fmt = "--term-playing-msg=MPINFO|${width}|${height}|${current-tracks/video/codec}|\
${video-params/gamma}|${current-tracks/video/dolby-vision-profile}|${current-tracks/audio/codec}|\
${current-tracks/audio/demux-channel-count}|${=duration}";
    let out = Command::new(mpv_com(mpv_exe))
        .args([
            "--no-config", "--vo=null", "--ao=null", "--frames=1", "--hwdec=no",
            "--term-status-msg=", fmt, file,
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| e.to_string())?;
    let text = String::from_utf8_lossy(&out.stdout);
    let line = text.lines().find(|l| l.starts_with("MPINFO|")).ok_or(tr!("Bilgi okunamadı", "Couldn't read the info"))?;
    let f: Vec<&str> = line.split('|').collect();
    let num = |i: usize| f.get(i).and_then(|s| s.trim().parse::<f64>().ok()).unwrap_or(0.0);
    let txt = |i: usize| {
        let s = f.get(i).map(|s| s.trim()).unwrap_or("");
        if s == "(unavailable)" { String::new() } else { s.to_string() }
    };
    Ok(MediaInfo {
        width: num(1) as u32,
        height: num(2) as u32,
        codec: txt(3),
        gamma: txt(4),
        dolby_vision: !txt(5).is_empty(),
        audio_codec: txt(6),
        channels: num(7) as u32,
        duration: num(8),
        size: std::fs::metadata(file).map(|m| m.len()).unwrap_or(0),
    })
}

/// A frame from ~15% into the video, cached as JPEG.
pub fn thumbnail(mpv_exe: &Path, file: &str, cache: &Path) -> Result<String, String> {
    use std::hash::{Hash, Hasher};
    let mut h = std::collections::hash_map::DefaultHasher::new();
    file.hash(&mut h);
    std::fs::metadata(file).map(|m| m.len()).unwrap_or(0).hash(&mut h);
    let name = format!("{:016x}.jpg", h.finish());
    let target = cache.join(&name);
    if target.exists() {
        return Ok(target.to_string_lossy().into_owned());
    }
    std::fs::create_dir_all(cache).map_err(|e| e.to_string())?;
    let tmp = cache.join(format!("tmp-{:016x}", h.finish()));
    let _ = std::fs::create_dir_all(&tmp);
    Command::new(mpv_com(mpv_exe))
        .args([
            "--no-config", "--ao=null", "--sid=no", "--frames=1", "--start=15%", "--hwdec=no",
            "--vo=image", "--vo-image-format=jpg", "--vo-image-jpeg-quality=82",
            "--vf=scale=480:-2", "--really-quiet",
        ])
        .arg(format!("--vo-image-outdir={}", tmp.display()))
        .arg(file)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| e.to_string())?;
    let produced = std::fs::read_dir(&tmp)
        .map_err(|e| e.to_string())?
        .flatten()
        .map(|e| e.path())
        .find(|p| p.extension().is_some_and(|x| x == "jpg"))
        .ok_or(tr!("Kare alınamadı", "Couldn't grab a frame"))?;
    std::fs::rename(&produced, &target).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_dir_all(&tmp);
    Ok(target.to_string_lossy().into_owned())
}

/// A small frame at `secs` for the seek-bar hover preview (cached per file and second).
pub fn frame_at(mpv_exe: &Path, file: &str, secs: u32, cache: &Path) -> Result<String, String> {
    use std::hash::{Hash, Hasher};
    let mut h = std::collections::hash_map::DefaultHasher::new();
    file.hash(&mut h);
    let dir = cache.join(format!("{:016x}", h.finish()));
    let target = dir.join(format!("{secs}.jpg"));
    if target.exists() {
        return Ok(target.to_string_lossy().into_owned());
    }
    let jpg = crate::preview::frame(mpv_exe, file, secs)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(&target, jpg).map_err(|e| e.to_string())?;
    Ok(target.to_string_lossy().into_owned())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub videos: u32,
}

/// Sub-folders (with how many videos they hold) and videos of one folder.
pub fn list_dir(dir: &str) -> Result<Vec<Entry>, String> {
    fn count(p: &Path, depth: u32) -> u32 {
        let Ok(rd) = std::fs::read_dir(p) else { return 0 };
        rd.flatten()
            .map(|e| {
                let p = e.path();
                if p.is_dir() {
                    if depth < 4 { count(&p, depth + 1) } else { 0 }
                } else {
                    is_video(&p) as u32
                }
            })
            .sum()
    }
    let mut out: Vec<Entry> = std::fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .flatten()
        .filter_map(|e| {
            let p = e.path();
            let name = e.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') || name.starts_with('$') {
                return None;
            }
            if p.is_dir() {
                let videos = count(&p, 0);
                (videos > 0).then(|| Entry { name, path: p.to_string_lossy().into(), is_dir: true, size: 0, videos })
            } else if is_video(&p) {
                let size = e.metadata().map(|m| m.len()).unwrap_or(0);
                Some(Entry { name, path: p.to_string_lossy().into(), is_dir: false, size, videos: 0 })
            } else {
                None
            }
        })
        .collect();
    out.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(out)
}

pub fn reveal(file: &str) -> Result<(), String> {
    // Explorer wants `/select,"C:\dir with spaces\file"` exactly; Rust's normal quoting wraps the
    // whole argument instead, which Explorer doesn't understand (it then opens Documents).
    let p = Path::new(file);
    let mut cmd = Command::new("explorer.exe");
    if p.exists() {
        cmd.raw_arg(format!("/select,\"{}\"", file.replace('/', "\\")));
    } else if let Some(dir) = p.ancestors().skip(1).find(|d| d.is_dir()) {
        // File not on disk (e.g. a torrent not downloaded yet): open the nearest existing folder.
        cmd.raw_arg(format!("\"{}\"", dir.display()));
    } else {
        return Err(tr!("Dosya bulunamadı", "File not found"));
    }
    cmd.spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// Moves the video (and its matching subtitle files) to the Recycle Bin.
pub fn delete(file: &str) -> Result<u32, String> {
    let p = Path::new(file);
    let mut items = vec![p.to_path_buf()];
    if let (Some(dir), Some(stem)) = (p.parent(), p.file_stem().and_then(|s| s.to_str())) {
        if let Ok(rd) = std::fs::read_dir(dir) {
            for e in rd.flatten() {
                let q = e.path();
                let n = e.file_name().to_string_lossy().to_lowercase();
                let is_sub = ["srt", "ass", "ssa", "vtt", "sub", "idx"]
                    .iter()
                    .any(|x| n.ends_with(&format!(".{x}")));
                if is_sub && n.starts_with(&stem.to_lowercase()) {
                    items.push(q);
                }
            }
        }
    }
    let n = items.len() as u32;
    trash::delete_all(&items).map_err(|e| e.to_string())?;
    Ok(n)
}

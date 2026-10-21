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

/// Runs `cmd` and returns its stdout, killing it if it takes longer than `secs`.
fn run_limited(mut cmd: Command, secs: u64) -> Result<Vec<u8>, String> {
    use std::io::Read;
    use std::process::Stdio;
    let mut child = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| e.to_string())?;
    let mut out = child.stdout.take();
    let reader = std::thread::spawn(move || {
        let mut buf = Vec::new();
        if let Some(o) = out.as_mut() {
            let _ = o.read_to_end(&mut buf);
        }
        buf
    });
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(secs);
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if std::time::Instant::now() < deadline => std::thread::sleep(std::time::Duration::from_millis(50)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = reader.join();
                return Err(tr!("Zaman aşımı", "Timed out"));
            }
        }
    }
    Ok(reader.join().unwrap_or_default())
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
    let mut cmd = Command::new(mpv_com(mpv_exe));
    cmd.args(["--no-config", "--vo=null", "--ao=null", "--frames=1", "--hwdec=no", "--term-status-msg=", fmt, file]);
    let out = run_limited(cmd, 30)?;
    let text = String::from_utf8_lossy(&out);
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
    let mut cmd = Command::new(mpv_com(mpv_exe));
    cmd.args([
        "--no-config", "--ao=null", "--sid=no", "--frames=1", "--start=15%", "--hwdec=no",
        "--vo=image", "--vo-image-format=jpg", "--vo-image-jpeg-quality=82",
        "--vf=scale=480:-2", "--really-quiet",
    ])
    .arg(format!("--vo-image-outdir={}", tmp.display()))
    .arg(file);
    let ran = run_limited(cmd, 30);
    let produced = std::fs::read_dir(&tmp)
        .ok()
        .and_then(|rd| rd.flatten().map(|e| e.path()).find(|p| p.extension().is_some_and(|x| x == "jpg")));
    let Some(produced) = produced else {
        let _ = std::fs::remove_dir_all(&tmp);
        ran?;
        return Err(tr!("Kare alınamadı", "Couldn't grab a frame"));
    };
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

/// `name` (lower case) is a subtitle of the video `stem`: "stem.srt" or "stem.<language / tags>.srt",
/// where the tags are language codes, numbers or forced / sdh / hi / cc.
fn is_own_sub(name: &str, stem: &str) -> bool {
    let Some(rest) = name.strip_prefix(stem) else { return false };
    let Some(rest) = rest.strip_prefix('.') else { return false };
    let mut parts: Vec<&str> = rest.split('.').collect();
    parts.pop(); // the extension
    parts.iter().all(|t| {
        let lang = (2..=3).contains(&t.len()) && t.chars().all(|c| c.is_ascii_alphabetic())
            || t.len() == 5 && t.as_bytes()[2] == b'-' && t.chars().filter(|c| *c != '-').all(|c| c.is_ascii_alphabetic());
        lang || t.chars().all(|c| c.is_ascii_digit()) || ["forced", "sdh", "hi", "cc", "default", "full"].contains(t)
    })
}

const SUB_EXT: &[&str] = &["srt", "ass", "ssa", "vtt", "sub", "idx"];

/// The subtitle files that belong to the video `p` in its folder ("Film.srt", "Film.tr.srt"…).
fn own_subs(p: &Path) -> Vec<PathBuf> {
    let (Some(dir), Some(stem)) = (p.parent(), p.file_stem().and_then(|s| s.to_str())) else { return vec![] };
    let stem = stem.to_lowercase();
    let Ok(rd) = std::fs::read_dir(dir) else { return vec![] };
    rd.flatten()
        .filter(|e| {
            let n = e.file_name().to_string_lossy().to_lowercase();
            SUB_EXT.iter().any(|x| n.ends_with(&format!(".{x}"))) && is_own_sub(&n, &stem)
        })
        .map(|e| e.path())
        .collect()
}

/// How many subtitle files sit next to each video (0 for links and missing files).
pub fn subs_beside(paths: &[String]) -> Vec<u32> {
    paths.iter().map(|f| {
        let p = Path::new(f);
        if f.contains("://") || !p.is_file() { 0 } else { own_subs(p).len() as u32 }
    }).collect()
}

/// Gives the video a new name in the same folder (the extension stays); its own subtitle files
/// are renamed with it so they keep matching. Returns the new path.
pub fn rename(file: &str, new_name: &str) -> Result<String, String> {
    let p = Path::new(file);
    let ext = p.extension().and_then(|x| x.to_str()).unwrap_or("");
    let mut stem = new_name.trim().to_string();
    // "New name.mkv" typed with the same extension: not doubled
    if !ext.is_empty() && stem.to_lowercase().ends_with(&format!(".{}", ext.to_lowercase())) {
        stem.truncate(stem.len() - ext.len() - 1);
    }
    let stem = stem.trim().trim_end_matches('.').to_string();
    if stem.is_empty() || stem.chars().any(|c| r#"\/:*?"<>|"#.contains(c) || c.is_control()) {
        return Err(tr!("Bu ad kullanılamaz (şunlar olmamalı: \\ / : * ? \" < > |)", "That name can't be used (none of these: \\ / : * ? \" < > |)"));
    }
    let old_stem = p.file_stem().and_then(|s| s.to_str()).ok_or_else(|| tr!("Dosya bulunamadı", "File not found"))?;
    let dir = p.parent().ok_or_else(|| tr!("Dosya bulunamadı", "File not found"))?;
    if !p.is_file() {
        return Err(tr!("Dosya bulunamadı", "File not found"));
    }
    let to = dir.join(if ext.is_empty() { stem.clone() } else { format!("{stem}.{ext}") });
    if to == p {
        return Ok(file.to_string());
    }
    // only the case changes ("alien" → "Alien"): Windows sees the same file, that's fine
    if to.exists() && to.to_string_lossy().to_lowercase() != p.to_string_lossy().to_lowercase() {
        return Err(tr!("Bu klasörde aynı adda bir dosya var", "A file with that name is already in this folder"));
    }
    let subs = own_subs(p);
    std::fs::rename(p, &to).map_err(|e| e.to_string())?;
    for s in subs {
        let n = s.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        let tail = &n[old_stem.len().min(n.len())..];
        let _ = std::fs::rename(&s, dir.join(format!("{stem}{tail}")));
    }
    Ok(to.to_string_lossy().to_string())
}

/// Moves the file to the Recycle Bin; a video takes its matching subtitle files along
/// (a book or a song never does: "Film.pdf" must not take "Film.tr.srt" of "Film.mkv").
pub fn delete(file: &str) -> Result<u32, String> {
    let p = Path::new(file);
    let mut items = vec![p.to_path_buf()];
    if is_video(p) {
        items.extend(own_subs(p));
    }
    let n = items.len() as u32;
    trash::delete_all(&items).map_err(|e| e.to_string())?;
    Ok(n)
}

#[cfg(test)]
mod tests {
    use super::is_own_sub;
    #[test]
    fn own_subtitles_only() {
        for n in ["alien.srt", "alien.en.srt", "alien.tr.forced.srt", "alien.en.2.srt", "alien.pt-br.srt"] {
            assert!(is_own_sub(n, "alien"), "{n}");
        }
        for n in ["aliens.en.srt", "alien.covenant.tr.srt", "alien resurrection.srt", "alien3.srt"] {
            assert!(!is_own_sub(n, "alien"), "{n}");
        }
    }
}

#[cfg(test)]
mod probe_tests {
    use super::{rename, subs_beside};

    #[test]
    fn rename_takes_subtitles_along() {
        let d = std::env::temp_dir().join(format!("luna-rename-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        for n in ["Alien.1979.mkv", "Alien.1979.srt", "Alien.1979.tr.srt", "Aliens.srt", "Other.mkv"] {
            std::fs::write(d.join(n), b"x").unwrap();
        }
        let f = d.join("Alien.1979.mkv").to_string_lossy().to_string();
        assert_eq!(subs_beside(&[f.clone()]), vec![2]);
        assert!(rename(&f, "Bad/Name").is_err());
        assert!(rename(&f, "Other").is_err());
        let to = rename(&f, "Alien (1979).mkv").unwrap();
        assert!(to.ends_with("Alien (1979).mkv"));
        for n in ["Alien (1979).mkv", "Alien (1979).srt", "Alien (1979).tr.srt", "Aliens.srt"] {
            assert!(d.join(n).exists(), "{n}");
        }
        assert!(!d.join("Alien.1979.mkv").exists());
        let _ = std::fs::remove_dir_all(&d);
    }

    /// mpv reads a real file's streams; an address that never answers is cut off by the time limit.
    #[test]
    #[ignore]
    fn probe_and_timeout() {
        let exe = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("mpv").join("mpv.exe");
        let file = std::env::var("LUNA_TEST_VIDEO").unwrap();
        let t = std::time::Instant::now();
        let info = super::probe(&exe, &file).expect("probe");
        println!("{}x{} {} {:.0}s in {:?}", info.width, info.height, info.codec, info.duration, t.elapsed());
        let t = std::time::Instant::now();
        // 10.255.255.1 is unroutable: the connection just hangs
        let r = super::probe(&exe, "http://10.255.255.1/video.mkv");
        println!("unreachable: {:?} after {:?}", r.err(), t.elapsed());
        assert!(t.elapsed().as_secs() <= 35);
    }
}

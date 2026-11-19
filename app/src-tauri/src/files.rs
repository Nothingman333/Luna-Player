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
    crate::media_probe::probe(mpv_exe, file).or_else(|_| probe_once(mpv_exe, file))
}

fn probe_once(mpv_exe: &Path, file: &str) -> Result<MediaInfo, String> {
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

/// Size and modification time of `file`: part of the cached frames' keys, so a video replaced by
/// another one (a better release under the same name) does not keep showing the old one's frames
/// (seek previews and stills were keyed by the path alone).
fn file_stamp(file: &str) -> (u64, u64) {
    let meta = std::fs::metadata(file).ok();
    let mtime = meta.as_ref().and_then(|m| m.modified().ok()).and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_nanos() as u64).unwrap_or(0);
    (meta.map(|m| m.len()).unwrap_or(0), mtime)
}

/// A scratch folder of its own for one mpv run: two requests for the same video (the library and the
/// details page asking at once) used to share one folder, and one of them then reported no frame.
fn scratch_dir(cache: &Path, key: &str) -> PathBuf {
    static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let n = NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    cache.join(format!("tmp-{key}-{}-{n}", std::process::id()))
}

/// Moves the frame mpv wrote to `target`; when another run finished first, its picture is used.
fn keep_frame(produced: &Path, target: &Path) -> Result<(), String> {
    match std::fs::rename(produced, target) {
        Ok(()) => Ok(()),
        Err(_) if target.exists() => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// A frame from ~15% into the video, cached as JPEG.
pub fn thumbnail(mpv_exe: &Path, file: &str, cache: &Path) -> Result<String, String> {
    let key = crate::stable_cache::file_key("thumbnail", file, b"");
    let name = format!("{key}.jpg");
    let target = cache.join(&name);
    if target.exists() {
        return Ok(target.to_string_lossy().into_owned());
    }
    std::fs::create_dir_all(cache).map_err(|e| e.to_string())?;
    let tmp = scratch_dir(cache, &key);
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
    let kept = keep_frame(&produced, &target);
    let _ = std::fs::remove_dir_all(&tmp);
    kept?;
    Ok(target.to_string_lossy().into_owned())
}

/// A large frame (1600 px wide) at `secs`, for cards people share (cached per file and tenth of a second).
pub fn still(mpv_exe: &Path, file: &str, secs: f64, cache: &Path) -> Result<std::path::PathBuf, String> {
    let key = crate::stable_cache::file_key("still", file, &((secs * 10.0).round() as u64).to_le_bytes());
    let target = cache.join(format!("{key}.jpg"));
    if target.exists() {
        return Ok(target);
    }
    std::fs::create_dir_all(cache).map_err(|e| e.to_string())?;
    let tmp = scratch_dir(cache, &key);
    let _ = std::fs::create_dir_all(&tmp);
    let mut cmd = Command::new(mpv_com(mpv_exe));
    cmd.args([
        "--no-config", "--ao=null", "--sid=no", "--frames=1", "--hwdec=no",
        "--vo=image", "--vo-image-format=jpg", "--vo-image-jpeg-quality=90",
        "--vf=scale=1600:-2", "--really-quiet",
    ])
    .arg(format!("--start={secs:.2}"))
    .arg(format!("--vo-image-outdir={}", tmp.display()))
    .arg(file);
    let ran = run_limited(cmd, 40);
    let produced = std::fs::read_dir(&tmp)
        .ok()
        .and_then(|rd| rd.flatten().map(|e| e.path()).find(|p| p.extension().is_some_and(|x| x == "jpg")));
    let Some(produced) = produced else {
        let _ = std::fs::remove_dir_all(&tmp);
        ran?;
        return Err(tr!("Kare alınamadı", "Couldn't grab a frame"));
    };
    let kept = keep_frame(&produced, &target);
    let _ = std::fs::remove_dir_all(&tmp);
    kept?;
    Ok(target)
}

/// A small frame at `secs` for the seek-bar hover preview (cached per file and second).
pub fn frame_at(mpv_exe:&Path,file:&str,secs:u32,cache:&Path)->Result<String,String>{frame_at_with_headers(mpv_exe,file,secs,cache,None,None)}
pub fn frame_at_with_headers(mpv_exe: &Path, file: &str, secs: u32, cache: &Path,referrer:Option<&str>,agent:Option<&str>) -> Result<String, String> {
    let key = crate::stable_cache::file_key("preview", file, b"");
    let dir = cache.join(key);
    let target = dir.join(format!("{secs}.jpg"));
    if target.exists() {
        return Ok(target.to_string_lossy().into_owned());
    }
    let jpg = crate::preview::frame_with_headers(mpv_exe, file, secs,referrer,agent)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    // written beside and then renamed: the page may load the picture while it is still being written
    let tmp = scratch_dir(&dir, &secs.to_string()).with_extension("part");
    std::fs::write(&tmp, jpg).and_then(|_| std::fs::rename(&tmp, &target)).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        e.to_string()
    })?;
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
                    if depth < 4 && !crate::stable_cache::skip_directory(&p) { count(&p, depth + 1) } else { 0 }
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
                if crate::stable_cache::skip_directory(&p) { return None; }
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
        // the same backslash form as above: Explorer opens Documents for "C:/Films" style folders
        let dir = dir.to_string_lossy().replace('/', "\\");
        cmd.raw_arg(format!("\"{dir}\""));
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

/// For each video, the subtitle file to read its lines from: the one in the wanted language ("tr" or "en"), else English,
/// else any (hearing-impaired and forced-only files last). Empty for links, missing files and videos without a text subtitle.
pub fn best_subs(paths: &[String], want: &str) -> Vec<Option<String>> {
    paths.iter().map(|f| {
        let p = Path::new(f);
        if f.contains("://") || !p.is_file() { return None; }
        let stem = p.file_stem()?.to_str()?.to_lowercase();
        own_subs(p).into_iter()
            .filter(|s| matches!(s.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase()).as_deref(), Some("srt" | "vtt" | "ass" | "ssa")))
            .map(|s| { let n = s.file_name().and_then(|n| n.to_str()).unwrap_or("").to_lowercase(); (crate::shell_core::rank_sub(&n, &stem, want), s) })
            .max_by_key(|(r, s)| (*r, std::cmp::Reverse(s.as_os_str().len())))
            .map(|(_, s)| s.to_string_lossy().into_owned())
    }).collect()
}

/// Every .srt/.vtt that belongs to the audio file `f` (beside it, same name stem), sorted; empty for links and missing files.
pub fn beside_text_subs(f: &str) -> Vec<String> {
    let p = Path::new(f);
    if f.contains("://") || !p.is_file() { return vec![]; }
    let mut v: Vec<String> = own_subs(p).into_iter()
        .filter(|s| matches!(s.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase()).as_deref(), Some("srt" | "vtt")))
        .map(|s| s.to_string_lossy().into_owned()).collect();
    v.sort();
    v
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
pub fn rename_plan(file: &str, new_name: &str) -> Result<Vec<(PathBuf,PathBuf)>, String> {
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
    // Windows keeps CON, NUL, COM1… for devices: renaming a film to one of them failed halfway with a system error
    let device = stem.split('.').next().unwrap_or("").trim_end().to_ascii_uppercase();
    if matches!(device.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (device.len() == 4 && (device.starts_with("COM") || device.starts_with("LPT")) && device.as_bytes()[3].is_ascii_digit())
    {
        return Err(tr!("Windows bu adı kullanmaya izin vermiyor", "Windows doesn't allow that name"));
    }
    let old_stem = p.file_stem().and_then(|s| s.to_str()).ok_or_else(|| tr!("Dosya bulunamadı", "File not found"))?;
    let dir = p.parent().ok_or_else(|| tr!("Dosya bulunamadı", "File not found"))?;
    if !p.is_file() {
        return Err(tr!("Dosya bulunamadı", "File not found"));
    }
    let to = dir.join(if ext.is_empty() { stem.clone() } else { format!("{stem}.{ext}") });
    if to == p {
        return Ok(Vec::new());
    }
    // only the case changes ("alien" → "Alien"): Windows sees the same file, that's fine
    if to.exists() && to.to_string_lossy().to_lowercase() != p.to_string_lossy().to_lowercase() {
        return Err(tr!("Bu klasörde aynı adda bir dosya var", "A file with that name is already in this folder"));
    }
    // Match the ORIGINAL UTF-8 prefix, rather than slicing it by the video's byte length.
    // Unicode lowercasing can expand a character (İ), so those byte lengths need not agree.
    let mut moves = vec![(p.to_path_buf(), to.clone())];
    for sub in own_subs(p) {
        let name = sub.file_name().and_then(|n| n.to_str()).ok_or("Invalid subtitle filename")?;
        let boundary = name.char_indices().find_map(|(i, c)|
            (c == '.' && name[..i].to_lowercase() == old_stem.to_lowercase()).then_some(i))
            .ok_or("Subtitle prefix could not be matched")?;
        let target = dir.join(format!("{stem}{}", &name[boundary..]));
        if target.exists() && target.to_string_lossy().to_lowercase() != sub.to_string_lossy().to_lowercase() {
            return Err(tr!("Altyazının hedef adı zaten var; hiçbir dosya değiştirilmedi", "A subtitle destination already exists; no files were changed"));
        }
        moves.push((sub, target));
    }
    let nfo=p.with_extension("nfo");
    if nfo.is_file() {
        let target=to.with_extension("nfo");
        if target.exists() && target.to_string_lossy().to_lowercase()!=nfo.to_string_lossy().to_lowercase(){return Err("NFO destination already exists; no files changed".into());}
        moves.push((nfo,target));
    }
    Ok(moves)
}

pub fn rename(file:&str,new_name:&str)->Result<String,String>{
    let moves=rename_plan(file,new_name)?;
    if moves.is_empty(){return Ok(file.to_string());}
    let to=moves[0].1.clone();
    for (index, (from, target)) in moves.iter().enumerate() {
        if let Err(error) = std::fs::rename(from, target) {
            let mut rollback_failed = Vec::new();
            for (original, moved) in moves[..index].iter().rev() {
                if std::fs::rename(moved, original).is_err() { rollback_failed.push(moved.display().to_string()); }
            }
            return Err(format!("{error}; rollback failures: {}", rollback_failed.join(", ")));
        }
    }
    Ok(to.to_string_lossy().to_string())
}

/// Moves the file to the Recycle Bin; a video takes its matching subtitle files along
/// (a book or a song never does: "Film.pdf" must not take "Film.tr.srt" of "Film.mkv").
pub fn delete(file: &str) -> Result<u32, String> {
    let p = Path::new(file);
    // already gone from disk: nothing to move, the caller only forgets it
    if !p.exists() { return Ok(0); }
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
    fn rename_handles_expanding_unicode_prefixes_and_collisions() {
        let d = std::env::temp_dir().join(format!("luna-unicode-{}", std::process::id()));
        std::fs::create_dir_all(&d).unwrap();
        std::fs::write(d.join("İ.mkv"), b"video").unwrap();
        std::fs::write(d.join("i\u{307}.tr.srt"), b"subtitle").unwrap();
        std::fs::write(d.join("New.tr.srt"), b"existing").unwrap();
        assert!(rename(d.join("İ.mkv").to_str().unwrap(), "New").is_err());
        assert!(d.join("İ.mkv").exists());
        assert_eq!(std::fs::read(d.join("New.tr.srt")).unwrap(), b"existing");
        std::fs::remove_file(d.join("New.tr.srt")).unwrap();
        rename(d.join("İ.mkv").to_str().unwrap(), "New").unwrap();
        assert_eq!(std::fs::read(d.join("New.tr.srt")).unwrap(), b"subtitle");
        std::fs::remove_dir_all(&d).unwrap();
    }

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

/// Moves a finished download into a folder (made when missing) and returns its new path. A name already taken
/// there gets " (2)", " (3)"…; across drives it copies, then removes the original.
pub fn move_into(file: &str, dir: &str) -> Result<String, String> {
    let src = Path::new(file);
    if !src.is_file() { return Err("Dosya bulunamadı".into()); }
    let dir = Path::new(dir);
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    if src.parent().map(|p| p == dir).unwrap_or(false) { return Ok(file.to_string()); }
    let stem = src.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let ext = src.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    let mut to = dir.join(format!("{stem}{ext}"));
    let mut n = 2;
    while to.exists() { to = dir.join(format!("{stem} ({n}){ext}")); n += 1; }
    if std::fs::rename(src, &to).is_err() {
        std::fs::copy(src, &to).map_err(|e| e.to_string())?;
        std::fs::remove_file(src).map_err(|e| e.to_string())?;
    }
    Ok(to.to_string_lossy().into_owned())
}

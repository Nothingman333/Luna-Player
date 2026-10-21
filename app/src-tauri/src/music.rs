//! The music library: audio files under the music folders, their tags and album covers.
//! Tags are read once per file (kept in an index by path, size and modification time), covers
//! are copied into the cache so the page can show them.

use lofty::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

const AUDIO_EXT: &[&str] = &["mp3", "flac", "m4a", "aac", "ogg", "opus", "wav", "wma", "alac", "aiff", "aif", "ape", "wv"];

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub path: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_artist: String,
    pub track: Option<u32>,
    pub disc: Option<u32>,
    pub year: Option<u32>,
    pub genre: Option<String>,
    pub duration: f64,
    /// A cached cover image for this track's album, when the file or its folder has one.
    pub cover: Option<String>,
    #[serde(default)]
    size: u64,
    #[serde(default)]
    mtime: u64,
}

pub fn is_audio(p: &Path) -> bool {
    p.extension().and_then(|x| x.to_str()).is_some_and(|x| AUDIO_EXT.contains(&x.to_lowercase().as_str()))
}

fn walk(dir: &Path, out: &mut Vec<PathBuf>, depth: u32) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for e in entries.flatten() {
        let p = e.path();
        if p.is_dir() {
            if depth < 8 {
                walk(&p, out, depth + 1);
            }
        } else if is_audio(&p) {
            out.push(p);
        }
    }
}

pub fn dedupe(files: &mut Vec<PathBuf>) {
    let mut seen = std::collections::HashSet::new();
    files.retain(|p| seen.insert(p.to_string_lossy().replace('/', "\\").to_lowercase()));
}

fn hash(s: &str) -> String {
    use std::hash::{Hash, Hasher};
    let mut h = std::collections::hash_map::DefaultHasher::new();
    s.hash(&mut h);
    format!("{:016x}", h.finish())
}

/// The album's picture: embedded in the file, else cover.jpg / folder.jpg… beside it. Copied into the cache once per album.
fn cover(file: &Path, tag: Option<&lofty::tag::Tag>, album_key: &str, covers: &Path, done: &mut HashMap<String, Option<String>>) -> Option<String> {
    if let Some(Some(c)) = done.get(album_key) {
        return Some(c.clone());
    }
    let out = covers.join(format!("{}.jpg", hash(album_key)));
    // read from the file each time it is (re)scanned, so a changed cover replaces the cached one
    let embedded = tag.and_then(|t| t.pictures().first()).map(|p| p.data().to_vec());
    let beside = || {
        let dir = file.parent()?;
        ["cover", "folder", "front", "album", "Cover", "Folder", "Front"]
            .iter()
            .flat_map(|n| ["jpg", "jpeg", "png"].map(|x| dir.join(format!("{n}.{x}"))))
            .find(|p| p.exists())
            .and_then(|p| std::fs::read(p).ok())
    };
    let found = match embedded.or_else(beside) {
        Some(bytes) => {
            if std::fs::read(&out).ok().as_deref() != Some(&bytes[..]) {
                let _ = std::fs::create_dir_all(covers);
                let _ = std::fs::write(&out, &bytes);
            }
            out.exists().then(|| out.to_string_lossy().into_owned())
        }
        None => out.exists().then(|| out.to_string_lossy().into_owned()),
    };
    // only a found cover is remembered: a track without one mustn't hide the next track's picture
    if found.is_some() {
        done.insert(album_key.to_string(), found.clone());
    }
    found
}

/// "01. Artist" / "01 Artist" → "Artist", but "2Pac" and "50 Cent" stay: only a number with a dot,
/// or a zero-padded one, counts as a track number.
fn strip_track_no(a: &str) -> &str {
    let digits = a.chars().take_while(|c| c.is_ascii_digit()).count();
    if digits == 0 || digits > 3 {
        return a;
    }
    let rest = &a[digits..];
    let numbered = rest.starts_with('.') || (a.starts_with('0') && rest.starts_with(' '));
    if !numbered {
        return a;
    }
    let r = rest.trim_start_matches(|c: char| c == '.' || c == ' ' || c == '-');
    if r.is_empty() { a } else { r }
}

fn read(p: &Path, size: u64, mtime: u64, covers: &Path, done: &mut HashMap<String, Option<String>>) -> Track {
    let name = p.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_string();
    let folder = p.parent().and_then(|d| d.file_name()).and_then(|s| s.to_str()).unwrap_or("").to_string();
    let tagged = lofty::read_from_path(p).ok();
    let tag = tagged.as_ref().and_then(|t| t.primary_tag().or_else(|| t.first_tag()));
    let s = |v: Option<std::borrow::Cow<str>>| v.map(|x| x.trim().to_string()).filter(|x| !x.is_empty());
    // no tags: "Artist - Title" from the file name, the folder as the album
    let (fa, ft) = match name.split_once(" - ") {
        Some((a, t)) if tag.and_then(|t| t.title()).is_none() => (Some(strip_track_no(a.trim()).to_string()), t.trim().to_string()),
        _ => (None, name.clone()),
    };
    let artist = s(tag.and_then(|t| t.artist())).or(fa).unwrap_or_default();
    let album = s(tag.and_then(|t| t.album())).unwrap_or(folder);
    let album_artist = tag.and_then(|t| t.get_string(&ItemKey::AlbumArtist)).map(|x| x.trim().to_string()).filter(|x| !x.is_empty()).unwrap_or_else(|| artist.clone());
    let key = format!("{}|{}", album_artist.to_lowercase(), album.to_lowercase());
    Track {
        path: p.to_string_lossy().into_owned(),
        title: s(tag.and_then(|t| t.title())).unwrap_or(ft),
        cover: cover(p, tag, &key, covers, done),
        artist,
        album,
        album_artist,
        track: tag.and_then(|t| t.track()),
        disc: tag.and_then(|t| t.disk()),
        year: tag.and_then(|t| t.year()).filter(|y| *y > 1000),
        genre: s(tag.and_then(|t| t.genre())),
        duration: tagged.as_ref().map(|t| t.properties().duration().as_secs_f64()).unwrap_or(0.0),
        size,
        mtime,
    }
}

/// Every audio file under `folders` with its tags. Unchanged files come from the index.
pub fn scan(folders: &[String], index_file: &Path, covers: &Path) -> Vec<Track> {
    let old: HashMap<String, Track> = std::fs::read_to_string(index_file)
        .ok()
        .and_then(|s| serde_json::from_str::<Vec<Track>>(&s).ok())
        .unwrap_or_default()
        .into_iter()
        .map(|t| (t.path.clone(), t))
        .collect();
    let mut files = Vec::new();
    for f in folders {
        walk(Path::new(f), &mut files, 0);
    }
    // a folder inside another added folder: each file once
    dedupe(&mut files);
    let mut done = HashMap::new();
    let mut out: Vec<Track> = files
        .iter()
        .map(|p| {
            let meta = std::fs::metadata(p).ok();
            let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
            let mtime = meta
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);
            match old.get(&*p.to_string_lossy()) {
                Some(t) if t.size == size && t.mtime == mtime && t.cover.as_ref().is_none_or(|c| Path::new(c).exists()) => t.clone(),
                _ => read(p, size, mtime, covers, &mut done),
            }
        })
        .collect();
    out.sort_by(|a, b| {
        (a.album_artist.to_lowercase(), a.album.to_lowercase(), a.disc, a.track, a.path.clone())
            .cmp(&(b.album_artist.to_lowercase(), b.album.to_lowercase(), b.disc, b.track, b.path.clone()))
    });
    if let Some(dir) = index_file.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if let Ok(s) = serde_json::to_string(&out) {
        let _ = std::fs::write(index_file, s);
    }
    out
}

#[cfg(test)]
mod tests {
    #[test]
    fn track_numbers() {
        assert_eq!(super::strip_track_no("01. Artist"), "Artist");
        assert_eq!(super::strip_track_no("07 Artist"), "Artist");
        assert_eq!(super::strip_track_no("2Pac"), "2Pac");
        assert_eq!(super::strip_track_no("50 Cent"), "50 Cent");
        assert_eq!(super::strip_track_no("Artist"), "Artist");
    }

    /// LUNA_MUSIC_TEST=<folder> cargo test music -- --ignored --nocapture
    #[test]
    #[ignore]
    fn scan_real_folder() {
        let dir = std::env::var("LUNA_MUSIC_TEST").expect("LUNA_MUSIC_TEST");
        let tmp = std::env::temp_dir().join("luna-music-test");
        let _ = std::fs::remove_dir_all(&tmp);
        let t0 = std::time::Instant::now();
        let first = super::scan(&[dir.clone()], &tmp.join("index.json"), &tmp.join("covers"));
        let t1 = t0.elapsed();
        let again = super::scan(&[dir], &tmp.join("index.json"), &tmp.join("covers"));
        for t in &first {
            println!("{} | {} | {} | {:?} | {:?} | {:.1}s | cover={}", t.artist, t.album, t.title, t.track, t.year, t.duration, t.cover.is_some());
        }
        println!("first {:?}, second {:?}", t1, t0.elapsed() - t1);
        assert_eq!(first.len(), again.len());
    }

    #[test]
    fn audio_extensions() {
        use std::path::Path;
        assert!(super::is_audio(Path::new("a/b/Song.FLAC")));
        assert!(super::is_audio(Path::new("x.mp3")));
        assert!(!super::is_audio(Path::new("x.mkv")));
        assert!(!super::is_audio(Path::new("cover.jpg")));
    }
}

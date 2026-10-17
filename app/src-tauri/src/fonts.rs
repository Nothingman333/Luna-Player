//! Subtitle fonts live in Luna's own folder (not installed into Windows): the bundled
//! Inter, plus any .ttf/.otf the user adds (also straight out of a .zip).

use serde::Serialize;
use std::io::Read;
use std::path::{Path, PathBuf};

const FONT_EXT: &[&str] = &["ttf", "otf", "ttc"];

fn is_font(name: &str) -> bool {
    name.rsplit('.').next().is_some_and(|x| FONT_EXT.contains(&x.to_lowercase().as_str()))
}

/// Copies the bundled fonts into `dir` so mpv has one folder to read from.
pub fn prepare(dir: &Path, bundled: &Path) {
    let _ = std::fs::create_dir_all(dir);
    if let Ok(rd) = std::fs::read_dir(bundled) {
        for e in rd.flatten() {
            let target = dir.join(e.file_name());
            if is_font(&e.file_name().to_string_lossy()) && !target.exists() {
                let _ = std::fs::copy(e.path(), target);
            }
        }
    }
}

/// Adds font files (or every font inside a .zip); returns how many were added.
pub fn add(dir: &Path, paths: Vec<String>) -> Result<u32, String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let mut n = 0;
    for p in paths {
        let path = PathBuf::from(&p);
        if p.to_lowercase().ends_with(".zip") {
            let f = std::fs::File::open(&path).map_err(|e| e.to_string())?;
            let mut zip = zip::ZipArchive::new(f).map_err(|e| format!("Zip açılamadı: {e}"))?;
            for i in 0..zip.len() {
                let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
                let name = entry.name().rsplit(['/', '\\']).next().unwrap_or("").to_string();
                if entry.is_file() && is_font(&name) {
                    let mut buf = Vec::new();
                    entry.read_to_end(&mut buf).map_err(|e| e.to_string())?;
                    std::fs::write(dir.join(&name), buf).map_err(|e| e.to_string())?;
                    n += 1;
                }
            }
        } else if is_font(&p) {
            let name = path.file_name().ok_or("Geçersiz dosya")?;
            std::fs::copy(&path, dir.join(name)).map_err(|e| e.to_string())?;
            n += 1;
        }
    }
    if n == 0 {
        return Err("İçinde font bulunamadı (.ttf / .otf)".into());
    }
    Ok(n)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FontInfo {
    /// Full name, e.g. "Netflix Sans Medium": what mpv's sub-font gets.
    pub name: String,
    pub family: String,
    pub file: String,
}

/// Fonts in Luna's folder with their real names (read from the font file itself).
pub fn list(dir: &Path) -> Vec<FontInfo> {
    let mut out = Vec::new();
    let Ok(rd) = std::fs::read_dir(dir) else { return out };
    for e in rd.flatten() {
        let file = e.file_name().to_string_lossy().into_owned();
        if !is_font(&file) {
            continue;
        }
        let Ok(data) = std::fs::read(e.path()) else { continue };
        let Ok(face) = ttf_parser::Face::parse(&data, 0) else { continue };
        let get = |id: u16| {
            face.names()
                .into_iter()
                .filter(|n| n.name_id == id)
                .find_map(|n| n.to_string())
        };
        let family = get(16).or_else(|| get(1)).unwrap_or_else(|| file.clone());
        let name = get(4).unwrap_or_else(|| family.clone());
        out.push(FontInfo { name, family, file });
    }
    out.sort_by(|a, b| a.family.cmp(&b.family).then(a.name.cmp(&b.name)));
    out
}

pub fn remove(dir: &Path, file: &str) -> Result<(), String> {
    let p = dir.join(file);
    if p.parent() != Some(dir) {
        return Err("Geçersiz dosya".into());
    }
    std::fs::remove_file(p).map_err(|e| e.to_string())
}

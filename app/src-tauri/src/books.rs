//! The book library: EPUB, PDF and comic (CBZ) files under the book folders. An EPUB's title,
//! author and cover come from its package file; a comic's cover is its first page.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Read;
use std::path::{Path, PathBuf};

const BOOK_EXT: &[&str] = &["epub", "pdf", "cbz"];
const IMG_EXT: &[&str] = &["jpg", "jpeg", "png", "webp", "gif", "avif"];

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Book {
    pub path: String,
    pub kind: String,
    pub title: String,
    pub author: String,
    pub lang: Option<String>,
    pub cover: Option<String>,
    #[serde(default)]
    size: u64,
    #[serde(default)]
    mtime: u64,
}

fn ext(p: &Path) -> String {
    p.extension().and_then(|x| x.to_str()).unwrap_or("").to_lowercase()
}

fn walk(dir: &Path, out: &mut Vec<PathBuf>, depth: u32) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for e in entries.flatten() {
        let p = e.path();
        if p.is_dir() {
            if depth < 8 {
                walk(&p, out, depth + 1);
            }
        } else if BOOK_EXT.contains(&ext(&p).as_str()) {
            out.push(p);
        }
    }
}

fn hash(s: &str) -> String {
    use std::hash::{Hash, Hasher};
    let mut h = std::collections::hash_map::DefaultHasher::new();
    s.hash(&mut h);
    format!("{:016x}", h.finish())
}

fn unescape(s: &str) -> String {
    s.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&apos;", "'").replace("&#39;", "'")
}

/// The attributes of every `<name …>` tag in `xml` (namespace prefixes ignored).
fn tags(xml: &str, name: &str) -> Vec<HashMap<String, String>> {
    let mut out = Vec::new();
    let mut rest = xml;
    while let Some(i) = rest.find('<') {
        rest = &rest[i + 1..];
        let end = rest.find('>').unwrap_or(rest.len());
        let tag = &rest[..end];
        let tname = tag.split(|c: char| c.is_whitespace() || c == '/').next().unwrap_or("");
        if tname.rsplit(':').next() == Some(name) {
            let mut attrs = HashMap::new();
            let mut a = &tag[tname.len()..];
            while let Some(eq) = a.find('=') {
                let key = a[..eq].trim().rsplit(':').next().unwrap_or("").to_string();
                let v = a[eq + 1..].trim_start();
                let Some(q) = v.chars().next().filter(|c| *c == '"' || *c == '\'') else { break };
                let v = &v[1..];
                let close = v.find(q).unwrap_or(v.len());
                attrs.insert(key, unescape(&v[..close]));
                a = &v[(close + 1).min(v.len())..];
            }
            out.push(attrs);
        }
        rest = &rest[end.min(rest.len())..];
    }
    out
}

/// The text inside the first `<dc:name>…</dc:name>`.
fn text_of(xml: &str, name: &str) -> Option<String> {
    let open = [format!("<dc:{name}"), format!("<{name}")];
    let start = open.iter().filter_map(|o| xml.find(o.as_str())).min()?;
    let body = &xml[start..];
    let gt = body.find('>')?;
    let body = &body[gt + 1..];
    let end = body.find("</")?;
    let t = unescape(body[..end].trim());
    (!t.is_empty()).then_some(t)
}

fn zip_text(z: &mut zip::ZipArchive<std::fs::File>, name: &str) -> Option<String> {
    let mut f = z.by_name(name).ok()?;
    let mut s = String::new();
    f.read_to_string(&mut s).ok()?;
    Some(s)
}

fn zip_bytes(z: &mut zip::ZipArchive<std::fs::File>, name: &str) -> Option<Vec<u8>> {
    let mut f = z.by_name(name).ok()?;
    let mut v = Vec::new();
    f.read_to_end(&mut v).ok()?;
    Some(v)
}

/// A path inside the zip, relative to `base` (the package file's folder).
fn join(base: &str, href: &str) -> String {
    let href = href.split('#').next().unwrap_or(href);
    let href = percent_decode(href);
    let mut parts: Vec<&str> = if base.is_empty() { vec![] } else { base.split('/').collect() };
    for p in href.split('/') {
        match p {
            ".." => { parts.pop(); }
            "." | "" => {}
            x => parts.push(x),
        }
    }
    parts.join("/")
}

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        // check the two hex bytes before slicing: a byte slice can cut a multi-byte character
        if b[i] == b'%' && i + 2 < b.len() && b[i + 1].is_ascii_hexdigit() && b[i + 2].is_ascii_hexdigit() {
            let hex = |x: u8| (x as char).to_digit(16).unwrap_or(0) as u8;
            out.push(hex(b[i + 1]) * 16 + hex(b[i + 2]));
            i += 3;
            continue;
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

struct Meta {
    title: Option<String>,
    author: Option<String>,
    lang: Option<String>,
    cover: Option<Vec<u8>>,
}

fn epub_meta(p: &Path) -> Option<Meta> {
    let mut z = zip::ZipArchive::new(std::fs::File::open(p).ok()?).ok()?;
    let container = zip_text(&mut z, "META-INF/container.xml")?;
    let opf_path = tags(&container, "rootfile").into_iter().find_map(|a| a.get("full-path").cloned())?;
    let opf = zip_text(&mut z, &opf_path)?;
    let base = opf_path.rsplit_once('/').map(|(b, _)| b.to_string()).unwrap_or_default();
    let items = tags(&opf, "item");
    let cover_id = tags(&opf, "meta").into_iter().find(|a| a.get("name").map(String::as_str) == Some("cover")).and_then(|a| a.get("content").cloned());
    let cover_href = items
        .iter()
        .find(|a| a.get("properties").is_some_and(|p| p.split_whitespace().any(|x| x == "cover-image")))
        .or_else(|| cover_id.as_ref().and_then(|id| items.iter().find(|a| a.get("id") == Some(id))))
        .or_else(|| items.iter().find(|a| a.get("id").is_some_and(|i| i.to_lowercase().contains("cover")) && a.get("media-type").is_some_and(|m| m.starts_with("image/"))))
        .and_then(|a| a.get("href").cloned());
    let cover = cover_href.and_then(|h| zip_bytes(&mut z, &join(&base, &h)));
    Some(Meta { title: text_of(&opf, "title"), author: text_of(&opf, "creator"), lang: text_of(&opf, "language"), cover })
}

/// The pages of a comic (images inside the zip), in reading order.
pub fn cbz_pages(p: &Path) -> Result<Vec<String>, String> {
    let z = zip::ZipArchive::new(std::fs::File::open(p).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    let mut names: Vec<String> = z
        .file_names()
        .filter(|n| !n.starts_with("__MACOSX") && IMG_EXT.contains(&n.rsplit('.').next().unwrap_or("").to_lowercase().as_str()))
        .map(String::from)
        .collect();
    names.sort_by(|a, b| natural(a, b));
    Ok(names)
}

/// "page2" before "page10".
fn natural(a: &str, b: &str) -> std::cmp::Ordering {
    let key = |s: &str| {
        let mut out: Vec<(String, u64)> = Vec::new();
        let mut text = String::new();
        let mut num = String::new();
        for c in s.to_lowercase().chars() {
            if c.is_ascii_digit() {
                num.push(c);
            } else {
                if !num.is_empty() {
                    out.push((std::mem::take(&mut text), num.parse().unwrap_or(0)));
                    num.clear();
                }
                text.push(c);
            }
        }
        out.push((text, num.parse().unwrap_or(0)));
        out
    };
    key(a).cmp(&key(b))
}

pub fn cbz_page(p: &Path, name: &str) -> Result<Vec<u8>, String> {
    let mut z = zip::ZipArchive::new(std::fs::File::open(p).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    zip_bytes(&mut z, name).ok_or_else(|| tr!("Sayfa okunamadı", "Couldn't read the page"))
}

fn read(p: &Path, size: u64, mtime: u64, covers: &Path) -> Book {
    let kind = ext(p);
    let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_string();
    // "Author - Title" file names
    let (fa, ft) = match stem.split_once(" - ") {
        Some((a, t)) => (a.trim().to_string(), t.trim().to_string()),
        None => (String::new(), stem.replace(['_', '.'], " ").trim().to_string()),
    };
    let meta = match kind.as_str() {
        "epub" => epub_meta(p),
        "cbz" => cbz_pages(p).ok().and_then(|n| n.first().cloned()).and_then(|first| cbz_page(p, &first).ok()).map(|c| Meta { title: None, author: None, lang: None, cover: Some(c) }),
        _ => None,
    };
    let cover = meta.as_ref().and_then(|m| m.cover.as_ref()).and_then(|bytes| {
        std::fs::create_dir_all(covers).ok()?;
        let out = covers.join(format!("book-{}.img", hash(&p.to_string_lossy())));
        std::fs::write(&out, bytes).ok()?;
        Some(out.to_string_lossy().into_owned())
    });
    Book {
        path: p.to_string_lossy().into_owned(),
        title: meta.as_ref().and_then(|m| m.title.clone()).unwrap_or(ft),
        author: meta.as_ref().and_then(|m| m.author.clone()).unwrap_or(fa),
        lang: meta.and_then(|m| m.lang),
        kind,
        cover,
        size,
        mtime,
    }
}

/// Every book under `folders`. Unchanged files come from the index.
pub fn scan(folders: &[String], index_file: &Path, covers: &Path) -> Vec<Book> {
    let old: HashMap<String, Book> = std::fs::read_to_string(index_file)
        .ok()
        .and_then(|s| serde_json::from_str::<Vec<Book>>(&s).ok())
        .unwrap_or_default()
        .into_iter()
        .map(|b| (b.path.clone(), b))
        .collect();
    let mut files = Vec::new();
    for f in folders {
        walk(Path::new(f), &mut files, 0);
    }
    let out: Vec<Book> = files
        .iter()
        .map(|p| {
            let meta = std::fs::metadata(p).ok();
            let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
            let mtime = meta.and_then(|m| m.modified().ok()).and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs()).unwrap_or(0);
            match old.get(&*p.to_string_lossy()) {
                Some(b) if b.size == size && b.mtime == mtime && b.cover.as_ref().is_none_or(|c| Path::new(c).exists()) => b.clone(),
                _ => read(p, size, mtime, covers),
            }
        })
        .collect();
    if let Some(dir) = index_file.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if let Ok(s) = serde_json::to_string(&out) {
        let _ = std::fs::write(index_file, s);
    }
    out
}

/// Downloads a book (an open library's EPUB) into `dir`; returns where it was saved.
/// What a downloaded book turned out to be.
#[derive(Serialize)]
pub struct Downloaded {
    pub path: String,
    pub kind: String,
    pub title: String,
    pub author: String,
}

/// The kind of book in `bytes`, from its first bytes; `hint` is the kind the user picked ("" = automatic).
/// Anything that isn't a PDF or a zip (a web page, an error message) is not a book.
fn sniff(bytes: &[u8], content_type: &str, hint: &str) -> Result<&'static str, String> {
    let head = &bytes[..bytes.len().min(200)];
    let found = if bytes.starts_with(b"%PDF") {
        "pdf"
    } else if bytes.starts_with(b"PK") {
        if head.windows(20).any(|w| w == b"application/epub+zip") || hint == "epub" || content_type.contains("epub") { "epub" } else { "cbz" }
    } else {
        let what = if content_type.contains("html") || head.trim_ascii_start().starts_with(b"<") { tr!("bir web sayfası", "a web page") } else { content_type.split(';').next().unwrap_or("").to_string() };
        return Err(tr!("Bu bağlantı bir kitap dosyası değil ({}). Dosyanın kendisine giden linki kullan.", "This link isn't a book file ({}). Use the link to the file itself.", if what.is_empty() { "?".into() } else { what }));
    };
    if !hint.is_empty() && hint != found && !(hint == "cbz" && found == "epub") {
        return Err(tr!("Seçtiğin biçim {} ama gelen dosya {}", "You picked {} but the file is {}", hint.to_uppercase(), found.to_uppercase()));
    }
    Ok(if hint == "cbz" { "cbz" } else { found })
}

/// Downloads one book file into `dir`. Empty title/author are filled from the EPUB itself,
/// then from `fallback` (the file's name in the link). Nothing is saved when it isn't a book.
pub async fn download(url: &str, dir: &Path, title: &str, author: &str, hint: &str, fallback: &str) -> Result<Downloaded, String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err(tr!("Geçersiz adres", "Invalid address"));
    }
    let res = reqwest::Client::builder()
        .user_agent("Luna Player")
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?
        .get(url)
        .send()
        .await
        .map_err(|e| tr!("İndirilemedi: {}", "Couldn't download: {}", e))?
        .error_for_status()
        .map_err(|e| tr!("İndirilemedi: {}", "Couldn't download: {}", e))?;
    let ctype = res.headers().get(reqwest::header::CONTENT_TYPE).and_then(|v| v.to_str().ok()).unwrap_or("").to_lowercase();
    const MAX_BOOK: u64 = 300 * 1024 * 1024;
    if res.content_length().is_some_and(|n| n > MAX_BOOK) {
        return Err(tr!("Kitap dosyası çok büyük", "The book file is too big"));
    }
    let bytes = res.bytes().await.map_err(|e| e.to_string())?;
    if bytes.len() as u64 > MAX_BOOK {
        return Err(tr!("Kitap dosyası çok büyük", "The book file is too big"));
    }
    let kind = sniff(&bytes, &ctype, hint)?;
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    // saved under a temporary name first: the real name may come from inside the EPUB
    let nonce = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let tmp = dir.join(format!(".luna-download-{}-{}.{kind}", std::process::id(), nonce));
    std::fs::write(&tmp, &bytes).map_err(|e| e.to_string())?;
    let meta = if kind == "epub" && (title.is_empty() || author.is_empty()) { epub_meta(&tmp) } else { None };
    let title = Some(title.trim().to_string()).filter(|t| !t.is_empty())
        .or_else(|| meta.as_ref().and_then(|m| m.title.clone()))
        .unwrap_or_else(|| fallback.to_string());
    let author = Some(author.trim().to_string()).filter(|t| !t.is_empty())
        .or_else(|| meta.as_ref().and_then(|m| m.author.clone()))
        .unwrap_or_default();
    let name = if author.is_empty() { title.clone() } else { format!("{author} - {title}") };
    let safe: String = name.chars().map(|c| if r#"<>:"/\|?*"#.contains(c) || c.is_control() { ' ' } else { c }).collect::<String>().trim().chars().take(120).collect();
    let safe = if safe.is_empty() { "book".to_string() } else { safe };
    let mut out = dir.join(format!("{safe}.{kind}"));
    let mut n = 2;
    while out.exists() {
        out = dir.join(format!("{safe} ({n}).{kind}"));
        n += 1;
    }
    std::fs::rename(&tmp, &out).map_err(|e| { let _ = std::fs::remove_file(&tmp); e.to_string() })?;
    Ok(Downloaded { path: out.to_string_lossy().into_owned(), kind: kind.into(), title, author })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn percent_decode_survives_multibyte() {
        assert_eq!(super::percent_decode("a%20b"), "a b");
        assert_eq!(super::percent_decode("%€"), "%€");
    }
    /// LUNA_BOOK_TEST=<folder> cargo test books -- --ignored --nocapture
    #[test]
    #[ignore]
    fn scan_real_folder() {
        let dir = std::env::var("LUNA_BOOK_TEST").expect("LUNA_BOOK_TEST");
        let tmp = std::env::temp_dir().join("luna-book-test");
        let _ = std::fs::remove_dir_all(&tmp);
        for b in scan(&[dir.clone()], &tmp.join("index.json"), &tmp.join("covers")) {
            println!("{} | {} | {} | {:?} | cover={:?}", b.kind, b.title, b.author, b.lang, b.cover.map(|c| std::fs::metadata(c).map(|m| m.len()).unwrap_or(0)));
        }
        let p = std::path::Path::new(&dir).join("comic.cbz");
        if p.exists() {
            println!("pages {:?}", cbz_pages(&p).unwrap());
        }
    }
    #[test]
    fn sniffs_books() {
        assert_eq!(sniff(b"%PDF-1.7 ...", "application/pdf", "").unwrap(), "pdf");
        let epub = b"PK\x03\x04....mimetypeapplication/epub+zip....";
        assert_eq!(sniff(epub, "", "").unwrap(), "epub");
        assert_eq!(sniff(b"PK\x03\x04 images", "", "").unwrap(), "cbz");
        assert_eq!(sniff(b"PK\x03\x04 images", "", "epub").unwrap(), "epub");
        assert!(sniff(b"<!doctype html><html>", "text/html; charset=utf-8", "").is_err());
        assert!(sniff(b"%PDF-1.7", "", "epub").is_err());
    }
    #[test]
    fn opf_bits() {
        let opf = r#"<package><metadata><dc:title>Suç &amp; Ceza</dc:title><dc:creator opf:role="aut">Dostoyevski</dc:creator><meta name="cover" content="c1"/></metadata>
            <manifest><item id="c1" href="Images/cover%20big.jpg" media-type="image/jpeg"/><item href='text/ch1.xhtml' id="ch1" media-type="application/xhtml+xml"/></manifest></package>"#;
        assert_eq!(text_of(opf, "title").as_deref(), Some("Suç & Ceza"));
        assert_eq!(text_of(opf, "creator").as_deref(), Some("Dostoyevski"));
        let items = tags(opf, "item");
        assert_eq!(items.len(), 2);
        assert_eq!(items[1].get("href").map(String::as_str), Some("text/ch1.xhtml"));
        assert_eq!(join("OEBPS", "Images/cover%20big.jpg"), "OEBPS/Images/cover big.jpg");
        assert_eq!(join("OEBPS/text", "../img/a.png"), "OEBPS/img/a.png");
        assert_eq!(join("", "cover.jpg"), "cover.jpg");
    }
    #[test]
    fn natural_order() {
        let mut v = vec!["p10.jpg", "p2.jpg", "p1.jpg"];
        v.sort_by(|a, b| natural(a, b));
        assert_eq!(v, ["p1.jpg", "p2.jpg", "p10.jpg"]);
    }
}

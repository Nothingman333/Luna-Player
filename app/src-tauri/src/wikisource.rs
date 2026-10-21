//! Vikikaynak (Wikisource): free, legal texts whose copyright has run out, Turkish ones too.
//! Wikisource has no EPUB download Luna can reach everywhere (its export tool is often out of
//! reach), so Luna makes the EPUB itself from the pages: the book's page, or its chapters when
//! the page is a table of contents.

use crate::books::{book_path, Downloaded};
use scraper::{node::Node, Html};
use std::io::Write;
use std::path::Path;

#[derive(serde::Serialize)]
pub struct Hit {
    title: String,
    author: String,
    year: String,
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("Luna Player (https://github.com/Nothingman333/Luna-Player)")
        .timeout(std::time::Duration::from_secs(40))
        .build()
        .map_err(|e| e.to_string())
}

fn api(lang: &str) -> Result<String, String> {
    if lang.len() < 2 || lang.len() > 3 || !lang.chars().all(|c| c.is_ascii_lowercase()) {
        return Err("bad language".into());
    }
    Ok(format!("https://{lang}.wikisource.org/w/api.php"))
}

async fn get(lang: &str, params: &[(&str, &str)]) -> Result<serde_json::Value, String> {
    let mut q = vec![("format", "json"), ("formatversion", "2")];
    q.extend_from_slice(params);
    client()?
        .get(api(lang)?)
        .query(&q)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())
}

/// The author and year in the title template at the top of each work ("yazar = …", "yıl = …").
async fn headers(lang: &str, titles: &[String]) -> Vec<Hit> {
    let mut out: Vec<Hit> = titles.iter().map(|t| Hit { title: t.clone(), author: String::new(), year: String::new() }).collect();
    if titles.is_empty() {
        return out;
    }
    let joined = titles.join("|");
    let Ok(v) = get(lang, &[("action", "query"), ("prop", "revisions"), ("rvprop", "content"), ("rvslots", "main"), ("rvsection", "0"), ("titles", &joined)]).await else {
        return out;
    };
    let field = |text: &str, names: &[&str]| -> String {
        for line in text.split(['|', '\n']) {
            if let Some((k, v)) = line.split_once('=') {
                if names.contains(&k.trim().to_lowercase().as_str()) {
                    let v = v.trim().trim_end_matches("}}").trim();
                    let v = v.trim_start_matches("[[").split(['|', ']']).next().unwrap_or("").trim();
                    let v = v.split_once(':').filter(|(a, _)| ["kişi", "yazar", "author"].contains(&a.to_lowercase().as_str())).map(|(_, b)| b).unwrap_or(v);
                    if !v.is_empty() {
                        return v.to_string();
                    }
                }
            }
        }
        String::new()
    };
    for p in v["query"]["pages"].as_array().into_iter().flatten() {
        let t = p["title"].as_str().unwrap_or("");
        let text = p["revisions"][0]["slots"]["main"]["content"].as_str().unwrap_or("");
        if let Some(h) = out.iter_mut().find(|h| h.title == t) {
            h.author = field(text, &["yazar", "author"]);
            h.year = field(text, &["yıl", "year"]).chars().filter(|c| c.is_ascii_digit()).take(4).collect();
        }
    }
    out
}

/// Works (not their chapters) matching `q`; with no query, the novels and books shelves.
pub async fn search(lang: &str, q: &str) -> Result<Vec<Hit>, String> {
    let titles: Vec<String> = if q.trim().is_empty() {
        let mut l = Vec::new();
        for cat in ["Kategori:Romanlar", "Kategori:Kitaplar", "Kategori:Hikâyeler"] {
            if let Ok(v) = get(lang, &[("action", "query"), ("list", "categorymembers"), ("cmtitle", cat), ("cmnamespace", "0"), ("cmlimit", "40")]).await {
                l.extend(v["query"]["categorymembers"].as_array().into_iter().flatten().filter_map(|x| x["title"].as_str().map(String::from)));
            }
        }
        l
    } else {
        let v = get(lang, &[("action", "query"), ("list", "search"), ("srsearch", q), ("srnamespace", "0"), ("srlimit", "40")]).await?;
        v["query"]["search"].as_array().into_iter().flatten().filter_map(|x| x["title"].as_str().map(String::from)).collect()
    };
    let mut seen = std::collections::HashSet::new();
    // a chapter ("Book/Chapter") stands for its book
    let works: Vec<String> = titles
        .into_iter()
        .map(|t| t.split('/').next().unwrap_or("").to_string())
        .filter(|t| !t.is_empty() && seen.insert(t.clone()))
        .take(24)
        .collect();
    let mut out = Vec::new();
    for part in works.chunks(12) {
        out.extend(headers(lang, part).await);
    }
    Ok(out)
}

async fn page_html(lang: &str, title: &str) -> Result<String, String> {
    let v = get(lang, &[("action", "parse"), ("page", title), ("prop", "text"), ("disableeditsection", "1"), ("redirects", "1")]).await?;
    if let Some(e) = v["error"]["info"].as_str() {
        return Err(e.to_string());
    }
    Ok(v["parse"]["text"].as_str().unwrap_or("").to_string())
}

// ---------- the page's HTML as clean XHTML blocks ----------
struct Blocks {
    out: Vec<(Option<(u8, String)>, String)>,
    loose: String,
}
const SKIP_CLASS: [&str; 10] = ["ws-noexport", "noprint", "mw-editsection", "reference", "pagenum", "ws-pagenum", "mw-references-wrap", "references", "navbox", "metadata"];
const INLINE: [&str; 9] = ["i", "b", "em", "strong", "u", "small", "sup", "sub", "s"];

fn esc(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}
fn skipped(e: &scraper::node::Element) -> bool {
    let cls = e.attr("class").unwrap_or("");
    ["script", "style", "link", "meta", "img", "figure", "audio", "video", "math", "noscript"].contains(&e.name())
        || SKIP_CLASS.iter().any(|c| cls.split_whitespace().any(|x| x == *c))
        || e.attr("id").is_some_and(|id| id == "headerContainer" || id == "toc")
        || e.attr("style").is_some_and(|s| s.replace(' ', "").contains("display:none"))
}
fn text_of(n: ego_tree::NodeRef<Node>) -> String {
    n.descendants().filter_map(|d| d.value().as_text().map(|t| t.to_string())).collect::<String>().split_whitespace().collect::<Vec<_>>().join(" ")
}
/// Inside a kept block: inline tags stay, line breaks stay, lists and quotes nest, the rest unwraps.
fn inner(n: ego_tree::NodeRef<Node>, s: &mut String) {
    for c in n.children() {
        match c.value() {
            Node::Text(t) => s.push_str(&esc(t)),
            Node::Element(e) if skipped(e) => {}
            Node::Element(e) => {
                let name = e.name();
                if name == "br" {
                    s.push_str("<br/>");
                } else if INLINE.contains(&name) || ["p", "li", "ul", "ol", "blockquote", "dd", "dt", "dl"].contains(&name) {
                    s.push_str(&format!("<{name}>"));
                    inner(c, s);
                    s.push_str(&format!("</{name}>"));
                } else {
                    inner(c, s);
                }
            }
            _ => {}
        }
    }
}
impl Blocks {
    fn flush(&mut self) {
        let t = std::mem::take(&mut self.loose);
        if !t.trim().is_empty() {
            self.out.push((None, format!("<p>{}</p>", t.trim())));
        }
    }
    fn walk(&mut self, n: ego_tree::NodeRef<Node>) {
        for c in n.children() {
            match c.value() {
                Node::Text(t) => self.loose.push_str(&esc(t)),
                Node::Element(e) if skipped(e) => {}
                Node::Element(e) => {
                    let name = e.name();
                    match name {
                        "br" => self.flush(),
                        "h1" | "h2" | "h3" | "h4" | "h5" | "h6" => {
                            self.flush();
                            let t = text_of(c);
                            if !t.is_empty() {
                                let lvl = name.as_bytes()[1] - b'0';
                                self.out.push((Some((lvl, t.clone())), format!("<h{lvl}>{}</h{lvl}>", esc(&t))));
                            }
                        }
                        "p" | "blockquote" | "ul" | "ol" | "dl" | "pre" => {
                            self.flush();
                            let mut s = String::new();
                            inner(c, &mut s);
                            if !s.trim().is_empty() {
                                let tag = if name == "pre" { "p" } else { name };
                                // scanned books often run whole pages into one paragraph with line breaks
                                if tag == "p" && s.len() > 600 {
                                    for part in split_breaks(&s) {
                                        self.out.push((None, format!("<p>{part}</p>")));
                                    }
                                } else {
                                    self.out.push((None, format!("<{tag}>{s}</{tag}>")));
                                }
                            }
                        }
                        "hr" => {
                            self.flush();
                            self.out.push((None, "<hr/>".into()));
                        }
                        _ if INLINE.contains(&name) => {
                            self.loose.push_str(&format!("<{name}>"));
                            let mut s = String::new();
                            inner(c, &mut s);
                            self.loose.push_str(&s);
                            self.loose.push_str(&format!("</{name}>"));
                        }
                        "span" | "a" | "font" | "abbr" | "bdi" | "cite" | "q" => {
                            let mut s = String::new();
                            inner(c, &mut s);
                            self.loose.push_str(&s);
                        }
                        // a container (div, center, table, poem…): what's in it is blocks of its own
                        _ => {
                            if ["div", "center", "table", "tr", "td", "th", "section", "tbody"].contains(&name) {
                                self.flush();
                            }
                            self.walk(c);
                            if ["div", "center", "tr", "td", "th", "section"].contains(&name) {
                                self.flush();
                            }
                        }
                    }
                }
                _ => {}
            }
        }
    }
}
/// "a<br/>b" → ["a", "b"], only at the top level (a break inside <i>…</i> stays a break).
fn split_breaks(s: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut depth = 0i32;
    let mut rest = s;
    while let Some(i) = rest.find('<') {
        cur.push_str(&rest[..i]);
        let j = rest[i..].find('>').map(|j| i + j + 1).unwrap_or(rest.len());
        let tag = &rest[i..j];
        if tag == "<br/>" && depth == 0 {
            out.push(std::mem::take(&mut cur));
        } else {
            if tag.starts_with("</") { depth -= 1 } else if !tag.ends_with("/>") { depth += 1 }
            cur.push_str(tag);
        }
        rest = &rest[j..];
    }
    cur.push_str(rest);
    out.push(cur);
    out.into_iter().map(|x| x.trim().to_string()).filter(|x| !x.is_empty()).collect()
}
fn blocks(html: &str) -> Vec<(Option<(u8, String)>, String)> {
    let doc = Html::parse_fragment(html);
    let mut b = Blocks { out: Vec::new(), loose: String::new() };
    b.walk(doc.tree.root());
    b.flush();
    b.out
}

fn header_field(html: &str, id: &str) -> String {
    let doc = Html::parse_fragment(html);
    let sel = scraper::Selector::parse(&format!("#{id}")).unwrap();
    doc.select(&sel).next().map(|e| e.text().collect::<String>().split_whitespace().collect::<Vec<_>>().join(" ")).unwrap_or_default()
}

/// The chapter pages a table-of-contents page links to, in the order they appear.
fn chapter_links(html: &str, title: &str) -> Vec<String> {
    let doc = Html::parse_fragment(html);
    let sel = scraper::Selector::parse("a[href]").unwrap();
    let prefix = format!("{}/", title);
    let mut seen = std::collections::HashSet::new();
    doc.select(&sel)
        .filter_map(|a| a.value().attr("href"))
        .filter_map(|h| h.strip_prefix("/wiki/"))
        .map(|h| percent(h.split('#').next().unwrap_or("")).replace('_', " "))
        .filter(|t| t.starts_with(&prefix) && seen.insert(t.clone()))
        .take(400)
        .collect()
}
fn percent(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

// ---------- the EPUB ----------
struct Chapter {
    title: String,
    body: String,
}

/// Splits one long page at its main headings (the level that repeats), so the reader has chapters.
fn split(blocks: Vec<(Option<(u8, String)>, String)>, book: &str) -> Vec<Chapter> {
    let lvl = (2..=4u8).find(|l| blocks.iter().filter(|(h, _)| h.as_ref().is_some_and(|(x, _)| x == l)).count() >= 2);
    let mut out: Vec<Chapter> = vec![Chapter { title: book.to_string(), body: String::new() }];
    for (h, html) in blocks {
        match (&h, lvl) {
            (Some((l, t)), Some(k)) if *l == k => out.push(Chapter { title: t.clone(), body: html }),
            _ => out.last_mut().unwrap().body.push_str(&html),
        }
    }
    out.retain(|c| !c.body.trim().is_empty());
    // a very long chapter (or a book with no headings) is cut into parts at paragraph ends,
    // so the reader stays quick and the contents list has places to go to
    const PART: usize = 45_000;
    let mut parts = Vec::new();
    for c in out {
        if c.body.len() <= PART * 3 / 2 {
            parts.push(c);
            continue;
        }
        let mut n = 1;
        let mut cur = String::new();
        for p in c.body.split_inclusive("</p>") {
            cur.push_str(p);
            if cur.len() > PART {
                parts.push(Chapter { title: format!("{} · {n}", c.title), body: std::mem::take(&mut cur) });
                n += 1;
            }
        }
        if !cur.trim().is_empty() {
            parts.push(Chapter { title: if n == 1 { c.title.clone() } else { format!("{} · {n}", c.title) }, body: cur });
        }
    }
    parts
}

fn xhtml(lang: &str, title: &str, body: &str) -> String {
    format!(
        "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<!DOCTYPE html>\n<html xmlns=\"http://www.w3.org/1999/xhtml\" xmlns:epub=\"http://www.idpf.org/2007/ops\" lang=\"{lang}\" xml:lang=\"{lang}\">\n<head><meta charset=\"utf-8\"/><title>{}</title><link rel=\"stylesheet\" type=\"text/css\" href=\"style.css\"/></head>\n<body>\n{body}\n</body>\n</html>\n",
        esc(title)
    )
}

fn write_epub(path: &Path, lang: &str, title: &str, author: &str, source: &str, chapters: &[Chapter]) -> Result<(), String> {
    use zip::write::SimpleFileOptions;
    let f = std::fs::File::create(path).map_err(|e| e.to_string())?;
    let mut z = zip::ZipWriter::new(f);
    let stored = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    let deflated = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let put = |z: &mut zip::ZipWriter<std::fs::File>, name: &str, data: &str, o: SimpleFileOptions| -> Result<(), String> {
        z.start_file(name, o).map_err(|e| e.to_string())?;
        z.write_all(data.as_bytes()).map_err(|e| e.to_string())
    };
    put(&mut z, "mimetype", "application/epub+zip", stored)?;
    put(&mut z, "META-INF/container.xml", "<?xml version=\"1.0\"?>\n<container version=\"1.0\" xmlns=\"urn:oasis:names:tc:opendocument:xmlns:container\"><rootfiles><rootfile full-path=\"OEBPS/content.opf\" media-type=\"application/oebps-package+xml\"/></rootfiles></container>\n", deflated)?;
    put(&mut z, "OEBPS/style.css", "body{line-height:1.5} h1,h2,h3{text-align:center;margin:1.2em 0 .8em} p{margin:0 0 .6em;text-indent:1.2em} blockquote{margin:.6em 1.4em} .src{font-size:.8em;text-indent:0;opacity:.7}\n", deflated)?;
    // the title page says where the text comes from (and that it's free to read)
    let cover = format!(
        "<h1>{}</h1>{}<p class=\"src\">Vikikaynak / Wikisource: {}</p>",
        esc(title),
        if author.is_empty() { String::new() } else { format!("<p style=\"text-align:center;text-indent:0\">{}</p>", esc(author)) },
        esc(source)
    );
    put(&mut z, "OEBPS/title.xhtml", &xhtml(lang, title, &cover), deflated)?;
    let mut manifest = String::from("<item id=\"css\" href=\"style.css\" media-type=\"text/css\"/><item id=\"nav\" href=\"nav.xhtml\" media-type=\"application/xhtml+xml\" properties=\"nav\"/><item id=\"title\" href=\"title.xhtml\" media-type=\"application/xhtml+xml\"/>");
    let mut spine = String::from("<itemref idref=\"title\"/>");
    let mut nav = String::new();
    for (i, c) in chapters.iter().enumerate() {
        let name = format!("c{:03}.xhtml", i + 1);
        let head = if c.body.trim_start().starts_with("<h") { String::new() } else { format!("<h2>{}</h2>", esc(&c.title)) };
        put(&mut z, &format!("OEBPS/{name}"), &xhtml(lang, &c.title, &format!("{head}{}", c.body)), deflated)?;
        manifest.push_str(&format!("<item id=\"c{}\" href=\"{name}\" media-type=\"application/xhtml+xml\"/>", i + 1));
        spine.push_str(&format!("<itemref idref=\"c{}\"/>", i + 1));
        nav.push_str(&format!("<li><a href=\"{name}\">{}</a></li>", esc(&c.title)));
    }
    put(&mut z, "OEBPS/nav.xhtml", &xhtml(lang, title, &format!("<nav epub:type=\"toc\" id=\"toc\"><h1>İçindekiler</h1><ol>{nav}</ol></nav>")), deflated)?;
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ");
    let opf = format!(
        "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<package xmlns=\"http://www.idpf.org/2007/opf\" version=\"3.0\" unique-identifier=\"id\"><metadata xmlns:dc=\"http://purl.org/dc/elements/1.1/\"><dc:identifier id=\"id\">{}</dc:identifier><dc:title>{}</dc:title>{}<dc:language>{lang}</dc:language><dc:source>{}</dc:source><dc:rights>Public domain (Wikisource)</dc:rights><meta property=\"dcterms:modified\">{now}</meta></metadata><manifest>{manifest}</manifest><spine>{spine}</spine></package>\n",
        esc(source),
        esc(title),
        if author.is_empty() { String::new() } else { format!("<dc:creator>{}</dc:creator>", esc(author)) },
        esc(source)
    );
    put(&mut z, "OEBPS/content.opf", &opf, deflated)?;
    z.finish().map_err(|e| e.to_string())?;
    Ok(())
}

/// The chapters behind a table of contents, eight pages at a time, kept in its order. A chapter
/// that is itself a contents page (parts of parts) is followed one level further.
fn gather<'a>(lang: &'a str, links: &'a [String], depth: u8) -> std::pin::Pin<Box<dyn std::future::Future<Output = Vec<Chapter>> + Send + 'a>> {
    Box::pin(async move {
        let mut out = Vec::new();
        for group in links.chunks(8) {
            let tasks: Vec<_> = group
                .iter()
                .map(|t| {
                    let (lang, t) = (lang.to_string(), t.clone());
                    tauri::async_runtime::spawn(async move { page_html(&lang, &t).await })
                })
                .collect();
            for (t, task) in group.iter().zip(tasks) {
                let Ok(Ok(h)) = task.await else { continue };
                let name = t.rsplit('/').next().unwrap_or(t).to_string();
                let body: String = blocks(&h).into_iter().map(|(_, h)| h).collect();
                let sub = if depth > 0 { chapter_links(&h, t) } else { Vec::new() };
                if sub.len() >= 2 {
                    if body.len() > 2000 {
                        out.push(Chapter { title: name, body });
                    }
                    out.extend(gather(lang, &sub, depth - 1).await);
                } else if !body.trim().is_empty() {
                    out.push(Chapter { title: name, body });
                }
            }
        }
        out
    })
}

/// Makes an EPUB of the work `title` and saves it into `dir`.
pub async fn book(lang: &str, title: &str, dir: &Path) -> Result<Downloaded, String> {
    let main = page_html(lang, title).await?;
    let shown = Some(header_field(&main, "header_title_text")).filter(|t| !t.is_empty()).unwrap_or_else(|| title.to_string());
    let author = header_field(&main, "header_author_text");
    let links = chapter_links(&main, title);
    let mut chapters: Vec<Chapter> = Vec::new();
    if links.len() >= 2 {
        // a table of contents: each chapter is a page of its own
        let intro: String = blocks(&main).into_iter().map(|(_, h)| h).collect();
        if !intro.trim().is_empty() && intro.len() > 400 {
            chapters.push(Chapter { title: shown.clone(), body: intro });
        }
        chapters.extend(gather(lang, &links, 1).await);
    } else {
        chapters = split(blocks(&main), &shown);
    }
    if chapters.is_empty() {
        return Err("Bu sayfada okunacak metin bulunamadı".into());
    }
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let out = book_path(dir, &shown, &author, "epub");
    let source = format!("https://{lang}.wikisource.org/wiki/{}", title.replace(' ', "_"));
    write_epub(&out, lang, &shown, &author, &source, &chapters).map_err(|e| {
        let _ = std::fs::remove_file(&out);
        e
    })?;
    Ok(Downloaded { path: out.to_string_lossy().into_owned(), kind: "epub".into(), title: shown, author })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cleans_and_splits() {
        let html = r#"<div class="mw-parser-output"><div id="headerContainer">x</div><h2>Bir</h2><p>Merhaba <i>dünya</i> & <a href="/wiki/X">bağ</a><sup class="reference">[1]</sup></p><div class="poem"><p>a<br>b</p></div><h2>İki</h2>serbest metin<br>ikinci satır<span class="pagenum">12</span></div>"#;
        let ch = split(blocks(html), "Kitap");
        assert_eq!(ch.len(), 2);
        assert_eq!(ch[0].title, "Bir");
        assert!(ch[0].body.contains("<p>Merhaba <i>dünya</i> &amp; bağ</p>"));
        assert!(ch[0].body.contains("<p>a<br/>b</p>"));
        assert!(ch[1].body.contains("<p>serbest metin</p><p>ikinci satır</p>"));
        assert!(!ch[1].body.contains("12"));
        assert_eq!(split_breaks("a<br/>b <i>c<br/>d</i><br/>"), vec!["a", "b <i>c<br/>d</i>"]);
    }

    #[test]
    fn decodes_links() {
        let html = r#"<a href="/wiki/Nutuk/1._b%C3%B6l%C3%BCm">1</a><a href="/wiki/Nutuk/1._b%C3%B6l%C3%BCm#x">1</a><a href="/wiki/Ba%C5%9Fka">x</a>"#;
        assert_eq!(chapter_links(html, "Nutuk"), vec!["Nutuk/1. bölüm".to_string()]);
    }

    /// cargo test wikisource_live -- --ignored --nocapture
    #[tokio::test]
    #[ignore]
    async fn wikisource_live() {
        let hits = search("tr", "Kürk Mantolu Madonna").await.unwrap();
        println!("{}", hits.iter().map(|h| format!("{} — {} ({})", h.title, h.author, h.year)).collect::<Vec<_>>().join("\n"));
        let dir = std::env::temp_dir().join("luna-ws-test");
        let b = book("tr", "Kürk Mantolu Madonna", &dir).await.unwrap();
        println!("{} {} {}", b.path, b.title, b.author);
        assert!(std::fs::metadata(&b.path).unwrap().len() > 50_000);
        let t = std::time::Instant::now();
        let n = book("tr", "Nutuk", &dir).await.unwrap();
        println!("{} in {:?}, {} bytes", n.title, t.elapsed(), std::fs::metadata(&n.path).unwrap().len());
        let _ = std::fs::remove_dir_all(&dir);
    }
}

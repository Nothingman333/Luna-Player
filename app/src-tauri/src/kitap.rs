//! Book reviews from 1000Kitap (Türkiye's reading community), for Luna Analiz on a book's page:
//! the same flow as Letterboxd for films. The pages carry their data as Next.js JSON
//! (`__NEXT_DATA__`): each review is a list of text pieces (plain, bold, italic, book and author links).

use crate::letterboxd::{get_page, urlencoding, Progress, Review};
use serde::Serialize;
use serde_json::Value;

const SITE: &str = "https://1000kitap.com";

#[derive(Serialize)]
pub struct BookReviews {
    pub url: String,
    pub reviews: Vec<Review>,
    /// the book's score on 1000Kitap (out of 10) and how many people read it
    pub rating: Option<f64>,
    pub readers: Option<u64>,
}

fn fold(s: &str) -> String {
    s.to_lowercase()
        .chars()
        .map(|c| match c { 'ç' => 'c', 'ğ' => 'g', 'ı' | 'î' | 'i' => 'i', 'ö' => 'o', 'ş' => 's', 'ü' | 'û' => 'u', 'â' => 'a', c if c.is_alphanumeric() => c, _ => ' ' })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join("-")
}

fn next_data(html: &str) -> Option<Value> {
    let start = html.find("<script id=\"__NEXT_DATA__\"")?;
    let open = html[start..].find('>')? + start + 1;
    let end = html[open..].find("</script>")? + open;
    serde_json::from_str(&html[open..end]).ok()
}

/// The book's page: the first search result whose address carries the title (else the first).
fn pick_book(html: &str, title: &str) -> Option<String> {
    let want = fold(title);
    let mut first = None;
    for part in html.split("href=\"/kitap/").skip(1) {
        let slug = part.split('"').next().unwrap_or("");
        if slug.is_empty() || slug.contains('/') || !slug.contains("--") {
            continue;
        }
        let name = slug.rsplit_once("--").map(|x| x.0).unwrap_or(slug);
        if first.is_none() {
            first = Some(slug.to_string());
        }
        if name == want {
            return Some(slug.to_string());
        }
    }
    first
}

/// One review's text from its pieces.
fn review_text(parse: &Value) -> String {
    let mut out = String::new();
    for p in parse.as_array().into_iter().flatten() {
        match p {
            Value::String(s) => out.push_str(s),
            Value::Object(o) => match o.get("item") {
                Some(Value::String(s)) => out.push_str(s),
                Some(Value::Object(i)) => out.push_str(i.get("adi").and_then(|x| x.as_str()).unwrap_or("")),
                _ => {}
            },
            _ => {}
        }
    }
    let text = out.replace('\u{200b}', "");
    let text: Vec<&str> = text.lines().map(|l| l.trim()).filter(|l| !l.is_empty()).collect();
    text.join("\n").chars().take(6000).collect()
}

fn parse_page(data: &Value) -> (Vec<Review>, bool, Option<f64>, Option<u64>) {
    let r = &data["props"]["pageProps"]["response"]["_sonuc"];
    let mut out = vec![];
    for x in r["liste"].as_array().into_iter().flatten() {
        if x["turu"].as_str() != Some("yorumlar") {
            continue;
        }
        let text = review_text(&x["alt"]["yorumlar"]["yorumParse"]["parse"]);
        if text.trim().is_empty() {
            continue;
        }
        let author = x["uye"]["adi"].as_str().unwrap_or("").trim().to_string();
        out.push(Review { author, stars: None, spoiler: false, text, full: None });
    }
    let book = &r["kitap"];
    (out, r["hasMore"].as_bool().unwrap_or(false), book["puan"].as_f64(), book["okuduDuz"].as_u64())
}

pub async fn reviews(title: &str, author: Option<&str>, count: usize, progress: Progress<'_>, found: &(dyn Fn(&[Review]) + Send + Sync)) -> Result<BookReviews, String> {
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(20)).build().map_err(|e| e.to_string())?;
    let count = count.clamp(1, 100);
    progress(tr!("1000Kitap'ta aranıyor", "Looking on 1000Kitap"));
    let q = match author { Some(a) if !a.trim().is_empty() => format!("{title} {a}"), _ => title.to_string() };
    let search = get_page(&client, &format!("{SITE}/ara?q={}", urlencoding(&q))).await?;
    let slug = pick_book(&search, title).ok_or_else(|| tr!("1000Kitap'ta bu kitap bulunamadı", "This book wasn't found on 1000Kitap"))?;
    let url = format!("{SITE}/kitap/{slug}");
    let (mut rating, mut readers) = (None, None);
    let mut out: Vec<Review> = vec![];
    for page in 1..=(count / 10 + 3) {
        let html = match get_page(&client, &format!("{url}/incelemeler?sayfa={page}")).await {
            Ok(h) => h,
            Err(e) if page == 1 => return Err(tr!("İncelemeler açılamadı ({})", "Couldn't open the reviews ({})", e)),
            Err(_) => break,
        };
        let Some(data) = next_data(&html) else { break };
        let (got, more, r, n) = parse_page(&data);
        rating = rating.or(r);
        readers = readers.or(n);
        let before = out.len();
        for x in got {
            if out.len() < count && !out.iter().any(|y| y.text == x.text) {
                out.push(x);
            }
        }
        found(&out[before..]);
        progress(tr!("{} inceleme alındı", "{} reviews read", out.len()));
        if out.len() >= count || !more {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
    }
    Ok(BookReviews { url, reviews: out, rating, readers })
}

#[cfg(test)]
mod tests {
    #[test]
    fn pieces() {
        let p = serde_json::json!(["— ", {"type": "egik", "item": "Kan mı dedin?"}, " dedi ", {"type": "kitapIdler", "item": {"adi": "Suç ve Ceza"}}, "\n\n İkinci  satır"]);
        assert_eq!(super::review_text(&p), "— Kan mı dedin? dedi Suç ve Ceza\nİkinci  satır");
        assert_eq!(super::fold("Suç ve Ceza"), "suc-ve-ceza");
        let html = r#"<a href="/kitap/insanligimi-yitirirken--333965">x</a><a href="/kitap/suc-ve-ceza--121">y</a>"#;
        assert_eq!(super::pick_book(html, "Suç ve Ceza").as_deref(), Some("suc-ve-ceza--121"));
    }

    #[tokio::test]
    #[ignore]
    async fn real_book() {
        let r = super::reviews("Suç ve Ceza", Some("Dostoyevski"), 10, &|m| println!("… {m}"), &|_| {}).await.unwrap();
        println!("{} → {} inceleme, puan {:?}, okuyan {:?}", r.url, r.reviews.len(), r.rating, r.readers);
        assert!(r.reviews.len() >= 8);
    }
}

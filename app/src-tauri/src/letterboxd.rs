//! Reads Letterboxd pages directly: every film's name, year and the user's star rating, page by
//! page. A profile link is expanded to the films the person watched (with ratings) and their
//! watchlist. Nothing is stored: the result goes straight back to the caller.

use scraper::{Html, Selector};
use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct Film {
    pub title: String,
    pub year: Option<String>,
    /// 0.5 – 5 stars, if the user rated it
    pub stars: Option<f32>,
}

#[derive(Serialize)]
pub struct Section {
    pub name: String,
    /// watched | liked | watchlist | list
    pub kind: String,
    pub url: String,
    pub films: Vec<Film>,
}

fn parse(html: &str) -> Vec<Film> {
    let doc = Html::parse_document(html);
    let li = Selector::parse("li").unwrap();
    let named = Selector::parse("[data-item-name]").unwrap();
    let rated = Selector::parse("[class*='rated-']").unwrap();
    let mut out: Vec<Film> = vec![];
    for item in doc.select(&li) {
        let Some(el) = item.select(&named).next() else { continue };
        // only the innermost <li> of a poster
        if item.select(&li).next().is_some() {
            continue;
        }
        let name = el.value().attr("data-item-name").unwrap_or("").trim().to_string();
        if name.is_empty() {
            continue;
        }
        let (title, year) = match name.rfind(" (") {
            Some(i) if name.ends_with(')') && name[i + 2..name.len() - 1].chars().all(|c| c.is_ascii_digit()) => {
                (name[..i].to_string(), Some(name[i + 2..name.len() - 1].to_string()))
            }
            _ => (name.clone(), None),
        };
        let stars = item.select(&rated).next().and_then(|r| {
            r.value().classes().find_map(|c| c.strip_prefix("rated-").and_then(|n| n.parse::<f32>().ok()))
        }).map(|n| n / 2.0);
        if !out.iter().any(|f| f.title == title && f.year == year) {
            out.push(Film { title, year, stars });
        }
    }
    out
}

/// What the reader is doing, for the "connecting…" card (a line like "Watched: page 3 · 214 films").
pub type Progress<'a> = &'a (dyn Fn(String) + Send + Sync);

/// Whatever the user pasted or typed, as a Letterboxd address: "dave", "@dave", "letterboxd.com/dave",
/// "https://letterboxd.com/dave/films/?x" or a boxd.it short link.
pub fn normalize(input: &str) -> Result<String, String> {
    let mut s = input.trim().trim_start_matches('@').to_string();
    if let Some(i) = s.find(['?', '#']) {
        s.truncate(i);
    }
    let s = s.trim().trim_end_matches('/').to_string();
    if s.is_empty() {
        return Err(tr!("Letterboxd kullanıcı adını ya da bağlantısını yaz", "Type a Letterboxd user name or link"));
    }
    let lower = s.to_lowercase();
    if lower.contains("letterboxd.com") || lower.contains("boxd.it") {
        let rest = lower.find("letterboxd.com").map(|i| &s[i..]).or_else(|| lower.find("boxd.it").map(|i| &s[i..])).unwrap_or(&s);
        let host_fixed = if rest.to_lowercase().starts_with("letterboxd.com") { format!("letterboxd.com{}", &rest["letterboxd.com".len()..]) } else { rest.to_string() };
        return Ok(format!("https://{host_fixed}"));
    }
    // a bare user name: letters, digits and _
    if s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') && s.len() <= 40 {
        return Ok(format!("https://letterboxd.com/{s}"));
    }
    Err(tr!("Bu bir Letterboxd bağlantısı değil: {}", "That isn't a Letterboxd link: {}", input.trim()))
}

async fn read_pages(client: &reqwest::Client, url: &str, max_pages: u32, label: &str, progress: Progress<'_>) -> Result<Vec<Film>, String> {
    let base = url.split('?').next().unwrap_or(url).trim_end_matches('/').to_string();
    let base = match base.find("/page/") { Some(i) => base[..i].to_string(), None => base };
    let mut all: Vec<Film> = vec![];
    for page in 1..=max_pages.max(1) {
        progress(if all.is_empty() { tr!("{}: sayfa {}", "{}: page {}", label, page) } else { tr!("{}: sayfa {} · {} film", "{}: page {} · {} films", label, page, all.len()) });
        let u = if page == 1 { format!("{base}/") } else { format!("{base}/page/{page}/") };
        // Cloudflare turns some requests away (403/429): wait and try again before giving up
        let mut body: Option<String> = None;
        let mut last = String::new();
        for attempt in 0..5u64 {
            match client.get(&u).send().await {
                Ok(res) if res.status().is_success() => {
                let text = match res.bytes().await { Ok(b) if b.len() <= 8 * 1024 * 1024 => String::from_utf8_lossy(&b).into_owned(), _ => String::new() };
                // a challenge page comes back as 200 without posters: treat it as a failure, except on a real last page
                if !parse(&text).is_empty() || text.contains("class=\"pagination") || attempt >= 3 { body = Some(text); break; }
                last = tr!("boş sayfa", "empty page");
            }
                Ok(res) if res.status() == reqwest::StatusCode::NOT_FOUND => { last = "404".into(); break; }
                Ok(res) => last = res.status().to_string(),
                Err(e) => last = e.to_string(),
            }
            tokio::time::sleep(std::time::Duration::from_millis(1200 * (attempt + 1))).await;
        }
        let Some(body) = body else {
            if page == 1 {
                return Err(tr!("Letterboxd sayfası açılamadı ({})", "Couldn't open the Letterboxd page ({})", last));
            }
            break;
        };
        let films = parse(&body);
        if films.is_empty() {
            break;
        }
        let before = all.len();
        for f in films {
            if !all.iter().any(|x| x.title == f.title && x.year == f.year) {
                all.push(f);
            }
        }
        if all.len() == before {
            break; // the site served the same page again: we're past the end
        }
        // be gentle with the site
        tokio::time::sleep(std::time::Duration::from_millis(250)).await;
    }
    Ok(all)
}

/// The person's own lists: (name, url), from every page of /USER/lists/.
async fn user_lists(client: &reqwest::Client, user: &str) -> Vec<(String, String)> {
    let a = Selector::parse("a[href]").unwrap();
    let prefix = format!("/{}/list/", user.to_lowercase());
    let mut out: Vec<(String, String)> = vec![];
    for page in 1..=5 {
        let u = if page == 1 { format!("https://letterboxd.com/{user}/lists/") } else { format!("https://letterboxd.com/{user}/lists/page/{page}/") };
        let Ok(res) = client.get(&u).send().await else { break };
        if !res.status().is_success() { break }
        let Ok(body) = res.bytes().await else { break };
        if body.len() > 8 * 1024 * 1024 { break; }
        let html = String::from_utf8_lossy(&body).into_owned();
        let before = out.len();
        {
            let doc = Html::parse_document(&html);
            for el in doc.select(&a) {
                let href = el.value().attr("href").unwrap_or("");
                let rest = href.to_lowercase();
                let Some(slug) = rest.strip_prefix(&prefix) else { continue };
                // exactly /user/list/slug/ and a visible name
                if slug.trim_end_matches('/').contains('/') || slug.contains('#') { continue }
                let name = el.text().collect::<String>().trim().to_string();
                if name.is_empty() { continue }
                let url = format!("https://letterboxd.com{}", href.trim_end_matches('/'));
                if !out.iter().any(|(_, x)| *x == url) { out.push((name, url)); }
            }
        }
        if out.len() == before { break }
        tokio::time::sleep(std::time::Duration::from_millis(250)).await;
    }
    out
}

/// `url`: a profile (→ watched films + watchlist), or any Letterboxd page with posters
/// (a list, /films/, /watchlist/, /films/ratings/…).
pub async fn read(url: &str, max_pages: u32, with_lists: bool, progress: Progress<'_>) -> Result<Vec<Section>, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36")
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;
    // short links (boxd.it/…) redirect to the real page
    let mut clean = normalize(url)?;
    if clean.contains("boxd.it/") {
        progress(tr!("Kısa bağlantı açılıyor", "Opening the short link"));
        let res = client.get(&clean).send().await.map_err(|e| tr!("Kısa bağlantı açılamadı: {}", "Couldn't open the short link: {}", e))?;
        clean = res.url().as_str().trim_end_matches('/').to_string();
    }
    let path: Vec<&str> = clean.split("letterboxd.com/").nth(1).unwrap_or("").split('/').filter(|s| !s.is_empty()).collect();
    if path.len() == 1 && !["films", "lists", "members", "film", "journal", "showdown"].contains(&path[0]) {
        let user = path[0];
        let root = format!("https://letterboxd.com/{user}");
        let watched = read_pages(&client, &format!("{root}/films"), max_pages, &tr!("İzledikleri", "Watched"), progress).await
            .map_err(|e| if e.contains("404") { tr!("“{}” adında bir Letterboxd kullanıcısı bulunamadı", "No Letterboxd user called “{}”", user) } else { e })?;
        let liked = read_pages(&client, &format!("{root}/likes/films"), max_pages, &tr!("Beğendikleri", "Liked"), progress).await.unwrap_or_default();
        let watchlist = read_pages(&client, &format!("{root}/watchlist"), max_pages, &tr!("İzleme listesi", "Watchlist"), progress).await.unwrap_or_default();
        let mut out = vec![
            Section { name: tr!("İzledikleri", "Watched"), kind: "watched".into(), url: format!("{root}/films/"), films: watched },
            Section { name: tr!("Beğendikleri", "Liked"), kind: "liked".into(), url: format!("{root}/likes/films/"), films: liked },
            Section { name: tr!("İzleme listesi", "Watchlist"), kind: "watchlist".into(), url: format!("{root}/watchlist/"), films: watchlist },
        ];
        if !with_lists {
            return Ok(out);
        }
        progress(tr!("Listeleri aranıyor", "Looking for their lists"));
        let lists: Vec<_> = user_lists(&client, user).await.into_iter().take(30).collect();
        let n = lists.len();
        for (i, (name, url)) in lists.into_iter().enumerate() {
            let label = tr!("Liste {}/{}: {}", "List {}/{}: {}", i + 1, n, name);
            if let Ok(films) = read_pages(&client, &url, max_pages.min(20), &label, progress).await {
                out.push(Section { name, kind: "list".into(), url: format!("{}/", url.trim_end_matches('/')), films });
            }
        }
        return Ok(out);
    }
    let films = read_pages(&client, &clean, max_pages, &tr!("Liste", "List"), progress).await?;
    let (name, kind) = if clean.contains("/watchlist") { (tr!("İzleme listesi", "Watchlist"), "watchlist") }
        else if clean.contains("/likes/") { (tr!("Beğendikleri", "Liked"), "liked") }
        else if clean.contains("/list/") { (tr!("Liste", "List"), "list") }
        else { (tr!("İzledikleri", "Watched"), "watched") };
    Ok(vec![Section { name, kind: kind.into(), url: format!("{clean}/"), films }])
}

// ---------- A film's reviews (for "Worth watching?") ----------

#[derive(Serialize)]
pub struct Review {
    pub author: String,
    /// 0.5 – 5 stars, if the reviewer rated it
    pub stars: Option<f32>,
    pub spoiler: bool,
    pub text: String,
}

#[derive(Serialize)]
pub struct Reviews {
    /// the film's Letterboxd page
    pub url: String,
    pub reviews: Vec<Review>,
}

/// "★★★★½" → 4.5
fn stars_of(label: &str) -> Option<f32> {
    let full = label.chars().filter(|c| *c == '★').count() as f32;
    let half = if label.contains('½') { 0.5 } else { 0.0 };
    let n = full + half;
    (n > 0.0 && n <= 5.0).then_some(n)
}

/// The reviews on one page of /film/SLUG/reviews/…: author, stars, spoiler flag and the text
/// (long reviews as the page shows them, cut where Letterboxd cuts them).
fn parse_reviews(html: &str) -> Vec<Review> {
    let doc = Html::parse_document(html);
    let article = Selector::parse("article.production-viewing").unwrap();
    let name = Selector::parse(".displayname").unwrap();
    let rating = Selector::parse(".inline-rating svg[aria-label], svg.-rating[aria-label]").unwrap();
    let spoiler = Selector::parse(".js-spoiler-container").unwrap();
    let body = Selector::parse(".js-review-body").unwrap();
    let para = Selector::parse("p").unwrap();
    let squash = |s: String| s.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut out = vec![];
    for a in doc.select(&article) {
        let Some(b) = a.select(&body).next() else { continue };
        let paras: Vec<String> = b.select(&para).map(|p| squash(p.text().collect())).filter(|t| !t.is_empty()).collect();
        let text = if paras.is_empty() { squash(b.text().collect()) } else { paras.join("\n") };
        let text: String = text.chars().take(3900).collect();
        if text.trim().is_empty() {
            continue;
        }
        out.push(Review {
            author: a.select(&name).next().map(|n| n.text().collect::<String>().trim().to_string()).unwrap_or_default(),
            stars: a.select(&rating).next().and_then(|r| r.value().attr("aria-label")).and_then(stars_of),
            spoiler: a.select(&spoiler).next().is_some(),
            text,
        });
    }
    out
}

fn urlencoding(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

/// The film's page: TMDB's id first (letterboxd.com/tmdb/ID redirects to the film), else the
/// search, preferring a result with the same year.
async fn film_page(client: &reqwest::Client, tmdb: Option<u64>, tv: bool, title: &str, year: Option<&str>) -> Result<String, String> {
    if let (Some(id), false) = (tmdb, tv) {
        if let Ok(res) = client.get(format!("https://letterboxd.com/tmdb/{id}/")).send().await {
            let u = res.url().as_str().to_string();
            if res.status().is_success() && u.contains("letterboxd.com/film/") {
                return Ok(u.trim_end_matches('/').to_string());
            }
        }
    }
    let year = year.filter(|y| !y.is_empty());
    let q = match year { Some(y) => format!("{title} {y}"), None => title.to_string() };
    let url = format!("https://letterboxd.com/s/search/films/{}/", urlencoding(&q));
    let html = get_page(client, &url).await.map_err(|e| tr!("Letterboxd'a bağlanılamadı: {}", "Couldn't reach Letterboxd: {}", e))?;
    let doc = Html::parse_document(&html);
    let item = Selector::parse("[data-item-link^='/film/']").unwrap();
    let mut pick: Option<String> = None;
    for el in doc.select(&item) {
        let link = el.value().attr("data-item-link").unwrap_or("").to_string();
        let name = el.value().attr("data-item-name").or(el.value().attr("data-item-full-display-name")).unwrap_or("");
        if pick.is_none() {
            pick = Some(link.clone());
        }
        if let Some(y) = year {
            if name.contains(&format!("({y})")) {
                pick = Some(link);
                break;
            }
        }
    }
    pick.map(|l| format!("https://letterboxd.com{}", l.trim_end_matches('/')))
        .ok_or_else(|| tr!("Letterboxd'da bu eser bulunamadı", "This title wasn't found on Letterboxd"))
}

/// One page as text. Letterboxd turns away reqwest's connection on its review pages (403) but not
/// Windows' own curl.exe (System32, since Windows 10 1803), so that is tried first; the address is
/// always a letterboxd.com one built here.
async fn get_page(client: &reqwest::Client, url: &str) -> Result<String, String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let curl = std::path::Path::new(&std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".into())).join("System32\\curl.exe");
        if curl.exists() {
            let url = url.to_string();
            let out = tokio::task::spawn_blocking(move || {
                std::process::Command::new(&curl)
                    .args(["-s", "-L", "--max-time", "20", "--max-filesize", "8000000", "-w", "\n%{http_code}", "-A", UA, &url])
                    .creation_flags(0x0800_0000)
                    .output()
            })
            .await;
            if let Ok(Ok(o)) = out {
                let body = String::from_utf8_lossy(&o.stdout).into_owned();
                if let Some((html, code)) = body.rsplit_once('\n') {
                    match code.trim() {
                        "200" => return Ok(html.to_string()),
                        "404" => return Err("404".into()),
                        _ => {}
                    }
                }
            }
        }
    }
    let res = client.get(url).send().await.map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(res.status().as_u16().to_string());
    }
    res.text().await.map_err(|e| e.to_string())
}

const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";

/// Up to `count` reviews of a film, most popular first (Letterboxd's "Review Activity" order).
pub async fn reviews(tmdb: Option<u64>, tv: bool, title: &str, year: Option<&str>, count: usize, progress: Progress<'_>) -> Result<Reviews, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36")
        .default_headers({
            let mut h = reqwest::header::HeaderMap::new();
            h.insert(reqwest::header::ACCEPT, "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8".parse().unwrap());
            h.insert(reqwest::header::ACCEPT_LANGUAGE, "en-US,en;q=0.9,tr;q=0.8".parse().unwrap());
            h
        })
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;
    let count = count.clamp(1, 100);
    progress(tr!("Letterboxd'da aranıyor", "Looking on Letterboxd"));
    let url = film_page(&client, tmdb, tv, title, year).await?;
    let mut out: Vec<Review> = vec![];
    // 12 reviews a page; one page more in case some are empty or repeated
    for page in 1..=(count / 12 + 2) {
        let u = if page == 1 { format!("{url}/reviews/by/activity/") } else { format!("{url}/reviews/by/activity/page/{page}/") };
        let found = match get_page(&client, &u).await {
            Ok(html) => parse_reviews(&html),
            Err(e) if page == 1 => return Err(tr!("Yorumlar açılamadı ({})", "Couldn't open the reviews ({})", e)),
            Err(_) => break,
        };
        if found.is_empty() {
            break;
        }
        for r in found {
            if out.len() < count && !out.iter().any(|x| x.text == r.text) {
                out.push(r);
            }
        }
        progress(tr!("{} yorum alındı", "{} reviews read", out.len()));
        if out.len() >= count {
            break;
        }
        // be gentle with the site
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
    }
    Ok(Reviews { url, reviews: out })
}

#[cfg(test)]
mod tests {
    #[test]
    fn review_page() {
        let html = r#"<article class="production-viewing -viewing"><span class="inline-rating"><svg aria-label="★★★★½"></svg></span><strong class="displayname">Ann</strong>
          <div class="js-review-body"><p>Great pacing.</p><p>Loud   score.</p></div></article>
          <article class="production-viewing -viewing"><strong class="displayname">Bo</strong><p class="js-spoiler-container"><em>may contain spoilers</em></p>
          <div class="js-review-body"><p>The ending works.</p></div></article>
          <article class="production-viewing -viewing"><strong class="displayname">Cy</strong><div class="js-review-body"> </div></article>"#;
        let r = super::parse_reviews(html);
        assert_eq!(r.len(), 2);
        assert_eq!((r[0].author.as_str(), r[0].stars, r[0].spoiler, r[0].text.as_str()), ("Ann", Some(4.5), false, "Great pacing.\nLoud score."));
        assert_eq!((r[1].stars, r[1].spoiler), (None, true));
        assert_eq!(super::stars_of("★★"), Some(2.0));
        assert_eq!(super::urlencoding("Dune 2021"), "Dune%202021");
    }

    #[tokio::test]
    #[ignore]
    async fn real_reviews() {
        let r = super::reviews(Some(27205), false, "Inception", Some("2010"), 50, &|m| println!("… {m}")).await.unwrap();
        println!("{} → {} yorum; ilk: {:?}", r.url, r.reviews.len(), r.reviews.first().map(|x| (&x.author, x.stars, x.spoiler)));
        assert!(r.reviews.len() >= 40);
        let s = super::reviews(None, false, "Dune", Some("1984"), 12, &|_| {}).await.unwrap();
        println!("{} → {}", s.url, s.reviews.len());
        assert!(s.url.contains("dune"));
    }

    #[test]
    fn addresses() {
        use super::normalize;
        assert_eq!(normalize("dave").unwrap(), "https://letterboxd.com/dave");
        assert_eq!(normalize("@dave ").unwrap(), "https://letterboxd.com/dave");
        assert_eq!(normalize("letterboxd.com/dave/").unwrap(), "https://letterboxd.com/dave");
        assert_eq!(normalize("https://www.letterboxd.com/dave/films/?a=1").unwrap(), "https://letterboxd.com/dave/films");
        assert_eq!(normalize("http://Letterboxd.com/dave/list/x/#top").unwrap(), "https://letterboxd.com/dave/list/x");
        assert_eq!(normalize("https://boxd.it/abc").unwrap(), "https://boxd.it/abc");
        assert!(normalize("https://imdb.com/x").is_err());
        assert!(normalize("").is_err());
    }

    #[tokio::test]
    #[ignore]
    async fn real_profile() {
        let s = super::read("https://letterboxd.com/dave/", 3, true, &|m| println!("… {m}")).await.unwrap();
        for sec in &s {
            println!("{}: {} film; ilk 3: {:?}", sec.name, sec.films.len(),
                sec.films.iter().take(3).map(|f| (f.title.clone(), f.year.clone(), f.stars)).collect::<Vec<_>>());
        }
        assert!(s[0].films.len() > 100);
    }
}

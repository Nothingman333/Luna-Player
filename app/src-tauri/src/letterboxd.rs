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

#[cfg(test)]
mod tests {
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

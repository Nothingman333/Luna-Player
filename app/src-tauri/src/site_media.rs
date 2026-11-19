//! Sites yt-dlp doesn't know, read from their public pages (no sign-in, nothing bypassed).
//! Podbee (podbeemedia.com): an episode page names its Mux stream ("muxPlaybackId"), which plays as public HLS;
//! a show page lists its episodes in its schema.org data.

use regex::Regex;
use serde::Serialize;

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Episode {
    pub url: String,
    pub title: String,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Show {
    pub name: String,
    pub art: Option<String>,
    pub episodes: Vec<Episode>,
}

fn host(url: &str) -> String {
    url::Url::parse(url).ok().and_then(|u| u.host_str().map(|h| h.trim_start_matches("www.").to_ascii_lowercase())).unwrap_or_default()
}

pub fn is_podbee(url: &str) -> bool {
    host(url) == "podbeemedia.com"
}

fn unescape(s: &str) -> String {
    s.replace("\\u0026", "&").replace("\\\"", "\"").replace("&amp;", "&").replace("&#x27;", "'").replace("&quot;", "\"")
}

/// The page's <title> without the " | Show" tail.
fn page_title(html: &str) -> String {
    Regex::new(r"<title>([^<]*)</title>").unwrap().captures(html).map(|c| unescape(c[1].split(" | ").next().unwrap_or("").trim())).unwrap_or_default()
}

/// The show an episode page belongs to (its <title> tail).
pub fn podbee_show_name(html: &str) -> String {
    Regex::new(r"<title>([^<]*)</title>").unwrap().captures(html).and_then(|c| c[1].split(" | ").nth(1).map(|x| unescape(x.trim()))).unwrap_or_default()
}

/// An episode page → its HLS address, title and picture.
pub fn podbee_episode(html: &str) -> Option<(String, String, Option<String>)> {
    let id = Regex::new(r#"muxPlaybackId\\?"\s*:\s*\\?"([A-Za-z0-9]{10,80})"#).unwrap().captures(html)?[1].to_string();
    let thumb = Regex::new(r#"thumbnailUrl\\?"\s*:\s*\\?"(https://[^"\\]+)"#).unwrap().captures(html).map(|c| unescape(&c[1]));
    Some((format!("https://stream.mux.com/{id}.m3u8"), page_title(html), thumb))
}

/// A show page → its name, picture and episodes (newest first, as the page lists them).
pub fn podbee_show(html: &str) -> Option<Show> {
    let re = Regex::new(r#""url":"(https://podbeemedia\.com/v/[0-9a-f]{12,32})","name":"((?:[^"\\]|\\.)*)""#).unwrap();
    let mut episodes: Vec<Episode> = Vec::new();
    for c in re.captures_iter(html) {
        let url = c[1].to_string();
        if !episodes.iter().any(|e| e.url == url) {
            episodes.push(Episode { url, title: unescape(&c[2]) });
        }
    }
    if episodes.is_empty() {
        return None;
    }
    let art = Regex::new(r#"<meta property="og:image" content="([^"]+)""#).unwrap().captures(html).map(|c| unescape(&c[1]));
    Some(Show { name: page_title(html), art, episodes })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reads_podbee_pages() {
        let ep = r#"<title>Delilikte Liyakat Esastır | Fularsız ile Kuralsız</title> x \"muxPlaybackId\":\"z0132gBkCLEX3Rvd\" \"thumbnailUrl\":\"https://cdn.x/a.jpg\""#;
        assert_eq!(podbee_episode(ep), Some(("https://stream.mux.com/z0132gBkCLEX3Rvd.m3u8".into(), "Delilikte Liyakat Esastır".into(), Some("https://cdn.x/a.jpg".into()))));
        let show = r#"<title>Fularsız ile Kuralsız | Podbee</title>{"@type":"ListItem","position":1,"url":"https://podbeemedia.com/v/6998c1e4b03b0561f2591313","name":"Bir \"iki\""},{"url":"https://podbeemedia.com/v/695d2484c4e5c14d04754114","name":"Motive"}"#;
        let s = podbee_show(show).unwrap();
        assert_eq!((s.name.as_str(), s.episodes.len(), s.episodes[0].title.as_str()), ("Fularsız ile Kuralsız", 2, "Bir \"iki\""));
        assert!(is_podbee("https://www.podbeemedia.com/v/x") && !is_podbee("https://evil.com/podbeemedia.com"));
    }
}

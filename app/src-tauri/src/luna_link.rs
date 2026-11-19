//! `luna://` links: a browser (or the Luna Chrome add-on) opens Luna with one of a few harmless actions.
//! Windows learns the scheme from a per-user registry key (no admin rights). Any site can open such a link,
//! so only "play", "open" and "import" (music into the music part) with an http(s) or magnet address are accepted; everything else is dropped.

use serde::Serialize;

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct LunaLink {
    pub action: String,
    pub url: String,
    pub title: Option<String>,
    /// for "download": "video" or "audio", and the highest picture height
    pub kind: Option<String>,
    pub height: Option<u32>,
    /// for "download": the whole playlist the video was opened in
    pub playlist: bool,
    /// from the add-on on any site: the address the page's own player plays (used when the page itself can't be read),
    /// whether that is sound, and how long it is in seconds
    pub media: Option<String>,
    pub duration: Option<u32>,
}

/// `luna://play?url=…&title=…` → the action and a checked address; `None` for anything else.
pub fn parse(raw: &str) -> Option<LunaLink> {
    if raw.len() > 8192 {
        return None;
    }
    let link = url::Url::parse(raw.trim()).ok()?;
    if link.scheme() != "luna" {
        return None;
    }
    let action = link.host_str().unwrap_or("").to_ascii_lowercase();
    if !["play", "open", "import", "download"].contains(&action.as_str()) {
        return None;
    }
    let mut target = None;
    let mut title = None;
    let mut kind = None;
    let mut height = None;
    let mut playlist = false;
    let mut media = None;
    let mut duration = None;
    for (k, v) in link.query_pairs() {
        match k.as_ref() {
            "playlist" => playlist = v == "1",
            "media" => media = Some(v.to_string()).filter(|m| m.len() <= 4096 && url::Url::parse(m).ok().is_some_and(|u| matches!(u.scheme(), "http" | "https") && u.host_str().is_some())),
            "dur" => duration = v.parse::<u32>().ok().filter(|d| *d > 0 && *d < 7 * 24 * 3600),
            "url" => target = Some(v.to_string()),
            "kind" if v == "video" || v == "audio" => kind = Some(v.to_string()),
            "height" => height = v.parse::<u32>().ok().filter(|h| [360, 480, 720, 1080, 1440, 2160].contains(h)),
            "title" => title = Some(v.chars().filter(|c| !c.is_control()).take(300).collect::<String>()),
            _ => {}
        }
    }
    let target = target?;
    let ok = if target.to_ascii_lowercase().starts_with("magnet:?") {
        target.len() <= 4096
    } else {
        url::Url::parse(&target).ok().is_some_and(|u| matches!(u.scheme(), "http" | "https") && u.host_str().is_some())
    };
    ok.then_some(LunaLink { action, url: target, title: title.filter(|t| !t.is_empty()), kind, height, playlist, media, duration })
}

/// The first `luna://` argument Luna was started with.
pub fn from_args<I: IntoIterator<Item = String>>(args: I) -> Option<LunaLink> {
    args.into_iter().filter(|a| a.to_ascii_lowercase().starts_with("luna:")).find_map(|a| parse(&a))
}

/// Points `luna://` at this exe for the current user. A release build always does; a dev build only when nothing is registered yet,
/// so running from source never takes the scheme away from the installed Luna.
#[cfg(windows)]
pub fn register() {
    use std::os::windows::process::CommandExt;
    const NO_WINDOW: u32 = 0x0800_0000;
    let Ok(exe) = std::env::current_exe() else { return };
    let exe = exe.to_string_lossy().to_string();
    let reg = |args: &[&str]| std::process::Command::new("reg").args(args).creation_flags(NO_WINDOW).output();
    let key = r"HKCU\Software\Classes\luna";
    let command = format!("\"{exe}\" \"%1\"");
    if cfg!(debug_assertions) && reg(&["query", &format!(r"{key}\shell\open\command")]).is_ok_and(|o| o.status.success()) {
        return;
    }
    if reg(&["query", &format!(r"{key}\shell\open\command"), "/ve"]).is_ok_and(|o| String::from_utf8_lossy(&o.stdout).contains(&command)) {
        return;
    }
    let _ = reg(&["add", key, "/ve", "/d", "URL:Luna Player", "/f"]);
    let _ = reg(&["add", key, "/v", "URL Protocol", "/d", "", "/f"]);
    let _ = reg(&["add", &format!(r"{key}\DefaultIcon"), "/ve", "/d", &format!("\"{exe}\",0"), "/f"]);
    let _ = reg(&["add", &format!(r"{key}\shell\open\command"), "/ve", "/d", &command, "/f"]);
}
#[cfg(not(windows))]
pub fn register() {}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn accepts_only_safe_links() {
        let l = parse("luna://play?url=https%3A%2F%2Fexample.com%2Fv.m3u8&title=Film").unwrap();
        assert_eq!((l.action.as_str(), l.url.as_str(), l.title.as_deref()), ("play", "https://example.com/v.m3u8", Some("Film")));
        assert!(parse("luna://play?url=magnet%3A%3Fxt%3Durn%3Abtih%3Aabc").is_some());
        assert!(parse("luna://open?url=https%3A%2F%2Fexample.com").is_some());
        assert_eq!(parse("luna://download?url=https%3A%2F%2Fyoutu.be%2Fa&kind=video&height=720").unwrap().height, Some(720));
        assert!(parse("luna://import?url=https%3A%2F%2Fopen.spotify.com%2Fplaylist%2Fx").is_some());
        let w = parse("luna://play?url=https%3A%2F%2Fa.com%2Fp&media=https%3A%2F%2Fcdn.a.com%2Fe.mp3&kind=audio&dur=1800").unwrap();
        assert_eq!((w.media.as_deref(), w.duration, w.kind.as_deref()), (Some("https://cdn.a.com/e.mp3"), Some(1800), Some("audio")));
        assert!(parse("luna://play?url=https%3A%2F%2Fa.com&media=file%3A%2F%2F%2Fc%3A%2Fx").unwrap().media.is_none());
        for bad in ["luna://delete?url=https%3A%2F%2Fa.com", "luna://play?url=file%3A%2F%2F%2FC%3A%2Fx", "luna://play", "https://a.com", "luna://play?url=javascript%3Aalert(1)"] {
            assert!(parse(bad).is_none(), "{bad}");
        }
        assert!(from_args(["--minimized".to_string(), "luna://play?url=https%3A%2F%2Fa.com%2Fv".to_string()]).is_some());
    }
}

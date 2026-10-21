//! A link copied anywhere in Windows: Luna offers to import it (a small note at the top for 30 s).
//! Only the clipboard's change counter is checked each second; its text is read only after a
//! change, and passed on only when it is one link (the app decides whether it can open it).

use tauri::{AppHandle, Emitter};

#[link(name = "user32")]
unsafe extern "system" {
    fn GetClipboardSequenceNumber() -> u32;
    fn OpenClipboard(owner: isize) -> i32;
    fn CloseClipboard() -> i32;
    fn GetClipboardData(format: u32) -> isize;
}
#[link(name = "kernel32")]
unsafe extern "system" {
    fn GlobalLock(h: isize) -> *const u16;
    fn GlobalUnlock(h: isize) -> i32;
    fn GlobalSize(h: isize) -> usize;
}
const CF_UNICODETEXT: u32 = 13;

fn text() -> Option<String> {
    unsafe {
        if OpenClipboard(0) == 0 {
            return None;
        }
        let mut out = None;
        let h = GetClipboardData(CF_UNICODETEXT);
        if h != 0 {
            let p = GlobalLock(h);
            if !p.is_null() {
                // a link is short: anything bigger isn't read
                let max = (GlobalSize(h) / 2).min(4096);
                let s = std::slice::from_raw_parts(p, max);
                let end = s.iter().position(|&c| c == 0).unwrap_or(max);
                out = String::from_utf16(&s[..end]).ok();
                GlobalUnlock(h);
            }
        }
        CloseClipboard();
        out
    }
}

/// One link alone (not a paragraph that has a link in it).
fn one_link(s: &str) -> Option<String> {
    let t = s.trim();
    let ok = (t.starts_with("http://") || t.starts_with("https://") || t.starts_with("magnet:?"))
        && t.len() < 3000
        && !t.chars().any(char::is_whitespace);
    ok.then(|| t.to_string())
}

/// Turned on by the app at start (unless switched off in Settings); off: the clipboard isn't read at all.
pub static ON: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

pub fn watch(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last = unsafe { GetClipboardSequenceNumber() };
        loop {
            std::thread::sleep(std::time::Duration::from_millis(900));
            let n = unsafe { GetClipboardSequenceNumber() };
            if n == last {
                continue;
            }
            last = n;
            if !ON.load(std::sync::atomic::Ordering::Relaxed) {
                continue;
            }
            // the program that copied may still hold the clipboard for a moment
            std::thread::sleep(std::time::Duration::from_millis(150));
            if let Some(link) = text().as_deref().and_then(one_link) {
                let _ = app.emit("clipboard-link", link);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    #[test]
    fn only_a_link() {
        use super::one_link as l;
        assert_eq!(l("  https://open.spotify.com/playlist/abc \r\n").as_deref(), Some("https://open.spotify.com/playlist/abc"));
        assert_eq!(l("magnet:?xt=urn:btih:abc").as_deref(), Some("magnet:?xt=urn:btih:abc"));
        assert_eq!(l("look at https://x.com"), None);
        assert_eq!(l("ftp://x"), None);
    }
}

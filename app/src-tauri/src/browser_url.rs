//! Address rules for every remote-tab entry point (create, navigate, popups, reads).
//! Pure and platform independent so the same file is unit-tested without WebView2.
//! Loaded from browser.rs with `#[path]`; it needs a `Url` type (tauri::Url = url::Url) in its parent.
use super::Url;

/// Luna's own origins on Windows are `http://<scheme>.localhost` (app UI, IPC, asset files).
/// `about.localhost` is the origin Tauri assigns to tabs created from `about:blank`.
const APP_HOSTS: [&str; 4] = ["tauri.localhost", "ipc.localhost", "asset.localhost", "about.localhost"];
/// The development UI (`tauri dev`, see tauri.conf.json devUrl).
const DEV_PORT: u16 = 1420;

/// Lower-case host without IPv6 brackets or trailing dots (`localhost.` is the same host).
pub fn host_key(url: &Url) -> String {
    url.host_str().unwrap_or("").trim_start_matches('[').trim_end_matches(']').trim_end_matches('.').to_ascii_lowercase()
}

/// Every spelling that reaches this computer's loopback interface: `*.localhost`, 127/8,
/// 0.0.0.0, ::1, :: and IPv4-mapped forms of those.
pub fn loopback_host(host: &str) -> bool {
    if host == "localhost" || host.ends_with(".localhost") { return true; }
    match host.parse::<std::net::IpAddr>() {
        Ok(std::net::IpAddr::V4(v4)) => v4.is_loopback() || v4.is_unspecified(),
        Ok(std::net::IpAddr::V6(v6)) => v6.is_loopback() || v6.is_unspecified()
            || v6.to_ipv4_mapped().is_some_and(|v4| v4.is_loopback() || v4.is_unspecified()),
        Err(_) => false,
    }
}

pub fn checked_url(raw: &str) -> Result<Url, String> {
    if raw.len() > 8192 { return Err("Address too long".into()); }
    let url = Url::parse(raw).map_err(|e| e.to_string())?;
    let host = host_key(&url);
    let app_origin = APP_HOSTS.iter().any(|h| host == *h || host.ends_with(&format!(".{h}")));
    if !matches!(url.scheme(), "http" | "https") || host.is_empty() || !url.username().is_empty() || url.password().is_some()
        || app_origin || (loopback_host(&host) && url.port() == Some(DEV_PORT)) {
        return Err("Only external HTTP(S) addresses are allowed".into());
    }
    Ok(url)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn privileged_schemes_and_credentials_stay_blocked() {
        for url in ["file:///C:/private", "javascript:alert(1)", "data:text/html,x", "about:blank", "tauri://localhost", "https://user:pass@example.com", "https://user@example.com"] {
            assert!(checked_url(url).is_err(), "{url}");
        }
    }
    #[test]
    fn app_origins_are_blocked_in_every_spelling() {
        for url in ["https://tauri.localhost/x", "http://tauri.localhost./", "http://TAURI.localhost../x", "https://x.tauri.localhost", "http://ipc.localhost/plugin", "http://asset.localhost/C:/a.jpg",
                    "http://a.asset.localhost/", "http://about.localhost/", "http://tauri%2Elocalhost/"] {
            assert!(checked_url(url).is_err(), "{url}");
        }
    }
    #[test]
    fn development_ui_port_is_blocked_on_every_loopback_spelling() {
        for url in ["http://localhost:1420", "http://localhost.:1420", "http://foo.localhost:1420", "http://127.0.0.1:1420", "http://127.0.0.2:1420", "http://2130706433:1420",
                    "http://0.0.0.0:1420", "http://[::1]:1420", "http://[0:0:0:0:0:0:0:1]:1420", "http://[::]:1420", "http://[::ffff:127.0.0.1]:1420", "https://localhost:1420"] {
            assert!(checked_url(url).is_err(), "{url}");
        }
    }
    #[test]
    fn ordinary_web_lan_and_other_local_ports_stay_open() {
        for url in ["https://example.com/a?q=1#part", "http://localhost:8000/a", "http://127.0.0.1:3000", "http://[::1]:8080/", "http://192.168.1.10/", "http://nas.local:5000/", "https://example.com:1420/", "http://10.0.0.5:1420/"] {
            assert!(checked_url(url).is_ok(), "{url}");
        }
        assert_eq!(checked_url("https://example.com/a?q=1#part").unwrap().as_str(), "https://example.com/a?q=1#part");
    }
    #[test]
    fn oversized_addresses_are_rejected_before_parsing() {
        assert!(checked_url(&format!("https://example.com/{}", "a".repeat(8200))).is_err());
    }
}

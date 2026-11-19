//! A page read through a real browser window: for sites whose bot wall turns plain downloads away (Letterboxd answers
//! curl with 403/503). It uses the profile of Luna's web browser (so a check passed there counts here too) and is
//! hidden; it gets no native capabilities and is closed after each read. If the site asks "are you human", the
//! window comes on screen so the user can answer it; Luna never answers it itself.
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

static APP: OnceLock<AppHandle> = OnceLock::new();
static ONE: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

pub fn init(app: &AppHandle) {
    let _ = APP.set(app.clone());
}

async fn run(view: &tauri::WebviewWindow, script: &str, wait: Duration) -> Result<String, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    let tx = Mutex::new(Some(tx));
    view.eval_with_callback(script, move |value| {
        if let Ok(mut s) = tx.lock() {
            if let Some(s) = s.take() {
                let _ = s.send(value);
            }
        }
    })
    .map_err(|e| e.to_string())?;
    let raw = tokio::time::timeout(wait, rx).await.map_err(|_| "page timed out")?.map_err(|_| "page closed")?;
    // ExecuteScript hands back the script's value JSON-encoded
    Ok(serde_json::from_str::<String>(&raw).unwrap_or_default())
}

/// The page's final address and HTML after it has loaded in a browser. Only https pages of the given hosts.
pub async fn get(url: &str, hosts: &[&str]) -> Result<(String, String), String> {
    let app = APP.get().ok_or("no app")?;
    let parsed = tauri::Url::parse(url).map_err(|e| e.to_string())?;
    let host = parsed.host_str().unwrap_or("");
    if parsed.scheme() != "https" || !hosts.iter().any(|h| host == *h || host.ends_with(&format!(".{h}"))) {
        return Err("not allowed".into());
    }
    let _one = ONE.lock().await;
    let label = "webfetch";
    if let Some(old) = app.get_webview_window(label) {
        let _ = old.destroy();
    }
    let profile = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("web-profile");
    // the same profile options as the browser's tabs: one WebView2 profile must always be opened the same way
    let view = tauri::WebviewWindowBuilder::new(app, label, tauri::WebviewUrl::External(parsed.clone()))
        .data_directory(profile)
        .browser_extensions_enabled(true)
        .title("Luna · Letterboxd")
        .inner_size(1000.0, 760.0)
        .skip_taskbar(true)
        .focused(false)
        .visible(false)
        .build()
        .map_err(|e| {
            crate::browser::dlog(app, &format!("webfetch: window failed: {e}"));
            e.to_string()
        })?;
    crate::browser::dlog(app, &format!("webfetch: open {}", parsed.path()));
    let started = Instant::now();
    let mut shown = false;
    let mut last = String::new();
    let result = loop {
        tokio::time::sleep(Duration::from_millis(600)).await;
        let state = run(&view, "document.readyState+'|'+(document.querySelector('#challenge-form,#challenge-running,#challenge-stage,.cf-turnstile,#cf-wrapper')||/just a moment|bir dakika|attention required/i.test(document.title)?'check':'page')+'|'+document.title.slice(0,60)", Duration::from_secs(5))
            .await
            .unwrap_or_else(|e| format!("err|{e}"));
        if state != last {
            crate::browser::dlog(app, &format!("webfetch: {state} ({} ms)", started.elapsed().as_millis()));
            last = state.clone();
        }
        if state.starts_with("complete|page|") {
            let html = run(&view, "location.href+'\\n'+document.documentElement.outerHTML", Duration::from_secs(10)).await;
            break html.and_then(|t| t.split_once('\n').map(|(u, h)| (u.to_string(), h.to_string())).ok_or("empty page".into()));
        }
        // only a real "are you human" check that does not pass by itself brings the window on screen
        if !shown && state.contains("|check|") && started.elapsed() > Duration::from_secs(8) {
            shown = true;
            crate::browser::dlog(app, "webfetch: shown for the user");
            let _ = view.center();
            let _ = view.set_skip_taskbar(false);
            let _ = view.show();
            let _ = view.set_focus();
        }
        if started.elapsed() > Duration::from_secs(if shown { 90 } else { 30 }) {
            break Err("the page did not open".into());
        }
    };
    let _ = view.destroy();
    if let Err(e) = &result {
        crate::browser::dlog(app, &format!("webfetch: failed: {e}"));
    }
    result.and_then(|(u, h)| if h.len() > 200 { Ok((u, h)) } else { Err("empty page".into()) })
}

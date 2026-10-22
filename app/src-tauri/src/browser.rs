//! Remote pages live in separate WebView2 storage and receive no Luna command access.
use std::{collections::HashSet, sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}}};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, Webview, WebviewBuilder, WebviewUrl};
use tauri::webview::{DownloadEvent, NewWindowResponse, PageLoadEvent, PermissionKind};
use std::io::Write as _;

/// Luna Web's detailed log (luna-debug.log in Luna's data folder): what the page layer, the bubble,
/// menus and downloads did, so a "layer" problem can be read back afterwards. Kept under ~4 MB.
pub fn dlog(app: &AppHandle, msg: &str) {
    let Ok(dir) = app.path().app_local_data_dir() else { return };
    let path = dir.join("luna-debug.log");
    if std::fs::metadata(&path).map(|m| m.len() > 4_000_000).unwrap_or(false) {
        let _ = std::fs::rename(&path, dir.join("luna-debug.old.log"));
    }
    let ms = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
        let _ = writeln!(f, "{ms} {msg}");
    }
}

#[tauri::command]
pub fn debug_log(app: AppHandle, caller: Webview, lines: Vec<String>) -> Result<(), String> {
    trusted(&caller)?;
    for l in lines.iter().take(200) { dlog(&app, &format!("ui {}", l.chars().take(4000).collect::<String>())); }
    Ok(())
}

/// Files the tabs downloaded in this run: only these can be opened or shown from Luna.
#[derive(Default)]
pub struct Downloads(pub Mutex<HashSet<std::path::PathBuf>>);

const RISKY: [&str; 14] = ["exe", "msi", "bat", "cmd", "ps1", "vbs", "js", "jse", "wsf", "scr", "com", "lnk", "hta", "reg"];

/// Opens a finished download (not programs or scripts: those are only shown in their folder) or shows it in Explorer.
#[tauri::command]
pub fn browser_download_open(app: AppHandle, caller: Webview, path: String, reveal: bool) -> Result<(), String> {
    trusted(&caller)?;
    let p = std::path::PathBuf::from(&path);
    if !app.state::<Downloads>().0.lock().map_err(|e| e.to_string())?.contains(&p) { return Err("Unknown download".into()); }
    if !p.exists() { return Err("Dosya artık yok".into()); }
    let ext = p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    dlog(&app, &format!("download open reveal={reveal} {path}"));
    let mut cmd = std::process::Command::new("explorer.exe");
    if reveal || RISKY.contains(&ext.as_str()) { cmd.arg(format!("/select,{}", p.display())); } else { cmd.arg(&p); }
    cmd.spawn().map(|_| ()).map_err(|e| e.to_string())
}

/// Unpacked browser extensions (Chrome/Edge style folders with a manifest.json) that every tab loads.
fn extensions_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let d = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("web-extensions");
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}

#[tauri::command]
pub fn browser_extensions(app: AppHandle, caller: Webview, action: String) -> Result<serde_json::Value, String> {
    trusted(&caller)?;
    let dir = extensions_dir(&app)?;
    if action == "open-folder" {
        std::process::Command::new("explorer.exe").arg(&dir).spawn().map_err(|e| e.to_string())?;
        return Ok(serde_json::Value::Null);
    }
    let mut out = vec![];
    for e in std::fs::read_dir(&dir).map_err(|e| e.to_string())?.flatten() {
        let m = e.path().join("manifest.json");
        let Ok(text) = std::fs::read_to_string(&m) else { continue };
        let j: serde_json::Value = serde_json::from_str(text.trim_start_matches('\u{feff}')).unwrap_or_default();
        let folder = e.file_name().to_string_lossy().to_string();
        let name = j["name"].as_str().filter(|n| !n.starts_with("__MSG_")).map(String::from).unwrap_or_else(|| folder.clone());
        out.push(serde_json::json!({ "name": name, "version": j["version"].as_str().unwrap_or(""), "folder": folder }));
    }
    Ok(serde_json::json!({ "dir": dir.display().to_string(), "items": out }))
}
use tauri::Url;

#[path = "browser_url.rs"]
mod url_rules;
use url_rules::checked_url;

#[derive(Default)]
pub struct BrowserState(pub Mutex<HashSet<u32>>);

fn trusted(caller: &Webview) -> Result<(), String> {
    if caller.label() == "main" { Ok(()) } else { Err("Browser commands require Luna's main UI".into()) }
}
fn label(id: u32) -> String { format!("luna-web-{id}") }
fn tab(app: &AppHandle, id: u32) -> Result<Webview, String> {
    app.get_webview(&label(id)).ok_or_else(|| "Tab closed".into())
}
fn mute(view: &Webview, muted: bool) -> Result<(), String> {
    // Native muting also covers cross-origin video frames, unlike DOM pause().
    view.with_webview(move |platform| {
        use windows_core::Interface;
        use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2_8;
        unsafe {
            if let Ok(core) = platform.controller().CoreWebView2() {
                if let Ok(audio) = core.cast::<ICoreWebView2_8>() {
                    let _ = audio.SetIsMuted(muted);
                }
            }
        }
    }).map_err(|e| e.to_string())
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BrowserEvent { id: u32, kind: &'static str, value: String }
fn event(app: &AppHandle, id: u32, kind: &'static str, value: String) {
    let _ = app.emit_to("main", "luna-browser-event", BrowserEvent { id, kind, value });
}
/// Runs a call on the tab's own CoreWebView2 (not page script, so it also works on error pages).
fn with_core(view: &Webview, call: impl FnOnce(&webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2) + Send + 'static) -> Result<(), String> {
    view.with_webview(move |platform| {
        if let Ok(core) = unsafe { platform.controller().CoreWebView2() } { call(&core); }
    }).map_err(|e| e.to_string())
}
fn permission_name(kind: PermissionKind) -> &'static str {
    match kind {
        PermissionKind::Microphone => "microphone", PermissionKind::Camera => "camera", PermissionKind::Geolocation => "location",
        PermissionKind::Notifications => "notifications", PermissionKind::ClipboardRead => "clipboard", PermissionKind::DisplayCapture => "screen",
        _ => "other",
    }
}

/// Native signals the UI cannot infer from page-load events alone: which navigation finished and
/// how (`nav-done`), real back/forward availability, whether the page is playing audio, and the
/// page zoom. All are read from WebView2 itself; none of them runs script in the page.
fn watch(view: &Webview, app: AppHandle, id: u32) -> Result<(), String> {
    view.with_webview(move |platform| {
        use std::{cell::RefCell, collections::HashMap, rc::Rc};
        use windows_core::{Interface, PWSTR};
        use webview2_com::{take_pwstr, HistoryChangedEventHandler, IsDocumentPlayingAudioChangedEventHandler,
            NavigationCompletedEventHandler, NavigationStartingEventHandler, ZoomFactorChangedEventHandler};
        use webview2_com::Microsoft::Web::WebView2::Win32::{ICoreWebView2_8, ICoreWebView2NavigationCompletedEventArgs2};
        let controller = platform.controller();
        let Ok(core) = (unsafe { controller.CoreWebView2() }) else { return };
        // NavigationId -> the address that navigation was (last) heading to, redirects included.
        let started: Rc<RefCell<HashMap<u64, String>>> = Rc::default();
        let mut token = Default::default();
        let seen = started.clone();
        let handler_1 = NavigationStartingEventHandler::create(Box::new(move |_, args| {
            let Some(args) = args else { return Ok(()) };
            let (mut nav, mut uri, mut cancel) = (0u64, PWSTR::null(), Default::default());
            unsafe { args.NavigationId(&mut nav)?; args.Uri(&mut uri)?; args.Cancel(&mut cancel)?; }
            let uri = take_pwstr(uri);
            let canceled: bool = cancel.into();
            let mut seen = seen.borrow_mut();
            if seen.len() > 64 { seen.clear(); }
            match Url::parse(&uri) { Ok(url) if !canceled => { seen.insert(nav, url.to_string()); } _ => { seen.remove(&nav); } }
            Ok(())
        }));
        let _ = unsafe { core.add_NavigationStarting(&handler_1, &mut token) };
        let (seen, done_app) = (started.clone(), app.clone());
        let handler_2 = NavigationCompletedEventHandler::create(Box::new(move |_, args| {
            let Some(args) = args else { return Ok(()) };
            let (mut nav, mut ok, mut status, mut http) = (0u64, Default::default(), Default::default(), 0i32);
            unsafe { args.NavigationId(&mut nav)?; args.IsSuccess(&mut ok)?; args.WebErrorStatus(&mut status)?; }
            if let Ok(more) = args.cast::<ICoreWebView2NavigationCompletedEventArgs2>() { let _ = unsafe { more.HttpStatusCode(&mut http) }; }
            let ok: bool = ok.into();
            let url = seen.borrow_mut().remove(&nav).unwrap_or_default();
            event(&done_app, id, "nav-done", serde_json::json!({ "url": url, "ok": ok, "status": status.0, "http": http }).to_string());
            Ok(())
        }));
        let _ = unsafe { core.add_NavigationCompleted(&handler_2, &mut token) };
        let history_app = app.clone();
        let handler_3 = HistoryChangedEventHandler::create(Box::new(move |sender, _| {
            let Some(core) = sender else { return Ok(()) };
            let (mut back, mut forward) = (Default::default(), Default::default());
            unsafe { core.CanGoBack(&mut back)?; core.CanGoForward(&mut forward)?; }
            let (back, forward): (bool, bool) = (back.into(), forward.into());
            event(&history_app, id, "history", format!("{}{}", u8::from(back), u8::from(forward)));
            Ok(())
        }));
        let _ = unsafe { core.add_HistoryChanged(&handler_3, &mut token) };
        if let Ok(audio) = core.cast::<ICoreWebView2_8>() {
            let audio_app = app.clone();
            let handler_4 = IsDocumentPlayingAudioChangedEventHandler::create(Box::new(move |sender, _| {
                let Some(core) = sender else { return Ok(()) };
                let mut playing = Default::default();
                unsafe { core.cast::<ICoreWebView2_8>()?.IsDocumentPlayingAudio(&mut playing)?; }
                let playing: bool = playing.into();
                event(&audio_app, id, "audio", if playing { "1" } else { "0" }.into());
                Ok(())
            }));
            let _ = unsafe { audio.add_IsDocumentPlayingAudioChanged(&handler_4, &mut token) };
        }
        let zoom_app = app.clone();
        let handler_5 = ZoomFactorChangedEventHandler::create(Box::new(move |sender, _| {
            let Some(controller) = sender else { return Ok(()) };
            let mut zoom = 1.0f64;
            unsafe { controller.ZoomFactor(&mut zoom)?; }
            if zoom.is_finite() { event(&zoom_app, id, "zoom", format!("{zoom:.3}")); }
            Ok(())
        }));
        let _ = unsafe { controller.add_ZoomFactorChanged(&handler_5, &mut token) };
    }).map_err(|e| e.to_string())
}

/// A tiny, transparent app-owned view is above native page content. No bottom bar is needed.
/// It has no IPC capability and can only signal opening the existing main-UI chat.
#[tauri::command]
pub async fn browser_bubble(app: AppHandle, caller: Webview, visible: bool, x: Option<f64>, y: Option<f64>, size: Option<f64>, color: Option<String>) -> Result<(), String> {
    trusted(&caller)?;
    const BUBBLE: &str = "luna-web-bubble";
    if !visible {
        if let Some(view) = app.get_webview(BUBBLE) { view.hide().map_err(|e| e.to_string())?; }
        return Ok(());
    }
    let (x, y, size) = (x.ok_or("Missing bubble position")?, y.ok_or("Missing bubble position")?, size.ok_or("Missing bubble size")?);
    let window_size = caller.window().inner_size().map_err(|e| e.to_string())?;
    if ![x, y, size].iter().all(|v| v.is_finite()) || x < 0. || y < 0. || !(32. ..=512.).contains(&size)
        || x + size > window_size.width as f64 + 2. || y + size > window_size.height as f64 + 2. { return Err("Invalid bubble bounds".into()); }
    let color = color.filter(|s| s.starts_with('#') && (s.len() == 4 || s.len() == 7) && s[1..].bytes().all(|c| c.is_ascii_hexdigit())).unwrap_or_else(|| "#e8701a".into());
    let view = if let Some(view) = app.get_webview(BUBBLE) { view } else {
        let callback_app = app.clone();
        let initial_color = serde_json::to_string(&color).map_err(|e| e.to_string())?;
        let builder = WebviewBuilder::new(BUBBLE, WebviewUrl::App("browser-bubble.html".into()))
            .transparent(true).focused(false).disable_drag_drop_handler()
            // Same profile as the main UI, so the same browser arguments: WebView2 refuses a second
            // environment on one folder with other options (0x8007139F "not in the correct state").
            .additional_browser_args("--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,CalculateNativeWinOcclusion --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling")
            .initialization_script(format!("addEventListener('DOMContentLoaded',()=>document.documentElement.style.setProperty('--accent',{initial_color}),{{once:true}});"))
            .on_navigation(move |url| {
                if url.as_str() == "https://luna-assistant.invalid/open" {
                    event(&callback_app, 0, "assistant", String::new());
                    return false;
                }
                matches!(url.scheme(), "tauri" | "http" | "https") && matches!(url.host_str(), Some("localhost" | "tauri.localhost" | "127.0.0.1"))
            })
            .on_new_window(|_, _| NewWindowResponse::Deny)
            .on_download(|_, _| false)
            .on_permission_request(|_, _| tauri::webview::PermissionResponse::Deny);
        caller.window().add_child(builder, tauri::PhysicalPosition::new(x as i32, y as i32), tauri::PhysicalSize::new(size as u32, size as u32)).map_err(|e| e.to_string())?
    };
    view.set_position(tauri::PhysicalPosition::new(x as i32, y as i32)).map_err(|e| e.to_string())?;
    view.set_size(tauri::PhysicalSize::new(size as u32, size as u32)).map_err(|e| e.to_string())?;
    let _ = view.eval(format!("document.documentElement.style.setProperty('--accent',{});", serde_json::to_string(&color).map_err(|e| e.to_string())?));
    view.show().map_err(|e| e.to_string())?;
    // Place its OWN child container above remote child containers, without activating the window.
    view.with_webview(|platform| unsafe {
        #[link(name = "user32")]
        unsafe extern "system" { fn SetWindowPos(hwnd: isize, after: isize, x: i32, y: i32, width: i32, height: i32, flags: u32) -> i32; }
        let mut hwnd = Default::default();
        if platform.controller().ParentWindow(&mut hwnd).is_ok() {
            let _ = SetWindowPos(hwnd.0 as isize, 0, 0, 0, 0, 0, 0x0013);
        }
    }).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_create(app: AppHandle, caller: Webview, id: u32, url: String) -> Result<(), String> {
    trusted(&caller)?;
    let url = checked_url(&url)?;
    {
        let state = app.state::<BrowserState>();
        let mut tabs = state.0.lock().map_err(|e| e.to_string())?;
        if tabs.len() >= 8 || !tabs.insert(id) { return Err("At most eight tabs may be open".into()); }
    }
    let result = (|| {
        let profile = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("web-profile");
        std::fs::create_dir_all(&profile).map_err(|e| e.to_string())?;
        let nav_app = app.clone(); let load_app = app.clone(); let title_app = app.clone(); let popup_app = app.clone(); let download_app = app.clone(); let permission_app = app.clone();
        // The tab starts on about:blank and only then navigates. Tauri derives a webview's protocol
        // origin from its FIRST address: a site opened first would otherwise be the CORS origin of
        // this tab's asset.localhost responses (library thumbnails, covers, fonts) and could read them.
        let blank = Url::parse("about:blank").map_err(|e| e.to_string())?;
        // The empty starting document may load once; after the real navigation is issued, pages
        // cannot send the tab back to about: (that would be a silent blank page with no notice).
        let started = Arc::new(AtomicBool::new(false)); let nav_started = started.clone();
        let builder = WebviewBuilder::new(label(id), WebviewUrl::External(blank))
            .data_directory(profile).disable_drag_drop_handler().focused(false)
            .browser_extensions_enabled(true).extensions_path(extensions_dir(&app)?)
            .on_navigation(move |url| {
                if url.scheme() == "about" { return !nav_started.load(Ordering::SeqCst); }
                let allowed = checked_url(url.as_str()).is_ok();
                event(&nav_app, id, if allowed { "navigate" } else { "blocked" }, url.to_string());
                allowed
            })
            .on_page_load(move |_, p| if p.url().scheme() != "about" {
                event(&load_app, id, if matches!(p.event(), PageLoadEvent::Finished) { "loaded" } else { "loading" }, p.url().to_string())
            })
            .on_document_title_changed(move |_, title| if title != "about:blank" { event(&title_app, id, "title", title.chars().take(500).collect()) })
            // Popups are offered in Luna's toolbar; pages cannot spawn unlimited windows.
            .on_new_window(move |url, _| {
                if checked_url(url.as_str()).is_ok() { event(&popup_app, id, "popup", url.to_string()); }
                NewWindowResponse::Deny
            })
            .on_download(move |_, ev| {
                match ev {
                    DownloadEvent::Requested { url, destination } => {
                        dlog(&download_app, &format!("download start tab={id} {url} -> {}", destination.display()));
                        if let Ok(mut set) = download_app.state::<Downloads>().0.lock() { set.insert(destination.clone()); }
                        event(&download_app, id, "download-start", serde_json::json!({ "url": url.to_string(), "path": destination.display().to_string() }).to_string());
                    }
                    DownloadEvent::Finished { url, path, success } => {
                        dlog(&download_app, &format!("download done tab={id} ok={success} {url} {:?}", path));
                        if let Some(p) = &path { if let Ok(mut set) = download_app.state::<Downloads>().0.lock() { set.insert(p.clone()); } }
                        event(&download_app, id, "download-done", serde_json::json!({ "url": url.to_string(), "path": path.map(|p| p.display().to_string()), "success": success }).to_string());
                    }
                    _ => {}
                }
                true
            })
            // Site permissions stay denied; the UI only explains what was refused.
            .on_permission_request(move |_, kind| { event(&permission_app, id, "permission", permission_name(kind).into()); tauri::webview::PermissionResponse::Deny });
        let main = app.get_webview("main").ok_or("Main UI closed")?;
        let view = main.window().add_child(builder, tauri::PhysicalPosition::new(0, 0), tauri::PhysicalSize::new(1, 1)).map_err(|e| e.to_string())?;
        // Optional signals: an older WebView2 runtime without them still browses normally.
        let _ = watch(&view, app.clone(), id);
        view.hide().map_err(|e| e.to_string())?;
        started.store(true, Ordering::SeqCst);
        view.navigate(url).map_err(|e| e.to_string())
    })();
    dlog(&app, &format!("tab create id={id} -> {:?}", result));
    if result.is_err() {
        if let Some(view) = app.get_webview(&label(id)) { let _ = view.close(); }
        if let Ok(mut ids) = app.state::<BrowserState>().0.lock() { ids.remove(&id); }
    }
    result
}

#[tauri::command]
pub async fn browser_action(app: AppHandle, caller: Webview, id: u32, action: String, url: Option<String>, zoom: Option<f64>) -> Result<(), String> {
    trusted(&caller)?;
    if action == "close" {
        if let Some(view) = app.get_webview(&label(id)) { view.close().map_err(|e| e.to_string())?; }
        app.state::<BrowserState>().0.lock().map_err(|e| e.to_string())?.remove(&id);
        return Ok(());
    }
    let view = tab(&app, id)?;
    match action.as_str() {
        "navigate" => view.navigate(checked_url(url.as_deref().ok_or("Missing URL")?)?).map_err(|e| e.to_string()),
        // Native history and Stop: no page script, so they also work on WebView2 error pages.
        "back" => with_core(&view, |core| { let _ = unsafe { core.GoBack() }; }),
        "forward" => with_core(&view, |core| { let _ = unsafe { core.GoForward() }; }),
        // Cancels the pending navigation; an uncommitted request leaves the previous page in place.
        "stop" => with_core(&view, |core| { let _ = unsafe { core.Stop() }; }),
        "reload" => view.reload().map_err(|e| e.to_string()),
        "zoom" => {
            let factor = zoom.filter(|z| z.is_finite() && (0.25..=5.0).contains(z)).ok_or("Invalid zoom")?;
            view.set_zoom(factor).map_err(|e| e.to_string())
        },
        // Cookies, cache and site storage of the separate web profile shared by all tabs. Luna's own
        // favourites, notes and reading list live in the main UI's storage and are not touched.
        "clear-data" => view.clear_all_browsing_data().map_err(|e| e.to_string()),
        "hide" => {
            mute(&view, true)?;
            let _ = view.eval("document.querySelectorAll('video,audio').forEach(m=>m.pause())");
            view.hide().map_err(|e| e.to_string())
        },
        _ => Err("Unknown browser action".into()),
    }
}

/// Physical window coordinates of the existing main-UI floating chat.
#[derive(Deserialize)]
pub struct BrowserOverlay { x: f64, y: f64, width: f64, height: f64, radius: f64 }

async fn floating_chat_region(view: &Webview, width: i32, height: i32, overlay: Option<(i32, i32, i32, i32, i32)>) -> Result<(), String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    view.with_webview(move |platform| {
        #[link(name = "user32")]
        unsafe extern "system" { fn SetWindowRgn(hwnd: isize, region: isize, redraw: i32) -> i32; }
        #[link(name = "gdi32")]
        unsafe extern "system" {
            fn CreateRectRgn(left: i32, top: i32, right: i32, bottom: i32) -> isize;
            fn CreateRoundRectRgn(left: i32, top: i32, right: i32, bottom: i32, ellipse_width: i32, ellipse_height: i32) -> isize;
            fn CombineRgn(dest: isize, first: isize, second: isize, mode: i32) -> i32;
            fn DeleteObject(object: isize) -> i32;
        }
        let result = (|| unsafe {
            let mut hwnd = Default::default();
            platform.controller().ParentWindow(&mut hwnd).map_err(|e| e.to_string())?;
            let region = if let Some((left, top, right, bottom, radius)) = overlay {
                let full = CreateRectRgn(0, 0, width, height);
                let cutout = CreateRoundRectRgn(left, top, right, bottom, radius * 2, radius * 2);
                if full == 0 || cutout == 0 {
                    if full != 0 { DeleteObject(full); }
                    if cutout != 0 { DeleteObject(cutout); }
                    return Err("Could not allocate floating chat region".to_string());
                }
                let combined = CombineRgn(full, full, cutout, 4); // RGN_DIFF
                DeleteObject(cutout);
                if combined == 0 { DeleteObject(full); return Err("Could not shape floating chat region".to_string()); }
                full
            } else { 0 };
            // The OS owns the region after success. Only the chat rectangle is excluded;
            // the actual page viewport and all its layout dimensions stay unchanged.
            if SetWindowRgn(hwnd.0 as isize, region, 1) == 0 {
                if region != 0 { DeleteObject(region); }
                return Err("Could not display floating chat over page".to_string());
            }
            Ok(())
        })();
        let _ = tx.send(result);
    }).map_err(|e| e.to_string())?;
    tokio::time::timeout(std::time::Duration::from_secs(5), rx).await
        .map_err(|_| "Floating chat placement timed out".to_string())?
        .map_err(|_| "Browser closed while placing chat".to_string())?
}

#[tauri::command]
pub async fn browser_bounds(app: AppHandle, caller: Webview, id: u32, x: f64, y: f64, width: f64, height: f64, overlay: Option<BrowserOverlay>) -> Result<(), String> {
    trusted(&caller)?;
    let view = tab(&app, id)?;
    let size = caller.window().inner_size().map_err(|e| e.to_string())?;
    if ![x, y, width, height].iter().all(|v| v.is_finite()) || x < 0. || y < 0. || width < 1. || height < 1.
        || x + width > size.width as f64 + 2. || y + height > size.height as f64 + 2. { return Err("Invalid browser bounds".into()); }
    let overlay = match overlay {
        Some(o) => {
            if ![o.x, o.y, o.width, o.height, o.radius].iter().all(|v| v.is_finite())
                || o.x.abs() > size.width as f64 * 2. || o.y.abs() > size.height as f64 * 2.
                || o.width <= 0. || o.height <= 0. || o.width > size.width as f64 + 2.
                || o.height > size.height as f64 + 2. || o.radius < 0. || o.radius > 512. {
                return Err("Invalid floating chat bounds".into());
            }
            Some(((o.x - x) as i32, (o.y - y) as i32, (o.x + o.width - x) as i32, (o.y + o.height - y) as i32, o.radius as i32))
        }
        None => None,
    };
    dlog(&app, &format!("bounds id={id} x={x} y={y} w={width} h={height} cut={:?}", overlay));
    view.set_position(tauri::PhysicalPosition::new(x as i32, y as i32)).map_err(|e| e.to_string())?;
    view.set_size(tauri::PhysicalSize::new(width as u32, height as u32)).map_err(|e| e.to_string())?;
    floating_chat_region(&view, width as i32, height as i32, overlay).await?;
    mute(&view, false)?;
    view.show().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_read(app: AppHandle, caller: Webview, id: u32) -> Result<serde_json::Value, String> {
    trusted(&caller)?;
    let view = tab(&app, id)?;
    let before = view.url().map_err(|e| e.to_string())?;
    checked_url(before.as_str())?;
    let source = include_str!("../../src/browserPage.js").replace("export function", "function");
    let script = format!("(()=>{{ {source}; return extractBrowserPage(); }})()");
    let (tx, rx) = tokio::sync::oneshot::channel();
    let tx = Mutex::new(Some(tx));
    view.eval_with_callback(script, move |value| {
        if let Ok(mut sender) = tx.lock() { if let Some(sender) = sender.take() { let _ = sender.send(value); } }
    }).map_err(|e| e.to_string())?;
    let raw = tokio::time::timeout(std::time::Duration::from_secs(5), rx).await.map_err(|_| "Page read timed out")?.map_err(|_| "Page closed")?;
    if view.url().map_err(|e| e.to_string())? != before { return Err("Page changed while reading; try again".into()); }
    if raw.len() > 200_000 { return Err("Page response too large".into()); }
    let mut result: serde_json::Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    if result.get("title").and_then(|v| v.as_str()).is_none_or(|s| s.chars().count() > 500) { return Err("Invalid page title".into()); }
    let text = result.get("text").and_then(|v| v.as_str()).ok_or("Page could not be read")?;
    if text.trim().is_empty() || text.chars().count() > 24000 { return Err("No readable page text; video and protected frames cannot be read".into()); }
    // The native URL is authoritative. Page JavaScript cannot substitute a different source.
    let mut source = before; source.set_query(None); source.set_fragment(None);
    result["url"] = source.to_string().into();
    Ok(result)
}

#[tauri::command]
pub async fn browser_translation(app: AppHandle, caller: Webview, id: u32, action: String, payload: Option<serde_json::Value>) -> Result<serde_json::Value, String> {
    trusted(&caller)?;
    if !matches!(action.as_str(), "snapshot" | "apply" | "restore") { return Err("Unknown translation action".into()); }
    let payload = payload.unwrap_or(serde_json::json!({}));
    if payload.to_string().len() > 800_000 { return Err("Translation payload too large".into()); }
    let view = tab(&app, id)?;
    let before = view.url().map_err(|e| e.to_string())?;
    checked_url(before.as_str())?;
    let source = include_str!("../../src/browserTranslatePage.js").replace("export function", "function");
    let script = format!("(()=>{{ try {{ {source}; return browserTranslatePage({}, {}); }} catch(e) {{ return {{lunaError:String(e.message||e)}}; }} }})()", serde_json::to_string(&action).map_err(|e| e.to_string())?, payload);
    let (tx, rx) = tokio::sync::oneshot::channel();
    let tx = Mutex::new(Some(tx));
    view.eval_with_callback(script, move |value| {
        if let Ok(mut sender) = tx.lock() { if let Some(sender) = sender.take() { let _ = sender.send(value); } }
    }).map_err(|e| e.to_string())?;
    let raw = tokio::time::timeout(std::time::Duration::from_secs(5), rx).await.map_err(|_| "Page translation timed out")?.map_err(|_| "Page closed")?;
    if raw.len() > 300_000 || view.url().map_err(|e| e.to_string())? != before { return Err("Page changed while translating".into()); }
    let value: serde_json::Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    if let Some(error) = value.get("lunaError").and_then(|e| e.as_str()) { return Err(error.chars().take(400).collect()); }
    if !value.is_object() { return Err("Page translation failed".into()); }
    if action == "snapshot" {
        let rows = value.get("rows").and_then(|r| r.as_array()).ok_or("No translation text")?;
        if rows.len() > 180 || value.get("token").and_then(|t| t.as_str()).is_none_or(|t| t.len() > 80) { return Err("Invalid translation snapshot".into()); }
        let mut total = 0;
        for (i, row) in rows.iter().enumerate() {
            let text = row.get("text").and_then(|t| t.as_str()).ok_or("Invalid translation text")?;
            if row.get("id").and_then(|n| n.as_u64()) != Some(i as u64) || text.chars().count() > 1800 { return Err("Invalid translation segment".into()); }
            total += text.chars().count();
        }
        if total > 24000 { return Err("Translation snapshot too large".into()); }
    }
    Ok(value)
}


/// Only a scroll fraction and authoritative URL; no page text, inputs or account storage.
#[tauri::command]
pub async fn browser_position(app:AppHandle, caller:Webview, id:u32, action:String, expected_url:String, fraction:Option<f64>)->Result<serde_json::Value,String>{
    trusted(&caller)?;let view=tab(&app,id)?;let before=view.url().map_err(|e|e.to_string())?;checked_url(before.as_str())?;
    // In-page (history API) navigation raises no load event; the UI asks for the native address. No page script runs.
    if action=="url" {return Ok(serde_json::json!({"url":before.as_str()}));}
    if before.as_str()!=expected_url {return Err("Page changed".into());}
    if action=="scroll" {
        let f=fraction.filter(|v|v.is_finite()&&*v>=0.&&*v<=1.).ok_or("Invalid position")?;
        view.eval(format!("(()=>{{const go=()=>window.scrollTo(0,Math.max(0,document.documentElement.scrollHeight-innerHeight)*{f});go();setTimeout(go,350);}})()" )).map_err(|e|e.to_string())?;
        return Ok(serde_json::json!({"url":before.as_str(),"progress":f}));
    }
    if action!="read" {return Err("Unknown position action".into());}
    let (tx,rx)=tokio::sync::oneshot::channel();let tx=Mutex::new(Some(tx));
    view.eval_with_callback("(()=>{const h=Math.max(0,document.documentElement.scrollHeight-innerHeight);return h>0?Math.max(0,Math.min(1,scrollY/h)):0;})()",move|value|{if let Ok(mut sender)=tx.lock(){if let Some(sender)=sender.take(){let _=sender.send(value);}}}).map_err(|e|e.to_string())?;
    let raw=tokio::time::timeout(std::time::Duration::from_secs(3),rx).await.map_err(|_|"Position read timed out")?.map_err(|_|"Tab closed")?;
    let value=serde_json::from_str::<f64>(&raw).map_err(|e|e.to_string())?;
    if !value.is_finite()||!(0. ..=1.).contains(&value)||view.url().map_err(|e|e.to_string())?!=before{return Err("Page position changed".into());}
    Ok(serde_json::json!({"url":before.as_str(),"progress":value}))
}

#[cfg(test)]
mod tests {
    #[test]
    fn only_external_web_pages() {
        for url in ["file:///C:/private", "javascript:alert(1)", "tauri://localhost", "https://tauri.localhost/x", "https://x.tauri.localhost", "http://localhost:1420", "https://user:pass@example.com"] {
            assert!(super::checked_url(url).is_err(), "{url}");
        }
        assert!(super::checked_url("https://example.com/a?q=1").is_ok());
    }
}

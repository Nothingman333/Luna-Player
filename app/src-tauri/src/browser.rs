//! Remote pages live in separate WebView2 storage and receive no Luna command access.
use std::{collections::{BTreeSet, HashSet}, sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}}};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, Webview, WebviewBuilder, WebviewUrl};
use tauri::webview::{NewWindowResponse, PageLoadEvent, PermissionKind};
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
/// Tabs the user muted from Luna's tab strip. Showing a tab again keeps them silent; hiding a tab
/// always mutes it (a hidden page must not keep playing behind the library).
static USER_MUTED: Mutex<BTreeSet<u32>> = Mutex::new(BTreeSet::new());
fn user_muted(id: u32) -> bool { USER_MUTED.lock().map(|set| set.contains(&id)).unwrap_or(false) }
fn set_user_muted(id: u32, muted: bool) {
    if let Ok(mut set) = USER_MUTED.lock() { if muted { set.insert(id); } else { set.remove(&id); } }
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
pub(crate) fn event(app: &AppHandle, id: u32, kind: &'static str, value: String) {
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
        // Native user context menu: link/selection are data; actions are chosen in the trusted Luna UI.
        if let Ok(menu_core) = core.cast::<webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2_11>() {
            let menu_app=app.clone();
            let handler=webview2_com::ContextMenuRequestedEventHandler::create(Box::new(move |_,args| {
                let Some(args)=args else{return Ok(())};
                let target=unsafe{args.ContextMenuTarget()?};
                let (mut has_link,mut has_selection,mut editable)=(Default::default(),Default::default(),Default::default());
                unsafe{target.HasLinkUri(&mut has_link)?;target.HasSelection(&mut has_selection)?;target.IsEditable(&mut editable)?;}
                let (has_link,has_selection,editable):(bool,bool,bool)=(has_link.into(),has_selection.into(),editable.into());
                if editable || (!has_link&&!has_selection){return Ok(())}
                let(mut link,mut text,mut page)=(PWSTR::null(),PWSTR::null(),PWSTR::null());
                if has_link{unsafe{target.LinkUri(&mut link)?;}}
                if has_selection{unsafe{target.SelectionText(&mut text)?;}}
                unsafe{target.PageUri(&mut page)?;}
                let link=if has_link{take_pwstr(link)}else{String::new()};
                let text=if has_selection{take_pwstr(text)}else{String::new()};
                let page=take_pwstr(page);
                let mut point=Default::default();unsafe{args.Location(&mut point)?;args.SetHandled(true)?;}
                event(&menu_app,id,"context",serde_json::json!({"url":link.chars().take(2048).collect::<String>(),"text":text.chars().take(8000).collect::<String>(),"page":page,"x":point.x,"y":point.y}).to_string());
                Ok(())
            }));
            let _=unsafe{menu_core.add_ContextMenuRequested(&handler,&mut token)};
        }
        let fullscreen_app=app.clone();
        let fullscreen=webview2_com::ContainsFullScreenElementChangedEventHandler::create(Box::new(move |sender,_|{
            let Some(core)=sender else{return Ok(())};let mut value=Default::default();unsafe{core.ContainsFullScreenElement(&mut value)?;}
            let on:bool=value.into();event(&fullscreen_app,id,"fullscreen",if on{"1"}else{"0"}.into());Ok(())
        }));
        let _=unsafe{core.add_ContainsFullScreenElementChanged(&fullscreen,&mut token)};
        // Luna Web's own shortcuts while the page has the keyboard (Ctrl+T, Ctrl+W, Ctrl+L, Ctrl+F…):
        // only the combinations in `page_shortcut` are taken from the page; every other key stays its own.
        let key_app = app.clone();
        let handler_6 = webview2_com::AcceleratorKeyPressedEventHandler::create(Box::new(move |_, args| {
            use webview2_com::Microsoft::Web::WebView2::Win32::{COREWEBVIEW2_KEY_EVENT_KIND, COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN, COREWEBVIEW2_KEY_EVENT_KIND_SYSTEM_KEY_DOWN};
            #[link(name = "user32")]
            unsafe extern "system" { fn GetKeyState(key: i32) -> i16; }
            let Some(args) = args else { return Ok(()) };
            let (mut kind, mut key) = (COREWEBVIEW2_KEY_EVENT_KIND(-1), 0u32);
            unsafe { args.KeyEventKind(&mut kind)?; args.VirtualKey(&mut key)?; }
            if kind.0 != COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN.0 && kind.0 != COREWEBVIEW2_KEY_EVENT_KIND_SYSTEM_KEY_DOWN.0 { return Ok(()) }
            let down = |vk: i32| unsafe { GetKeyState(vk) } < 0;
            if let Some(name) = page_shortcut(key, down(0x11), down(0x10), down(0x12)) {
                unsafe { args.SetHandled(true)?; }
                event(&key_app, id, "key", name.into());
            }
            Ok(())
        }));
        let _ = unsafe { controller.add_AcceleratorKeyPressed(&handler_6, &mut token) };
    }).map_err(|e| e.to_string())
}

/// The Luna Web shortcuts a focused page hands over to Luna (virtual-key code + Ctrl/Shift/Alt).
/// AltGr arrives as Ctrl+Alt, so no Ctrl combination with Alt is taken: typed characters stay safe.
fn page_shortcut(key: u32, ctrl: bool, shift: bool, alt: bool) -> Option<&'static str> {
    const DIGITS: [&str; 9] = ["ctrl+1", "ctrl+2", "ctrl+3", "ctrl+4", "ctrl+5", "ctrl+6", "ctrl+7", "ctrl+8", "ctrl+9"];
    match (ctrl, shift, alt) {
        (true, false, false) => match key {
            0x54 => Some("ctrl+t"), 0x57 => Some("ctrl+w"), 0x4C => Some("ctrl+l"), 0x46 => Some("ctrl+f"), 0x48 => Some("ctrl+h"),
            0x44 => Some("ctrl+d"), 0x4B => Some("ctrl+k"), 0x4D => Some("ctrl+m"), 0x4A => Some("ctrl+j"), 0x09 => Some("ctrl+tab"), 0x21 => Some("ctrl+pageup"), 0x22 => Some("ctrl+pagedown"),
            0x31..=0x39 => Some(DIGITS[(key - 0x31) as usize]),
            _ => None,
        },
        (true, true, false) => match key {
            0x54 => Some("ctrl+shift+t"), 0x09 => Some("ctrl+shift+tab"), 0x52 => Some("ctrl+shift+r"), 0x41 => Some("ctrl+shift+a"), 0x2E => Some("ctrl+shift+delete"), 0x21 => Some("ctrl+shift+pageup"), 0x22 => Some("ctrl+shift+pagedown"),
            _ => None,
        },
        (false, false, true) => if key == 0x24 { Some("alt+home") } else { None },
        (false, false, false) => match key { 0x75 => Some("f6"), 0x78 => Some("f9"), 0x70 => Some("f1"), _ => None },
        _ => None,
    }
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
        let nav_app = app.clone(); let load_app = app.clone(); let title_app = app.clone(); let popup_app = app.clone(); let permission_app = app.clone();
        // The tab starts on about:blank and only then navigates. Tauri derives a webview's protocol
        // origin from its FIRST address: a site opened first would otherwise be the CORS origin of
        // this tab's asset.localhost responses (library thumbnails, covers, fonts) and could read them.
        let blank = Url::parse("about:blank").map_err(|e| e.to_string())?;
        // The empty starting document may load once; after the real navigation is issued, pages
        // cannot send the tab back to about: (that would be a silent blank page with no notice).
        let started = Arc::new(AtomicBool::new(false)); let nav_started = started.clone();
        let builder = WebviewBuilder::new(label(id), WebviewUrl::External(blank))
            .data_directory(profile).disable_drag_drop_handler().focused(false)
            .browser_extensions_enabled(true)
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
            // Site permissions stay denied; the UI only explains what was refused.
            .on_permission_request(move |_, kind| { event(&permission_app, id, "permission", permission_name(kind).into()); tauri::webview::PermissionResponse::Deny });
        let main = app.get_webview("main").ok_or("Main UI closed")?;
        let view = main.window().add_child(builder, tauri::PhysicalPosition::new(0, 0), tauri::PhysicalSize::new(1, 1)).map_err(|e| e.to_string())?;
        // Optional signals: an older WebView2 runtime without them still browses normally.
        let _ = watch(&view, app.clone(), id);
        crate::browser_downloads::watch(&view, app.clone(), id)?;
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
pub async fn browser_action(app: AppHandle, caller: Webview, id: u32, action: String, url: Option<String>, zoom: Option<f64>, force: Option<bool>) -> Result<(), String> {
    trusted(&caller)?;
    if action == "close" {
        if force.unwrap_or(false) {crate::browser_downloads::abort_tab(&app,id).await?;}
        if app.state::<crate::browser_downloads::Downloads>().0.lock().map_err(|e|e.to_string())?.iter().any(|row|row.tab==id&&(matches!(row.state.as_str(),"running"|"paused")||row.can_resume)) {
            return Err("Bu sekmede indirme sürüyor. Önce İndirmeler ekranından iptal et veya tamamlanmasını bekle.".into());
        }
        if let Some(view) = app.get_webview(&label(id)) { view.close().map_err(|e| e.to_string())?; }
        app.state::<BrowserState>().0.lock().map_err(|e| e.to_string())?.remove(&id);
        set_user_muted(id, false);
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
        "exit-fullscreen" => view.eval("if(document.fullscreenElement)void document.exitFullscreen().catch(()=>{})").map_err(|e|e.to_string()),
        "reload" => view.reload().map_err(|e| e.to_string()),
        "zoom" => {
            let factor = zoom.filter(|z| z.is_finite() && (0.25..=5.0).contains(z)).ok_or("Invalid zoom")?;
            view.set_zoom(factor).map_err(|e| e.to_string())
        },
        // Cookies, cache and site storage of the separate web profile shared by all tabs. Luna's own
        // favourites, notes and reading list live in the main UI's storage and are not touched.
        "clear-data" => view.clear_all_browsing_data().map_err(|e| e.to_string()),
        // Tab mute from the tab strip (WebView2 IsMuted: also silences cross-origin frames).
        "mute" | "unmute" => {
            let muted = action == "mute";
            set_user_muted(id, muted);
            mute(&view, muted)
        },
        // The page's own print preview (WebView2 shows it inside the tab).
        "print" => view.eval("window.print()").map_err(|e| e.to_string()),
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

async fn floating_chat_region(view: &Webview, width: i32, height: i32, overlays: Vec<(i32, i32, i32, i32, i32)>) -> Result<(), String> {
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
            let region=if overlays.is_empty(){0}else{
                let full=CreateRectRgn(0,0,width,height);if full==0{return Err("Could not allocate page region".to_string())}
                for(left,top,right,bottom,radius)in overlays{
                    let cut=CreateRoundRectRgn(left,top,right,bottom,radius*2,radius*2);
                    if cut==0{DeleteObject(full);return Err("Could not allocate overlay region".to_string())}
                    let result=CombineRgn(full,full,cut,4);DeleteObject(cut);
                    if result==0{DeleteObject(full);return Err("Could not shape page region".to_string())}
                }full
            };
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
pub async fn browser_bounds(app: AppHandle, caller: Webview, id: u32, x: f64, y: f64, width: f64, height: f64, overlay: Option<BrowserOverlay>, overlays: Option<Vec<BrowserOverlay>>) -> Result<(), String> {
    trusted(&caller)?;
    let view = tab(&app, id)?;
    let size = caller.window().inner_size().map_err(|e| e.to_string())?;
    if ![x, y, width, height].iter().all(|v| v.is_finite()) || x < 0. || y < 0. || width < 1. || height < 1.
        || x + width > size.width as f64 + 2. || y + height > size.height as f64 + 2. { return Err("Invalid browser bounds".into()); }
    let mut cuts=Vec::new();
    let mut requested=overlays.unwrap_or_default();if let Some(o)=overlay{requested.insert(0,o);}
    if requested.len()>8{return Err("Too many overlays".into())}
    for entry in requested { let overlay = match Some(entry) {
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
    if let Some(cut)=overlay{cuts.push(cut);} }
    dlog(&app, &format!("bounds id={id} x={x} y={y} w={width} h={height} cut={:?}", cuts));
    view.set_position(tauri::PhysicalPosition::new(x as i32, y as i32)).map_err(|e| e.to_string())?;
    view.set_size(tauri::PhysicalSize::new(width as u32, height as u32)).map_err(|e| e.to_string())?;
    floating_chat_region(&view, width as i32, height as i32, cuts).await?;
    mute(&view, user_muted(id))?;
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

fn find_action(action: &str) -> bool { matches!(action, "find" | "next" | "prev" | "clear") }

/// Find in page (Ctrl+F). The script paints matches with CSS highlights and returns only a count and
/// the current position; the query is passed as a JSON string literal, never spliced as code.
#[tauri::command]
pub async fn browser_find(app: AppHandle, caller: Webview, id: u32, action: String, query: Option<String>, match_case: Option<bool>) -> Result<serde_json::Value, String> {
    trusted(&caller)?;
    if !find_action(&action) { return Err("Unknown find action".into()); }
    let query: String = query.unwrap_or_default().chars().take(200).collect();
    let view = tab(&app, id)?;
    checked_url(view.url().map_err(|e| e.to_string())?.as_str())?;
    let source = include_str!("../../src/browserFindPage.js").replace("export function", "function");
    let script = format!("(()=>{{ try {{ {source}; return browserFindPage({}, {}, {}); }} catch(e) {{ return {{count:0,index:0,capped:false}}; }} }})()",
        serde_json::to_string(&action).map_err(|e| e.to_string())?, serde_json::to_string(&query).map_err(|e| e.to_string())?, match_case.unwrap_or(false));
    let (tx, rx) = tokio::sync::oneshot::channel();
    let tx = Mutex::new(Some(tx));
    view.eval_with_callback(script, move |value| {
        if let Ok(mut sender) = tx.lock() { if let Some(sender) = sender.take() { let _ = sender.send(value); } }
    }).map_err(|e| e.to_string())?;
    let raw = tokio::time::timeout(std::time::Duration::from_secs(4), rx).await.map_err(|_| "Find timed out")?.map_err(|_| "Tab closed")?;
    if raw.len() > 2_000 { return Err("Invalid find result".into()); }
    let value: serde_json::Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    let count = value.get("count").and_then(|v| v.as_u64()).unwrap_or(0).min(1000);
    let index = value.get("index").and_then(|v| v.as_u64()).unwrap_or(0).min(count);
    let capped = value.get("capped").and_then(|v| v.as_bool()).unwrap_or(false);
    Ok(serde_json::json!({ "count": count, "index": index, "capped": capped }))
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
    #[test]
    fn page_shortcuts_take_only_luna_combinations() {
        use super::page_shortcut as k;
        assert_eq!(k(0x54, true, false, false), Some("ctrl+t"));
        assert_eq!(k(0x54, true, true, false), Some("ctrl+shift+t"));
        assert_eq!(k(0x39, true, false, false), Some("ctrl+9"));
        assert_eq!(k(0x24, false, false, true), Some("alt+home"));
        assert_eq!(k(0x75, false, false, false), Some("f6"));
        assert_eq!(k(0x78, false, false, false), Some("f9"));
        assert_eq!(k(0x21, true, false, false), Some("ctrl+pageup"));
        assert_eq!(k(0x22, true, true, false), Some("ctrl+shift+pagedown"));
        assert_eq!(k(0x54, true, false, true), None); // AltGr+T types a character
        assert_eq!(k(0x43, true, false, false), None); // Ctrl+C stays the page's copy
        assert_eq!(k(0x41, false, false, false), None);
    }
    #[test]
    fn find_actions_and_user_mute() {
        for ok in ["find", "next", "prev", "clear"] { assert!(super::find_action(ok), "{ok}"); }
        for bad in ["", "eval", "Find", "next;"] { assert!(!super::find_action(bad), "{bad}"); }
        super::set_user_muted(77, true); assert!(super::user_muted(77));
        super::set_user_muted(77, false); assert!(!super::user_muted(77));
    }
}

/// Only the trusted UI can request these two bounded log tails. Export redaction happens before display/save.
#[tauri::command]
pub fn diagnostic_snapshot(app:AppHandle,caller:Webview)->Result<serde_json::Value,String>{
    trusted(&caller)?;use std::io::{Read,Seek,SeekFrom};
    let dir=app.path().app_local_data_dir().map_err(|e|e.to_string())?;let mut logs=Vec::new();
    for name in ["luna-debug.log","luna-debug.old.log"]{
        if let Ok(mut file)=std::fs::File::open(dir.join(name)){
            let size=file.metadata().map_err(|e|e.to_string())?.len();let start=size.saturating_sub(32768);file.seek(SeekFrom::Start(start)).map_err(|e|e.to_string())?;
            let mut bytes=Vec::new();file.take(32768).read_to_end(&mut bytes).map_err(|e|e.to_string())?;
            let text=String::from_utf8_lossy(&bytes).to_string();let text=if start>0{text.split_once('\n').map(|(_,tail)|tail.to_string()).unwrap_or_default()}else{text};
            logs.push(serde_json::json!({"name":name,"text":text}));
        }
    }
    Ok(serde_json::json!({"version":app.package_info().version.to_string(),"os":std::env::consts::OS,"arch":std::env::consts::ARCH,"logs":logs}))
}

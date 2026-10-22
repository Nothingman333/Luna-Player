//! Windows shell integration: a tray icon (with "keep playing in the tray" on close), and a
//! watcher that tells the app when files appear or disappear in the library folders.
//!
//! Everything is off until the user switches it on in Settings; the tray icon exists from the
//! start but stays hidden until then (or until Luna was started with `--minimized`).

use crate::shell_core as core;
use serde_json::json;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{channel, RecvTimeoutError};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};

static TRAY_MODE: AtomicBool = AtomicBool::new(false);
const TRAY_ID: &str = "luna-tray";

/// True while closing the window should hide it (music and podcasts go on) instead of quitting.
pub fn tray_mode() -> bool {
    TRAY_MODE.load(Ordering::Relaxed)
}

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

fn menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let show = MenuItem::with_id(app, "show", tr!("Luna'yı göster", "Show Luna"), true, None::<&str>)?;
    let play = MenuItem::with_id(app, "playpause", tr!("Oynat / duraklat", "Play / pause"), true, None::<&str>)?;
    let next = MenuItem::with_id(app, "next", tr!("Sonraki", "Next"), true, None::<&str>)?;
    let prev = MenuItem::with_id(app, "prev", tr!("Önceki", "Previous"), true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", tr!("Çık", "Quit"), true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    Menu::with_items(app, &[&show, &sep, &play, &next, &prev, &sep2, &quit])
}

/// Builds the (hidden) tray icon; `visible` shows it at once (started with `--minimized`).
pub fn setup_tray(app: &AppHandle, visible: bool) -> tauri::Result<()> {
    let mut b = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Luna Player")
        .menu(&menu(app)?)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, ev| match ev.id().as_ref() {
            "show" => show_main(app),
            "quit" => app.exit(0),
            id @ ("playpause" | "next" | "prev") => {
                let _ = app.emit("tray-action", id);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, ev| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = ev {
                let app = tray.app_handle();
                match app.get_webview_window("main") {
                    Some(w) if w.is_visible().unwrap_or(false) && !w.is_minimized().unwrap_or(false) => {
                        let _ = w.hide();
                        let _ = app.emit("window-hidden", ());
                    }
                    _ => show_main(app),
                }
            }
        });
    if let Some(icon) = app.default_window_icon() {
        b = b.icon(icon.clone());
    }
    let tray = b.build(app)?;
    let _ = tray.set_visible(visible);
    if visible {
        TRAY_MODE.store(true, Ordering::Relaxed);
    }
    Ok(())
}

/// Turns "close hides to the tray" on or off (the icon appears or disappears with it).
#[tauri::command]
pub fn set_tray_mode(app: AppHandle, on: bool) -> Result<(), String> {
    TRAY_MODE.store(on, Ordering::Relaxed);
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_visible(on);
        if on {
            // labels follow the UI language chosen since start
            if let Ok(m) = menu(&app) {
                let _ = tray.set_menu(Some(m));
            }
        }
    }
    Ok(())
}

/// Called for the main window's close request: hides instead of closing when the tray mode is on.
pub fn on_close_requested(window: &tauri::Window, api: &tauri::CloseRequestApi) {
    if window.label() == "main" && tray_mode() {
        api.prevent_close();
        let _ = window.hide();
        let _ = window.app_handle().emit("window-hidden", ());
    }
}

// ---------- folder watcher ----------

static WATCHER: Mutex<Option<notify::RecommendedWatcher>> = Mutex::new(None);

/// Watches the film, music and book folders (replacing the earlier watch) and emits
/// `folders-changed` `{ kinds: ["film"…], paths: [...] }` once the changes have been quiet for
/// three seconds. Returns how many folders are watched; empty lists stop watching.
#[tauri::command]
pub fn watch_folders(app: AppHandle, film: Vec<String>, music: Vec<String>, books: Vec<String>) -> Result<u32, String> {
    use notify::{event::ModifyKind, EventKind, RecursiveMode, Watcher};
    // the old watcher (and with it the old sender, which ends the old debounce thread) goes first
    *WATCHER.lock().unwrap() = None;
    let roots: Vec<String> = film.iter().chain(&music).chain(&books).filter(|r| Path::new(r).is_dir()).cloned().collect();
    if roots.is_empty() {
        return Ok(0);
    }
    let (tx, rx) = channel::<(String, String)>();
    let (f, m, b) = (film.clone(), music.clone(), books.clone());
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        let Ok(ev) = res else { return };
        if !matches!(ev.kind, EventKind::Create(_) | EventKind::Remove(_) | EventKind::Modify(ModifyKind::Name(_))) {
            return;
        }
        for p in ev.paths {
            let s = p.to_string_lossy().into_owned();
            if let Some(kind) = core::classify(&s, &f, &m, &b) {
                if core::is_relevant(kind, &s) {
                    let _ = tx.send((kind.to_string(), s));
                }
            }
        }
    })
    .map_err(|e| e.to_string())?;
    let mut watched = 0;
    for r in &roots {
        if watcher.watch(Path::new(r), RecursiveMode::Recursive).is_ok() {
            watched += 1;
        }
    }
    *WATCHER.lock().unwrap() = Some(watcher);
    std::thread::spawn(move || {
        let t0 = Instant::now();
        let mut deb = core::Debounce::default();
        loop {
            match rx.recv_timeout(Duration::from_millis(500)) {
                Ok((kind, path)) => deb.push(&kind, &path, t0.elapsed().as_secs_f64()),
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => break,
            }
            if let Some((kinds, paths)) = deb.take(t0.elapsed().as_secs_f64(), 3.0, 30.0) {
                let _ = app.emit("folders-changed", json!({ "kinds": kinds, "paths": paths }));
            }
        }
    });
    Ok(watched)
}

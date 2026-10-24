//! Windows owns media-key routing; Luna never reserves global media shortcuts.
use serde::Deserialize;
use souvlaki::{MediaControlEvent as Event, MediaControls, MediaMetadata, MediaPlayback, MediaPosition, PlatformConfig, SeekDirection};
use std::{sync::Mutex, time::Duration};
use tauri::{Emitter, Manager};

#[derive(Default)]
pub struct Controls(Mutex<Option<Session>>);
struct Session { controls: MediaControls, metadata: String }

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Playback {
    title: String, artist: Option<String>, album: Option<String>, cover: Option<String>,
    duration: f64, position: f64, paused: bool, active: bool,
}

fn seconds(n: f64) -> Duration {
    Duration::from_secs_f64(if n.is_finite() { n.clamp(0.0, 604800.0) } else { 0.0 })
}

#[tauri::command]
pub async fn media_controls_enable(app: tauri::AppHandle, on: bool) -> Result<(), String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    let handle = app.clone();
    app.run_on_main_thread(move || {
        let result = (|| -> Result<(), String> {
            let state = handle.state::<Controls>();
            let mut slot = state.0.lock().unwrap_or_else(|e| e.into_inner());
            if !on {
                if let Some(mut c) = slot.take() { let _ = c.controls.set_playback(MediaPlayback::Stopped); let _ = c.controls.detach(); }
                return Ok(());
            }
            if slot.is_some() { return Ok(()); }
            let win = handle.get_webview_window("main").ok_or("Main window unavailable")?;
            let hwnd = win.hwnd().map_err(|e| e.to_string())?.0 as *mut std::ffi::c_void;
            let mut c = MediaControls::new(PlatformConfig { dbus_name: "luna", display_name: "Luna Player", hwnd: Some(hwnd) }).map_err(|e| e.to_string())?;
            let events = handle.clone();
            c.attach(move |event| {
                let direction = |d: SeekDirection| if matches!(d, SeekDirection::Forward) { 1.0 } else { -1.0 };
                let (action, value) = match event {
                    Event::Play => ("play", None), Event::Pause => ("pause", None), Event::Toggle => ("playpause", None),
                    Event::Next => ("next", None), Event::Previous => ("prev", None), Event::Stop => ("stop", None),
                    Event::Seek(d) => ("seek-relative", Some(direction(d) * 10.0)),
                    Event::SeekBy(d, t) => ("seek-relative", Some(direction(d) * t.as_secs_f64())),
                    Event::SetPosition(p) => ("seek", Some(p.0.as_secs_f64())),
                    Event::SetVolume(v) => ("volume", Some(v.clamp(0.0, 1.0) * 100.0)),
                    Event::Raise => { if let Some(w) = events.get_webview_window("main") { let _ = w.show(); let _ = w.set_focus(); } return; },
                    _ => return,
                };
                let _ = events.emit("media-action", serde_json::json!({ "action": action, "value": value }));
            }).map_err(|e| e.to_string())?;
            *slot = Some(Session {controls:c,metadata:String::new()});
            Ok(())
        })();
        let _ = tx.send(result);
    }).map_err(|e| e.to_string())?;
    rx.await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn media_controls_update(app: tauri::AppHandle, playback: Playback) -> Result<(), String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    let handle = app.clone();
    app.run_on_main_thread(move || {
        let result = (|| -> Result<(), String> {
            let state = handle.state::<Controls>();
            let mut slot = state.0.lock().unwrap_or_else(|e| e.into_inner());
            let Some(c) = slot.as_mut() else { return Ok(()); };
            let p = playback;
            let cover = p.cover.as_deref().and_then(|s| {
                if s.starts_with("https://") || s.starts_with("http://") { reqwest::Url::parse(s).ok() }
                else { reqwest::Url::from_file_path(s).ok() }
            }).filter(|u| u.username().is_empty() && u.password().is_none());
            let metadata=serde_json::json!([p.title,p.artist,p.album,p.cover,p.duration]).to_string();
            if c.metadata != metadata { c.controls.set_metadata(MediaMetadata { title: Some(&p.title), artist: p.artist.as_deref(), album: p.album.as_deref(), cover_url: cover.as_ref().map(|u| u.as_str()), duration: Some(seconds(p.duration)) }).map_err(|e| e.to_string())?;c.metadata=metadata;}
            let progress = Some(MediaPosition(seconds(p.position)));
            c.controls.set_playback(if !p.active { MediaPlayback::Stopped } else if p.paused { MediaPlayback::Paused { progress } } else { MediaPlayback::Playing { progress } }).map_err(|e| e.to_string())
        })();
        let _ = tx.send(result);
    }).map_err(|e| e.to_string())?;
    rx.await.map_err(|e| e.to_string())?
}

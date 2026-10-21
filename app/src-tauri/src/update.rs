//! Luna updates itself from its GitHub releases, like any installed program.
//!
//! Each release carries a `latest.json` (made by `scripts/build-release.ps1`) and the installer
//! signed with Luna's update key; the public half is in tauri.conf.json, so an installer that
//! wasn't signed by us is refused. Betas are GitHub pre-releases, offered only when the user
//! turns them on.

use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, Url};
use tauri_plugin_updater::{Update, UpdaterExt};

const REPO: &str = "Nothingman333/Luna-Player";

#[derive(Default)]
pub struct Pending(Mutex<Option<Update>>);

#[derive(serde::Serialize)]
pub struct Info {
    version: String,
    notes: String,
    date: String,
    beta: bool,
    /// the release page (for the notes, and for a portable copy that can't install itself)
    page: String,
    /// false in the developer build and in the portable zip: those are updated by hand
    installable: bool,
}

#[derive(serde::Deserialize)]
struct Release {
    html_url: String,
    prerelease: bool,
    draft: bool,
    assets: Vec<Asset>,
}
#[derive(serde::Deserialize)]
struct Asset {
    name: String,
    browser_download_url: String,
}

/// Installed with the setup (NSIS leaves its uninstaller beside the exe), not the portable zip.
fn installed() -> bool {
    !cfg!(debug_assertions)
        && std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|d| d.join("uninstall.exe").exists()))
            .unwrap_or(false)
}

/// The newest release this user takes (betas only if asked); None when Luna is up to date.
pub async fn check(app: &AppHandle, beta: bool) -> Result<Option<Info>, String> {
    let list: Vec<Release> = reqwest::Client::builder()
        .user_agent("Luna Player")
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?
        .get(format!("https://api.github.com/repos/{REPO}/releases?per_page=20"))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    // newest first; a release made before the updater existed has no latest.json and is skipped
    let Some((rel, manifest)) = list.iter().filter(|r| !r.draft && (beta || !r.prerelease)).find_map(|r| {
        r.assets.iter().find(|a| a.name == "latest.json").map(|a| (r, a.browser_download_url.clone()))
    }) else {
        return Ok(None);
    };
    let url = Url::parse(&manifest).map_err(|e| e.to_string())?;
    let found = app
        .updater_builder()
        .endpoints(vec![url])
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?;
    let Some(u) = found else { return Ok(None) };
    let info = Info {
        version: u.version.clone(),
        notes: u.body.clone().unwrap_or_default(),
        date: u.date.map(|d| d.to_string()).unwrap_or_default(),
        beta: rel.prerelease,
        page: rel.html_url.clone(),
        installable: installed(),
    };
    *app.state::<Pending>().0.lock().unwrap() = Some(u);
    Ok(Some(info))
}

/// Downloads the update found by `check` (progress as "update-progress" events), checks its
/// signature and runs the installer, which closes Luna and opens the new one.
pub async fn install(app: AppHandle) -> Result<(), String> {
    if !installed() {
        return Err("not installed".into());
    }
    let u = app.state::<Pending>().0.lock().unwrap().take().ok_or("no update")?;
    let mut got = 0usize;
    let a = app.clone();
    u.download_and_install(
        move |n, total| {
            got += n;
            let _ = a.emit("update-progress", (got, total));
        },
        || {},
    )
    .await
    .map_err(|e| e.to_string())?;
    app.restart();
}

/// Messages in the UI language: `tr!("Türkçe {}", "English {}", arg)` (English unless the UI is Turkish).
#[macro_export]
macro_rules! tr {
    ($t:literal, $e:literal $(, $a:expr)* $(,)?) => {
        if $crate::is_tr() { format!($t $(, $a)*) } else { format!($e $(, $a)*) }
    };
}
static UI_TR: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
pub fn is_tr() -> bool {
    UI_TR.load(std::sync::atomic::Ordering::Relaxed)
}
#[tauri::command]
fn set_lang(lang: String) {
    UI_TR.store(lang == "tr", std::sync::atomic::Ordering::Relaxed);
}

mod files;
mod preview;
mod fonts;
mod indexers;
mod letterboxd;
mod mpv;
mod pgs;
mod subs;
mod torrent;
mod upscaler;

use serde_json::Value;
use std::path::PathBuf;
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter, Manager, RunEvent};

static MPV: OnceLock<mpv::Mpv> = OnceLock::new();

fn mpv_exe(app: &AppHandle) -> PathBuf {
    mpv::mpv_exe(app.path().resource_dir().ok())
}

/// What the first-run check shows: is everything Luna needs on this computer?
#[derive(serde::Serialize)]
struct SysCheck {
    /// The bundled mpv is there and starts.
    mpv: bool,
    /// Vulkan loader from the graphics driver (mpv needs it to start).
    vulkan: bool,
    /// Graphics cards, to point at the right driver download.
    gpus: Vec<String>,
    /// Lossless Scaling (optional, for the upscaler).
    lossless: bool,
    webview: Option<String>,
}

#[tauri::command]
async fn system_check(app: AppHandle) -> Result<SysCheck, String> {
    use std::os::windows::process::CommandExt;
    const NO_WINDOW: u32 = 0x0800_0000;
    let exe = mpv_exe(&app);
    blocking(move || {
        let sys = std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".into());
        let vulkan = PathBuf::from(&sys).join("System32").join("vulkan-1.dll").exists();
        let com = exe.with_extension("com");
        let mpv = exe.exists()
            && std::process::Command::new(if com.exists() { &com } else { &exe })
                .arg("--version").creation_flags(NO_WINDOW).output()
                .map(|o| o.status.success()).unwrap_or(false);
        let gpus = std::process::Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", "(Get-CimInstance Win32_VideoController).Name"])
            .creation_flags(NO_WINDOW).output()
            .map(|o| String::from_utf8_lossy(&o.stdout).lines().map(|l| l.trim().to_string()).filter(|l| !l.is_empty()).collect())
            .unwrap_or_default();
        Ok(SysCheck { mpv, vulkan, gpus, lossless: upscaler::exe_path().is_some(), webview: tauri::webview_version().ok() })
    })
    .await
}

async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())?
}

#[tauri::command]
fn mpv_command(args: Value) {
    if let Some(m) = MPV.get() {
        m.command(args);
    }
}

/// File passed on the command line ("Open with…" / double click).
#[tauri::command]
fn startup_file() -> Option<String> {
    std::env::args().skip(1).find(|a| !a.starts_with('-'))
}

fn sub_cache(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_cache_dir().map_err(|e| e.to_string())?.join("subtitles"))
}

/// Release sample clips ("movie-sample.mkv", "Sample/clip.mkv"), not films that merely have "sample" somewhere in their path.
fn is_sample(p: &std::path::Path) -> bool {
    let word = |s: &str| s.to_lowercase().split(|c: char| !c.is_alphanumeric()).any(|w| w == "sample");
    let stem = p.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let parent = p.parent().and_then(|d| d.file_name()).map(|s| s.to_string_lossy().to_lowercase()).unwrap_or_default();
    word(&stem) || parent == "sample" || parent == "samples"
}

#[tauri::command]
async fn find_subtitles(
    app: AppHandle,
    path: String,
    api_key: String,
    langs: String,
    query: Option<subs::Query>,
) -> Result<subs::Found, String> {
    subs::find(&path, &api_key, &langs, query.unwrap_or_default(), sub_cache(&app)?).await
}

#[tauri::command]
async fn search_subtitles(
    path: String,
    api_key: String,
    langs: String,
    query: Option<subs::Query>,
) -> Result<Vec<subs::Hit>, String> {
    subs::search(&path, &api_key, &langs, query.unwrap_or_default()).await
}

#[tauri::command]
async fn download_subtitle(
    app: AppHandle,
    path: String,
    api_key: String,
    file_id: i64,
    language: String,
) -> Result<String, String> {
    subs::download(&path, &api_key, file_id, &language, sub_cache(&app)?).await
}

#[tauri::command]
fn subtitle_cues(file: String) -> Result<Vec<(f64, f64)>, String> {
    subs::cues(&file)
}

fn walk(dir: &std::path::Path, out: &mut Vec<String>, depth: u32) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for e in entries.flatten() {
        let p = e.path();
        if p.is_dir() {
            if depth < 6 {
                walk(&p, out, depth + 1);
            }
        } else if files::is_video(&p) && !is_sample(&p) {
            out.push(p.to_string_lossy().into_owned());
        }
    }
}

/// Every video file under the library folders.
#[tauri::command]
async fn scan_folders(folders: Vec<String>) -> Vec<String> {
    blocking(move || {
        let mut out = Vec::new();
        for f in folders {
            walk(std::path::Path::new(&f), &mut out, 0);
        }
        out.sort();
        Ok(out)
    })
    .await
    .unwrap_or_default()
}

#[tauri::command]
async fn probe_video(app: AppHandle, path: String) -> Result<files::MediaInfo, String> {
    let exe = mpv_exe(&app);
    blocking(move || files::probe(&exe, &path)).await
}

#[tauri::command]
async fn video_thumbnail(app: AppHandle, path: String) -> Result<String, String> {
    let exe = mpv_exe(&app);
    let cache = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("thumbs");
    blocking(move || files::thumbnail(&exe, &path, &cache)).await
}

#[tauri::command]
async fn seek_preview(app: AppHandle, path: String, secs: u32) -> Result<String, String> {
    let exe = mpv_exe(&app);
    let cache = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("previews");
    blocking(move || files::frame_at(&exe, &path, secs, &cache)).await
}

/// Which of these files still exist (library entries whose video was moved or deleted show as missing).
#[tauri::command]
async fn paths_exist(paths: Vec<String>) -> Vec<bool> {
    blocking(move || Ok::<_, String>(paths.iter().map(|p| std::path::Path::new(p).exists()).collect()))
        .await
        .unwrap_or_default()
}

#[tauri::command]
async fn list_dir(path: String) -> Result<Vec<files::Entry>, String> {
    blocking(move || files::list_dir(&path)).await
}

#[tauri::command]
async fn torrent_add(source: String, out_dir: String) -> Result<torrent::Added, String> {
    torrent::add(source, out_dir).await
}

#[tauri::command]
async fn torrent_list() -> Vec<Value> {
    // Never on the UI thread: librqbit's locks can be held while a torrent pauses or starts.
    tauri::async_runtime::spawn_blocking(torrent::list).await.unwrap_or_default()
}

/// Sends a generateContent request to the Gemini API (from Rust, so no browser CORS issues).
#[tauri::command]
async fn gemini(key: String, model: String, body: Value) -> Result<Value, String> {
    let url = format!("https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent");
    let res = reqwest::Client::new()
        .post(url)
        .header("x-goog-api-key", key)
        .json(&body)
        .send()
        .await
        .map_err(|e| tr!("Gemini'ye bağlanılamadı: {}", "Couldn't reach Gemini: {}", e))?;
    let status = res.status();
    let v: Value = res.json().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        let msg = v["error"]["message"].as_str().map(str::to_string).unwrap_or_else(|| tr!("bilinmeyen hata", "unknown error"));
        return Err(tr!("Gemini hatası ({}): {}", "Gemini error ({}): {}", status, msg));
    }
    Ok(v)
}

/// Gemini models usable for chat with this key: (id, display name).
#[tauri::command]
async fn gemini_models(key: String) -> Result<Vec<(String, String)>, String> {
    let mut out = vec![];
    let mut page: Option<String> = None;
    loop {
        let mut req = reqwest::Client::new()
            .get("https://generativelanguage.googleapis.com/v1beta/models")
            .header("x-goog-api-key", &key)
            .query(&[("pageSize", "1000")]);
        if let Some(p) = &page {
            req = req.query(&[("pageToken", p)]);
        }
        let v: Value = req.send().await.map_err(|e| e.to_string())?.json().await.map_err(|e| e.to_string())?;
        if let Some(msg) = v["error"]["message"].as_str() {
            return Err(tr!("Gemini hatası: {}", "Gemini error: {}", msg));
        }
        for m in v["models"].as_array().into_iter().flatten() {
            let chat = m["supportedGenerationMethods"].as_array().is_some_and(|a| a.iter().any(|x| x == "generateContent"));
            let id = m["name"].as_str().unwrap_or("").trim_start_matches("models/").to_string();
            if chat && id.starts_with("gemini") {
                out.push((id.clone(), m["displayName"].as_str().unwrap_or(&id).to_string()));
            }
        }
        match v["nextPageToken"].as_str() {
            Some(t) if !t.is_empty() => page = Some(t.to_string()),
            _ => break,
        }
    }
    Ok(out)
}

fn plugins_dir(app: &AppHandle) -> PathBuf {
    app.path().app_local_data_dir().unwrap_or_default().join("plugins")
}

#[tauri::command]
fn plugins_list(app: AppHandle) -> Vec<indexers::PluginInfo> {
    indexers::list(&plugins_dir(&app))
}

#[tauri::command]
fn plugins_add(app: AppHandle, paths: Vec<String>) -> Result<u32, String> {
    indexers::add(&plugins_dir(&app), paths)
}

#[tauri::command]
fn plugins_remove(app: AppHandle, file: String) -> Result<(), String> {
    indexers::remove(&plugins_dir(&app), &file)
}

#[tauri::command]
async fn web_search(app: AppHandle, query: String, disabled: Vec<String>) -> Result<indexers::SearchOut, String> {
    Ok(indexers::search(&plugins_dir(&app), query, disabled).await)
}

#[tauri::command]
async fn plugin_test(app: AppHandle, file: String, query: String) -> Result<Vec<indexers::Hit>, String> {
    indexers::search_one(&plugins_dir(&app).join(file), &query).await
}

#[tauri::command]
async fn web_resolve(app: AppHandle, file: String, url: String) -> Result<String, String> {
    indexers::resolve(&plugins_dir(&app).join(file), &url).await
}

#[tauri::command]
async fn upscaler_status() -> Result<upscaler::Status, String> {
    blocking(|| Ok(upscaler::status())).await
}

#[tauri::command]
async fn upscaler_save(values: std::collections::BTreeMap<String, String>) -> Result<(), String> {
    blocking(move || upscaler::save(values)).await
}

#[tauri::command]
async fn upscaler_scale(on: bool) -> Result<bool, String> {
    blocking(move || upscaler::set_scaling(on)).await
}

/// Appends a line to upscaler.log (app data folder) for diagnosing the Upscaler on the user's machine.
fn upscaler_log(app: &AppHandle) -> impl Fn(String) + Send + 'static {
    let path = app.path().app_local_data_dir().unwrap_or_default().join("upscaler.log");
    move |m: String| {
        use std::io::Write;
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
            let t = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
            let _ = writeln!(f, "{t} {m}");
        }
    }
}

static SUBS_ON: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// The subtitle window used while the Upscaler runs: covers Luna's window, click-through,
/// always on top and invisible to screen capture (so frame generation never touches the text).
#[tauri::command]
async fn subs_window(app: AppHandle, show: bool) -> Result<(), String> {
    use std::sync::atomic::Ordering;
    let main = app.get_webview_window("main").ok_or("ana pencere yok")?;
    let w = match app.get_webview_window("subs") {
        Some(w) => w,
        None => {
            if !show {
                return Ok(());
            }
            let w = tauri::WebviewWindowBuilder::new(&app, "subs", tauri::WebviewUrl::App("index.html?subs=1".into()))
                .additional_browser_args("--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,CalculateNativeWinOcclusion --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling")
                .title("Luna subtitles")
                .transparent(true)
                .decorations(false)
                .shadow(false)
                .always_on_top(true)
                .skip_taskbar(true)
                .focused(false)
                .resizable(false)
                .visible(false)
                .build()
                .map_err(|e| e.to_string())?;
            let _ = w.set_ignore_cursor_events(true);
            w
        }
    };
    if show {
        if let (Ok(pos), Ok(size)) = (main.outer_position(), main.outer_size()) {
            let _ = w.set_position(pos);
            let _ = w.set_size(size);
        }
        let _ = w.show();
        let _ = main.set_focus();
        // Capture exclusion: set by the window's own (main) thread, after it is shown, and read back.
        if let Ok(h) = w.hwnd() {
            let h = h.0 as isize;
            let log = upscaler_log(&app);
            let _ = app.run_on_main_thread(move || {
                let (a, err) = upscaler::win::exclude_from_capture(h);
                log(format!("yakalama disi: affinity={a:#x} hata={err}"));
            });
        }
        // The line on screen right now (mpv only reports changes).
        let last = LAST_SUB.lock().unwrap().clone();
        let _ = app.emit_to("subs", "luna-subs-text", last);
        pgs::reset_shown();
        if !SUBS_ON.swap(true, Ordering::SeqCst) {
            // Lossless Scaling's own window is topmost too: keep ours above it.
            let w2 = w.clone();
            let log = upscaler_log(&app);
            std::thread::spawn(move || {
                let mut last = String::new();
                while SUBS_ON.load(Ordering::SeqCst) {
                    if let Ok(h) = w2.hwnd() {
                        let h = h.0 as isize;
                        upscaler::win::keep_on_top(h);
                        // Record where the subtitles sit relative to Lossless Scaling's output.
                        let ls = upscaler::current_pid().and_then(upscaler::win::scaling_window);
                        let line = format!(
                            "altyazi z={} gorunur={} | LS cikti penceresi={}",
                            upscaler::win::z_index(h),
                            w2.is_visible().unwrap_or(false),
                            ls.map(|l| format!("z={}", upscaler::win::z_index(l))).unwrap_or("yok".into())
                        );
                        if line != last {
                            log(line.clone());
                            last = line;
                        }
                    }
                    std::thread::sleep(std::time::Duration::from_millis(400));
                }
            });
        }
    } else {
        SUBS_ON.store(false, Ordering::SeqCst);
        let _ = w.hide();
    }
    Ok(())
}

fn state_file(app: &AppHandle) -> PathBuf {
    app.path().app_local_data_dir().unwrap_or_default().join("luna-state.json")
}

/// Durable copy of everything Luna keeps in the webview's localStorage. WebView2 can throw its
/// storage away (e.g. after a crash); Luna then restores from this file at startup.
#[tauri::command]
async fn state_save(app: AppHandle, json: String) -> Result<(), String> {
    let path = state_file(&app);
    blocking(move || {
        if json.len() < 10 {
            return Ok(());
        }
        std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
        // Keep the previous good copy, then replace atomically.
        if path.exists() {
            let _ = std::fs::copy(&path, path.with_extension("json.bak"));
        }
        let tmp = path.with_extension("json.tmp");
        std::fs::write(&tmp, json).map_err(|e| e.to_string())?;
        std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
    })
    .await
}

/// The saved state, or a one-time restore file placed next to the exe (luna-restore.json).
#[tauri::command]
async fn state_load(app: AppHandle) -> Option<String> {
    let path = state_file(&app);
    blocking(move || {
        if let Some(seed) = std::env::current_exe().ok().and_then(|e| e.parent().map(|d| d.join("luna-restore.json"))) {
            if let Ok(s) = std::fs::read_to_string(&seed) {
                let _ = std::fs::rename(&seed, seed.with_extension("json.used"));
                return Ok(Some(s));
            }
        }
        Ok(std::fs::read_to_string(&path).or_else(|_| std::fs::read_to_string(path.with_extension("json.bak"))).ok())
    })
    .await
    .unwrap_or(None)
}

static SUBS_STYLE: std::sync::Mutex<Option<Value>> = std::sync::Mutex::new(None);

/// Font, size, colours… for the subtitle window (Luna's subtitle settings).
#[tauri::command]
fn subs_style(app: AppHandle, style: Value) {
    *SUBS_STYLE.lock().unwrap() = Some(style.clone());
    let _ = app.emit_to("subs", "luna-subs-style", style);
}

/// Called by the mpv reader for every subtitle line. While the Upscaler runs, Luna's own page
/// is covered by Lossless Scaling, so the line goes straight to the subtitle window instead.
/// While the Upscaler runs with a picture (PGS) track: send the picture due now to the subtitle window.
pub(crate) fn forward_pgs(app: &AppHandle) {
    if !SUBS_ON.load(std::sync::atomic::Ordering::SeqCst) {
        return;
    }
    if let Some(cue) = pgs::due() {
        let pics = cue.map(|c| c.pics).unwrap_or_default();
        let _ = app.emit_to("subs", "luna-subs-pics", pics);
    }
}

/// Reads the PGS track `track` (MKV track number = mpv's src-id) of `file` in the background.
/// Progress goes to the main window as "pgs-progress", the result as "pgs-ready" / "pgs-error".
#[tauri::command]
fn pgs_prepare(app: AppHandle, file: String, track: u64) {
    let key = format!("{file}#{track}");
    if pgs::loaded_key().as_deref() == Some(key.as_str()) {
        let _ = app.emit("pgs-ready", key);
        return;
    }
    pgs::clear();
    let cache = app.path().app_cache_dir().unwrap_or_default().join("pgs");
    std::thread::spawn(move || {
        let a2 = app.clone();
        let progress = move |p: f32| {
            let _ = a2.emit("pgs-progress", p);
        };
        match pgs::load(&file, track, &cache, &progress) {
            Ok(t) => {
                upscaler_log(&app)(format!("PGS hazir: {} altyazi ({key})", t.cues.len()));
                pgs::set_track(key.clone(), t);
                let _ = app.emit("pgs-ready", key);
                forward_pgs(&app);
            }
            Err(e) => {
                upscaler_log(&app)(format!("PGS hatasi: {e}"));
                let _ = app.emit("pgs-error", e);
            }
        }
    });
}

#[tauri::command]
fn pgs_clear(app: AppHandle) {
    pgs::clear();
    let _ = app.emit_to("subs", "luna-subs-pics", Vec::<pgs::Pic>::new());
}

static LAST_SUB: std::sync::Mutex<String> = std::sync::Mutex::new(String::new());

pub(crate) fn forward_sub_text(app: &AppHandle, text: &str) {
    *LAST_SUB.lock().unwrap() = text.to_string();
    if SUBS_ON.load(std::sync::atomic::Ordering::SeqCst) {
        let ok = app.emit_to("subs", "luna-subs-text", text.to_string()).is_ok();
        upscaler_log(app)(format!("satir gonderildi ok={ok}: {:?}", text.chars().take(30).collect::<String>()));
    }
}

/// Downloads a web page (e.g. a Letterboxd / IMDb list) and returns its readable text, including the
/// film names that only live in poster alt texts. Letterboxd lists: the first pages are followed too.
#[tauri::command]
async fn fetch_page_text(url: String) -> Result<String, String> {
    use scraper::{Html, Selector};
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36")
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;
    let mut pages = vec![url.clone()];
    if url.contains("letterboxd.com") && !url.contains("/page/") {
        let base = url.trim_end_matches('/').to_string();
        for n in 2..=5 {
            pages.push(format!("{base}/page/{n}/"));
        }
    }
    let mut out = String::new();
    for (i, u) in pages.iter().enumerate() {
        let res = client.get(u).header("Accept-Language", "tr,en;q=0.8").send().await.map_err(|e| tr!("Sayfa açılamadı: {}", "Couldn't open the page: {}", e))?;
        if !res.status().is_success() {
            if i == 0 {
                return Err(tr!("Sayfa açılamadı ({})", "Couldn't open the page ({})", res.status()));
            }
            break;
        }
        let html = res.text().await.map_err(|e| e.to_string())?;
        let text = {
            let doc = Html::parse_document(&html);
            let mut t = String::new();
            // film names in poster attributes (Letterboxd: data-film-name / img alt)
            let attrs = Selector::parse("[data-film-name], img[alt], [data-item-name]").unwrap();
            for el in doc.select(&attrs) {
                let v = el.value();
                if let Some(n) = v.attr("data-film-name").or(v.attr("data-item-name")).or(v.attr("alt")) {
                    if n.len() > 1 && n.len() < 150 {
                        t.push_str(n);
                        if let Some(y) = v.attr("data-film-release-year") {
                            t.push_str(&format!(" ({y})"));
                        }
                        t.push('\n');
                    }
                }
            }
            let body = Selector::parse("body").unwrap();
            if let Some(b) = doc.select(&body).next() {
                for chunk in b.text() {
                    let c = chunk.trim();
                    if !c.is_empty() {
                        t.push_str(c);
                        t.push('\n');
                    }
                }
            }
            t
        };
        if i > 0 && text.len() < 200 {
            break;
        }
        out.push_str(&text);
        if out.len() > 120_000 {
            break;
        }
    }
    Ok(out.chars().take(120_000).collect())
}

#[tauri::command]
async fn letterboxd_read(url: String, max_pages: Option<u32>) -> Result<Vec<letterboxd::Section>, String> {
    letterboxd::read(&url, max_pages.unwrap_or(30).min(100)).await
}

#[tauri::command]
fn upscaler_note(app: AppHandle, m: String) {
    upscaler_log(&app)(m);
}

#[tauri::command]
fn subs_current_style() -> Option<Value> {
    SUBS_STYLE.lock().unwrap().clone()
}

#[tauri::command]
async fn preview_release() {
    let _ = tauri::async_runtime::spawn_blocking(preview::release).await;
}

#[tauri::command]
async fn torrent_haves(id: usize, idx: usize) -> Result<Vec<(f64, f64)>, String> {
    blocking(move || torrent::haves(id, idx)).await
}

#[tauri::command]
async fn torrent_pause(id: usize, pause: bool) -> Result<(), String> {
    torrent::pause(id, pause).await
}

#[tauri::command]
async fn torrent_remove(id: usize, delete_files: bool) -> Result<(), String> {
    let _ = tauri::async_runtime::spawn_blocking(preview::release).await;
    torrent::remove(id, delete_files).await
}

fn fonts_dir(app: &AppHandle) -> PathBuf {
    app.path().app_local_data_dir().unwrap_or_default().join("fonts")
}

#[tauri::command]
fn fonts_add(app: AppHandle, paths: Vec<String>) -> Result<u32, String> {
    fonts::add(&fonts_dir(&app), paths)
}

#[tauri::command]
fn fonts_list(app: AppHandle) -> Vec<fonts::FontInfo> {
    fonts::list(&fonts_dir(&app))
}

#[tauri::command]
fn fonts_remove(app: AppHandle, file: String) -> Result<(), String> {
    fonts::remove(&fonts_dir(&app), &file)
}

#[tauri::command]
fn downloads_dir(app: AppHandle) -> Option<String> {
    app.path().download_dir().ok().map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
fn reveal_file(path: String) -> Result<(), String> {
    files::reveal(&path)
}

#[tauri::command]
async fn delete_file(path: String) -> Result<u32, String> {
    let _ = tauri::async_runtime::spawn_blocking(preview::release).await;
    blocking(move || files::delete(&path)).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        // Double-clicking another video while Luna is open plays it in the same window.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(f) = argv.iter().skip(1).find(|a| !a.starts_with('-')) {
                let _ = app.emit("open-file", f.clone());
            }
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let win = app.get_webview_window("main").expect("main window");
            let hwnd = win.hwnd()?.0 as isize;
            let exe = mpv_exe(app.handle());
            // Bundled Inter sits next to the mpv folder; user fonts join it in Luna's data folder.
            let bundled = exe.parent().and_then(|p| p.parent()).map(|p| p.join("fonts")).unwrap_or_default();
            let fonts = fonts_dir(app.handle());
            fonts::prepare(&fonts, &bundled);
            let _ = MPV.set(mpv::start(app.handle().clone(), exe, hwnd, fonts));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            set_lang,
            system_check,
            mpv_command,
            startup_file,
            find_subtitles,
            search_subtitles,
            download_subtitle,
            subtitle_cues,
            scan_folders,
            probe_video,
            video_thumbnail,
            seek_preview,
            paths_exist,
            preview_release,
            torrent_haves,
            gemini,
            state_save,
            state_load,
            upscaler_status,
            upscaler_save,
            upscaler_scale,
            subs_window,
            subs_style,
            subs_current_style,
            pgs_prepare,
            pgs_clear,
            upscaler_note,
            fetch_page_text,
            letterboxd_read,
            plugins_list,
            plugins_add,
            plugins_remove,
            web_search,
            plugin_test,
            web_resolve,
            gemini_models,
            list_dir,
            reveal_file,
            torrent_add,
            torrent_list,
            torrent_pause,
            torrent_remove,
            downloads_dir,
            fonts_add,
            fonts_list,
            fonts_remove,
            delete_file
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app, event| {
        // Closing Luna's main window quits Luna, even if helper windows (subtitles) still exist.
        if let RunEvent::WindowEvent { label, event: tauri::WindowEvent::Destroyed, .. } = &event {
            if label == "main" {
                app.exit(0);
            }
        }
        if let RunEvent::Exit = event {
            if let Some(m) = MPV.get() {
                m.kill();
            }
            preview::shutdown();
        }
    });
}

#[cfg(test)]
mod tests {
    use std::path::Path;
    #[test]
    fn samples_only() {
        assert!(super::is_sample(Path::new(r"D:\Films\Movie.2010\movie-sample.mkv")));
        assert!(super::is_sample(Path::new(r"D:\Films\Movie.2010\Sample\clip.mkv")));
        assert!(!super::is_sample(Path::new(r"D:\Sample Collection\Inception.2010.mkv")));
        assert!(!super::is_sample(Path::new(r"D:\Films\Samplers.2019.mkv")));
    }
}

mod cache_tools;
/// Messages in the UI language: `tr!("Türkçe {}", "English {}", arg)` (English unless the UI is Turkish).
#[macro_export]
macro_rules! tr {
    ($t:literal, $e:literal $(, $a:expr)* $(,)?) => {
        if $crate::is_tr() { format!($t $(, $a)*) } else { format!($e $(, $a)*) }
    };
}
use std::io::Read;
static UI_TR: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
pub fn is_tr() -> bool {
    UI_TR.load(std::sync::atomic::Ordering::Relaxed)
}
#[tauri::command]
fn set_lang(lang: String) {
    UI_TR.store(lang == "tr", std::sync::atomic::Ordering::Relaxed);
}

mod browser;
mod clipboard;
mod files;
mod preview;
mod fonts;
mod indexers;
mod letterboxd;
mod kitap;
mod books;
mod mpv;
mod music;
mod pgs;
mod screen;
mod secrets;
mod subs;
mod torrent;
mod tts;
mod update;
mod wikisource;
mod upscaler;
mod yt;

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

/// Every audio file under the music folders, with tags and cached covers.
#[tauri::command]
async fn music_scan(app: AppHandle, folders: Vec<String>) -> Result<Vec<music::Track>, String> {
    let index = app.path().app_data_dir().map_err(|e| e.to_string())?.join("music-index.json");
    let covers = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("covers");
    blocking(move || { let result=music::scan(&folders, &index, &covers); cache_tools::enforce(&app); Ok(result) }).await
}

/// YouTube results for a song (yt-dlp next to mpv).
#[tauri::command]
async fn yt_search(app: AppHandle, query: String, n: Option<u32>) -> Result<Vec<yt::Hit>, String> {
    let n = n.unwrap_or(6);
    // YouTube's own search first (fast); yt-dlp when that fails (YouTube changed something)
    if let Ok(hits) = yt::search_api(&query, n).await {
        return Ok(hits);
    }
    let ytdlp = mpv::ytdlp_exe(&mpv_exe(&app));
    blocking(move || yt::search(&ytdlp, &query, n)).await
}

/// What a YouTube (or other supported) link is: a video or a playlist's videos.
#[tauri::command]
async fn yt_info(app: AppHandle, url: String) -> Result<Vec<yt::Hit>, String> {
    let ytdlp = mpv::ytdlp_exe(&mpv_exe(&app));
    blocking(move || yt::info(&ytdlp, &url)).await
}

/// A YouTube video's subtitles as plain text (the assistant summarises the video from them).
#[tauri::command]
async fn yt_transcript(app: AppHandle, url: String) -> Result<String, String> {
    let ytdlp = mpv::ytdlp_exe(&mpv_exe(&app));
    blocking(move || yt::transcript(&ytdlp, &url)).await
}

/// The API keys kept in Windows' Credential Manager (see secrets.rs): only the ones asked for.
#[tauri::command]
async fn secrets_load(names: Vec<String>) -> std::collections::HashMap<String, String> {
    names.into_iter().filter_map(|n| secrets::get(&n).map(|v| (n, v))).collect()
}

#[tauri::command]
async fn secret_set(name: String, value: String) -> Result<(), String> {
    secrets::set(&name, &value)
}

/// A song's audio address, found before its turn (see yt::stream).
/// Edge's natural voice reading `text`: 4 bytes (little-endian) of JSON length, the words' times as
/// JSON, then the mp3.
#[tauri::command]
async fn tts_speak(text: String, voice: String, rate: Option<i32>) -> Result<tauri::ipc::Response, String> {
    let s = tts::speak(&text, &voice, rate.unwrap_or(0)).await?;
    let words = serde_json::to_vec(&s.words).map_err(|e| e.to_string())?;
    let mut out = Vec::with_capacity(4 + words.len() + s.audio.len());
    out.extend_from_slice(&(words.len() as u32).to_le_bytes());
    out.extend_from_slice(&words);
    out.extend_from_slice(&s.audio);
    Ok(tauri::ipc::Response::new(out))
}

/// Vikikaynak (Wikisource): works matching `q`, or its novels and books shelves.
#[tauri::command]
async fn ws_search(lang: String, q: String) -> Result<Vec<wikisource::Hit>, String> {
    wikisource::search(&lang, &q).await
}
/// Makes an EPUB of a Wikisource work and saves it into `dir`.
#[tauri::command]
async fn ws_book(lang: String, title: String, dir: String) -> Result<books::Downloaded, String> {
    wikisource::book(&lang, &title, std::path::Path::new(&dir)).await
}
#[tauri::command]
async fn update_check(app: tauri::AppHandle, beta: bool) -> Result<Option<update::Info>, String> {
    update::check(&app, beta).await
}
#[tauri::command]
async fn update_install(app: tauri::AppHandle) -> Result<(), String> {
    update::install(app).await
}
#[tauri::command]
async fn tts_voices() -> Result<Vec<tts::Voice>, String> {
    tts::voices().await
}

#[tauri::command]
async fn yt_stream(app: AppHandle, url: String) -> Result<yt::Stream, String> {
    let ytdlp = mpv::ytdlp_exe(&mpv_exe(&app));
    // a song to be found ("ytsearch1:Artist Title"): YouTube's own search is quicker than yt-dlp's
    let url = match url.strip_prefix("ytsearch1:") {
        Some(q) => yt::search_api(q, 1).await.ok().and_then(|h| h.into_iter().next()).map(|h| h.url).unwrap_or(url),
        None => url,
    };
    blocking(move || yt::stream(&ytdlp, &url)).await
}

/// Every book (EPUB, PDF, CBZ) under the book folders.
#[tauri::command]
async fn books_scan(app: AppHandle, folders: Vec<String>) -> Result<Vec<books::Book>, String> {
    let index = app.path().app_data_dir().map_err(|e| e.to_string())?.join("books-index.json");
    let covers = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("covers");
    blocking(move || { let result=books::scan(&folders, &index, &covers); cache_tools::enforce(&app); Ok(result) }).await
}

/// A book file's bytes, for the reader.
#[tauri::command]
async fn book_bytes(path: String) -> Result<tauri::ipc::Response, String> {
    blocking(move || {
        let len = std::fs::metadata(&path).map_err(|e| e.to_string())?.len();
        if len > 300 * 1024 * 1024 {
            return Err(tr!("Dosya çok büyük", "File too big"));
        }
        books::validate_book_file(std::path::Path::new(&path))?;
        std::fs::read(&path).map(tauri::ipc::Response::new).map_err(|e| e.to_string())
    }).await
}
#[tauri::command]
async fn cbz_pages(path: String) -> Result<Vec<String>, String> {
    blocking(move || books::cbz_pages(std::path::Path::new(&path))).await
}

#[tauri::command]
async fn cbz_page(path: String, name: String) -> Result<tauri::ipc::Response, String> {
    blocking(move || books::cbz_page(std::path::Path::new(&path), &name).map(tauri::ipc::Response::new)).await
}

/// Where books from the open libraries are saved unless the user picked a book folder.
#[tauri::command]
fn books_default_dir(app: AppHandle) -> Option<String> {
    app.path().document_dir().ok().map(|d| d.join("Luna Books").to_string_lossy().into_owned())
}

#[tauri::command]
async fn book_download(url: String, dir: String, title: String, author: String, kind: Option<String>, fallback: Option<String>) -> Result<books::Downloaded, String> {
    books::download(&url, std::path::Path::new(&dir), &title, &author, kind.as_deref().unwrap_or(""), fallback.as_deref().unwrap_or("")).await
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
    blocking(move || { let result=files::thumbnail(&exe, &path, &cache); cache_tools::enforce(&app); result }).await
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

/// OpenAI-style (OpenAI and any compatible server: OpenRouter, Groq, Ollama, LM Studio…) or Anthropic
/// request for the assistant when Gemini isn't the chosen provider. `kind` is "openai" or "anthropic".
fn llm_req(client: &reqwest::Client, kind: &str, method: reqwest::Method, url: &str, key: &str) -> reqwest::RequestBuilder {
    let mut req = client.request(method, url);
    if kind == "anthropic" {
        req = req.header("x-api-key", key).header("anthropic-version", "2023-06-01");
    } else if !key.is_empty() {
        req = req.bearer_auth(key);
    }
    req
}

fn llm_error(status: reqwest::StatusCode, v: &Value) -> String {
    let msg = v["error"]["message"].as_str().or_else(|| v["error"].as_str()).or_else(|| v["message"].as_str())
        .map(str::to_string).unwrap_or_else(|| tr!("bilinmeyen hata", "unknown error"));
    tr!("Asistan hatası ({}): {}", "Assistant error ({}): {}", status, msg)
}

/// "error sending request" alone hides why (a certificate, a timeout…): the causes are added.
fn err_chain(e: &dyn std::error::Error) -> String {
    let mut out = e.to_string();
    let mut s = e.source();
    while let Some(x) = s {
        out += &format!(" ← {x}");
        s = x.source();
    }
    out
}

#[tauri::command]
async fn llm_post(kind: String, url: String, key: String, body: Value) -> Result<Value, String> {
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(180)).build().map_err(|e| e.to_string())?;
    let res = llm_req(&client, &kind, reqwest::Method::POST, &url, &key)
        .json(&body)
        .send()
        .await
        .map_err(|e| tr!("Asistana bağlanılamadı ({}): {}", "Couldn't reach the assistant ({}): {}", url, err_chain(&e)))?;
    let status = res.status();
    let text = res.text().await.map_err(|e| e.to_string())?;
    let v: Value = serde_json::from_str(&text).unwrap_or_else(|_| serde_json::json!({ "message": text.chars().take(300).collect::<String>() }));
    if !status.is_success() {
        return Err(llm_error(status, &v));
    }
    Ok(v)
}

/// The models a provider offers (GET …/models): ids.
#[tauri::command]
async fn llm_models(kind: String, url: String, key: String) -> Result<Vec<String>, String> {
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(20)).build().map_err(|e| e.to_string())?;
    let res = llm_req(&client, &kind, reqwest::Method::GET, &url, &key).send().await.map_err(|e| e.to_string())?;
    let status = res.status();
    let v: Value = res.json().await.unwrap_or(Value::Null);
    if !status.is_success() {
        return Err(llm_error(status, &v));
    }
    let list = v["data"].as_array().or_else(|| v["models"].as_array()).cloned().unwrap_or_default();
    Ok(list.iter().filter_map(|m| m["id"].as_str().or_else(|| m["name"].as_str()).map(str::to_string)).collect())
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


fn safe_plugin_file(file: &str) -> Result<(), String> {
    let p = std::path::Path::new(file);
    if file.trim().is_empty() || p.is_absolute() || p.components().any(|c| matches!(c, std::path::Component::ParentDir | std::path::Component::RootDir | std::path::Component::Prefix(_))) {
        return Err(tr!("Geçersiz eklenti dosyası", "Invalid plugin file"));
    }
    Ok(())
}
#[tauri::command]
async fn plugin_test(app: AppHandle, file: String, query: String) -> Result<Vec<indexers::Hit>, String> {
    safe_plugin_file(&file)?;
    indexers::search_one(&plugins_dir(&app).join(file), &query).await
}

#[tauri::command]
async fn web_resolve(app: AppHandle, file: String, url: String) -> Result<String, String> {
    safe_plugin_file(&file)?;
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

fn valid_state_json(json: &str) -> bool {
    serde_json::from_str::<std::collections::HashMap<String,String>>(json).is_ok()
}

fn state_file(app: &AppHandle) -> PathBuf {
    app.path().app_local_data_dir().unwrap_or_default().join("luna-state.json")
}

/// Durable copy of everything Luna keeps in the webview's localStorage. WebView2 can throw its
/// storage away (e.g. after a crash); Luna then restores from this file at startup.
#[tauri::command]
async fn state_save(app: AppHandle, json: String) -> Result<(), String> {
    static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);
    static WRITTEN: std::sync::Mutex<u64> = std::sync::Mutex::new(0);
    if !valid_state_json(&json) { return Err("Invalid Luna state".into()); }
    let ticket = NEXT.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    let path = state_file(&app);
    blocking(move || {
        if json.len() < 10 {
            return Ok(());
        }
        let mut written = WRITTEN.lock().unwrap_or_else(|e| e.into_inner());
        if ticket < *written {
            return Ok(());
        }
        *written = ticket;
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
                if valid_state_json(&s) {
                    let _ = std::fs::rename(&seed, seed.with_extension("json.used"));
                    return Ok(Some(s));
                }
                // a broken restore file must not hide the real saved state
                let _ = std::fs::rename(&seed, seed.with_extension("json.bad"));
            }        }
        let valid = |p: PathBuf| std::fs::read_to_string(p).ok().filter(|s| valid_state_json(s));
        Ok(valid(path.clone()).or_else(|| valid(path.with_extension("json.bak"))))
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
    let (generation,cached)=pgs::begin_load(&key);
    if cached {pgs::with_current(generation,||{let _=app.emit("pgs-ready",&key);});return;}
    pgs::with_current(generation,||{let _ = app.emit_to("subs","luna-subs-pics",Vec::<pgs::Pic>::new());});
    let cache = app.path().app_cache_dir().unwrap_or_default().join("pgs");
    std::thread::spawn(move || {
        // Only one decoder owns the packet budget/cache writer. Superseded workers exit when dequeued.
        let _worker=pgs::LOAD_WORKER.lock().unwrap();
        if !pgs::current(generation){return;}
        let a2=app.clone();
        let progress=move|p:f32|pgs::with_current(generation,||{let _=a2.emit("pgs-progress",p);});
        match pgs::load(&file,track,&cache,&progress,&||!pgs::current(generation)){
            Ok(t)=>{let count=t.cues.len();pgs::finish_load(generation,key.clone(),t,||{
                upscaler_log(&app)(format!("PGS hazir: {count} altyazi ({key})"));
                let _=app.emit("pgs-ready",&key);forward_pgs(&app);
            });}
            Err(e)=>pgs::with_current(generation,||{upscaler_log(&app)(format!("PGS hatasi: {e}"));let _=app.emit("pgs-error",e);}),
        }
    });
}

#[tauri::command]
fn pgs_clear(app: AppHandle) {
    pgs::clear(||{let _ = app.emit_to("subs", "luna-subs-pics", Vec::<pgs::Pic>::new());});
}

static LAST_SUB: std::sync::Mutex<String> = std::sync::Mutex::new(String::new());

pub(crate) fn forward_sub_text(app: &AppHandle, text: &str) {
    *LAST_SUB.lock().unwrap() = text.to_string();
    if SUBS_ON.load(std::sync::atomic::Ordering::SeqCst) {
        let _ = app.emit_to("subs", "luna-subs-text", text.to_string());
    }
}

const MAX_EXPORT_TOTAL:u64=128*1024*1024;
fn read_export_text(reader:impl std::io::Read,remaining:&mut u64)->Result<String,String>{
    let limit=(*remaining).min(50_000_000);
    let mut text=String::new();
    std::io::Read::take(reader,limit+1).read_to_string(&mut text).map_err(|e|e.to_string())?;
    if text.len() as u64>limit{return Err("Export exceeds its CSV or total byte budget".into());}
    *remaining-=text.len() as u64;Ok(text)
}

/// The CSV files of a data export (Letterboxd): every .csv inside a .zip, or the .csv files themselves.
#[tauri::command]
async fn read_export(paths: Vec<String>) -> Result<Vec<(String, String)>, String> {
    blocking(move || {
        const MAX: u64 = 50_000_000;
        let mut out = Vec::new();
        let mut remaining=MAX_EXPORT_TOTAL;
        if paths.len()>64{return Err("Too many export files (maximum 64)".into());}
        for p in paths {
            let path = std::path::Path::new(&p);
            if path.extension().is_some_and(|e| e.eq_ignore_ascii_case("zip")) {
                let mut z = zip::ZipArchive::new(std::fs::File::open(path).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
                if z.len()>10_000{return Err("Export archive has too many entries".into());}
                for i in 0..z.len() {
                    let mut f = z.by_index(i).map_err(|e| e.to_string())?;
                    if !f.name().to_lowercase().ends_with(".csv") {continue;}
                    if f.size()>MAX || f.size()>remaining || out.len()>=200{return Err("Export exceeds its CSV count or byte budget".into());}
                    let name = f.name().replace('\\', "/");
                    let text=read_export_text(&mut f,&mut remaining)?;
                    out.push((name, text));
                }
            } else {
                let len = std::fs::metadata(path).map_err(|e| e.to_string())?.len();
                if len > MAX {
                    return Err(tr!("Dosya çok büyük", "File too big"));
                }
                let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
                let text=read_export_text(std::fs::File::open(path).map_err(|e|e.to_string())?,&mut remaining)?;
                out.push((name, text));
            }
        }
        Ok(out)
    })
    .await
}
/// One GET returning text (OPDS catalogs, podcast feeds: XML that pages can't fetch across origins).
#[tauri::command]
async fn http_text(url: String, bearer: Option<String>) -> Result<String, String> {
    Ok(get_text(url, bearer).await?.1)
}
/// The same, with the address the answer finally came from (after redirects), so that relative
/// links in a catalog resolve against where it really lives.
#[tauri::command]
async fn http_text_at(url: String) -> Result<(String, String), String> {
    get_text(url, None).await
}
async fn get_text(url: String, bearer: Option<String>) -> Result<(String, String), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err(tr!("Geçersiz adres", "Invalid address"));
    }
    let mut req = reqwest::Client::builder()
        .user_agent("Luna Player")
        .timeout(std::time::Duration::from_secs(25))
        .build()
        .map_err(|e| e.to_string())?
        .get(&url);
    if let Some(t) = bearer {
        req = req.bearer_auth(t).header(reqwest::header::ACCEPT, "application/json");
    }
    let res = req
        .send()
        .await
        .map_err(|e| tr!("Ulaşılamadı: {}", "Couldn't reach it: {}", e))?;
    if !res.status().is_success() {
        return Err(tr!("Sunucu hata verdi ({})", "The server returned an error ({})", res.status()));
    }
    if res.content_length().is_some_and(|n| n > 20 * 1024 * 1024) {
        return Err(tr!("Yanıt çok büyük", "The answer is too big"));
    }
    let at = res.url().to_string();
    let bytes = res.bytes().await.map_err(|e| e.to_string())?;
    if bytes.len() > 20 * 1024 * 1024 {
        return Err(tr!("Yanıt çok büyük", "The answer is too big"));
    }
    Ok((at, String::from_utf8_lossy(&bytes).into_owned()))
}

/// One GET from a Stremio addon (manifest, catalog, meta or streams), as JSON. Done here rather than
/// in the page because not every addon sends CORS headers.
#[tauri::command]
async fn addon_get(url: String) -> Result<Value, String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err(tr!("Geçersiz eklenti adresi", "Not a valid addon address"));
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;
    let res = client
        .get(&url)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| tr!("Eklentiye ulaşılamadı: {}", "Couldn't reach the addon: {}", e))?;
    if !res.status().is_success() {
        return Err(tr!("Eklenti hata verdi ({})", "The addon returned an error ({})", res.status()));
    }
    res.json::<Value>()
        .await
        .map_err(|e| tr!("Eklentinin yanıtı okunamadı: {}", "Couldn't read the addon's answer: {}", e))
}

/// Downloads a web page (e.g. a Letterboxd / IMDb list) and returns its readable text, including the
/// film names that only live in poster alt texts. Letterboxd lists: the first pages are followed too.
fn is_private_url(u: &str) -> bool {
    let host = match reqwest::Url::parse(u) {
        Ok(x) => x.host_str().unwrap_or("").to_string(),
        Err(_) => return true,
    };
    let h = host.trim_start_matches('[').trim_end_matches(']').to_lowercase();
    if h == "localhost" || h.ends_with(".localhost") || h == "0.0.0.0" {
        return true;
    }
    if let Ok(ip) = h.parse::<std::net::IpAddr>() {
        return match ip {
            std::net::IpAddr::V4(v4) => private_v4(v4),
            std::net::IpAddr::V6(v6) => {
                let s = v6.segments()[0];
                v6.is_loopback() || v6.is_unspecified()
                    || (s & 0xfe00) == 0xfc00 // unique local
                    || (s & 0xffc0) == 0xfe80 // link local
                    || v6.to_ipv4_mapped().is_some_and(private_v4)
            }
        };
    }
    false
}
fn private_v4(v4: std::net::Ipv4Addr) -> bool {
    v4.is_private() || v4.is_loopback() || v4.is_link_local() || v4.is_unspecified()
        || (v4.octets()[0] == 100 && (v4.octets()[1] & 0xc0) == 64) // carrier-grade NAT
}
#[tauri::command]
async fn fetch_page_text(url: String) -> Result<String, String> {
    use scraper::{Html, Selector};
    if !(url.starts_with("https://") || url.starts_with("http://")) || is_private_url(&url) {
        return Err(tr!("Bu adres güvenli değil", "This address isn't allowed"));
    }
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36")
        // a public page must not redirect the reader into the local network
        .redirect(reqwest::redirect::Policy::custom(|a| {
            if is_private_url(a.url().as_str()) {
                a.error("private address")
            } else if a.previous().len() > 8 {
                a.stop()
            } else {
                a.follow()
            }
        }))
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
        let body = res.bytes().await.map_err(|e| e.to_string())?;
        if body.len() > 4 * 1024 * 1024 {
            if i == 0 { return Err(tr!("Sayfa çok büyük", "The page is too big")); }
            break;
        }
        let html = String::from_utf8_lossy(&body).into_owned();
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
async fn letterboxd_read(app: AppHandle, url: String, max_pages: Option<u32>, lists: Option<bool>) -> Result<Vec<letterboxd::Section>, String> {
    let say = move |m: String| { let _ = app.emit("lb-progress", m); };
    letterboxd::read(&url, max_pages.unwrap_or(30).min(100), lists.unwrap_or(true), &say).await
}

/// Up to `count` Letterboxd reviews of a film, for the "Worth watching?" card.
#[tauri::command]
async fn letterboxd_reviews(app: AppHandle, tmdb: Option<u64>, tv: Option<bool>, title: String, year: Option<String>, count: Option<usize>, spoilers: Option<bool>) -> Result<letterboxd::Reviews, String> {
    let app2 = app.clone();
    let say = move |m: String| { let _ = app.emit("lb-reviews-progress", m); };
    let found = move |r: &[letterboxd::Review]| { let _ = app2.emit("lb-reviews-found", r.to_vec()); };
    letterboxd::reviews(tmdb, tv.unwrap_or(false), &title, year.as_deref(), count.unwrap_or(50), spoilers.unwrap_or(true), &say, &found).await
}

/// Up to `count` 1000Kitap reviews of a book, for Luna Analiz on a book's page.
#[tauri::command]
async fn book_reviews(app: AppHandle, title: String, author: Option<String>, count: Option<usize>) -> Result<kitap::BookReviews, String> {
    let app2 = app.clone();
    let say = move |m: String| { let _ = app.emit("lb-reviews-progress", m); };
    let found = move |r: &[letterboxd::Review]| { let _ = app2.emit("lb-reviews-found", r.to_vec()); };
    kitap::reviews(&title, author.as_deref(), count.unwrap_or(30), &say, &found).await
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

/// Settings › General: offer copied links (the clipboard watch), or leave the clipboard alone.
#[tauri::command]
fn clipboard_offer(on: bool) {
    clipboard::ON.store(on, std::sync::atomic::Ordering::Relaxed);
}

/// The backup file (Settings › Backup): Luna's records as one JSON file where the user chose.
#[tauri::command]
async fn backup_write(path: String, json: String) -> Result<(), String> {
    blocking(move || std::fs::write(&path, json).map_err(|e| tr!("Yedek kaydedilemedi: {}", "Couldn't save the backup: {}", e))).await
}

/// A playlist file (.m3u / .m3u8) on disk, as text.
#[tauri::command]
async fn text_file_read(path: String) -> Result<String, String> {
    blocking(move || {
        let size = std::fs::metadata(&path).map_err(|e| e.to_string())?.len();
        if size > 30_000_000 {
            return Err(tr!("Dosya çok büyük", "The file is too big"));
        }
        let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
        Ok(String::from_utf8_lossy(&bytes).into_owned())
    })
    .await
}

#[tauri::command]
async fn backup_read(path: String) -> Result<String, String> {
    blocking(move || {
        let size = std::fs::metadata(&path).map_err(|e| e.to_string())?.len();
        if size > 300_000_000 {
            return Err(tr!("Bu dosya bir Luna yedeği olamayacak kadar büyük", "This file is too big to be a Luna backup"));
        }
        std::fs::read_to_string(&path).map_err(|_| tr!("Yedek dosyası okunamadı", "Couldn't read the backup file"))
    })
    .await
}

#[tauri::command]
async fn subs_beside(paths: Vec<String>) -> Result<Vec<u32>, String> {
    blocking(move || Ok(files::subs_beside(&paths))).await
}

#[tauri::command]
async fn rename_video(path: String, name: String) -> Result<String, String> {
    // the preview player may hold the file open
    let _ = tauri::async_runtime::spawn_blocking(preview::release).await;
    blocking(move || files::rename(&path, &name)).await
}

/// Keeps the window inside the space the taskbar leaves (a restored window can be taller than the
/// screen; at start only) and zooms the page out on screens narrower than Luna's layout (off: `fit_zoom` false).
#[tauri::command]
fn fit_window(window: tauri::WebviewWindow, fit_zoom: bool, keep_inside: bool) -> Result<f64, String> {
    let m = window.current_monitor().map_err(|e| e.to_string())?.ok_or("no screen")?;
    let zoom = if fit_zoom { screen::zoom_for(m.size().width as f64 / m.scale_factor()) } else { 1.0 };
    window.set_zoom(zoom).map_err(|e| e.to_string())?;
    // only when Luna starts: leaving full screen briefly reports a screen-sized window, and moving or
    // resizing is the user's own doing
    if keep_inside && !window.is_fullscreen().unwrap_or(false) && !window.is_maximized().unwrap_or(false) && !window.is_minimized().unwrap_or(false) {
        let a = m.work_area();
        if let (Ok(p), Ok(sz)) = (window.outer_position(), window.outer_size()) {
            let area = (a.position.x, a.position.y, a.size.width as i32, a.size.height as i32);
            if let Some((x, y, w, h)) = screen::inside((p.x, p.y, sz.width as i32, sz.height as i32), area) {
                let _ = window.set_size(tauri::PhysicalSize::new(w as u32, h as u32));
                let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
            }
        }
    }
    Ok(zoom)
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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(update::Pending::default())
        .manage(browser::BrowserState::default())
        .manage(browser::Downloads::default())
        .setup(|app| {
            let win = app.get_webview_window("main").expect("main window");
            let hwnd = win.hwnd()?.0 as isize;
            let exe = mpv_exe(app.handle());
            // Bundled Inter sits next to the mpv folder; user fonts join it in Luna's data folder.
            let bundled = exe.parent().and_then(|p| p.parent()).map(|p| p.join("fonts")).unwrap_or_default();
            let fonts = fonts_dir(app.handle());
            fonts::prepare(&fonts, &bundled);
            if let Ok(data) = app.path().app_data_dir() {
                yt::update_weekly(mpv::ytdlp_exe(&exe), data.join("yt-dlp-updated.txt"));
            }
            if let (Ok(local), Ok(dl)) = (app.path().app_local_data_dir(), app.path().download_dir()) {
                torrent::resume(local.join("torrent-session"), dl);
            }
            clipboard::watch(app.handle().clone());
            let _ = MPV.set(mpv::start(app.handle().clone(), exe, hwnd, fonts));
            Ok(())
        })
        .invoke_handler(|invoke| {
            // Application commands must never be callable by a website, even if a capability changes.
            if invoke.message.webview_ref().label().starts_with("luna-web-") {
                invoke.resolver.reject("Web pages cannot invoke Luna commands");
                return true;
            }
            let handler: fn(tauri::ipc::Invoke<tauri::Wry>) -> bool = tauri::generate_handler![
            cache_tools::cache_tools,
            browser::browser_create,
            browser::debug_log,
            browser::browser_download_open,
            browser::browser_extensions,
            browser::browser_action,
            browser::browser_bounds,
            browser::browser_bubble,
            browser::browser_read,
            browser::browser_position,
            browser::browser_translation,
            set_lang,
            system_check,
            mpv_command,
            startup_file,
            find_subtitles,
            search_subtitles,
            download_subtitle,
            subtitle_cues,
            scan_folders,
            music_scan,
            books_scan,
            yt_search,
            yt_info,
            yt_transcript,
            yt_stream,
            tts_speak,
            tts_voices,
            update_check,
            ws_search,
            ws_book,
            update_install,
            secrets_load,
            secret_set,
            book_bytes,
            cbz_pages,
            cbz_page,
            books_default_dir,
            book_download,
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
            addon_get,
            http_text,
            http_text_at,
            read_export,
            letterboxd_read,
            letterboxd_reviews,
            book_reviews,
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
            delete_file,
            subs_beside,
            llm_post,
            llm_models,
            rename_video,
            fit_window,
            backup_write,
            backup_read,
            text_file_read,
            clipboard_offer
            ];
            handler(invoke)
        })
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

#[cfg(test)]
mod export_budget_tests{
    use super::read_export_text;
    #[test]fn csv_reads_share_one_total_budget(){let mut left=6;assert_eq!(read_export_text(&b"abc"[..],&mut left).unwrap(),"abc");assert_eq!(left,3);assert_eq!(read_export_text(&b"def"[..],&mut left).unwrap(),"def");assert_eq!(left,0);assert!(read_export_text(&b"x"[..],&mut left).is_err());}
    #[test]fn csv_over_budget_is_rejected_instead_of_truncated(){let mut left=3;assert!(read_export_text(&b"abcd"[..],&mut left).is_err());assert_eq!(left,3);}
    #[test]fn csv_invalid_utf8_is_an_error(){let mut left=10;assert!(read_export_text(&[255u8][..],&mut left).is_err());}
}

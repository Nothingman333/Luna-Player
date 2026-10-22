//! Subtitle studio, the native half: audio taken out of a video with the bundled mpv, local
//! Whisper transcription (whisper.cpp's `whisper-cli.exe`, downloaded on request or chosen by the
//! user), subtitle sync by listening to the audio, the optional Anime4K shaders, subtitle files
//! written next to the video, and rotating automatic backups.
//!
//! Every long task is a job with an id the UI chose: progress arrives as `studio` events
//! (`{ job, phase, pct, text }`) and `studio_cancel(job)` stops it (child processes are killed,
//! partial files removed). Nothing is downloaded or run without the user's click.

use crate::shell_core as shell;
use crate::studio_core as core;
use serde::Serialize;
use serde_json::json;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

const NO_WINDOW: u32 = 0x0800_0000;

/// whisper.cpp release builds for Windows (pinned: size and SHA-256 are checked before anything runs).
const ENGINES: &[(&str, &str, &str, u64)] = &[
    (
        "cpu",
        "https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.4/whisper-bin-x64.zip",
        "74f973345cb52ef5ba3ec9e7e7af8e48cc8c71722d1528603b80588a11f82e3e",
        4_078_768,
    ),
    (
        "cuda",
        "https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.4/whisper-cublas-12.4.0-bin-x64.zip",
        "b07cff4e59831b227896018facbb6334907bf324a342c84597c44f087823d252",
        457_024_596,
    ),
];
/// Anime4K GLSL shaders v4.0.1 (MIT), pinned the same way.
const ANIME4K: (&str, &str, u64) = (
    "https://github.com/bloc97/Anime4K/releases/download/v4.0.1/Anime4K_v4.0.zip",
    "139cd282086457c5adc79caf7b75b8b825091d71c9b54958c18745fea62d7ed7",
    776_303,
);

#[link(name = "kernel32")]
unsafe extern "system" {
    fn GetShortPathNameW(long: *const u16, short: *mut u16, len: u32) -> u32;
}

/// whisper-cli reads its command line in the system code page, so a path with letters outside
/// plain ASCII (a Windows user name like "Çağlar") may not be found. The 8.3 short form of an
/// existing path is plain ASCII; when there is none, the caller gets a clear message.
fn ascii_path(p: &Path) -> Result<PathBuf, String> {
    use std::os::windows::ffi::{OsStrExt, OsStringExt};
    if p.to_string_lossy().is_ascii() {
        return Ok(p.to_path_buf());
    }
    let wide: Vec<u16> = p.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
    let mut buf = vec![0u16; 1024];
    // SAFETY: `wide` is NUL-terminated and `buf` holds `buf.len()` u16 values for the result.
    let n = unsafe { GetShortPathNameW(wide.as_ptr(), buf.as_mut_ptr(), buf.len() as u32) } as usize;
    if n > 0 && n < buf.len() {
        let short = PathBuf::from(std::ffi::OsString::from_wide(&buf[..n]));
        if short.to_string_lossy().is_ascii() {
            return Ok(short);
        }
    }
    Err(tr!(
        "Whisper bu yolu okuyamıyor (Türkçe/özel harf içeriyor): {}. whisper-cli.exe ve modeli yalnız İngilizce harf içeren bir klasöre koyup oradan seç.",
        "Whisper can't read this path (it has non-ASCII letters): {}. Put whisper-cli.exe and the model in a folder with plain English letters and choose them from there.",
        p.display()
    ))
}

/// A folder for the temporary audio and subtitle that Whisper reads and writes: Luna's cache, its
/// short form when the cache path has special letters, else C:\Users\Public\Luna-Studio.
fn work_dir(cache: &Path) -> Result<PathBuf, String> {
    std::fs::create_dir_all(cache).map_err(|e| e.to_string())?;
    if let Ok(p) = ascii_path(cache) {
        return Ok(p);
    }
    let public = std::env::var_os("PUBLIC").map(PathBuf::from).unwrap_or_else(|| PathBuf::from(r"C:\Users\Public")).join("Luna-Studio");
    std::fs::create_dir_all(&public).map_err(|e| e.to_string())?;
    ascii_path(&public)
}

/// Silero voice-activity model for whisper.cpp's `--vad` (ggml-org/whisper-vad, MIT), pinned.
const SILERO: (&str, &str, u64) = (
    "https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v6.2.0.bin",
    "2aa269b785eeb53a82983a20501ddf7c1d9c48e33ab63a41391ac6c9f7fb6987",
    885_098,
);
const SILERO_FILE: &str = "ggml-silero-v6.2.0.bin";

static JOBS: LazyLock<Mutex<HashMap<u64, Arc<AtomicBool>>>> = LazyLock::new(Default::default);

/// One running task: its cancel flag, and progress sent to the UI. Dropping it ends the job.
struct Job {
    id: u64,
    flag: Arc<AtomicBool>,
    app: AppHandle,
}
impl Job {
    fn start(app: &AppHandle, id: u64) -> Result<Job, String> {
        let mut jobs = JOBS.lock().unwrap();
        if jobs.contains_key(&id) {
            return Err(tr!("Bu iş zaten çalışıyor", "This task is already running"));
        }
        let flag = Arc::new(AtomicBool::new(false));
        jobs.insert(id, flag.clone());
        Ok(Job { id, flag, app: app.clone() })
    }
    fn cancelled(&self) -> bool {
        self.flag.load(Ordering::Relaxed)
    }
    fn emit(&self, phase: &str, pct: Option<f64>, text: &str) {
        let pct = pct.map(|p| (p.clamp(0.0, 100.0) * 10.0).round() / 10.0);
        let _ = self.app.emit("studio", json!({ "job": self.id, "phase": phase, "pct": pct, "text": text }));
    }
}
impl Drop for Job {
    fn drop(&mut self) {
        JOBS.lock().unwrap().remove(&self.id);
    }
}

fn cancelled_msg() -> String {
    tr!("İptal edildi", "Cancelled")
}

/// Stops a running studio task (download, audio extraction, transcription, sync).
#[tauri::command]
pub fn studio_cancel(job: u64) {
    if let Some(f) = JOBS.lock().unwrap().get(&job) {
        f.store(true, Ordering::Relaxed);
    }
}

fn local_dir(app: &AppHandle, sub: &str) -> Result<PathBuf, String> {
    Ok(app.path().app_local_data_dir().map_err(|e| e.to_string())?.join(sub))
}
fn cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_cache_dir().map_err(|e| e.to_string())?.join("studio"))
}

/// A stable name for cached results of one file (path, size and modification time).
fn file_key(path: &str) -> String {
    use std::hash::{Hash, Hasher};
    let mut h = std::collections::hash_map::DefaultHasher::new();
    path.to_lowercase().hash(&mut h);
    if let Ok(m) = std::fs::metadata(path) {
        m.len().hash(&mut h);
        if let Ok(t) = m.modified() {
            t.hash(&mut h);
        }
    }
    format!("{:016x}", h.finish())
}

/// Writes `bytes` to `dest` through a temporary file in the same folder, so a crash never leaves
/// half a file under the real name.
fn write_atomic(dest: &Path, bytes: &[u8]) -> Result<(), String> {
    let name = dest.file_name().and_then(|n| n.to_str()).ok_or("bad file name")?;
    let tmp = dest.with_file_name(format!(".{name}.luna-tmp"));
    let res = (|| -> std::io::Result<()> {
        let mut f = std::fs::File::create(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
        drop(f);
        std::fs::rename(&tmp, dest)
    })();
    if res.is_err() {
        let _ = std::fs::remove_file(&tmp);
    }
    res.map_err(|e| e.to_string())
}

// ---------- audio ----------

/// Takes the audio of `input` (a file or a link) out as 16-bit mono WAV at `rate` with the
/// bundled mpv: encoding mode first, the PCM writer as a fallback. Progress follows the file size.
fn extract_audio(j: &Job, mpv: &Path, input: &str, out: &Path, rate: u32, duration: Option<f64>) -> Result<(), String> {
    let com = mpv.with_file_name("mpv.com");
    let exe = if com.exists() { com } else { mpv.to_path_buf() };
    let common = [
        "--no-config", "--really-quiet", "--load-scripts=no", "--vid=no", "--sid=no", "--sub-auto=no",
        "--audio-file-auto=no", "--audio-channels=mono",
    ];
    let attempts: [Vec<String>; 2] = [
        vec![format!("--o={}", out.display()), "--of=wav".into(), "--oac=pcm_s16le".into(), format!("--audio-samplerate={rate}")],
        vec![
            "--vo=null".into(), "--ao=pcm".into(), format!("--ao-pcm-file={}", out.display()), "--ao-pcm-waveheader=yes".into(),
            "--audio-format=s16".into(), format!("--audio-samplerate={rate}"),
        ],
    ];
    let mut last_err = String::new();
    for extra in attempts {
        let _ = std::fs::remove_file(out);
        if j.cancelled() {
            return Err(cancelled_msg());
        }
        let mut child = Command::new(&exe)
            .args(common)
            .args(&extra)
            .arg("--")
            .arg(input)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(NO_WINDOW)
            .spawn()
            .map_err(|e| tr!("mpv başlatılamadı: {}", "Couldn't start mpv: {}", e))?;
        let started = Instant::now();
        let mut last = Instant::now();
        let status = loop {
            match child.try_wait() {
                Ok(Some(s)) => break Some(s),
                Ok(None) => {}
                Err(e) => {
                    last_err = e.to_string();
                    break None;
                }
            }
            if j.cancelled() || started.elapsed() > Duration::from_secs(3 * 3600) {
                let _ = child.kill();
                let _ = child.wait();
                let _ = std::fs::remove_file(out);
                return Err(if j.cancelled() { cancelled_msg() } else { tr!("Zaman aşımı", "Timed out") });
            }
            if last.elapsed() > Duration::from_millis(400) {
                last = Instant::now();
                let done = std::fs::metadata(out).map(|m| m.len().saturating_sub(44) as f64 / (rate as f64 * 2.0)).unwrap_or(0.0);
                j.emit("audio", duration.filter(|d| *d > 1.0).map(|d| (done / d * 100.0).min(99.0)), "");
            }
            std::thread::sleep(Duration::from_millis(150));
        };
        let size = std::fs::metadata(out).map(|m| m.len()).unwrap_or(0);
        if status.is_some_and(|s| s.success()) && size > 4096 {
            // the file must really be mono at the wanted rate (Whisper refuses anything else)
            let right = std::fs::File::open(out)
                .ok()
                .and_then(|f| core::wav_header(&mut BufReader::new(f)).ok())
                .is_some_and(|h| h.rate == rate && h.channels == 1);
            if right {
                j.emit("audio", Some(100.0), "");
                return Ok(());
            }
            last_err = "unexpected audio format".into();
            continue;
        }
        if let Some(s) = status {
            last_err = format!("mpv {s}");
        }
    }
    let _ = std::fs::remove_file(out);
    Err(tr!("Ses çıkarılamadı ({})", "Couldn't extract the audio ({})", last_err))
}

/// Speech activity of a video, cached per file (a few hundred KB instead of the audio).
fn activity(j: &Job, mpv: &Path, video: &str, cache: &Path, duration: Option<f64>) -> Result<core::Activity, String> {
    let key = file_key(video);
    let vad = cache.join(format!("{key}.vad"));
    if let Some(a) = std::fs::read(&vad).ok().and_then(|b| core::decode_activity(&b)) {
        return Ok(a);
    }
    std::fs::create_dir_all(cache).map_err(|e| e.to_string())?;
    let wav = cache.join(format!("{key}-vad.wav"));
    extract_audio(j, mpv, video, &wav, 8000, duration)?;
    j.emit("analyse", None, "");
    let res = std::fs::File::open(&wav)
        .map_err(|e| e.to_string())
        .and_then(|f| core::frame_levels(&mut BufReader::with_capacity(1 << 20, f), &|| j.cancelled()));
    let _ = std::fs::remove_file(&wav);
    let (levels, _) = res.map_err(|e| if j.cancelled() { cancelled_msg() } else { e })?;
    let act = core::activity_from_levels(&levels, 0.05);
    let _ = std::fs::write(&vad, core::encode_activity(&act));
    Ok(act)
}

/// A sync result with the speech activity to draw (`preview`: '0'/'1' per `preview_step` seconds).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncOut {
    #[serde(flatten)]
    result: core::SyncResult,
    preview: String,
    preview_step: f64,
}

/// Lines an external subtitle file up with the video's speech: the delay (and a frame-rate
/// correction) to apply. Listens to the whole film once; later runs use the cached result.
#[tauri::command]
pub async fn studio_sync(app: AppHandle, job: u64, video: String, subtitle: String, duration: Option<f64>) -> Result<SyncOut, String> {
    if video.contains("://") {
        return Err(tr!("Sesle senkron yalnız bilgisayardaki dosyalarda çalışır", "Audio sync works only for files on this computer"));
    }
    let j = Job::start(&app, job)?;
    let mpv = crate::mpv_exe(&app);
    let cache = cache_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let cues = crate::subs::cues(&subtitle)?;
        if cues.len() < 3 {
            return Err(tr!("Altyazıda yeterli satır yok", "The subtitle has too few lines"));
        }
        let act = activity(&j, &mpv, &video, &cache, duration)?;
        j.emit("align", None, "");
        let result = core::align(&cues, &act, 120.0).ok_or_else(|| tr!("Altyazı sesle eşleştirilemedi", "Couldn't match the subtitle to the audio"))?;
        Ok(SyncOut { result, preview: core::activity_preview(&act, 0.5), preview_step: 0.5 })
    })
    .await
    .map_err(|e| e.to_string())?
}

// ---------- whisper ----------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    name: String,
    path: String,
    size: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WhisperStatus {
    /// whisper-cli.exe files found (Luna's downloads first, then a copy beside mpv, then PATH).
    engines: Vec<String>,
    models: Vec<ModelInfo>,
    models_dir: String,
    /// Models Luna can download, with their approximate size.
    offered: Vec<(String, u64)>,
    /// The voice-activity model (Silero) when downloaded.
    vad: Option<String>,
}

fn engine_candidates(app: &AppHandle) -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Ok(dir) = local_dir(app, "whisper") {
        for v in ["cuda", "cpu"] {
            out.push(dir.join("bin").join(v).join("whisper-cli.exe"));
        }
    }
    out.push(crate::mpv_exe(app).with_file_name("whisper").join("whisper-cli.exe"));
    if let Some(path) = std::env::var_os("PATH") {
        for d in std::env::split_paths(&path) {
            out.push(d.join("whisper-cli.exe"));
        }
    }
    out
}

/// What is installed for local transcription.
#[tauri::command]
pub async fn whisper_status(app: AppHandle) -> Result<WhisperStatus, String> {
    let models_dir = local_dir(&app, "whisper")?.join("models");
    let cands = engine_candidates(&app);
    tauri::async_runtime::spawn_blocking(move || {
        let mut engines: Vec<String> = Vec::new();
        for c in cands {
            let s = c.to_string_lossy().into_owned();
            if c.is_file() && !engines.iter().any(|e| e.eq_ignore_ascii_case(&s)) {
                engines.push(s);
            }
        }
        let mut models = Vec::new();
        if let Ok(rd) = std::fs::read_dir(&models_dir) {
            for e in rd.flatten() {
                let n = e.file_name().to_string_lossy().into_owned();
                if let Some(name) = n.strip_prefix("ggml-").and_then(|r| r.strip_suffix(".bin")).filter(|r| !r.starts_with("silero")) {
                    models.push(ModelInfo { name: name.to_string(), path: e.path().to_string_lossy().into_owned(), size: e.metadata().map(|m| m.len()).unwrap_or(0) });
                }
            }
        }
        models.sort_by(|a, b| a.size.cmp(&b.size));
        let offered = core::MODELS.iter().map(|(n, s)| (n.to_string(), *s)).collect();
        let vad = models_dir.join(SILERO_FILE);
        let vad = vad.is_file().then(|| vad.to_string_lossy().into_owned());
        Ok(WhisperStatus { engines, models, models_dir: models_dir.to_string_lossy().into_owned(), offered, vad })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Streams `url` into `dest`, checking cancellation, the size limit and (when given) the exact
/// size and SHA-256. Returns the number of bytes written.
async fn download(j: &Job, url: &str, dest: &Path, max: u64, expect: Option<(&str, u64)>) -> Result<u64, String> {
    use sha2::Digest;
    let client = reqwest::Client::builder()
        .user_agent("Luna Player")
        .connect_timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;
    let mut res = client
        .get(url)
        .send()
        .await
        .map_err(|e| tr!("İndirilemedi: {}", "Download failed: {}", e))?
        .error_for_status()
        .map_err(|e| tr!("İndirilemedi: {}", "Download failed: {}", e))?;
    let total = res.content_length();
    if total.is_some_and(|t| t > max) {
        return Err(tr!("Dosya beklenenden büyük", "The file is larger than expected"));
    }
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut f = std::fs::File::create(dest).map_err(|e| e.to_string())?;
    let mut hasher = sha2::Sha256::new();
    let mut whole: Option<Vec<u8>> = expect.filter(|(_, size)| *size <= 8_000_000).map(|(_, size)| Vec::with_capacity(size as usize));
    let (mut done, mut last) = (0u64, Instant::now());
    let fail = |dest: &Path, msg: String| {
        let _ = std::fs::remove_file(dest);
        Err(msg)
    };
    loop {
        if j.cancelled() {
            drop(f);
            return fail(dest, cancelled_msg());
        }
        let chunk = match res.chunk().await {
            Ok(Some(c)) => c,
            Ok(None) => break,
            Err(e) => {
                drop(f);
                return fail(dest, tr!("İndirme yarıda kaldı: {}", "The download stopped: {}", e));
            }
        };
        done += chunk.len() as u64;
        if done > max {
            drop(f);
            return fail(dest, tr!("Dosya beklenenden büyük", "The file is larger than expected"));
        }
        hasher.update(&chunk);
        if let Some(w) = whole.as_mut() {
            w.extend_from_slice(&chunk);
        }
        if let Err(e) = f.write_all(&chunk) {
            drop(f);
            return fail(dest, e.to_string());
        }
        if last.elapsed() > Duration::from_millis(300) {
            last = Instant::now();
            j.emit("download", total.map(|t| done as f64 / t as f64 * 100.0), &format!("{} MB", done / 1_000_000));
        }
    }
    if let Err(e) = f.flush() {
        drop(f);
        return fail(dest, e.to_string());
    }
    drop(f);
    if let Some((sha, size)) = expect {
        // small archives are checked a second time over the whole buffer (same function as the tests use)
        let got: String = match whole.as_deref() {
            Some(w) => core::sha256_hex(w),
            None => hasher.finalize().iter().map(|b| format!("{b:02x}")).collect(),
        };
        if done != size || got != sha {
            return fail(dest, tr!("İndirilen dosya doğrulanamadı (boyut/SHA-256 tutmuyor)", "The downloaded file failed verification (size/SHA-256 mismatch)"));
        }
    }
    j.emit("download", Some(100.0), "");
    Ok(done)
}

/// Downloads one of the offered ggml Whisper models into Luna's data folder.
#[tauri::command]
pub async fn whisper_get_model(app: AppHandle, job: u64, name: String) -> Result<String, String> {
    let url = core::model_url(&name).ok_or_else(|| tr!("Bilinmeyen model", "Unknown model"))?;
    let min = core::model_min_size(&name).unwrap_or(0);
    let j = Job::start(&app, job)?;
    let dir = local_dir(&app, "whisper")?.join("models");
    let part = dir.join(format!("ggml-{name}.bin.part"));
    let done = download(&j, &url, &part, 4_000_000_000, None).await?;
    if done < min {
        let _ = std::fs::remove_file(&part);
        return Err(tr!("Model eksik indi, tekrar dene", "The model arrived incomplete; try again"));
    }
    let fin = dir.join(format!("ggml-{name}.bin"));
    std::fs::rename(&part, &fin).map_err(|e| e.to_string())?;
    Ok(fin.to_string_lossy().into_owned())
}

/// Downloads the Silero voice-activity model (0.9 MB, verified) next to the Whisper models.
#[tauri::command]
pub async fn whisper_get_vad(app: AppHandle, job: u64) -> Result<String, String> {
    let j = Job::start(&app, job)?;
    let dir = local_dir(&app, "whisper")?.join("models");
    let part = dir.join(format!("{SILERO_FILE}.part"));
    download(&j, SILERO.0, &part, SILERO.2 + 1, Some((SILERO.1, SILERO.2))).await?;
    let fin = dir.join(SILERO_FILE);
    std::fs::rename(&part, &fin).map_err(|e| e.to_string())?;
    Ok(fin.to_string_lossy().into_owned())
}

/// Takes only `exts` files out of a ZIP into `dest` (flattened, checked names and sizes).
fn unzip_flat(zip_path: &Path, dest: &Path, exts: &[&str], per_file: u64, total_max: u64) -> Result<Vec<String>, String> {
    let file = std::fs::File::open(zip_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    let tmp = dest.with_extension("luna-new");
    let _ = std::fs::remove_dir_all(&tmp);
    std::fs::create_dir_all(&tmp).map_err(|e| e.to_string())?;
    let (mut total, mut names) = (0u64, Vec::new());
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
        if entry.is_dir() {
            continue;
        }
        let Some(name) = core::safe_entry_name(entry.name(), exts) else { continue };
        if entry.size() > per_file || names.iter().any(|n: &String| n.eq_ignore_ascii_case(&name)) {
            continue;
        }
        total += entry.size();
        if total > total_max {
            let _ = std::fs::remove_dir_all(&tmp);
            return Err(tr!("Arşiv beklenenden büyük", "The archive is larger than expected"));
        }
        let mut out = std::fs::File::create(tmp.join(&name)).map_err(|e| e.to_string())?;
        // bounded copy: a lying size field can't write more than allowed
        let copied = std::io::copy(&mut (&mut entry).take(per_file + 1), &mut out).map_err(|e| e.to_string())?;
        if copied > per_file {
            let _ = std::fs::remove_dir_all(&tmp);
            return Err(tr!("Arşiv beklenenden büyük", "The archive is larger than expected"));
        }
        names.push(name);
    }
    if names.is_empty() {
        let _ = std::fs::remove_dir_all(&tmp);
        return Err(tr!("Arşivde beklenen dosyalar yok", "The archive doesn't contain the expected files"));
    }
    let _ = std::fs::remove_dir_all(dest);
    std::fs::rename(&tmp, dest).map_err(|e| e.to_string())?;
    Ok(names)
}

/// Downloads whisper.cpp for Windows ("cpu" or "cuda", the NVIDIA build), verified, into Luna's
/// data folder. Returns the path of whisper-cli.exe.
#[tauri::command]
pub async fn whisper_get_engine(app: AppHandle, job: u64, variant: String) -> Result<String, String> {
    let (_, url, sha, size) = *ENGINES.iter().find(|e| e.0 == variant).ok_or_else(|| tr!("Bilinmeyen sürüm", "Unknown build"))?;
    let j = Job::start(&app, job)?;
    let zip_path = cache_dir(&app)?.join(format!("whisper-{variant}.zip"));
    download(&j, url, &zip_path, size + 1, Some((sha, size))).await?;
    j.emit("unpack", None, "");
    let dest = local_dir(&app, "whisper")?.join("bin").join(&variant);
    let zp = zip_path.clone();
    let names = tauri::async_runtime::spawn_blocking(move || unzip_flat(&zp, &dest, &["exe", "dll"], 700_000_000, 1_500_000_000).map(|n| (n, dest)))
        .await
        .map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(&zip_path);
    let (names, dest) = names?;
    if !names.iter().any(|n| n.eq_ignore_ascii_case("whisper-cli.exe")) {
        return Err(tr!("Arşivde whisper-cli.exe yok", "whisper-cli.exe is missing from the archive"));
    }
    Ok(dest.join("whisper-cli.exe").to_string_lossy().into_owned())
}

fn valid_lang(l: &str) -> bool {
    l == "auto" || ((2..=3).contains(&l.len()) && l.chars().all(|c| c.is_ascii_lowercase()))
}

/// Transcribes `input` (a video, an audio file or a link) with whisper.cpp; returns the SRT text.
/// `translate` asks Whisper for an English translation instead of the spoken language.
#[tauri::command]
pub async fn whisper_run(
    app: AppHandle,
    job: u64,
    input: String,
    engine: String,
    model: String,
    lang: String,
    translate: bool,
    duration: Option<f64>,
    prompt: Option<String>,
    vad: Option<bool>,
    preset: Option<String>,
) -> Result<String, String> {
    let engine = PathBuf::from(engine);
    let is_exe = engine.extension().is_some_and(|x| x.eq_ignore_ascii_case("exe"));
    if !is_exe || !engine.is_file() {
        return Err(tr!("Whisper motoru bulunamadı", "The Whisper engine wasn't found"));
    }
    if !Path::new(&model).is_file() || !model.to_lowercase().ends_with(".bin") {
        return Err(tr!("Whisper modeli bulunamadı", "The Whisper model wasn't found"));
    }
    if !valid_lang(&lang) {
        return Err(tr!("Geçersiz dil kodu", "Invalid language code"));
    }
    let model = ascii_path(Path::new(&model))?.to_string_lossy().into_owned();
    let vad_model = if vad.unwrap_or(false) {
        let p = local_dir(&app, "whisper")?.join("models").join(SILERO_FILE);
        if !p.is_file() {
            return Err(tr!("Sessizlik algılama modeli indirilmemiş", "The voice-activity model isn't downloaded"));
        }
        Some(ascii_path(&p)?.to_string_lossy().into_owned())
    } else {
        None
    };
    let j = Job::start(&app, job)?;
    let mpv = crate::mpv_exe(&app);
    let cache = cache_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let cache = work_dir(&cache)?;
        let base = cache.join(format!("whisper-{job}"));
        let wav = base.with_extension("wav");
        let srt = base.with_extension("srt");
        let cleanup = || {
            let _ = std::fs::remove_file(&wav);
            let _ = std::fs::remove_file(&srt);
        };
        if let Err(e) = extract_audio(&j, &mpv, &input, &wav, 16_000, duration) {
            cleanup();
            return Err(e);
        }
        j.emit("transcribe", Some(0.0), "");
        let threads = std::thread::available_parallelism().map(|n| n.get().clamp(1, 8)).unwrap_or(4);
        let mut cmd = Command::new(&engine);
        if let Some(dir) = engine.parent() {
            cmd.current_dir(dir);
        }
        // names of the film and its characters help Whisper spell them; only plain ASCII survives
        // whisper-cli's code-page command line, so anything else is left out (the UI builds it so)
        let prompt_ok = prompt.as_deref().map(str::trim).filter(|p| !p.is_empty() && p.is_ascii() && p.len() <= 600);
        let (wav_s, base_s) = (wav.to_string_lossy().into_owned(), base.to_string_lossy().into_owned());
        cmd.args(shell::whisper_args(&shell::WhisperOpts {
            model: &model,
            wav: &wav_s,
            base: &base_s,
            lang: &lang,
            translate,
            threads,
            prompt: prompt_ok,
            vad_model: vad_model.as_deref(),
            preset: preset.as_deref().unwrap_or("balanced"),
        }));
        let mut child = cmd
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .creation_flags(NO_WINDOW)
            .spawn()
            .map_err(|e| {
                cleanup();
                tr!("Whisper başlatılamadı: {}", "Couldn't start Whisper: {}", e)
            })?;
        let (tx, rx) = std::sync::mpsc::channel::<String>();
        let err = child.stderr.take();
        let reader = std::thread::spawn(move || {
            if let Some(e) = err {
                for line in BufReader::new(e).lines().map_while(Result::ok) {
                    if tx.send(line).is_err() {
                        break;
                    }
                }
            }
        });
        let mut tail: Vec<String> = Vec::new();
        let status = loop {
            while let Ok(line) = rx.try_recv() {
                if let Some(p) = core::whisper_progress(&line) {
                    j.emit("transcribe", Some(p as f64), "");
                } else if !line.trim().is_empty() {
                    tail.push(line);
                    if tail.len() > 12 {
                        tail.remove(0);
                    }
                }
            }
            match child.try_wait() {
                Ok(Some(s)) => break Ok(s),
                Ok(None) => {}
                Err(e) => break Err(e.to_string()),
            }
            if j.cancelled() {
                let _ = child.kill();
                let _ = child.wait();
                break Err(cancelled_msg());
            }
            std::thread::sleep(Duration::from_millis(200));
        };
        let _ = reader.join();
        let result = match status {
            Ok(s) if s.success() => std::fs::read(&srt)
                .map(|b| String::from_utf8_lossy(&b).into_owned())
                .map_err(|_| tr!("Whisper çıktı üretmedi", "Whisper produced no output")),
            Ok(s) => Err(tr!("Whisper hata verdi ({}): {}", "Whisper failed ({}): {}", s, tail.join(" | ").chars().take(600).collect::<String>())),
            Err(e) => Err(e),
        };
        cleanup();
        result
    })
    .await
    .map_err(|e| e.to_string())?
}

// ---------- shaders ----------

/// The Anime4K shader files Luna has (full paths), empty when not downloaded.
#[tauri::command]
pub async fn shaders_status(app: AppHandle) -> Result<Vec<String>, String> {
    let dir = local_dir(&app, "shaders")?.join("anime4k");
    let mut out: Vec<String> = std::fs::read_dir(&dir)
        .map(|rd| {
            rd.flatten()
                .map(|e| e.path())
                .filter(|p| p.extension().is_some_and(|x| x.eq_ignore_ascii_case("glsl")))
                .map(|p| p.to_string_lossy().into_owned())
                .collect()
        })
        .unwrap_or_default();
    out.sort();
    Ok(out)
}

/// Downloads the Anime4K shaders (official release, verified) for mpv's GPU renderer.
#[tauri::command]
pub async fn shaders_get(app: AppHandle, job: u64) -> Result<Vec<String>, String> {
    let j = Job::start(&app, job)?;
    let (url, sha, size) = ANIME4K;
    let zip_path = cache_dir(&app)?.join("anime4k.zip");
    download(&j, url, &zip_path, size + 1, Some((sha, size))).await?;
    let dest = local_dir(&app, "shaders")?.join("anime4k");
    let zp = zip_path.clone();
    let res = tauri::async_runtime::spawn_blocking(move || unzip_flat(&zp, &dest, &["glsl"], 2_000_000, 20_000_000))
        .await
        .map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(&zip_path);
    res?;
    drop(j);
    shaders_status(app).await
}

// ---------- subtitle files ----------

const SUB_EXT: [&str; 4] = ["srt", "vtt", "ass", "ssa"];

/// A subtitle file's text (UTF-8 or UTF-16 with BOM), for the transcript panel and the studio.
#[tauri::command]
pub async fn subtitle_text(file: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let p = Path::new(&file);
        let ext = p.extension().and_then(|x| x.to_str()).unwrap_or("").to_lowercase();
        if !SUB_EXT.contains(&ext.as_str()) {
            return Err(tr!("Metin altyazısı değil", "Not a text subtitle"));
        }
        let size = std::fs::metadata(p).map_err(|e| e.to_string())?.len();
        if size > 20_000_000 {
            return Err(tr!("Dosya çok büyük", "The file is too big"));
        }
        let raw = std::fs::read(p).map_err(|e| e.to_string())?;
        Ok(crate::subs::decode_text(&raw))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Saves a new subtitle next to the video ("Film.tr.srt", numbered when taken; Luna's cache when
/// the folder is read-only). Returns where it went.
#[tauri::command]
pub async fn subtitle_save(app: AppHandle, video: String, lang: String, text: String) -> Result<String, String> {
    if text.len() > 20_000_000 || !text.contains("-->") {
        return Err(tr!("Kaydedilecek altyazı geçersiz", "The subtitle to save is invalid"));
    }
    let cache = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("subtitles");
    tauri::async_runtime::spawn_blocking(move || crate::subs::save_named(&video, &lang, "srt", cache, text.as_bytes()))
        .await
        .map_err(|e| e.to_string())?
}

/// Replaces the text of an SRT/VTT subtitle (edits from the transcript panel). The original is
/// kept once in Luna's cache (subtitles/backup) before the first change.
#[tauri::command]
pub async fn subtitle_overwrite(app: AppHandle, file: String, text: String) -> Result<String, String> {
    let backup_dir = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("subtitles").join("backup");
    tauri::async_runtime::spawn_blocking(move || {
        let p = Path::new(&file);
        let ext = p.extension().and_then(|x| x.to_str()).unwrap_or("").to_lowercase();
        if !(ext == "srt" || ext == "vtt") || !p.is_file() {
            return Err(tr!("Yalnız SRT ve VTT dosyaları düzenlenebilir", "Only SRT and VTT files can be edited"));
        }
        if text.len() > 20_000_000 || !text.contains("-->") {
            return Err(tr!("Kaydedilecek altyazı geçersiz", "The subtitle to save is invalid"));
        }
        std::fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;
        let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("subtitle.srt");
        let keep = backup_dir.join(format!("{}-{}", file_key(&file).get(..8).unwrap_or("0"), name));
        let first = !keep.exists();
        if first {
            std::fs::copy(p, &keep).map_err(|e| e.to_string())?;
        }
        write_atomic(p, text.as_bytes())?;
        Ok(if first { keep.to_string_lossy().into_owned() } else { String::new() })
    })
    .await
    .map_err(|e| e.to_string())?
}

// ---------- automatic backup ----------

/// Writes one automatic backup ("Luna auto-backup <date>.json") into `dir` and moves the oldest
/// of Luna's own automatic backups beyond `keep` to the Recycle Bin. Other files are never touched.
#[tauri::command]
pub async fn backup_auto(dir: String, name: String, json: String, keep: u32) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if !name.starts_with("Luna auto-backup ") || !name.ends_with(".json") || name.contains(['/', '\\', ':']) || name.len() > 80 {
            return Err("invalid backup name".into());
        }
        let d = Path::new(&dir);
        if !d.is_dir() {
            return Err(tr!("Yedek klasörü bulunamadı", "The backup folder wasn't found"));
        }
        let target = d.join(&name);
        write_atomic(&target, json.as_bytes()).map_err(|e| tr!("Yedek kaydedilemedi: {}", "Couldn't save the backup: {}", e))?;
        let names: Vec<String> = std::fs::read_dir(d)
            .map(|rd| rd.flatten().filter(|e| e.path().is_file()).map(|e| e.file_name().to_string_lossy().into_owned()).collect())
            .unwrap_or_default();
        for old in core::backups_to_prune(&names, keep.clamp(1, 100) as usize) {
            let _ = trash::delete(d.join(old));
        }
        Ok(target.to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| e.to_string())?
}


// ---------- library health: fingerprints ----------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Fingerprint {
    path: String,
    size: u64,
    /// OpenSubtitles hash (size + the first and last 64 KiB): equal size and hash mean the same file content for every practical purpose.
    hash: Option<String>,
}

/// Size and quick hash of up to 20 000 video files, for finding copies of the same file under
/// different names. Reads 128 KiB per file; progress and cancel like every studio job.
#[tauri::command]
pub async fn library_fingerprints(app: AppHandle, job: u64, paths: Vec<String>) -> Result<Vec<Fingerprint>, String> {
    if paths.len() > 20_000 {
        return Err(tr!("Çok fazla dosya (en çok 20 000)", "Too many files (20 000 at most)"));
    }
    let j = Job::start(&app, job)?;
    tauri::async_runtime::spawn_blocking(move || {
        let total = paths.len().max(1) as f64;
        let mut out = Vec::with_capacity(paths.len());
        let mut last = Instant::now();
        for (i, p) in paths.into_iter().enumerate() {
            if j.cancelled() {
                return Err(cancelled_msg());
            }
            if p.contains("://") {
                continue;
            }
            let path = Path::new(&p);
            let Ok(meta) = std::fs::metadata(path) else { continue };
            if !meta.is_file() {
                continue;
            }
            let hash = if meta.len() >= 65_536 { crate::subs::movie_hash(path).ok() } else { None };
            out.push(Fingerprint { path: p, size: meta.len(), hash });
            if last.elapsed() > Duration::from_millis(300) {
                last = Instant::now();
                j.emit("scan", Some(i as f64 / total * 100.0), "");
            }
        }
        j.emit("scan", Some(100.0), "");
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}

// ---------- clip maker ----------

/// Cuts `start..end` of a video into an MP4, WebM or GIF with mpv's own encoder (no ffmpeg
/// needed), optionally with the subtitles burnt in and a size cap in megabytes. Returns the file.
#[tauri::command]
pub async fn make_clip(
    app: AppHandle,
    job: u64,
    input: String,
    out: String,
    format: String,
    start: f64,
    end: f64,
    sub_file: Option<String>,
    burn_subs: bool,
    max_mb: Option<u32>,
    src_height: Option<u32>,
) -> Result<String, String> {
    let target = PathBuf::from(&out);
    let parent_ok = target.parent().is_some_and(|p| p.is_dir());
    if !parent_ok || input.is_empty() {
        return Err(tr!("Kayıt klasörü bulunamadı", "The destination folder wasn't found"));
    }
    let sub_arg = sub_file.filter(|f| !f.contains("://") && Path::new(f).is_file());
    let args = shell::clip_args(&shell::ClipOpts {
        out: &out,
        format: &format,
        start,
        end,
        sub_file: sub_arg.as_deref(),
        burn_subs,
        max_mb,
        src_height,
        max_height: 720,
    })?;
    let j = Job::start(&app, job)?;
    let mpv = crate::mpv_exe(&app);
    let expected: Option<u64> = max_mb.filter(|m| *m > 0).map(|m| m as u64 * 1_000_000);
    tauri::async_runtime::spawn_blocking(move || {
        let com = mpv.with_file_name("mpv.com");
        let exe = if com.exists() { com } else { mpv };
        let part = target.with_file_name(format!(".{}.luna-clip", target.file_name().and_then(|n| n.to_str()).unwrap_or("clip")));
        // encode into a temporary name, then rename: a cancelled or failed run never leaves half a clip under the real name
        let mut args = args;
        for a in args.iter_mut() {
            if a.starts_with("--o=") {
                *a = format!("--o={}", part.display());
            }
        }
        let mut child = Command::new(&exe)
            .args(&args)
            .arg("--")
            .arg(&input)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(NO_WINDOW)
            .spawn()
            .map_err(|e| tr!("mpv başlatılamadı: {}", "Couldn't start mpv: {}", e))?;
        let started = Instant::now();
        let mut last = Instant::now();
        let status = loop {
            match child.try_wait() {
                Ok(Some(s)) => break s,
                Ok(None) => {}
                Err(e) => {
                    let _ = std::fs::remove_file(&part);
                    return Err(e.to_string());
                }
            }
            if j.cancelled() || started.elapsed() > Duration::from_secs(1800) {
                let _ = child.kill();
                let _ = child.wait();
                let _ = std::fs::remove_file(&part);
                return Err(if j.cancelled() { cancelled_msg() } else { tr!("Zaman aşımı", "Timed out") });
            }
            if last.elapsed() > Duration::from_millis(400) {
                last = Instant::now();
                let size = std::fs::metadata(&part).map(|m| m.len()).unwrap_or(0);
                j.emit("clip", expected.map(|e| (size as f64 / e as f64 * 100.0).min(98.0)), &format!("{} KB", size / 1000));
            }
            std::thread::sleep(Duration::from_millis(120));
        };
        let size = std::fs::metadata(&part).map(|m| m.len()).unwrap_or(0);
        if !status.success() || size < 1024 {
            let _ = std::fs::remove_file(&part);
            return Err(tr!("Klip oluşturulamadı (mpv kodlayıcısı çalışmadı)", "Couldn't make the clip (mpv's encoder didn't finish)"));
        }
        let _ = std::fs::remove_file(&target);
        std::fs::rename(&part, &target).map_err(|e| e.to_string())?;
        j.emit("clip", Some(100.0), "");
        Ok(target.to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| e.to_string())?
}

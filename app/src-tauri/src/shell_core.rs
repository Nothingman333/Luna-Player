//! Pure helpers behind the Windows shell features and the new studio commands, kept free of
//! Windows, Tauri and child processes so they run in plain `cargo test` on any machine:
//! which library a changed file belongs to, a debouncer for bursts of file events, the exact
//! `whisper-cli` command line for a preset, and the mpv encode command line of the clip maker.

use std::collections::BTreeSet;

pub const FILM_EXT: &[&str] = &["mkv", "mp4", "avi", "mov", "wmv", "webm", "m4v", "ts", "m2ts", "flv", "mpg", "mpeg"];
pub const MUSIC_EXT: &[&str] = &["mp3", "flac", "m4a", "aac", "ogg", "oga", "opus", "wav", "wma", "ape", "alac"];
pub const BOOK_EXT: &[&str] = &["epub", "pdf", "cbz", "cbr", "mobi", "azw3", "fb2"];

/// A path in a comparable form: lower case, forward slashes, no trailing slash.
pub fn norm(p: &str) -> String {
    p.replace('\\', "/").trim_end_matches('/').to_lowercase()
}

fn inside(path: &str, root: &str) -> bool {
    !root.is_empty() && (path == root || path.starts_with(&format!("{root}/")))
}

/// "film", "music" or "book": the library whose folder holds `path` (the deepest folder wins, so a
/// music folder inside a film folder keeps its own files).
pub fn classify(path: &str, film: &[String], music: &[String], books: &[String]) -> Option<&'static str> {
    let p = norm(path);
    let mut best: Option<(usize, &'static str)> = None;
    for (kind, roots) in [("film", film), ("music", music), ("book", books)] {
        for r in roots {
            let r = norm(r);
            if inside(&p, &r) && best.is_none_or(|(len, _)| r.len() > len) {
                best = Some((r.len(), kind));
            }
        }
    }
    best.map(|(_, k)| k)
}

/// A file worth a rescan: a media file of that library, not a temporary or half-written one.
pub fn is_relevant(kind: &str, path: &str) -> bool {
    let name = path.rsplit(['/', '\\']).next().unwrap_or("").to_lowercase();
    if name.is_empty() || name.starts_with('.') || name.starts_with("~$") || name.ends_with(".luna-tmp") || name.ends_with(".part") || name.ends_with(".tmp") || name == "thumbs.db" {
        return false;
    }
    let Some(ext) = name.rsplit_once('.').map(|(_, e)| e) else { return false };
    match kind {
        "film" => FILM_EXT.contains(&ext),
        "music" => MUSIC_EXT.contains(&ext),
        "book" => BOOK_EXT.contains(&ext),
        _ => false,
    }
}

/// Collects kinds from bursts of file events and says when they are quiet enough to act on (a
/// film being copied sends events for minutes; one rescan after it stops is enough).
#[derive(Default, Debug)]
pub struct Debounce {
    kinds: BTreeSet<String>,
    paths: Vec<String>,
    first: Option<f64>,
    last: f64,
}

impl Debounce {
    pub fn push(&mut self, kind: &str, path: &str, now: f64) {
        if self.first.is_none() {
            self.first = Some(now);
        }
        self.last = now;
        self.kinds.insert(kind.to_string());
        if self.paths.len() < 20 && !self.paths.iter().any(|p| p == path) {
            self.paths.push(path.to_string());
        }
    }
    /// The collected kinds and paths when no event came for `quiet` seconds, or when events have
    /// kept coming for `max_wait` seconds (so a never-ending copy doesn't postpone forever).
    pub fn take(&mut self, now: f64, quiet: f64, max_wait: f64) -> Option<(Vec<String>, Vec<String>)> {
        let first = self.first?;
        if now - self.last < quiet && now - first < max_wait {
            return None;
        }
        self.first = None;
        let out = (self.kinds.iter().cloned().collect(), std::mem::take(&mut self.paths));
        self.kinds.clear();
        Some(out)
    }
}

// ---------- Whisper ----------

pub struct WhisperOpts<'a> {
    pub model: &'a str,
    pub wav: &'a str,
    pub base: &'a str,
    pub lang: &'a str,
    pub translate: bool,
    pub threads: usize,
    pub prompt: Option<&'a str>,
    pub vad_model: Option<&'a str>,
    pub preset: &'a str,
}

/// The `whisper-cli` arguments (whisper.cpp v1.8.4 flags). Presets: "fast" (greedy, no
/// temperature fallback), "balanced" (defaults, non-speech tokens suppressed, the default) and
/// "quality" (beam search). A prompt is carried into every window so the names stay spelled right;
/// VAD (Silero) lets Whisper skip silence and music instead of inventing lines in them.
pub fn whisper_args(o: &WhisperOpts) -> Vec<String> {
    let mut a: Vec<String> = ["-m", o.model, "-f", o.wav, "-of", o.base, "-osrt", "-pp", "-t"].iter().map(|s| s.to_string()).collect();
    a.push(o.threads.clamp(1, 16).to_string());
    a.push("-l".into());
    a.push(o.lang.into());
    if o.translate {
        a.push("-tr".into());
    }
    let preset: &[&str] = match o.preset {
        "fast" => &["-bs", "1", "-bo", "1", "-nf"],
        "quality" => &["-bs", "8", "-sns"],
        _ => &["-sns"],
    };
    a.extend(preset.iter().map(|s| s.to_string()));
    if let Some(p) = o.prompt.map(str::trim).filter(|p| !p.is_empty()) {
        a.push("--prompt".into());
        a.push(p.into());
        a.push("--carry-initial-prompt".into());
    }
    if let Some(v) = o.vad_model {
        a.push("--vad".into());
        a.push("-vm".into());
        a.push(v.into());
    }
    a
}

// ---------- clip maker ----------

pub struct ClipOpts<'a> {
    pub out: &'a str,
    pub format: &'a str,
    pub start: f64,
    pub end: f64,
    pub sub_file: Option<&'a str>,
    pub burn_subs: bool,
    pub max_mb: Option<u32>,
    pub src_height: Option<u32>,
    pub max_height: u32,
}

/// Video bitrate (kbit/s) that keeps `secs` of video plus `audio_kbps` of sound under `max_mb`
/// megabytes (5 % headroom for the container); never below 150.
pub fn video_kbps(max_mb: u32, secs: f64, audio_kbps: u32) -> u32 {
    let total = max_mb as f64 * 8.0 * 1000.0 * 0.95; // kilobit
    ((total / secs.max(0.5)) - audio_kbps as f64).max(150.0).round() as u32
}

/// mpv's encode mode as arguments (the input file goes last, after `--`); `Err` names what is wrong.
pub fn clip_args(o: &ClipOpts) -> Result<Vec<String>, String> {
    let secs = o.end - o.start;
    if !(o.start.is_finite() && o.end.is_finite()) || o.start < 0.0 || !(0.5..=600.0).contains(&secs) {
        return Err("The clip must be between half a second and ten minutes".into());
    }
    let ext_ok = o.out.to_lowercase().ends_with(&format!(".{}", o.format));
    if !["mp4", "webm", "gif"].contains(&o.format) || !ext_ok {
        return Err("The file name must end with the chosen format".into());
    }
    let mut a: Vec<String> = ["--no-config", "--really-quiet", "--load-scripts=no"].iter().map(|s| s.to_string()).collect();
    a.push(format!("--start={:.3}", o.start));
    a.push(format!("--end={:.3}", o.end));
    match (o.burn_subs, o.sub_file) {
        (true, Some(f)) => {
            a.push(format!("--sub-file={f}"));
            a.push("--sid=1".into());
        }
        (true, None) => a.push("--sid=auto".into()),
        _ => a.push("--sid=no".into()),
    }
    a.push("--sub-auto=no".into());
    let too_tall = o.src_height.is_some_and(|h| h > o.max_height);
    let scale = if too_tall { format!("scale=-2:{}", o.max_height) } else { String::new() };
    a.push(format!("--o={}", o.out));
    a.push(format!("--of={}", o.format));
    let cap = o.max_mb.filter(|m| *m > 0);
    match o.format {
        "mp4" => {
            let vf = [scale.as_str(), "format=yuv420p"].iter().filter(|s| !s.is_empty()).cloned().collect::<Vec<_>>().join(",");
            a.push(format!("--vf=lavfi=[{vf}]"));
            a.push("--ovc=libx264".into());
            a.push(match cap {
                Some(m) => {
                    let k = video_kbps(m, secs, 128);
                    format!("--ovcopts=preset=veryfast,b={k}k,maxrate={}k,bufsize={}k", k * 6 / 5, k * 2)
                }
                None => "--ovcopts=preset=veryfast,crf=23".into(),
            });
            a.push("--oac=aac".into());
            a.push("--oacopts=b=128k".into());
        }
        "webm" => {
            let vf = [scale.as_str(), "format=yuv420p"].iter().filter(|s| !s.is_empty()).cloned().collect::<Vec<_>>().join(",");
            a.push(format!("--vf=lavfi=[{vf}]"));
            a.push("--ovc=libvpx-vp9".into());
            a.push(match cap {
                Some(m) => format!("--ovcopts=b={}k,cpu-used=4,row-mt=1,deadline=good", video_kbps(m, secs, 96)),
                None => "--ovcopts=b=0,crf=33,cpu-used=4,row-mt=1,deadline=good".into(),
            });
            a.push("--oac=libopus".into());
            a.push("--oacopts=b=96k".into());
        }
        _ => {
            a.push("--aid=no".into());
            a.push("--vf=lavfi=[fps=12,scale=480:-2:flags=lanczos]".into());
            a.push("--ovc=gif".into());
        }
    }
    Ok(a)
}

// ---------- images handed between the page and the disk (quote cards, recap cards) ----------

const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/// Standard base64 with padding.
pub fn b64_encode(data: &[u8]) -> String {
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for chunk in data.chunks(3) {
        let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
        let n = ((b[0] as u32) << 16) | ((b[1] as u32) << 8) | b[2] as u32;
        for i in 0..4 {
            if i <= chunk.len() {
                out.push(B64[((n >> (18 - 6 * i)) & 63) as usize] as char);
            } else {
                out.push('=');
            }
        }
    }
    out
}

/// Standard base64 (whitespace ignored, padding optional); `Err` on any other character.
pub fn b64_decode(s: &str) -> Result<Vec<u8>, String> {
    let mut out = Vec::with_capacity(s.len() / 4 * 3);
    let (mut acc, mut bits) = (0u32, 0u32);
    for c in s.bytes() {
        let v = match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => c - b'a' + 26,
            b'0'..=b'9' => c - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            b'=' => break,
            b' ' | b'\n' | b'\r' | b'\t' => continue,
            _ => return Err("invalid base64".into()),
        } as u32;
        acc = (acc << 6) | v;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((acc >> bits) as u8);
            acc &= (1 << bits) - 1;
        }
    }
    Ok(out)
}

/// `data:image/png;base64,...` (or jpeg) → its type and bytes. Other kinds of data are refused.
pub fn data_url_bytes(url: &str) -> Result<(&'static str, Vec<u8>), String> {
    let (head, body) = url.split_once(',').ok_or("not a data address")?;
    let mime = match head {
        "data:image/png;base64" => "png",
        "data:image/jpeg;base64" => "jpeg",
        _ => return Err("only PNG or JPEG pictures can be saved".into()),
    };
    let bytes = b64_decode(body)?;
    let magic_ok = match mime {
        "png" => bytes.starts_with(&[0x89, b'P', b'N', b'G']),
        _ => bytes.starts_with(&[0xFF, 0xD8, 0xFF]),
    };
    if !magic_ok {
        return Err("the picture data is damaged".into());
    }
    Ok((mime, bytes))
}

/// The file name fits the picture: .png for PNG, .jpg/.jpeg for JPEG.
pub fn image_target_ok(path: &str, mime: &str) -> bool {
    let p = path.to_lowercase();
    match mime {
        "png" => p.ends_with(".png"),
        "jpeg" => p.ends_with(".jpg") || p.ends_with(".jpeg"),
        _ => false,
    }
}

// ---------- ComicInfo.xml (the metadata comic archives carry) ----------

#[derive(Debug, Default, PartialEq, Eq, Clone)]
pub struct ComicInfo {
    pub series: Option<String>,
    pub number: Option<String>,
    pub title: Option<String>,
    pub writer: Option<String>,
    pub lang: Option<String>,
}

fn xml_unescape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(i) = rest.find('&') {
        out.push_str(&rest[..i]);
        let tail = &rest[i..];
        let Some(end) = tail.find(';').filter(|e| *e <= 10) else {
            out.push('&');
            rest = &tail[1..];
            continue;
        };
        let ent = &tail[1..end];
        let ch = match ent {
            "amp" => Some('&'),
            "lt" => Some('<'),
            "gt" => Some('>'),
            "quot" => Some('"'),
            "apos" => Some('\''),
            _ => ent
                .strip_prefix("#x")
                .or_else(|| ent.strip_prefix("#X"))
                .and_then(|h| u32::from_str_radix(h, 16).ok())
                .or_else(|| ent.strip_prefix('#').and_then(|d| d.parse::<u32>().ok()))
                .and_then(char::from_u32),
        };
        match ch {
            Some(c) => {
                out.push(c);
                rest = &tail[end + 1..];
            }
            None => {
                out.push('&');
                rest = &tail[1..];
            }
        }
    }
    out.push_str(rest);
    out
}

/// The text of the first `<tag>…</tag>` (CDATA unwrapped, entities decoded, trimmed, at most 300 characters).
fn xml_tag(xml: &str, tag: &str) -> Option<String> {
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    let a = xml.find(&open)? + open.len();
    let b = a + xml[a..].find(&close)?;
    let raw = xml[a..b].trim();
    let raw = raw.strip_prefix("<![CDATA[").and_then(|r| r.strip_suffix("]]>")).unwrap_or(raw);
    let text: String = xml_unescape(raw).chars().filter(|c| !c.is_control() || *c == ' ').take(300).collect();
    let text = text.trim().to_string();
    (!text.is_empty()).then_some(text)
}

/// The fields Luna shows (series, number, title, first writer, language) from a ComicInfo.xml.
pub fn comic_info(xml: &str) -> ComicInfo {
    ComicInfo {
        series: xml_tag(xml, "Series"),
        number: xml_tag(xml, "Number").filter(|n| n.len() <= 12),
        title: xml_tag(xml, "Title"),
        writer: xml_tag(xml, "Writer").map(|w| w.split(',').next().unwrap_or("").trim().to_string()).filter(|w| !w.is_empty()),
        lang: xml_tag(xml, "LanguageISO").filter(|l| (2..=8).contains(&l.len()) && l.chars().all(|c| c.is_ascii_alphabetic() || c == '-')),
    }
}

/// "Series #3: Title", "Series #3", "Series: Title" or just the title; `None` when ComicInfo has neither series nor title.
pub fn comic_title(ci: &ComicInfo) -> Option<String> {
    match (&ci.series, &ci.number, &ci.title) {
        (Some(s), Some(n), Some(t)) if !t.eq_ignore_ascii_case(s) && !t.eq_ignore_ascii_case(&format!("{s} {n}")) && !t.eq_ignore_ascii_case(&format!("{s} #{n}")) => Some(format!("{s} #{n}: {t}")),
        (Some(s), Some(n), _) => Some(format!("{s} #{n}")),
        (Some(s), None, Some(t)) if !t.eq_ignore_ascii_case(s) => Some(format!("{s}: {t}")),
        (Some(s), None, _) => Some(s.clone()),
        (None, _, Some(t)) => Some(t.clone()),
        _ => None,
    }
}

// ---------- which subtitle file to read for a film ----------

/// How well a subtitle file name fits the language the user reads: 3 for the wanted language, 2 for
/// English, 1 for an untagged or other file, 0 for hearing-impaired or forced-only files (still readable, last).
pub fn rank_sub(name_lower: &str, stem_lower: &str, want: &str) -> u8 {
    let rest = name_lower.strip_prefix(stem_lower).unwrap_or(name_lower);
    let tags: Vec<&str> = rest.trim_start_matches('.').split('.').collect();
    let has = |t: &[&str]| tags.iter().any(|x| t.contains(x));
    if has(&["forced", "sdh", "hi", "cc"]) {
        return 0;
    }
    let (wanted, english): (&[&str], &[&str]) = if want == "tr" { (&["tr", "tur", "turkish", "tr-tr", "türkçe"], &["en", "eng", "english", "en-us", "en-gb"]) } else { (&["en", "eng", "english", "en-us", "en-gb"], &["tr", "tur", "turkish"]) };
    if has(wanted) {
        3
    } else if has(english) {
        2
    } else {
        1
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn v(s: &[&str]) -> Vec<String> {
        s.iter().map(|x| x.to_string()).collect()
    }

    #[test]
    fn classify_picks_the_deepest_folder_and_ignores_lookalikes() {
        let film = v(&[r"D:\Media", r"E:\Diziler\"]);
        let music = v(&[r"D:\Media\Music"]);
        let books = v(&["F:/Kitaplar"]);
        assert_eq!(classify(r"D:\Media\Dune\dune.mkv", &film, &music, &books), Some("film"));
        assert_eq!(classify(r"d:\media\music\a.mp3", &film, &music, &books), Some("music"));
        assert_eq!(classify("f:/kitaplar/x.epub", &film, &music, &books), Some("book"));
        assert_eq!(classify(r"D:\MediaX\a.mkv", &film, &music, &books), None);
        assert_eq!(classify(r"E:\Diziler", &film, &music, &books), Some("film"));
        assert_eq!(classify(r"C:\Users\a.mkv", &[], &[], &[]), None);
    }

    #[test]
    fn relevance_skips_temporary_and_foreign_files() {
        assert!(is_relevant("film", r"D:\Media\Film.2024.MKV"));
        assert!(is_relevant("music", "a/b/Song.FLAC"));
        assert!(is_relevant("book", "x/y.cbz"));
        assert!(!is_relevant("film", r"D:\Media\Film.mkv.part"));
        assert!(!is_relevant("film", "D:/Media/.hidden.mkv"));
        assert!(!is_relevant("film", "D:/Media/Film.srt"));
        assert!(!is_relevant("music", "D:/Music/.Film.srt.luna-tmp"));
        assert!(!is_relevant("music", "D:/Music/Thumbs.db"));
        assert!(!is_relevant("film", "D:/Media/noext"));
        assert!(!is_relevant("other", "a.mkv"));
    }

    #[test]
    fn debounce_waits_for_quiet_but_not_forever() {
        let mut d = Debounce::default();
        assert!(d.take(0.0, 3.0, 30.0).is_none());
        d.push("film", "a.mkv", 1.0);
        d.push("film", "a.mkv", 2.0);
        d.push("music", "b.mp3", 2.5);
        assert!(d.take(4.0, 3.0, 30.0).is_none(), "not quiet yet");
        let (kinds, paths) = d.take(5.6, 3.0, 30.0).unwrap();
        assert_eq!(kinds, v(&["film", "music"]));
        assert_eq!(paths, v(&["a.mkv", "b.mp3"]));
        assert!(d.take(99.0, 3.0, 30.0).is_none(), "taken once");
        // a copy that never goes quiet is still acted on after max_wait
        for i in 0..40 {
            d.push("film", "big.mkv", 100.0 + i as f64);
        }
        assert!(d.take(139.0, 3.0, 30.0).is_some());
    }

    #[test]
    fn whisper_presets_and_vad() {
        let base = WhisperOpts { model: "m.bin", wav: "a.wav", base: "out", lang: "tr", translate: false, threads: 99, prompt: None, vad_model: None, preset: "balanced" };
        let a = whisper_args(&base);
        assert_eq!(&a[..9], ["-m", "m.bin", "-f", "a.wav", "-of", "out", "-osrt", "-pp", "-t"]);
        assert_eq!(a[9], "16");
        assert!(a.windows(2).any(|w| w == ["-l", "tr"]) && a.contains(&"-sns".to_string()));
        assert!(!a.contains(&"--vad".to_string()) && !a.contains(&"--prompt".to_string()) && !a.contains(&"-tr".to_string()));
        let fast = whisper_args(&WhisperOpts { preset: "fast", translate: true, ..base_clone(&base) });
        assert!(fast.windows(2).any(|w| w == ["-bs", "1"]) && fast.contains(&"-nf".to_string()) && fast.contains(&"-tr".to_string()) && !fast.contains(&"-sns".to_string()));
        let q = whisper_args(&WhisperOpts { preset: "quality", prompt: Some("  Dune. Names: Paul.  "), vad_model: Some("vad.bin"), ..base_clone(&base) });
        assert!(q.windows(2).any(|w| w == ["-bs", "8"]));
        let i = q.iter().position(|x| x == "--prompt").unwrap();
        assert_eq!(q[i + 1], "Dune. Names: Paul.");
        assert_eq!(q[i + 2], "--carry-initial-prompt");
        assert!(q.windows(3).any(|w| w == ["--vad", "-vm", "vad.bin"]));
        assert!(whisper_args(&WhisperOpts { preset: "nonsense", ..base_clone(&base) }).contains(&"-sns".to_string()));
        assert!(!whisper_args(&WhisperOpts { prompt: Some("   "), ..base_clone(&base) }).contains(&"--prompt".to_string()));
    }

    fn base_clone<'a>(o: &WhisperOpts<'a>) -> WhisperOpts<'a> {
        WhisperOpts { model: o.model, wav: o.wav, base: o.base, lang: o.lang, translate: o.translate, threads: o.threads, prompt: o.prompt, vad_model: o.vad_model, preset: o.preset }
    }

    #[test]
    fn clip_bitrate_fits_the_cap() {
        let k = video_kbps(8, 30.0, 128);
        assert!((1850..=1950).contains(&k), "{k}");
        // 30 s at that rate plus audio stays under 8 MB
        let bytes = (k as f64 + 128.0) * 1000.0 / 8.0 * 30.0;
        assert!(bytes < 8_000_000.0);
        assert_eq!(video_kbps(1, 600.0, 128), 150);
    }

    #[test]
    fn clip_args_per_format() {
        let o = ClipOpts { out: "C:/x/clip.mp4", format: "mp4", start: 10.0, end: 25.5, sub_file: Some("C:/s/film.tr.srt"), burn_subs: true, max_mb: Some(8), src_height: Some(2160), max_height: 720 };
        let a = clip_args(&o).unwrap();
        assert!(a.contains(&"--start=10.000".to_string()) && a.contains(&"--end=25.500".to_string()));
        assert!(a.contains(&"--sub-file=C:/s/film.tr.srt".to_string()) && a.contains(&"--sid=1".to_string()));
        assert!(a.contains(&"--vf=lavfi=[scale=-2:720,format=yuv420p]".to_string()));
        assert!(a.iter().any(|x| x.starts_with("--ovcopts=preset=veryfast,b=") && x.contains("maxrate=")));
        assert!(a.contains(&"--o=C:/x/clip.mp4".to_string()) && a.contains(&"--of=mp4".to_string()));
        let small = clip_args(&ClipOpts { src_height: Some(480), sub_file: None, burn_subs: false, max_mb: None, ..clone_clip(&o) }).unwrap();
        assert!(small.contains(&"--vf=lavfi=[format=yuv420p]".to_string()) && small.contains(&"--sid=no".to_string()));
        assert!(small.contains(&"--ovcopts=preset=veryfast,crf=23".to_string()));
        let web = clip_args(&ClipOpts { out: "a.WEBM", format: "webm", ..clone_clip(&o) }).unwrap();
        assert!(web.contains(&"--ovc=libvpx-vp9".to_string()) && web.contains(&"--oac=libopus".to_string()));
        let gif = clip_args(&ClipOpts { out: "a.gif", format: "gif", ..clone_clip(&o) }).unwrap();
        assert!(gif.contains(&"--aid=no".to_string()) && gif.contains(&"--ovc=gif".to_string()));
        let auto = clip_args(&ClipOpts { sub_file: None, ..clone_clip(&o) }).unwrap();
        assert!(auto.contains(&"--sid=auto".to_string()));
    }

    fn clone_clip<'a>(o: &ClipOpts<'a>) -> ClipOpts<'a> {
        ClipOpts { out: o.out, format: o.format, start: o.start, end: o.end, sub_file: o.sub_file, burn_subs: o.burn_subs, max_mb: o.max_mb, src_height: o.src_height, max_height: o.max_height }
    }

    #[test]
    fn clip_args_reject_bad_input() {
        let o = ClipOpts { out: "a.mp4", format: "mp4", start: 5.0, end: 5.2, sub_file: None, burn_subs: false, max_mb: None, src_height: None, max_height: 720 };
        assert!(clip_args(&o).is_err(), "too short");
        assert!(clip_args(&ClipOpts { end: 900.0, ..clone_clip(&o) }).is_err(), "too long");
        assert!(clip_args(&ClipOpts { start: -1.0, end: 4.0, ..clone_clip(&o) }).is_err());
        assert!(clip_args(&ClipOpts { end: f64::NAN, ..clone_clip(&o) }).is_err());
        assert!(clip_args(&ClipOpts { end: 9.0, out: "a.mkv", ..clone_clip(&o) }).is_err(), "extension mismatch");
        assert!(clip_args(&ClipOpts { end: 9.0, format: "avi", out: "a.avi", ..clone_clip(&o) }).is_err(), "format not offered");
    }

    #[test]
    fn base64_round_trips_and_matches_known_vectors() {
        assert_eq!(b64_encode(b""), "");
        assert_eq!(b64_encode(b"M"), "TQ==");
        assert_eq!(b64_encode(b"Ma"), "TWE=");
        assert_eq!(b64_encode(b"Man"), "TWFu");
        assert_eq!(b64_encode(b"Luna Player!"), "THVuYSBQbGF5ZXIh");
        assert_eq!(b64_decode("TWFu").unwrap(), b"Man");
        assert_eq!(b64_decode("TWE=").unwrap(), b"Ma");
        assert_eq!(b64_decode("TQ").unwrap(), b"M");
        assert_eq!(b64_decode("TW\nFu").unwrap(), b"Man");
        assert!(b64_decode("TW*u").is_err());
        let data: Vec<u8> = (0..=255u8).cycle().take(1000).collect();
        assert_eq!(b64_decode(&b64_encode(&data)).unwrap(), data);
    }

    #[test]
    fn data_urls_only_png_or_jpeg_with_real_headers() {
        let png = format!("data:image/png;base64,{}", b64_encode(&[0x89, b'P', b'N', b'G', 1, 2, 3]));
        assert_eq!(data_url_bytes(&png).unwrap().0, "png");
        let jpg = format!("data:image/jpeg;base64,{}", b64_encode(&[0xFF, 0xD8, 0xFF, 0xE0]));
        assert_eq!(data_url_bytes(&jpg).unwrap().0, "jpeg");
        assert!(data_url_bytes("data:image/svg+xml;base64,PHN2Zz4=").is_err());
        assert!(data_url_bytes("data:text/html;base64,PGI+").is_err());
        assert!(data_url_bytes(&format!("data:image/png;base64,{}", b64_encode(b"GIF89a"))).is_err(), "magic bytes checked");
        assert!(data_url_bytes("no comma").is_err());
        assert!(image_target_ok(r"C:\Kartlar\Dune.PNG", "png") && image_target_ok("a.jpeg", "jpeg") && image_target_ok("a.JPG", "jpeg"));
        assert!(!image_target_ok("a.png.exe", "png") && !image_target_ok("a.jpg", "png") && !image_target_ok("a.png", "gif"));
    }

    #[test]
    fn comic_info_fields_titles_and_entities() {
        let xml = "<?xml version=\"1.0\"?>\n<ComicInfo>\n <Title>Fire &amp; Ice</Title>\n <Series>Saga</Series>\n <Number>12</Number>\n <Writer>Brian K. Vaughan, Fiona Staples</Writer>\n <LanguageISO>en</LanguageISO>\n</ComicInfo>";
        let ci = comic_info(xml);
        assert_eq!(ci.title.as_deref(), Some("Fire & Ice"));
        assert_eq!(ci.series.as_deref(), Some("Saga"));
        assert_eq!(ci.number.as_deref(), Some("12"));
        assert_eq!(ci.writer.as_deref(), Some("Brian K. Vaughan"));
        assert_eq!(ci.lang.as_deref(), Some("en"));
        assert_eq!(comic_title(&ci).as_deref(), Some("Saga #12: Fire & Ice"));
        let cd = comic_info("<ComicInfo><Series><![CDATA[Tom & Jerry]]></Series><Number>3</Number><Title>Tom &amp; Jerry #3</Title></ComicInfo>");
        assert_eq!(cd.series.as_deref(), Some("Tom & Jerry"));
        assert_eq!(comic_title(&cd).as_deref(), Some("Tom & Jerry #3"), "a title that only repeats the series and number is dropped");
        assert_eq!(comic_title(&comic_info("<ComicInfo><Series>Akira</Series></ComicInfo>")).as_deref(), Some("Akira"));
        assert_eq!(comic_title(&comic_info("<ComicInfo><Title>Tek Cilt</Title></ComicInfo>")).as_deref(), Some("Tek Cilt"));
        assert_eq!(comic_title(&comic_info("<ComicInfo><Series>X</Series><Title>Bölüm</Title></ComicInfo>")).as_deref(), Some("X: Bölüm"));
        assert_eq!(comic_title(&comic_info("<ComicInfo></ComicInfo>")), None);
        assert_eq!(comic_title(&comic_info("not xml at all")), None);
        // odd input never panics and never grows
        let long = format!("<ComicInfo><Title>{}</Title><Number>{}</Number><LanguageISO>x1</LanguageISO></ComicInfo>", "ç".repeat(2000), "9".repeat(40));
        let l = comic_info(&long);
        assert_eq!(l.title.as_ref().map(|t| t.chars().count()), Some(300));
        assert_eq!(l.number, None);
        assert_eq!(l.lang, None);
        assert_eq!(comic_info("<Title>&#x41;&#66;&bogus;&#xD800;</Title>").title.as_deref(), Some("AB&bogus;&#xD800;"));
        assert_eq!(comic_info("<Title>a &amp b</Title>").title.as_deref(), Some("a &amp b"));
    }

    #[test]
    fn subtitle_files_are_ranked_for_reading() {
        assert_eq!(rank_sub("film.tr.srt", "film", "tr"), 3);
        assert_eq!(rank_sub("film.turkish.srt", "film", "tr"), 3);
        assert_eq!(rank_sub("film.en.srt", "film", "tr"), 2);
        assert_eq!(rank_sub("film.srt", "film", "tr"), 1);
        assert_eq!(rank_sub("film.tr.forced.srt", "film", "tr"), 0);
        assert_eq!(rank_sub("film.en.sdh.srt", "film", "en"), 0);
        assert_eq!(rank_sub("film.en.srt", "film", "en"), 3);
        assert_eq!(rank_sub("film.tr.srt", "film", "en"), 2);
        assert_eq!(rank_sub("film.fr.srt", "film", "en"), 1);
    }
}

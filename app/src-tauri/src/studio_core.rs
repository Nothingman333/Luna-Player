//! The parts of the subtitle studio that need no Windows, Tauri or child process: reading the
//! WAV that mpv writes, a small speech-activity detector, lining a subtitle up with that activity,
//! and the name/size checks used before anything is written to disk. Kept apart so they are unit
//! tested on any machine (`cargo test` and the host-side check in the delivery report).

use std::io::Read;

/// Speech activity of a recording: one 0/1 value per `bin` seconds.
#[derive(Debug, Clone, PartialEq)]
pub struct Activity {
    pub bin: f64,
    pub bits: Vec<u8>,
}

/// The best way to line a subtitle up with the audio: shown time = `time * ratio + offset`.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    pub offset: f64,
    pub ratio: f64,
    /// How far the best match stands out from the other offsets (standard deviations).
    pub confidence: f64,
    /// Share of the subtitle's spoken time that falls on detected speech after the change (0..1).
    pub overlap: f64,
    /// The same share before any change (sub-delay 0, normal speed).
    pub overlap_before: f64,
}

const FRAME_SECS: f64 = 0.02;

fn u16le(b: &[u8]) -> u16 {
    u16::from_le_bytes([b[0], b[1]])
}
fn u32le(b: &[u8]) -> u32 {
    u32::from_le_bytes([b[0], b[1], b[2], b[3]])
}

/// Format of the PCM data in a WAV stream, read up to the start of the `data` chunk.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct WavFormat {
    pub rate: u32,
    pub channels: u16,
    /// Bytes of sample data announced by the header (`None` when unknown / streamed).
    pub data_len: Option<u64>,
}

/// Reads RIFF/WAVE chunk headers until the `data` chunk; only 16-bit PCM is accepted.
pub fn wav_header(r: &mut impl Read) -> Result<WavFormat, String> {
    let mut head = [0u8; 12];
    r.read_exact(&mut head).map_err(|_| "WAV: too short".to_string())?;
    if &head[0..4] != b"RIFF" || &head[8..12] != b"WAVE" {
        return Err("WAV: not a RIFF/WAVE file".into());
    }
    let mut fmt: Option<(u16, u16, u32, u16)> = None;
    for _ in 0..64 {
        let mut ch = [0u8; 8];
        r.read_exact(&mut ch).map_err(|_| "WAV: no data chunk".to_string())?;
        let size = u32le(&ch[4..8]) as u64;
        match &ch[0..4] {
            b"fmt " => {
                if !(16..=4096).contains(&size) {
                    return Err("WAV: bad fmt chunk".into());
                }
                let mut f = vec![0u8; size as usize];
                r.read_exact(&mut f).map_err(|_| "WAV: short fmt chunk".to_string())?;
                fmt = Some((u16le(&f[0..2]), u16le(&f[2..4]), u32le(&f[4..8]), u16le(&f[14..16])));
                if size % 2 == 1 {
                    let mut pad = [0u8; 1];
                    let _ = r.read_exact(&mut pad);
                }
            }
            b"data" => {
                let (tag, channels, rate, bits) = fmt.ok_or("WAV: data before fmt")?;
                // 1 = PCM, 0xFFFE = WAVE_FORMAT_EXTENSIBLE (PCM subformat for 16-bit output)
                if !(tag == 1 || tag == 0xFFFE) || bits != 16 {
                    return Err("WAV: only 16-bit PCM is supported".into());
                }
                if channels == 0 || channels > 16 || !(4000..=192_000).contains(&rate) {
                    return Err("WAV: unsupported channel count or sample rate".into());
                }
                // A writer that could not seek back leaves 0 or 0xFFFFFFFF: read to the end instead.
                let data_len = if size == 0 || size == 0xFFFF_FFFF { None } else { Some(size) };
                return Ok(WavFormat { rate, channels, data_len });
            }
            _ => {
                // skip LIST/fact/… chunks (bounded)
                let skip = size + (size % 2);
                if skip > 64 * 1024 * 1024 {
                    return Err("WAV: oversized chunk".into());
                }
                std::io::copy(&mut r.take(skip), &mut std::io::sink()).map_err(|e| e.to_string())?;
            }
        }
    }
    Err("WAV: no data chunk".into())
}

/// Frame energies (dB) of a 16-bit PCM WAV stream, every 20 ms, mixed down to mono.
/// Streams the data: memory stays small even for a three-hour film.
pub fn frame_levels(r: &mut impl Read, cancelled: &dyn Fn() -> bool) -> Result<(Vec<f32>, WavFormat), String> {
    let fmt = wav_header(r)?;
    let frame = ((fmt.rate as f64 * FRAME_SECS).round() as usize).max(1);
    let ch = fmt.channels as usize;
    let mut left = fmt.data_len;
    let mut buf = vec![0u8; 64 * 1024 * ch.max(1)];
    let mut carry: Vec<u8> = Vec::new();
    let mut levels = Vec::new();
    let (mut acc, mut n, mut prev) = (0f64, 0usize, 0f64);
    loop {
        if cancelled() {
            return Err("cancelled".into());
        }
        let want = match left {
            Some(0) => break,
            Some(l) => (l as usize).min(buf.len()),
            None => buf.len(),
        };
        let got = r.read(&mut buf[..want]).map_err(|e| e.to_string())?;
        if got == 0 {
            break;
        }
        if let Some(l) = left.as_mut() {
            *l -= got as u64;
        }
        carry.extend_from_slice(&buf[..got]);
        let whole = carry.len() / (2 * ch) * (2 * ch);
        for s in carry[..whole].chunks_exact(2 * ch) {
            let mut v = 0f64;
            for c in 0..ch {
                v += i16::from_le_bytes([s[2 * c], s[2 * c + 1]]) as f64;
            }
            v /= ch as f64;
            // pre-emphasis: weakens the hum, bass and rumble that are not speech
            let y = v - 0.95 * prev;
            prev = v;
            acc += y * y;
            n += 1;
            if n == frame {
                levels.push((10.0 * ((acc / n as f64) + 1e-3).log10()) as f32);
                acc = 0.0;
                n = 0;
            }
        }
        carry.drain(..whole);
        if levels.len() > 3 * 3600 * 50 * 2 {
            return Err("WAV: recording too long".into());
        }
    }
    if n > frame / 2 {
        levels.push((10.0 * ((acc / n as f64) + 1e-3).log10()) as f32);
    }
    Ok((levels, fmt))
}

fn percentile(sorted: &[f32], p: f64) -> f32 {
    if sorted.is_empty() {
        return 0.0;
    }
    let i = ((sorted.len() - 1) as f64 * p).round() as usize;
    sorted[i.min(sorted.len() - 1)]
}

/// Speech activity per `bin` seconds from 20 ms frame levels: an adaptive threshold above the
/// noise floor, a short hangover, then "active" when at least 40 % of a bin's frames are.
pub fn activity_from_levels(levels: &[f32], bin: f64) -> Activity {
    let per_bin = ((bin / FRAME_SECS).round() as usize).max(1);
    let mut sorted: Vec<f32> = levels.iter().copied().filter(|v| v.is_finite()).collect();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let floor = percentile(&sorted, 0.10);
    let high = percentile(&sorted, 0.90);
    let thr = floor + (0.3 * (high - floor)).max(6.0);
    let mut voiced = vec![false; levels.len()];
    let mut hang = 0;
    for (i, v) in levels.iter().enumerate() {
        if *v > thr {
            voiced[i] = true;
            hang = 4;
        } else if hang > 0 {
            voiced[i] = true;
            hang -= 1;
        }
    }
    let bits = voiced
        .chunks(per_bin)
        .map(|c| (c.iter().filter(|x| **x).count() * 10 >= c.len() * 4) as u8)
        .collect();
    Activity { bin: per_bin as f64 * FRAME_SECS, bits }
}

/// Lines the subtitle cues up with the speech activity: tries the usual frame-rate mix-ups and
/// offsets up to ±`max_offset` seconds. `None` when there is nothing to compare.
pub fn align(cues: &[(f64, f64)], act: &Activity, max_offset: f64) -> Option<SyncResult> {
    let n = act.bits.len();
    let cues: Vec<(f64, f64)> = cues
        .iter()
        .copied()
        .filter(|(s, e)| s.is_finite() && e.is_finite() && *e > *s && *s >= 0.0 && e - s < 60.0)
        .collect();
    if n < 10 || cues.len() < 3 {
        return None;
    }
    let ones = act.bits.iter().filter(|b| **b == 1).count();
    if ones == 0 || ones == n {
        return None;
    }
    let mean = ones as f64 / n as f64;
    // prefix sums of the centred activity: a cue on speech scores, a cue on silence costs
    let mut pre = Vec::with_capacity(n + 1);
    pre.push(0f64);
    for b in &act.bits {
        let last = *pre.last().unwrap();
        pre.push(last + (*b as f64 - mean));
    }
    let mut raw = Vec::with_capacity(n + 1);
    raw.push(0f64);
    for b in &act.bits {
        let last = *raw.last().unwrap();
        raw.push(last + *b as f64);
    }
    let integral = |p: &Vec<f64>, x: f64| -> f64 {
        let pos = (x / act.bin).clamp(0.0, n as f64);
        let i = pos.floor() as usize;
        if i >= n {
            return p[n];
        }
        p[i] + (pos - i as f64) * (p[i + 1] - p[i])
    };
    let score = |ratio: f64, off: f64| -> f64 {
        cues.iter().map(|(s, e)| integral(&pre, e * ratio + off) - integral(&pre, s * ratio + off)).sum()
    };
    let overlap = |ratio: f64, off: f64| -> f64 {
        let (mut hit, mut total) = (0f64, 0f64);
        for (s, e) in &cues {
            hit += integral(&raw, e * ratio + off) - integral(&raw, s * ratio + off);
            total += (e - s) * ratio / act.bin;
        }
        if total > 0.0 { (hit / total).clamp(0.0, 1.0) } else { 0.0 }
    };
    const RATIOS: [f64; 7] = [1.0, 25.0 / 23.976, 23.976 / 25.0, 25.0 / 24.0, 24.0 / 25.0, 24.0 / 23.976, 23.976 / 24.0];
    let coarse = 0.5f64;
    let steps = (max_offset / coarse).round() as i64;
    let mut best: Option<(f64, f64, f64, f64)> = None; // ratio, offset, score, z
    for ratio in RATIOS {
        let mut grid = Vec::with_capacity((2 * steps + 1) as usize);
        for k in -steps..=steps {
            let off = k as f64 * coarse;
            grid.push((off, score(ratio, off)));
        }
        let (mut bo, mut bs) = grid[0];
        for (o, s) in &grid {
            if *s > bs {
                bs = *s;
                bo = *o;
            }
        }
        // refine: ±0.6 s at 50 ms, then ±60 ms at 10 ms
        for (span, step) in [(0.6, 0.05), (0.06, 0.01)] {
            let c = bo;
            let k = (span / step) as i64;
            for i in -k..=k {
                let o = c + i as f64 * step;
                let s = score(ratio, o);
                if s > bs {
                    bs = s;
                    bo = o;
                }
            }
        }
        let m = grid.iter().map(|g| g.1).sum::<f64>() / grid.len() as f64;
        let var = grid.iter().map(|g| (g.1 - m).powi(2)).sum::<f64>() / grid.len() as f64;
        let z = if var > 0.0 { (bs - m) / var.sqrt() } else { 0.0 };
        // another frame rate must clearly beat normal speed to be chosen
        let better = match best {
            None => true,
            Some((_, _, s, _)) => bs > s * if ratio == 1.0 { 1.0 } else { 1.04 } && bs > s,
        };
        if better {
            best = Some((ratio, bo, bs, z));
        }
    }
    let (ratio, offset, _, z) = best?;
    let offset = (offset * 1000.0).round() / 1000.0;
    Some(SyncResult {
        offset,
        ratio,
        confidence: (z * 10.0).round() / 10.0,
        overlap: (overlap(ratio, offset) * 1000.0).round() / 1000.0,
        overlap_before: (overlap(1.0, 0.0) * 1000.0).round() / 1000.0,
    })
}

/// The activity at a coarser `step` (seconds) for drawing: one '0'/'1' per step, '1' when at least
/// half of the step is speech. A two-hour film at 0.5 s is 14 400 characters.
pub fn activity_preview(a: &Activity, step: f64) -> String {
    let per = ((step / a.bin).round() as usize).max(1);
    a.bits.chunks(per).map(|c| if c.iter().filter(|b| **b == 1).count() * 2 >= c.len() { '1' } else { '0' }).collect()
}

/// Saved activity: "LVAD1", bin in ms (u16), then one byte per bin.
pub fn encode_activity(a: &Activity) -> Vec<u8> {
    let mut out = b"LVAD1".to_vec();
    out.extend_from_slice(&((a.bin * 1000.0).round() as u16).to_le_bytes());
    out.extend_from_slice(&a.bits);
    out
}
pub fn decode_activity(b: &[u8]) -> Option<Activity> {
    if b.len() < 7 || &b[0..5] != b"LVAD1" {
        return None;
    }
    let ms = u16le(&b[5..7]);
    if ms == 0 || b[7..].iter().any(|x| *x > 1) {
        return None;
    }
    Some(Activity { bin: ms as f64 / 1000.0, bits: b[7..].to_vec() })
}

/// "whisper_print_progress_callback: progress =  45%" → 45
pub fn whisper_progress(line: &str) -> Option<u32> {
    let i = line.find("progress =")?;
    let rest = line[i + 10..].trim_start();
    let digits: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
    let v: u32 = digits.parse().ok()?;
    (v <= 100 && rest[digits.len()..].starts_with('%')).then_some(v)
}

/// Whisper models Luna offers to download (ggml format, from the whisper.cpp model repository),
/// with the smallest size a complete download can have.
pub const MODELS: &[(&str, u64)] = &[
    ("tiny", 70_000_000),
    ("base", 140_000_000),
    ("small", 460_000_000),
    ("medium", 1_400_000_000),
    ("large-v3-turbo-q5_0", 540_000_000),
    ("large-v3-turbo", 1_500_000_000),
];
pub fn model_min_size(name: &str) -> Option<u64> {
    MODELS.iter().find(|(n, _)| *n == name).map(|(_, s)| *s)
}
pub fn model_url(name: &str) -> Option<String> {
    model_min_size(name)?;
    Some(format!("https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-{name}.bin"))
}

/// Only a plain file name with one of `exts` from an archive entry: no folders, no "..",
/// no device names, nothing but letters, digits, '.', '-', '_', ' ' and '+'.
pub fn safe_entry_name(entry: &str, exts: &[&str]) -> Option<String> {
    let base = entry.rsplit(['/', '\\']).next()?.trim();
    if base.is_empty() || base.starts_with('.') || base.len() > 120 || base.contains("..") {
        return None;
    }
    if !base.chars().all(|c| c.is_ascii_alphanumeric() || "._- +".contains(c)) {
        return None;
    }
    let lower = base.to_ascii_lowercase();
    let stem = lower.split('.').next().unwrap_or("");
    const DEVICES: [&str; 8] = ["con", "prn", "aux", "nul", "com1", "lpt1", "com2", "lpt2"];
    if DEVICES.contains(&stem) {
        return None;
    }
    exts.iter().any(|x| lower.ends_with(&format!(".{x}"))).then(|| base.to_string())
}

/// Lower-case hex SHA-256 of `bytes`.
pub fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::Digest;
    let d = sha2::Sha256::digest(bytes);
    d.iter().map(|b| format!("{b:02x}")).collect()
}

/// Automatic backups to remove: Luna's own "Luna auto-backup …json" names, oldest first,
/// beyond the newest `keep`. The date in the name sorts correctly as text.
pub fn backups_to_prune(names: &[String], keep: usize) -> Vec<String> {
    let mut own: Vec<&String> = names
        .iter()
        .filter(|n| n.starts_with("Luna auto-backup ") && n.ends_with(".json") && n.len() < 80)
        .collect();
    own.sort();
    let extra = own.len().saturating_sub(keep.max(1));
    own.into_iter().take(extra).cloned().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn wav(rate: u32, channels: u16, samples: &[i16], data_len_field: Option<u32>) -> Vec<u8> {
        let data: Vec<u8> = samples.iter().flat_map(|s| s.to_le_bytes()).collect();
        let mut v = b"RIFF".to_vec();
        v.extend_from_slice(&(36 + data.len() as u32).to_le_bytes());
        v.extend_from_slice(b"WAVE");
        v.extend_from_slice(b"LIST");
        v.extend_from_slice(&3u32.to_le_bytes());
        v.extend_from_slice(b"abc\0"); // odd size + pad byte
        v.extend_from_slice(b"fmt ");
        v.extend_from_slice(&16u32.to_le_bytes());
        v.extend_from_slice(&1u16.to_le_bytes());
        v.extend_from_slice(&channels.to_le_bytes());
        v.extend_from_slice(&rate.to_le_bytes());
        v.extend_from_slice(&(rate * 2 * channels as u32).to_le_bytes());
        v.extend_from_slice(&(2 * channels).to_le_bytes());
        v.extend_from_slice(&16u16.to_le_bytes());
        v.extend_from_slice(b"data");
        v.extend_from_slice(&data_len_field.unwrap_or(data.len() as u32).to_le_bytes());
        v.extend_from_slice(&data);
        v
    }

    /// A synthetic "film": noise floor, speech bursts (a 300 Hz tone with an envelope) at `speech`.
    fn film(rate: u32, secs: f64, speech: &[(f64, f64)]) -> Vec<i16> {
        let n = (rate as f64 * secs) as usize;
        let mut seed = 7u32;
        (0..n)
            .map(|i| {
                let t = i as f64 / rate as f64;
                seed = seed.wrapping_mul(1_103_515_245).wrapping_add(12345);
                let noise = ((seed >> 16) as i32 % 200 - 100) as f64;
                let on = speech.iter().any(|(a, b)| t >= *a && t < *b);
                let tone = if on { 6000.0 * (t * 300.0 * std::f64::consts::TAU).sin() } else { 0.0 };
                (noise + tone) as i16
            })
            .collect()
    }

    #[test]
    fn wav_header_skips_chunks_and_accepts_unknown_length() {
        let w = wav(8000, 1, &[1, 2, 3, 4], None);
        let f = wav_header(&mut &w[..]).unwrap();
        assert_eq!((f.rate, f.channels, f.data_len), (8000, 1, Some(8)));
        let w = wav(8000, 2, &[1, 2, 3, 4], Some(0xFFFF_FFFF));
        assert_eq!(wav_header(&mut &w[..]).unwrap().data_len, None);
        assert!(wav_header(&mut &b"RIFX0000WAVE"[..]).is_err());
        let mut bad = wav(8000, 1, &[0; 4], None);
        bad[34 + 12] = 8; // bits per sample in the fmt chunk (after the 12-byte LIST chunk)
        assert!(wav_header(&mut &bad[..]).is_err());
    }

    #[test]
    fn levels_mix_channels_and_respect_cancel() {
        let samples = film(8000, 2.0, &[(0.5, 1.5)]);
        let stereo: Vec<i16> = samples.iter().flat_map(|s| [*s, *s]).collect();
        let (mono_levels, _) = frame_levels(&mut &wav(8000, 1, &samples, None)[..], &|| false).unwrap();
        let (st_levels, f) = frame_levels(&mut &wav(8000, 2, &stereo, None)[..], &|| false).unwrap();
        assert_eq!(f.channels, 2);
        assert_eq!(mono_levels.len(), 100);
        assert_eq!(mono_levels, st_levels);
        assert!(frame_levels(&mut &wav(8000, 1, &samples, None)[..], &|| true).is_err());
    }

    #[test]
    fn activity_marks_speech_bins() {
        let samples = film(8000, 10.0, &[(2.0, 4.0), (6.0, 7.0)]);
        let (levels, _) = frame_levels(&mut &wav(8000, 1, &samples, None)[..], &|| false).unwrap();
        let a = activity_from_levels(&levels, 0.1);
        assert!((a.bin - 0.1).abs() < 1e-9);
        assert_eq!(a.bits.len(), 100);
        assert!(a.bits[25..38].iter().all(|b| *b == 1));
        assert!(a.bits[0..18].iter().all(|b| *b == 0));
        assert!(a.bits[45..58].iter().all(|b| *b == 0));
        let round = decode_activity(&encode_activity(&a)).unwrap();
        assert_eq!(round, a);
        assert!(decode_activity(b"LVAD1\x64\x00\x02").is_none());
    }

    fn speech_plan() -> Vec<(f64, f64)> {
        // irregular lines, like dialogue
        let mut t = 3.0;
        let mut out = vec![];
        for i in 0..60 {
            let len = 1.0 + (i % 5) as f64 * 0.6;
            out.push((t, t + len));
            t += len + 0.8 + (i * 7 % 11) as f64 * 0.35;
        }
        out
    }

    #[test]
    fn align_finds_a_constant_delay() {
        let speech = speech_plan();
        let samples = film(8000, 300.0, &speech);
        let (levels, _) = frame_levels(&mut &wav(8000, 1, &samples, None)[..], &|| false).unwrap();
        let act = activity_from_levels(&levels, 0.05);
        // the subtitle is 4.3 s early: it must be shown 4.3 s later
        let cues: Vec<(f64, f64)> = speech.iter().map(|(a, b)| (a - 4.3, b - 4.3)).filter(|(a, _)| *a >= 0.0).collect();
        let r = align(&cues, &act, 30.0).unwrap();
        assert_eq!(r.ratio, 1.0);
        assert!((r.offset - 4.3).abs() < 0.1, "{r:?}");
        assert!(r.confidence > 4.0, "{r:?}");
        assert!(r.overlap > 0.85 && r.overlap > r.overlap_before, "{r:?}");
    }

    #[test]
    fn align_finds_a_frame_rate_mismatch() {
        let speech = speech_plan();
        let samples = film(8000, 300.0, &speech);
        let (levels, _) = frame_levels(&mut &wav(8000, 1, &samples, None)[..], &|| false).unwrap();
        let act = activity_from_levels(&levels, 0.05);
        // timed for 25 fps while the video runs at 23.976 (times shrunk), plus a delay
        let k = 23.976 / 25.0;
        let cues: Vec<(f64, f64)> = speech.iter().map(|(a, b)| (a * k - 1.0, b * k - 1.0)).filter(|(a, _)| *a >= 0.0).collect();
        let r = align(&cues, &act, 30.0).unwrap();
        assert!((r.ratio - 25.0 / 23.976).abs() < 1e-9, "{r:?}");
        assert!((r.offset - 1.0 * 25.0 / 23.976).abs() < 0.15, "{r:?}");
    }

    #[test]
    fn align_refuses_empty_input() {
        let act = Activity { bin: 0.1, bits: vec![0; 100] };
        assert!(align(&[(1.0, 2.0), (3.0, 4.0), (5.0, 6.0)], &act, 10.0).is_none());
        let act = Activity { bin: 0.1, bits: (0..100).map(|i| (i % 2) as u8).collect() };
        assert!(align(&[(1.0, 2.0)], &act, 10.0).is_none());
        assert!(align(&[(f64::NAN, 2.0), (3.0, 1.0), (-1.0, 0.5)], &act, 10.0).is_none());
    }

    #[test]
    fn preview_is_a_majority_downsample() {
        let a = Activity { bin: 0.05, bits: vec![1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0] };
        assert_eq!(activity_preview(&a, 0.1), "100110");
        assert_eq!(activity_preview(&a, 0.0), "11000011110");
    }

    #[test]
    fn progress_lines() {
        assert_eq!(whisper_progress("whisper_print_progress_callback: progress =  45%"), Some(45));
        assert_eq!(whisper_progress("progress = 100%"), Some(100));
        assert_eq!(whisper_progress("progress = 140%"), None);
        assert_eq!(whisper_progress("progress = 12 items"), None);
        assert_eq!(whisper_progress("[00:00.000 --> 00:02.000] progress"), None);
    }

    #[test]
    fn models_are_whitelisted() {
        assert!(model_url("base").unwrap().ends_with("/ggml-base.bin"));
        assert!(model_url("../../evil").is_none());
        assert!(model_url("base.bin").is_none());
    }

    #[test]
    fn archive_names_are_flattened_and_checked() {
        let exe = ["exe", "dll"];
        assert_eq!(safe_entry_name("Release/whisper-cli.exe", &exe).as_deref(), Some("whisper-cli.exe"));
        assert_eq!(safe_entry_name("a\\b\\ggml.dll", &exe).as_deref(), Some("ggml.dll"));
        assert!(safe_entry_name("Release/readme.txt", &exe).is_none());
        assert!(safe_entry_name("Release/", &exe).is_none());
        assert!(safe_entry_name("../x.exe", &exe).as_deref() == Some("x.exe"));
        assert!(safe_entry_name("con.exe", &exe).is_none());
        assert!(safe_entry_name("bad\u{202e}name.exe", &exe).is_none());
        assert!(safe_entry_name(".hidden.dll", &exe).is_none());
        assert_eq!(safe_entry_name("Anime4K_Upscale_CNN_x2_M.glsl", &["glsl"]).as_deref(), Some("Anime4K_Upscale_CNN_x2_M.glsl"));
    }

    #[test]
    fn hashes() {
        assert_eq!(sha256_hex(b"abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    }

    #[test]
    fn backup_rotation_keeps_the_newest_own_files() {
        let names: Vec<String> = [
            "Luna auto-backup 2026-10-01 08-00.json",
            "Luna auto-backup 2026-10-03 08-00.json",
            "Luna auto-backup 2026-10-02 08-00.json",
            "Luna yedek 2026-10-01.json",
            "notes.txt",
        ]
        .iter()
        .map(|s| s.to_string())
        .collect();
        assert_eq!(backups_to_prune(&names, 2), vec!["Luna auto-backup 2026-10-01 08-00.json".to_string()]);
        assert!(backups_to_prune(&names, 5).is_empty());
        assert_eq!(backups_to_prune(&names, 0).len(), 2);
    }
}

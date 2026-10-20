//! Picture subtitles (Blu-ray PGS) for the Upscaler's subtitle layer.
//!
//! mpv draws PGS itself, but then the subtitles are part of the video Lossless Scaling captures
//! and get warped by frame generation. Here Luna reads the PGS track straight out of the MKV,
//! decodes every subtitle picture to a transparent PNG, and the subtitle window shows them in
//! sync with playback, outside of Lossless Scaling's capture.
//!
//! The MKV reader only walks element headers and skips every video/audio block, so even a
//! 60 GB 4K file is scanned quickly. Results are cached per file + track.

use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{BufReader, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

// ---------- EBML ----------

fn read_vint(r: &mut impl Read, keep_marker: bool) -> std::io::Result<Option<(u64, usize)>> {
    let mut first = [0u8; 1];
    if r.read(&mut first)? == 0 {
        return Ok(None);
    }
    let b = first[0];
    if b == 0 {
        return Ok(Some((u64::MAX, 1))); // invalid / 9+ bytes: treat as unknown
    }
    let len = b.leading_zeros() as usize + 1;
    let mut v = if keep_marker { b as u64 } else { (b as u16 & (0xFFu16 >> len)) as u64 };
    let mut rest = vec![0u8; len - 1];
    r.read_exact(&mut rest)?;
    for x in rest {
        v = (v << 8) | x as u64;
    }
    if !keep_marker && v == (1u64 << (7 * len)) - 1 {
        return Ok(Some((u64::MAX, len))); // "unknown size"
    }
    Ok(Some((v, len)))
}

fn read_uint(r: &mut impl Read, size: u64) -> std::io::Result<u64> {
    let mut v = 0u64;
    for _ in 0..size {
        let mut b = [0u8; 1];
        r.read_exact(&mut b)?;
        v = (v << 8) | b[0] as u64;
    }
    Ok(v)
}

const SEGMENT: u64 = 0x18538067;
const INFO: u64 = 0x1549A966;
const TIMESTAMP_SCALE: u64 = 0x2AD7B1;
const TRACKS: u64 = 0x1654AE6B;
const TRACK_ENTRY: u64 = 0xAE;
const TRACK_NUMBER: u64 = 0xD7;
const CODEC_ID: u64 = 0x86;
const CONTENT_ENCODINGS: u64 = 0x6D80;
const CONTENT_ENCODING: u64 = 0x6240;
const CONTENT_COMPRESSION: u64 = 0x5034;
const COMP_ALGO: u64 = 0x4254;
const COMP_SETTINGS: u64 = 0x4255;
const CLUSTER: u64 = 0x1F43B675;
const CLUSTER_TS: u64 = 0xE7;
const SIMPLE_BLOCK: u64 = 0xA3;
const BLOCK_GROUP: u64 = 0xA0;
const BLOCK: u64 = 0xA1;
const BLOCK_DURATION: u64 = 0x9B;

#[derive(Clone, Debug, Default)]
struct TrackInfo {
    number: u64,
    codec: String,
    comp_algo: Option<u64>,
    comp_settings: Vec<u8>,
}

/// One subtitle packet: time in ms and the raw PGS segments.
struct Packet {
    ms: f64,
    data: Vec<u8>,
}

fn parse_track(r: &mut BufReader<File>, end: u64) -> std::io::Result<TrackInfo> {
    let mut t = TrackInfo::default();
    while r.stream_position()? < end {
        let Some((id, _)) = read_vint(r, true)? else { break };
        let Some((size, _)) = read_vint(r, false)? else { break };
        let here = r.stream_position()?;
        match id {
            TRACK_NUMBER => t.number = read_uint(r, size)?,
            CODEC_ID => {
                if size > 16 * 1024 * 1024 { break; }
                let mut b = vec![0u8; size as usize];
                r.read_exact(&mut b)?;
                t.codec = String::from_utf8_lossy(&b).trim_end_matches('\0').to_string();
            }
            CONTENT_ENCODINGS | CONTENT_ENCODING | CONTENT_COMPRESSION => {
                // descend: their children are read by this same loop
                continue;
            }
            COMP_ALGO => t.comp_algo = Some(read_uint(r, size)?),
            COMP_SETTINGS => {
                if size > 16 * 1024 * 1024 { break; }
                let mut b = vec![0u8; size as usize];
                r.read_exact(&mut b)?;
                t.comp_settings = b;
            }
            _ => {}
        }
        r.seek(SeekFrom::Start(here + size))?;
    }
    // a ContentCompression element without ContentCompAlgo means zlib (default 0)
    Ok(t)
}

/// Reads all packets of MKV track `track_number` (the subtitle track mpv calls src-id).
fn read_track(path: &Path, track_number: u64, progress: &dyn Fn(f32)) -> Result<(TrackInfo, Vec<Packet>), String> {
    let f = File::open(path).map_err(|e| e.to_string())?;
    let total = f.metadata().map(|m| m.len()).unwrap_or(1).max(1);
    let mut r = BufReader::with_capacity(1 << 16, f);
    let mut ts_scale = 1_000_000u64; // ns per tick
    let mut track = TrackInfo::default();
    let mut packets = vec![];
    let mut cluster_ts = 0u64;
    let mut last_report = 0u64;
    let e = |x: std::io::Error| x.to_string();
    // Walk: top level → Segment children → Cluster children.
    loop {
        let pos = r.stream_position().map_err(e)?;
        if pos >= total {
            break;
        }
        if pos - last_report > 256 << 20 {
            progress(pos as f32 / total as f32);
            last_report = pos;
        }
        let Some((id, _)) = read_vint(&mut r, true).map_err(e)? else { break };
        let Some((size, _)) = read_vint(&mut r, false).map_err(e)? else { break };
        let body = r.stream_position().map_err(e)?;
        match id {
            SEGMENT | CLUSTER => {
                // descend into containers (also works for "unknown size")
                continue;
            }
            INFO => {
                let end = body + size;
                while r.stream_position().map_err(e)? < end {
                    let Some((cid, _)) = read_vint(&mut r, true).map_err(e)? else { break };
                    let Some((cs, _)) = read_vint(&mut r, false).map_err(e)? else { break };
                    let h = r.stream_position().map_err(e)?;
                    if cid == TIMESTAMP_SCALE {
                        ts_scale = read_uint(&mut r, cs).map_err(e)?;
                    }
                    r.seek(SeekFrom::Start(h + cs)).map_err(e)?;
                }
            }
            TRACKS => {
                let end = body + size;
                while r.stream_position().map_err(e)? < end {
                    let Some((cid, _)) = read_vint(&mut r, true).map_err(e)? else { break };
                    let Some((cs, _)) = read_vint(&mut r, false).map_err(e)? else { break };
                    let h = r.stream_position().map_err(e)?;
                    if cid == TRACK_ENTRY {
                        let t = parse_track(&mut r, h + cs).map_err(e)?;
                        if t.number == track_number {
                            track = t;
                        }
                    }
                    r.seek(SeekFrom::Start(h + cs)).map_err(e)?;
                }
                if track.number != track_number {
                    return Err(tr!("Altyazı izi bulunamadı (#{})", "Subtitle track not found (#{})", track_number));
                }
                if !track.codec.contains("PGS") {
                    return Err(tr!("Bu iz PGS değil ({})", "This track isn't PGS ({})", track.codec));
                }
            }
            CLUSTER_TS => cluster_ts = read_uint(&mut r, size).map_err(e)?,
            SIMPLE_BLOCK | BLOCK_GROUP => {
                let (blk_start, blk_size) = if id == BLOCK_GROUP {
                    // find the Block inside the group
                    let end = body + size;
                    let mut found = None;
                    while r.stream_position().map_err(e)? < end {
                        let Some((cid, _)) = read_vint(&mut r, true).map_err(e)? else { break };
                        let Some((cs, _)) = read_vint(&mut r, false).map_err(e)? else { break };
                        let h = r.stream_position().map_err(e)?;
                        if cid == BLOCK {
                            found = Some((h, cs));
                        }
                        let _ = BLOCK_DURATION;
                        r.seek(SeekFrom::Start(h + cs)).map_err(e)?;
                    }
                    match found {
                        Some(x) => x,
                        None => {
                            r.seek(SeekFrom::Start(body + size)).map_err(e)?;
                            continue;
                        }
                    }
                } else {
                    (body, size)
                };
                r.seek(SeekFrom::Start(blk_start)).map_err(e)?;
                let Some((tn, tlen)) = read_vint(&mut r, false).map_err(e)? else { break };
                if tn == track_number && track.number == track_number {
                    let mut hdr = [0u8; 3];
                    r.read_exact(&mut hdr).map_err(e)?;
                    let rel = i16::from_be_bytes([hdr[0], hdr[1]]) as i64;
                    let Some(len) = (blk_size as usize).checked_sub(tlen as usize + 3) else { break; };
                    if len > 16 * 1024 * 1024 { break; }
                    let mut data = vec![0u8; len];
                    r.read_exact(&mut data).map_err(e)?;
                    let data = match track.comp_algo {
                        Some(0) => {
                            let mut out = vec![];
                            std::io::Read::take(flate2::read::ZlibDecoder::new(&data[..]), 16 * 1024 * 1024).read_to_end(&mut out).map_err(e)?;
                            out
                        }
                        Some(3) => [track.comp_settings.clone(), data].concat(),
                        _ => data,
                    };
                    let ticks = cluster_ts as i64 + rel;
                    packets.push(Packet { ms: ticks as f64 * ts_scale as f64 / 1e6, data });
                }
                r.seek(SeekFrom::Start(body + size)).map_err(e)?;
            }
            _ => {
                if size == u64::MAX {
                    break;
                }
                r.seek(SeekFrom::Start(body + size)).map_err(e)?;
            }
        }
    }
    progress(1.0);
    Ok((track, packets))
}

// ---------- PGS ----------

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Pic {
    /// position and size relative to the subtitle canvas (0..1)
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
    pub file: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Cue {
    pub start: f64,
    pub end: f64,
    pub pics: Vec<Pic>,
}

#[derive(Serialize, Deserialize, Default)]
pub struct Track {
    pub cues: Vec<Cue>,
}

struct Object {
    w: u16,
    h: u16,
    rle: Vec<u8>,
}

fn ycbcr(y: u8, cr: u8, cb: u8, a: u8) -> [u8; 4] {
    // BT.709, limited range
    let y = (y as f32 - 16.0) * 255.0 / 219.0;
    let cb = cb as f32 - 128.0;
    let cr = cr as f32 - 128.0;
    let c = |v: f32| v.round().clamp(0.0, 255.0) as u8;
    [c(y + 1.5748 * cr), c(y - 0.1873 * cb - 0.4681 * cr), c(y + 1.8556 * cb), a]
}

fn decode_rle(o: &Object, pal: &[[u8; 4]; 256]) -> Vec<u8> {
    let (w, h) = (o.w as usize, o.h as usize);
    let mut px = vec![0u8; w * h * 4];
    let (mut x, mut y, mut i) = (0usize, 0usize, 0usize);
    let d = &o.rle;
    let mut put = |x: &mut usize, y: usize, color: u8, n: usize| {
        for _ in 0..n {
            if *x < w && y < h {
                let k = (y * w + *x) * 4;
                px[k..k + 4].copy_from_slice(&pal[color as usize]);
            }
            *x += 1;
        }
    };
    while i < d.len() && y < h {
        let b = d[i];
        i += 1;
        if b != 0 {
            put(&mut x, y, b, 1);
            continue;
        }
        let Some(&f) = d.get(i) else { break };
        i += 1;
        if f == 0 {
            x = 0;
            y += 1; // end of line
            continue;
        }
        let long = f & 0x40 != 0;
        let colored = f & 0x80 != 0;
        let mut n = (f & 0x3F) as usize;
        if long {
            n = (n << 8) | *d.get(i).unwrap_or(&0) as usize;
            i += 1;
        }
        let color = if colored {
            let c = *d.get(i).unwrap_or(&0);
            i += 1;
            c
        } else {
            0
        };
        put(&mut x, y, color, n);
    }
    px
}

fn write_png(path: &Path, w: u32, h: u32, rgba: &[u8]) -> Result<(), String> {
    let f = File::create(path).map_err(|e| e.to_string())?;
    let mut enc = png::Encoder::new(std::io::BufWriter::new(f), w, h);
    enc.set_color(png::ColorType::Rgba);
    enc.set_depth(png::BitDepth::Eight);
    enc.set_compression(png::Compression::Fast);
    let mut wr = enc.write_header().map_err(|e| e.to_string())?;
    wr.write_image_data(rgba).map_err(|e| e.to_string())
}

/// Decodes the PGS packets into timed pictures written as PNGs into `out`.
fn decode(packets: &[Packet], out: &Path) -> Result<Track, String> {
    std::fs::create_dir_all(out).map_err(|e| e.to_string())?;
    let mut palettes: Vec<[[u8; 4]; 256]> = vec![[[0u8; 4]; 256]; 8];
    let mut objects: std::collections::HashMap<u16, Object> = Default::default();
    let mut cues: Vec<Cue> = vec![];
    let mut n = 0usize;
    // composition state of the display set being read
    let mut canvas = (1920u16, 1080u16);
    let mut placements: Vec<(u16, u16, u16)> = vec![]; // object id, x, y
    let mut palette_id = 0usize;
    for p in packets {
        let d = &p.data;
        let mut i = 0usize;
        while i + 3 <= d.len() {
            let kind = d[i];
            let len = u16::from_be_bytes([d[i + 1], d[i + 2]]) as usize;
            let s = &d[(i + 3).min(d.len())..(i + 3 + len).min(d.len())];
            i += 3 + len;
            match kind {
                0x16 if s.len() >= 11 => {
                    // Presentation composition
                    canvas = (u16::from_be_bytes([s[0], s[1]]), u16::from_be_bytes([s[2], s[3]]));
                    let state = s[7];
                    palette_id = s[9] as usize % 8;
                    let count = s[10] as usize;
                    if state & 0x80 != 0 {
                        objects.clear(); // epoch start
                    }
                    placements.clear();
                    let mut k = 11;
                    for _ in 0..count {
                        if k + 8 > s.len() {
                            break;
                        }
                        let id = u16::from_be_bytes([s[k], s[k + 1]]);
                        let cropped = s[k + 3] & 0x80 != 0;
                        let x = u16::from_be_bytes([s[k + 4], s[k + 5]]);
                        let y = u16::from_be_bytes([s[k + 6], s[k + 7]]);
                        placements.push((id, x, y));
                        k += if cropped { 16 } else { 8 };
                    }
                }
                0x14 if s.len() >= 2 => {
                    // Palette
                    let id = s[0] as usize % 8;
                    let mut k = 2;
                    while k + 5 <= s.len() {
                        palettes[id][s[k] as usize] = ycbcr(s[k + 1], s[k + 2], s[k + 3], s[k + 4]);
                        k += 5;
                    }
                }
                0x15 if s.len() >= 4 => {
                    // Object (bitmap), possibly split over several segments
                    let id = u16::from_be_bytes([s[0], s[1]]);
                    let seq = s[3];
                    if seq & 0x80 != 0 && s.len() >= 11 {
                        let w = u16::from_be_bytes([s[7], s[8]]);
                        let h = u16::from_be_bytes([s[9], s[10]]);
                        objects.insert(id, Object { w, h, rle: s[11..].to_vec() });
                    } else if let Some(o) = objects.get_mut(&id) {
                        o.rle.extend_from_slice(&s[4..]);
                    }
                }
                0x80 => {
                    // End of display set: the previous cue ends here, a new one starts if anything is shown.
                    if let Some(last) = cues.last_mut() {
                        if last.end <= last.start {
                            last.end = p.ms;
                        }
                    }
                    let mut pics = vec![];
                    for &(id, x, y) in &placements {
                        if let Some(o) = objects.get(&id) {
                            if o.w == 0 || o.h == 0 {
                                continue;
                            }
                            let rgba = decode_rle(o, &palettes[palette_id]);
                            let file = out.join(format!("{n}.png"));
                            n += 1;
                            write_png(&file, o.w as u32, o.h as u32, &rgba)?;
                            let (cw, ch) = (canvas.0.max(1) as f32, canvas.1.max(1) as f32);
                            pics.push(Pic {
                                x: x as f32 / cw,
                                y: y as f32 / ch,
                                w: o.w as f32 / cw,
                                h: o.h as f32 / ch,
                                file: file.to_string_lossy().into_owned(),
                            });
                        }
                    }
                    if !pics.is_empty() {
                        cues.push(Cue { start: p.ms, end: p.ms, pics });
                    }
                }
                _ => {}
            }
        }
    }
    // a last cue without an explicit end: show it for a few seconds
    if let Some(last) = cues.last_mut() {
        if last.end <= last.start {
            last.end = last.start + 5000.0;
        }
    }
    Ok(Track { cues })
}

/// Loads (or builds and caches) the PGS track `track_number` of `file`.
pub fn load(file: &str, track_number: u64, cache: &Path, progress: &dyn Fn(f32)) -> Result<Track, String> {
    use std::hash::{Hash, Hasher};
    let mut h = std::collections::hash_map::DefaultHasher::new();
    file.hash(&mut h);
    std::fs::metadata(file).map(|m| m.len()).unwrap_or(0).hash(&mut h);
    track_number.hash(&mut h);
    let dir: PathBuf = cache.join(format!("{:016x}", h.finish()));
    let index = dir.join("index.json");
    if let Ok(s) = std::fs::read_to_string(&index) {
        if let Ok(t) = serde_json::from_str::<Track>(&s) {
            return Ok(t);
        }
    }
    let (_, packets) = read_track(Path::new(file), track_number, progress)?;
    let t = decode(&packets, &dir)?;
    std::fs::write(&index, serde_json::to_string(&t).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    Ok(t)
}

#[cfg(test)]
mod tests {
    /// Real file on this machine: reads one PGS track of Paprika and reports what it found.
    #[test]
    #[ignore]
    fn paprika() {
        let file = std::env::var("LUNA_PGS_FILE").unwrap();
        let track: u64 = std::env::var("LUNA_PGS_TRACK").unwrap().parse().unwrap();
        let out = std::env::temp_dir().join("luna-pgs-test");
        let _ = std::fs::remove_dir_all(&out);
        let t0 = std::time::Instant::now();
        let t = super::load(&file, track, &out, &|p| println!("  %{:.0}", p * 100.0)).unwrap();
        println!("{} cues in {:?}", t.cues.len(), t0.elapsed());
        for c in t.cues.iter().take(5) {
            println!("{:.1}s - {:.1}s: {:?}", c.start / 1000.0, c.end / 1000.0, c.pics.iter().map(|p| (p.x, p.y, p.w, p.h)).collect::<Vec<_>>());
        }
        assert!(t.cues.len() > 10);
    }
}

// ---------- live state: which picture is on screen ----------

use std::sync::Mutex;

struct Live {
    key: String,
    track: Track,
    shown: Option<usize>,
}

static LIVE: Mutex<Option<Live>> = Mutex::new(None);
static CLOCK: Mutex<(f64, f64)> = Mutex::new((0.0, 0.0)); // time-pos, sub-delay (seconds)

pub fn set_track(key: String, track: Track) {
    *LIVE.lock().unwrap() = Some(Live { key, track, shown: None });
}

pub fn clear() {
    *LIVE.lock().unwrap() = None;
}

pub fn loaded_key() -> Option<String> {
    LIVE.lock().unwrap().as_ref().map(|l| l.key.clone())
}

pub fn set_time(t: f64) {
    CLOCK.lock().unwrap().0 = t;
}

pub fn set_delay(d: f64) {
    CLOCK.lock().unwrap().1 = d;
}

/// The cue to show now, if it differs from the one already shown: Some(None) = clear the screen.
pub fn due() -> Option<Option<Cue>> {
    let (t, delay) = *CLOCK.lock().unwrap();
    let ms = (t - delay) * 1000.0;
    let mut g = LIVE.lock().unwrap();
    let live = g.as_mut()?;
    let cues = &live.track.cues;
    // last cue starting at or before now
    let i = cues.partition_point(|c| c.start <= ms);
    let now = if i > 0 && ms < cues[i - 1].end { Some(i - 1) } else { None };
    if now == live.shown {
        return None;
    }
    live.shown = now;
    Some(now.map(|k| cues[k].clone()))
}

pub fn reset_shown() {
    if let Some(l) = LIVE.lock().unwrap().as_mut() {
        l.shown = None;
    }
}

//! "Upscaler": drives Lossless Scaling (the user's own Steam copy) from inside Luna.
//!
//! - Luna keeps its own profile ("Luna Player") in Lossless Scaling's Settings.xml, so the
//!   user's game profiles are never touched.
//! - Lossless Scaling is started when needed and scaling is toggled with its own hotkey.
//! - Subtitles are drawn in a separate, click-through, always-on-top window that is excluded
//!   from screen capture (SetWindowDisplayAffinity). Lossless Scaling captures the screen, so it
//!   never sees the subtitles: frame generation only touches the video, the text stays sharp.

use serde::Serialize;
use std::collections::BTreeMap;
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::Command;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const EXE: &str = "LosslessScaling.exe";
pub const PROFILE: &str = "Luna Player";

/// The Lossless Scaling settings Luna lets the user change (element name in Settings.xml).
pub const KEYS: &[&str] = &[
    "FrameGeneration", "LSFG3Mode1", "LSFG3Multiplier", "LSFG3Target", "LSFGFlowScale", "LSFGSize", "LSFG2Mode",
    "HdrSupport", "DrawFps", "CaptureApi", "SyncMode", "MaxFrameLatency", "GsyncSupport",
    "ScalingType", "Anime4kType", "LS1Type", "FSRType", "Sharpness", "LS1Sharpness", "VRS",
    "ScalingMode", "ScalingFitMode", "ScaleFactor",
];

/// Allowed values, read from Lossless Scaling's own enum definitions (LosslessScaling.dll 3.2.2).
/// Anything else is refused: an unknown value would make it reset all of its settings.
fn valid(key: &str, v: &str) -> bool {
    let one_of = |l: &[&str]| l.contains(&v);
    let num = |lo: f64, hi: f64| v.parse::<f64>().is_ok_and(|x| (lo..=hi).contains(&x));
    match key {
        "FrameGeneration" => one_of(&["Off", "LSFG3", "LSFG2", "LSFG1"]),
        "LSFG3Mode1" => one_of(&["FIXED", "ADAPTIVE"]),
        "LSFG2Mode" => one_of(&["X2", "X3", "X4"]),
        "LSFGSize" | "LS1Type" => one_of(&["BALANCED", "PERFORMANCE"]),
        "FSRType" => one_of(&["ORIGINAL", "OPTIMIZED"]),
        "SyncMode" => one_of(&["OFF", "DEFAULT", "VSYNC1", "VSYNC2", "VSYNC3", "VSYNC4"]),
        "CaptureApi" => one_of(&["DXGI", "WGC", "GDI"]),
        "ScalingType" => one_of(&["Off", "LS1", "FSR", "NIS", "SGSR", "BicubicCAS", "Anime4K", "XBR", "SharpBilinear", "Integer", "Nearest"]),
        "Anime4kType" => one_of(&["S", "M", "L", "VL", "UL"]),
        "ScalingMode" => one_of(&["Auto", "Custom"]),
        "ScalingFitMode" => one_of(&["AspectRatio", "Fullscreen"]),
        "HdrSupport" | "DrawFps" | "GsyncSupport" | "VRS" => one_of(&["true", "false"]),
        "LSFG3Multiplier" => v.parse::<u32>().is_ok_and(|x| (2..=20).contains(&x)),
        "LSFG3Target" => v.parse::<u32>().is_ok_and(|x| (20..=1000).contains(&x)),
        "LSFGFlowScale" => v.parse::<u32>().is_ok_and(|x| (25..=100).contains(&x)),
        "MaxFrameLatency" => v.parse::<u32>().is_ok_and(|x| (1..=10).contains(&x)),
        "Sharpness" | "LS1Sharpness" => v.parse::<u32>().is_ok_and(|x| x <= 10),
        "ScaleFactor" => num(1.0, 10.0),
        _ => false,
    }
}

// ---------- finding Lossless Scaling ----------

fn steam_libraries() -> Vec<PathBuf> {
    let mut libs = vec![];
    let out = Command::new("reg")
        .args(["query", r"HKCU\Software\Valve\Steam", "/v", "SteamPath"])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
    if let Ok(o) = out {
        let text = String::from_utf8_lossy(&o.stdout).to_string();
        if let Some(line) = text.lines().find(|l| l.contains("SteamPath")) {
            if let Some(p) = line.split("REG_SZ").nth(1) {
                let steam = PathBuf::from(p.trim().replace('/', "\\"));
                libs.push(steam.clone());
                // Other library folders are listed in libraryfolders.vdf as "path"  "D:\\SteamLibrary".
                if let Ok(vdf) = std::fs::read_to_string(steam.join("steamapps").join("libraryfolders.vdf")) {
                    for l in vdf.lines() {
                        let l = l.trim();
                        if let Some(rest) = l.strip_prefix("\"path\"") {
                            let v = rest.trim().trim_matches('"').replace("\\\\", "\\");
                            libs.push(PathBuf::from(v));
                        }
                    }
                }
            }
        }
    }
    libs.push(PathBuf::from(r"C:\Program Files (x86)\Steam"));
    libs
}

pub fn exe_path() -> Option<PathBuf> {
    steam_libraries()
        .into_iter()
        .map(|l| l.join("steamapps").join("common").join("Lossless Scaling").join(EXE))
        .find(|p| p.exists())
}

fn settings_path() -> PathBuf {
    PathBuf::from(std::env::var("LOCALAPPDATA").unwrap_or_default()).join("Lossless Scaling").join("Settings.xml")
}

// ---------- process ----------

fn pid() -> Option<u32> {
    let o = Command::new("tasklist")
        .args(["/FI", &format!("IMAGENAME eq {EXE}"), "/FO", "CSV", "/NH"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&o.stdout).to_string();
    text.lines().find(|l| l.contains(EXE))?.split(',').nth(1)?.trim_matches('"').parse().ok()
}

pub fn current_pid() -> Option<u32> {
    pid()
}

pub fn running() -> bool {
    pid().is_some()
}

pub fn start() -> Result<(), String> {
    if running() {
        return Ok(());
    }
    let exe = exe_path().ok_or(tr!("Lossless Scaling bulunamadı. Steam'den kurulu olduğundan emin ol.", "Lossless Scaling not found. Make sure it's installed from Steam."))?;
    Command::new(&exe).current_dir(exe.parent().unwrap()).spawn().map_err(|e| tr!("Lossless Scaling başlatılamadı: {}", "Couldn't start Lossless Scaling: {}", e))?;
    // Wait for it, then tuck its window away so it doesn't cover the player.
    for _ in 0..50 {
        std::thread::sleep(std::time::Duration::from_millis(200));
        if let Some(p) = pid() {
            std::thread::sleep(std::time::Duration::from_millis(1200));
            win::minimize_main_window(p);
            return Ok(());
        }
    }
    Err(tr!("Lossless Scaling açılmadı", "Lossless Scaling didn't open"))
}

/// Closes Lossless Scaling and waits until it's gone (it writes Settings.xml when it exits).
fn stop() {
    if !running() {
        return;
    }
    let _ = Command::new("taskkill").args(["/IM", EXE]).creation_flags(CREATE_NO_WINDOW).output();
    for _ in 0..25 {
        std::thread::sleep(std::time::Duration::from_millis(200));
        if !running() {
            return;
        }
    }
    let _ = Command::new("taskkill").args(["/F", "/IM", EXE]).creation_flags(CREATE_NO_WINDOW).output();
    std::thread::sleep(std::time::Duration::from_millis(500));
}

// ---------- Settings.xml (Luna's profile) ----------

fn block_range(xml: &str, title: &str) -> Option<(usize, usize)> {
    let mut from = 0;
    while let Some(a) = xml[from..].find("<Profile>").map(|i| i + from) {
        let b = xml[a..].find("</Profile>")? + a + "</Profile>".len();
        if xml[a..b].contains(&format!("<Title>{title}</Title>")) {
            return Some((a, b));
        }
        from = b;
    }
    None
}

fn first_block(xml: &str) -> Option<(usize, usize)> {
    let a = xml.find("<Profile>")?;
    let b = xml[a..].find("</Profile>")? + a + "</Profile>".len();
    Some((a, b))
}

fn get(block: &str, key: &str) -> Option<String> {
    let a = block.find(&format!("<{key}>"))? + key.len() + 2;
    let b = block[a..].find(&format!("</{key}>"))? + a;
    Some(block[a..b].to_string())
}

fn set(block: &str, key: &str, val: &str) -> String {
    let esc = val.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;");
    if let (Some(a), Some(_)) = (block.find(&format!("<{key}>")), block.find(&format!("</{key}>"))) {
        let start = a + key.len() + 2;
        let end = block[start..].find(&format!("</{key}>")).unwrap() + start;
        format!("{}{}{}", &block[..start], esc, &block[end..])
    } else if let Some(a) = block.find(&format!("<{key} />")) {
        format!("{}<{key}>{esc}</{key}>{}", &block[..a], &block[a + key.len() + 4..])
    } else {
        let end = block.rfind("</Profile>").unwrap_or(block.len());
        format!("{}  <{key}>{esc}</{key}>\n    {}", &block[..end], &block[end..])
    }
}

fn remove(block: &str, key: &str) -> String {
    match (block.find(&format!("<{key}>")), block.find(&format!("</{key}>"))) {
        (Some(a), Some(b)) if b > a => {
            let end = b + key.len() + 3;
            let start = block[..a].trim_end_matches([' ', '\t']).len();
            let end = if block[end..].starts_with('\n') { end + 1 } else { end };
            format!("{}{}", &block[..start], &block[end..])
        }
        _ => block.to_string(),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub installed: bool,
    pub running: bool,
    pub scaling: bool,
    pub settings: BTreeMap<String, String>,
    pub hotkey: String,
}

pub fn status() -> Status {
    let xml = std::fs::read_to_string(settings_path()).unwrap_or_default();
    let block = block_range(&xml, PROFILE).or_else(|| first_block(&xml)).map(|(a, b)| xml[a..b].to_string()).unwrap_or_default();
    let mut settings = BTreeMap::new();
    for k in KEYS {
        if let Some(v) = get(&block, k) {
            settings.insert(k.to_string(), v);
        }
    }
    let p = pid();
    Status {
        installed: exe_path().is_some(),
        running: p.is_some(),
        scaling: p.is_some_and(win::is_scaling),
        settings,
        hotkey: format!("{} + {}", get(&xml, "HotkeyModifierKeys").unwrap_or_default().replace(' ', " + "), get(&xml, "Hotkey").unwrap_or_default()),
    }
}

/// Writes Luna's profile. Lossless Scaling overwrites the file on exit, so it is closed first
/// and started again afterwards if it was running.
pub fn save(values: BTreeMap<String, String>) -> Result<(), String> {
    // Check everything before touching Lossless Scaling or its file.
    if let Some((k, v)) = values.iter().find(|(k, v)| KEYS.contains(&k.as_str()) && !valid(k, v)) {
        return Err(tr!("Geçersiz değer: {} = {}", "Invalid value: {} = {}", k, v));
    }
    let path = settings_path();
    let was_running = running();
    stop();
    // whatever happens while writing, Lossless Scaling is started again if it was running
    let result = write_profile(&path, &values);
    if was_running {
        let started = start();
        result.as_ref().ok().map(|_| started).transpose()?;
    }
    result
}

fn write_profile(path: &std::path::Path, values: &BTreeMap<String, String>) -> Result<(), String> {
    let mut xml = std::fs::read_to_string(path).map_err(|_| tr!("Lossless Scaling ayar dosyası bulunamadı. Programı bir kez açıp kapat.", "Lossless Scaling's settings file wasn't found. Open and close the program once."))?;
    let (a, b) = match block_range(&xml, PROFILE) {
        Some(r) => r,
        None => {
            // First time: copy the user's default profile as the starting point.
            let (fa, fb) = first_block(&xml).ok_or(tr!("Lossless Scaling ayar dosyasında profil yok", "No profile in Lossless Scaling's settings file"))?;
            // (set() also handles an empty "<Title />")
            let copy = set(&xml[fa..fb], "Title", PROFILE);
            xml.insert_str(fb, &format!("\n    {copy}"));
            let start = fb + 5;
            (start, start + copy.len())
        }
    };
    let mut block = xml[a..b].to_string();
    for (k, v) in values {
        if KEYS.contains(&k.as_str()) {
            block = set(&block, k, v);
        }
    }
    // The profile applies to Luna's window; scaling itself is switched by Luna (only while a video plays).
    // "Path": executable name, full path or window title, ';'-separated (Lossless Scaling's own field).
    block = set(&block, "Path", "Luna Player.exe;Luna Player");
    block = remove(&block, "Filter"); // left by an earlier Luna version, never read by Lossless Scaling
    block = set(&block, "AutoScale", "false");
    xml.replace_range(a..b, &block);
    let _ = std::fs::copy(path, path.with_extension("xml.luna-backup"));
    std::fs::write(path, xml).map_err(|e| e.to_string())
}

/// Presses Lossless Scaling's hotkey (it scales the foreground window, i.e. Luna).
pub fn toggle() -> Result<(), String> {
    let xml = std::fs::read_to_string(settings_path()).unwrap_or_default();
    let key = get(&xml, "Hotkey").unwrap_or_else(|| "S".into());
    let mods = get(&xml, "HotkeyModifierKeys").unwrap_or_else(|| "Alt Control".into());
    win::press(&key, &mods)
}

/// Makes sure Luna's profile exists, is bound to Luna and captures with WGC (rewrites it otherwise).
fn ensure_profile() -> Result<(), String> {
    let xml = std::fs::read_to_string(settings_path()).unwrap_or_default();
    let ok = block_range(&xml, PROFILE).is_some_and(|(a, b)| {
        let blk = &xml[a..b];
        get(blk, "Path").is_some_and(|p| p.contains("Luna Player"))
    });
    if ok { Ok(()) } else { save(BTreeMap::new()) }
}

/// Turns scaling on or off, starting Lossless Scaling first when needed.
pub fn set_scaling(on: bool) -> Result<bool, String> {
    if on {
        ensure_profile()?;
        start()?;
    }
    let Some(p) = pid() else { return Ok(false) };
    if win::is_scaling(p) != on {
        toggle()?;
        for _ in 0..20 {
            std::thread::sleep(std::time::Duration::from_millis(150));
            if win::is_scaling(p) == on {
                break;
            }
        }
    }
    Ok(win::is_scaling(p))
}

// ---------- Win32 ----------

pub mod win {
    use std::ffi::c_void;

    type Hwnd = isize;
    #[repr(C)]
    struct Rect { l: i32, t: i32, r: i32, b: i32 }
    #[repr(C)]
    struct KeybdInput { vk: u16, scan: u16, flags: u32, time: u32, extra: usize }
    #[repr(C)]
    struct Input { kind: u32, ki: KeybdInput, _pad: [u8; 8] }

    #[link(name = "user32")]
    unsafe extern "system" {
        fn EnumWindows(cb: extern "system" fn(Hwnd, isize) -> i32, lp: isize) -> i32;
        fn GetWindowThreadProcessId(h: Hwnd, pid: *mut u32) -> u32;
        fn IsWindowVisible(h: Hwnd) -> i32;
        fn GetWindowLongW(h: Hwnd, idx: i32) -> i32;
        fn GetWindowRect(h: Hwnd, r: *mut Rect) -> i32;
        fn GetSystemMetrics(i: i32) -> i32;
        fn ShowWindow(h: Hwnd, cmd: i32) -> i32;
        fn GetWindow(h: Hwnd, cmd: u32) -> Hwnd;
        fn SendInput(n: u32, inputs: *const Input, size: i32) -> u32;
        fn SetWindowDisplayAffinity(h: Hwnd, a: u32) -> i32;
        fn GetWindowDisplayAffinity(h: Hwnd, a: *mut u32) -> i32;
        fn GetLastError() -> u32;
        fn SetWindowPos(h: Hwnd, after: Hwnd, x: i32, y: i32, cx: i32, cy: i32, flags: u32) -> i32;
        fn SetWindowLongPtrW(h: Hwnd, idx: i32, v: isize) -> isize;
        fn MonitorFromWindow(h: Hwnd, flags: u32) -> isize;
        fn GetMonitorInfoW(m: isize, info: *mut MonitorInfo) -> i32;
    }
    #[repr(C)]
    struct MonitorInfo { size: u32, monitor: Rect, work: Rect, flags: u32 }

    struct Find { pid: u32, found: Vec<Hwnd> }

    extern "system" fn collect(h: Hwnd, lp: isize) -> i32 {
        let f = unsafe { &mut *(lp as *mut Find) };
        let mut p = 0u32;
        unsafe { GetWindowThreadProcessId(h, &mut p) };
        if p == f.pid && unsafe { IsWindowVisible(h) } != 0 {
            f.found.push(h);
        }
        1
    }

    fn windows_of(pid: u32) -> Vec<Hwnd> {
        let mut f = Find { pid, found: vec![] };
        unsafe { EnumWindows(collect, &mut f as *mut Find as isize) };
        f.found
    }

    /// While scaling, Lossless Scaling shows a topmost window the size of the whole screen.
    /// (measured against the screen the window is on, not the main one: a small second monitor counts too)
    pub fn scaling_window(pid: u32) -> Option<Hwnd> {
        windows_of(pid).into_iter().find(|&h| {
            let ex = unsafe { GetWindowLongW(h, -20) } as u32;
            let mut r = Rect { l: 0, t: 0, r: 0, b: 0 };
            unsafe { GetWindowRect(h, &mut r) };
            let mut mi = MonitorInfo { size: std::mem::size_of::<MonitorInfo>() as u32, monitor: Rect { l: 0, t: 0, r: 0, b: 0 }, work: Rect { l: 0, t: 0, r: 0, b: 0 }, flags: 0 };
            let (sw, sh) = if unsafe { GetMonitorInfoW(MonitorFromWindow(h, 2), &mut mi) } != 0 {
                (mi.monitor.r - mi.monitor.l, mi.monitor.b - mi.monitor.t)
            } else {
                unsafe { (GetSystemMetrics(0), GetSystemMetrics(1)) }
            };
            let topmost = ex & 0x8 != 0;
            topmost && (r.r - r.l) >= sw * 9 / 10 && (r.b - r.t) >= sh * 9 / 10
        })
    }

    pub fn is_scaling(pid: u32) -> bool {
        scaling_window(pid).is_some()
    }

    /// Makes `owner` own `h`: Windows always keeps an owned window above its owner,
    /// so the subtitles stay above Lossless Scaling's output without fighting over the top spot.
    pub fn set_owner(h: Hwnd, owner: Hwnd) {
        unsafe { SetWindowLongPtrW(h, -8, owner) };
    }

    pub fn minimize_main_window(pid: u32) {
        for h in windows_of(pid) {
            // Owner-less windows only (the main window), never the scaling overlay.
            if unsafe { GetWindow(h, 4) } == 0 && unsafe { GetWindowLongW(h, -20) } as u32 & 0x8 == 0 {
                unsafe { ShowWindow(h, 6) }; // SW_MINIMIZE
            }
        }
    }

    fn vk(name: &str) -> Option<u16> {
        let n = name.trim();
        match n.to_ascii_lowercase().as_str() {
            "control" | "ctrl" => Some(0x11),
            "alt" => Some(0x12),
            "shift" => Some(0x10),
            "windows" | "win" => Some(0x5B),
            _ if n.len() == 1 => Some(n.to_ascii_uppercase().as_bytes()[0] as u16),
            _ if n.starts_with('F') && n[1..].parse::<u16>().is_ok() => Some(0x6F + n[1..].parse::<u16>().unwrap()),
            _ => None,
        }
    }

    pub fn press(key: &str, mods: &str) -> Result<(), String> {
        let mut keys: Vec<u16> = mods.split([' ', ',', '+']).filter(|s| !s.is_empty()).filter_map(vk).collect();
        keys.push(vk(key).ok_or(tr!("Lossless Scaling kısayolu anlaşılamadı", "Couldn't understand the Lossless Scaling shortcut"))?);
        let mut inputs = vec![];
        for &k in &keys {
            inputs.push(Input { kind: 1, ki: KeybdInput { vk: k, scan: 0, flags: 0, time: 0, extra: 0 }, _pad: [0; 8] });
        }
        for &k in keys.iter().rev() {
            inputs.push(Input { kind: 1, ki: KeybdInput { vk: k, scan: 0, flags: 2, time: 0, extra: 0 }, _pad: [0; 8] });
        }
        let sent = unsafe { SendInput(inputs.len() as u32, inputs.as_ptr(), std::mem::size_of::<Input>() as i32) };
        if sent as usize == inputs.len() { Ok(()) } else { Err(tr!("Kısayol gönderilemedi", "Couldn't send the shortcut")) }
    }

    /// Hidden from every screen capture (Lossless Scaling, screenshots) but still shown on screen.
    /// Must run on the thread that created the window. Returns the affinity read back (0x11 = ok).
    pub fn exclude_from_capture(h: Hwnd) -> (u32, u32) {
        let ok = unsafe { SetWindowDisplayAffinity(h, 0x11) };
        let err = if ok == 0 { unsafe { GetLastError() } } else { 0 };
        let mut a = 0u32;
        unsafe { GetWindowDisplayAffinity(h, &mut a) };
        (a, err)
    }

    /// Z-order position of `h` among top-level windows (0 = topmost of all).
    pub fn z_index(h: Hwnd) -> i32 {
        let mut z = 0;
        let mut cur = unsafe { GetWindow(h, 3) }; // GW_HWNDPREV: walk up to the top
        while cur != 0 {
            z += 1;
            cur = unsafe { GetWindow(cur, 3) };
        }
        z
    }

    pub fn keep_on_top(h: Hwnd) {
        // HWND_TOPMOST, no move / size / activate.
        unsafe { SetWindowPos(h, -1, 0, 0, 0, 0, 0x0002 | 0x0001 | 0x0010) };
    }

    #[allow(dead_code)]
    fn _unused(_: *mut c_void) {}
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn profile_editing() {
        let xml = "<Settings>\n  <Hotkey>S</Hotkey>\n  <GameProfiles>\n    <Profile>\n      <Title>Varsayılan</Title>\n      <LSFG3Multiplier>2</LSFG3Multiplier>\n      <HdrSupport>false</HdrSupport>\n    </Profile>\n  </GameProfiles>\n</Settings>";
        assert!(block_range(xml, PROFILE).is_none());
        let (a, b) = first_block(xml).unwrap();
        let mut copy = xml[a..b].to_string();
        copy = copy.replacen("<Title>Varsayılan</Title>", "<Title>Luna Player</Title>", 1);
        let mut x = xml.to_string();
        x.insert_str(b, &format!("\n    {copy}"));
        let (a2, b2) = block_range(&x, PROFILE).unwrap();
        let mut blk = x[a2..b2].to_string();
        blk = set(&blk, "HdrSupport", "true");
        blk = set(&blk, "Filter", "Luna Player.exe");
        blk = remove(&blk, "Filter");
        assert!(!blk.contains("Filter"));
        blk = set(&blk, "Filter", "Luna Player.exe");
        x.replace_range(a2..b2, &blk);
        let lb = &x[block_range(&x, PROFILE).unwrap().0..block_range(&x, PROFILE).unwrap().1];
        assert_eq!(get(lb, "HdrSupport").as_deref(), Some("true"));
        assert_eq!(get(lb, "Filter").as_deref(), Some("Luna Player.exe"));
        // the user's own profile is untouched
        let fb = &x[first_block(&x).unwrap().0..first_block(&x).unwrap().1];
        assert_eq!(get(fb, "HdrSupport").as_deref(), Some("false"));
    }

    /// Read-only check on this machine: finds Lossless Scaling and reads its settings.
    #[test]
    #[ignore]
    fn read_real_status() {
        let st = status();
        println!("exe={:?} installed={} running={} scaling={} hotkey={}", exe_path(), st.installed, st.running, st.scaling, st.hotkey);
        println!("settings={:?}", st.settings);
        assert!(st.installed);
    }
}

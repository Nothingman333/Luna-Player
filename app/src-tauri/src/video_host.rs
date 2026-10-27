//! A Luna-owned clipping window isolates mpv's resize handling from the main WebView.
//! All operations run on the window's UI thread. mpv only ever receives this HWND.
use std::sync::Mutex;

#[derive(Clone, Copy)]
struct Host { parent: isize, hwnd: isize, mini: Option<[i32; 4]> }
static HOST: Mutex<Option<Host>> = Mutex::new(None);

#[repr(C)]
struct Rect { left: i32, top: i32, right: i32, bottom: i32 }
#[link(name = "user32")]
unsafe extern "system" {
    fn CreateWindowExW(ex: u32, class: *const u16, title: *const u16, style: u32,
        x: i32, y: i32, width: i32, height: i32, parent: isize, menu: isize,
        instance: isize, param: *const std::ffi::c_void) -> isize;
    fn GetClientRect(hwnd: isize, rect: *mut Rect) -> i32;
    fn SetWindowPos(hwnd: isize, after: isize, x: i32, y: i32, width: i32, height: i32, flags: u32) -> i32;
    fn EnableWindow(hwnd: isize, enable: i32) -> i32;
}

pub fn create(parent: isize) -> Result<isize, String> {
    let class: Vec<u16> = "STATIC\0".encode_utf16().collect();
    let title: Vec<u16> = "Luna video surface\0".encode_utf16().collect();
    // WS_CHILD | WS_VISIBLE | WS_CLIPCHILDREN. Do not clip siblings here:
    // the transparent WebView must still composite above the full-size video.
    let hwnd = unsafe { CreateWindowExW(0, class.as_ptr(), title.as_ptr(), 0x5200_0000,
        0, 0, 1, 1, parent, 0, 0, std::ptr::null()) };
    if hwnd == 0 { return Err(format!("Video host: {}", std::io::Error::last_os_error())); }
    // Pointer/keyboard input belongs to Luna's overlay, not the native video child.
    unsafe { EnableWindow(hwnd, 0); }
    *HOST.lock().unwrap_or_else(|e| e.into_inner()) = Some(Host { parent, hwnd, mini: None });
    resize(parent)?;
    Ok(hwnd)
}

pub fn dock(parent: isize, mini: Option<[i32; 4]>) -> Result<(), String> {
    let host = {
        let mut state = HOST.lock().unwrap_or_else(|e| e.into_inner());
        let host = state.as_mut().filter(|h| h.parent == parent).ok_or("Video host is unavailable")?;
        host.mini = mini;
        *host
    };
    apply(host)
}

pub fn resize(parent: isize) -> Result<(), String> {
    let host = *HOST.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(host) = host.filter(|h| h.parent == parent) { apply(host)?; }
    Ok(())
}

fn apply(host: Host) -> Result<(), String> {
    let mut bounds = Rect { left: 0, top: 0, right: 0, bottom: 0 };
    if unsafe { GetClientRect(host.parent, &mut bounds) } == 0 { return Err("Video host bounds unavailable".into()); }
    // A minimized main window has no usable area. Retain the requested mode until restored.
    if bounds.right < 1 || bounds.bottom < 1 { return Ok(()); }
    let rect = host.mini.unwrap_or([0, 0, bounds.right, bounds.bottom]);
    let [x, y, w, h] = crate::dock_layout::inside(rect, bounds.right, bounds.bottom)
        .ok_or("Invalid video host rectangle")?;
    // Mini: above the WebView, confined to its preview rectangle. Full: behind the overlay.
    if unsafe { SetWindowPos(host.hwnd, if host.mini.is_some() { 0 } else { 1 },
        x, y, w, h, 0x10 | 0x40) } == 0 {
        return Err(format!("Video host position: {}", std::io::Error::last_os_error()));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[link(name = "user32")]
    unsafe extern "system" {
        fn GetParent(hwnd: isize) -> isize;
        fn DestroyWindow(hwnd: isize) -> i32;
    }
    fn size(hwnd: isize) -> (i32, i32) {
        let mut r = Rect { left: 0, top: 0, right: 0, bottom: 0 };
        assert_ne!(unsafe { GetClientRect(hwnd, &mut r) }, 0);
        (r.right, r.bottom)
    }
    #[test]
    fn child_resize_cannot_expand_mini_host() {
        let class: Vec<u16> = "STATIC\0".encode_utf16().collect();
        // Hidden parent: this test never opens or operates the user's Luna window.
        let parent = unsafe { CreateWindowExW(0, class.as_ptr(), class.as_ptr(), 0x00cf_0000,
            0, 0, 960, 640, 0, 0, 0, std::ptr::null()) };
        assert_ne!(parent, 0);
        let host = create(parent).unwrap();
        let child = unsafe { CreateWindowExW(0, class.as_ptr(), class.as_ptr(), 0x5000_0000,
            0, 0, 128, 72, host, 0, 0, std::ptr::null()) };
        assert_ne!(child, 0);
        dock(parent, Some([20, 400, 128, 72])).unwrap();
        assert_eq!(unsafe { GetParent(child) }, host);
        // Simulate mpv trying to cover a whole resized parent: clipping host stays small.
        unsafe { SetWindowPos(child, 0, 0, 0, 1920, 1080, 0x10); }
        assert_eq!(size(host), (128, 72));
        unsafe { SetWindowPos(parent, 0, 0, 0, 640, 480, 0x14); }
        resize(parent).unwrap();
        assert_eq!(size(host), (128, 72));
        dock(parent, None).unwrap();
        assert_eq!(size(host), size(parent));
        dock(parent, Some([20, 20, 128, 72])).unwrap();
        assert_eq!(size(host), (128, 72));
        unsafe { DestroyWindow(parent); }
        *HOST.lock().unwrap_or_else(|e| e.into_inner()) = None;
    }
}

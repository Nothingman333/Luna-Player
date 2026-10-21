//! Luna's window on the screen it is on: inside the space the taskbar leaves, and on screens
//! narrower than Luna's layout (1920 points) the page zoomed out so it looks the same everywhere.

/// The layout's width: below it the header and rows run out of room.
const DESIGN_WIDTH: f64 = 1920.0;
/// Windows' invisible resize borders reach a few pixels past the screen's edge; that is not off-screen.
const SLACK: i32 = 16;

/// The page zoom for a screen this many points wide (1 on a wide screen, never below 0.7).
pub fn zoom_for(points_wide: f64) -> f64 {
    if points_wide <= 0.0 || points_wide >= DESIGN_WIDTH - 20.0 {
        return 1.0;
    }
    ((points_wide / DESIGN_WIDTH) * 100.0).round().max(70.0) / 100.0
}

/// A window (x, y, w, h) moved and shrunk to stay inside the work area (ax, ay, aw, ah);
/// `None` when it already fits.
pub fn inside(win: (i32, i32, i32, i32), area: (i32, i32, i32, i32)) -> Option<(i32, i32, i32, i32)> {
    let (x, y, w, h) = win;
    let (ax, ay, aw, ah) = area;
    let fits = w <= aw + 2 * SLACK && h <= ah + SLACK && x >= ax - SLACK && y >= ay - SLACK
        && x + w <= ax + aw + SLACK && y + h <= ay + ah + SLACK;
    if fits {
        return None;
    }
    let (w, h) = (w.min(aw), h.min(ah));
    Some((x.clamp(ax, ax + aw - w), y.clamp(ay, ay + ah - h), w, h))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zoom() {
        assert_eq!(zoom_for(2048.0), 1.0);
        assert_eq!(zoom_for(1920.0), 1.0);
        assert_eq!(zoom_for(1707.0), 0.89);
        assert_eq!(zoom_for(1536.0), 0.8);
        assert_eq!(zoom_for(1280.0), 0.7);
    }

    #[test]
    fn window_inside_the_work_area() {
        // 1536x864 points at 125%: work area 1920x1032 pixels above a 48 px taskbar
        let area = (0, 0, 1920, 1032);
        // restored taller than the space: shrunk to it, moved up
        assert_eq!(inside((0, 0, 1920, 1080), area), Some((0, 0, 1920, 1032)));
        assert_eq!(inside((100, 200, 1280, 1000), area), Some((100, 32, 1280, 1000)));
        // a normal window, and one snapped to the left edge (its invisible border at -7), are left alone
        assert_eq!(inside((200, 100, 1280, 760), area), None);
        assert_eq!(inside((-7, 0, 974, 1039), area), None);
        // off to the right of the screen
        assert_eq!(inside((1800, 100, 1280, 760), area), Some((640, 100, 1280, 760)));
    }
}

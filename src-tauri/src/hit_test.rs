//! Click-through for the transparent notch window.
//!
//! The window is much larger than the visible notch so it can animate without
//! resizing. The frontend reports the notch's current rectangle (CSS pixels,
//! relative to the window) and this module polls the cursor:
//! - cursor over the notch  -> window accepts input
//! - cursor elsewhere       -> clicks pass through to the desktop
//!
//! It also emits `notch://hover` (bool) on enter/leave and, while the notch is
//! expanded, `notch://click-outside` when a mouse button goes down outside it.

use serde::Deserialize;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

pub const EVENT_HOVER: &str = "notch://hover";
pub const EVENT_CLICK_OUTSIDE: &str = "notch://click-outside";

/// Notch rectangle in CSS pixels, relative to the window's top-left corner.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HitRegion {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    /// True while the notch is expanded; enables click-outside detection.
    pub expanded: bool,
}

impl HitRegion {
    fn contains(&self, x: f64, y: f64) -> bool {
        x >= self.x && x <= self.x + self.width && y >= self.y && y <= self.y + self.height
    }

    /// Distance from the point to the rectangle (0 inside).
    fn distance(&self, x: f64, y: f64) -> f64 {
        let dx = (self.x - x).max(x - (self.x + self.width)).max(0.0);
        let dy = (self.y - y).max(y - (self.y + self.height)).max(0.0);
        dx.hypot(dy)
    }
}

#[derive(Default)]
pub struct HitTestState {
    region: Mutex<Option<HitRegion>>,
}

#[tauri::command]
pub fn set_hit_region(state: State<'_, HitTestState>, region: HitRegion) {
    if let Ok(mut current) = state.region.lock() {
        *current = Some(region);
    }
}

#[cfg(windows)]
pub fn start(app: AppHandle) {
    use tauri::Emitter;
    use windows::Win32::Foundation::POINT;
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON, VK_RBUTTON};
    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;

    use std::time::Duration;
    use windows::Win32::Foundation::{HWND, RECT};
    use windows::Win32::UI::HiDpi::GetDpiForWindow;
    use windows::Win32::UI::WindowsAndMessaging::{GetWindowRect, IsWindowVisible};

    /// Cursor near the notch (or it is open): smooth hover and clicks.
    const FAST: Duration = Duration::from_millis(16);
    /// Cursor far away: nothing can happen before it gets closer.
    const SLOW: Duration = Duration::from_millis(60);
    /// Window hidden (tray, full screen app).
    const IDLE: Duration = Duration::from_millis(250);
    /// Distance from the notch (CSS px) under which polling is fast.
    const NEAR: f64 = 160.0;

    std::thread::spawn(move || {
        let mut was_inside = false;
        let mut button_was_down = false;
        let mut pending_nudge = false;
        let mut interval = FAST;
        // The notch window lives as long as the app.
        let mut hwnd: Option<HWND> = None;

        loop {
            std::thread::sleep(interval);
            interval = IDLE;

            let Some(window) = crate::window::main_window(&app) else { continue };
            // Plain Win32 reads: Tauri's getters (even the HWND) go through the
            // main thread, which is a lot of round trips at this rate.
            if hwnd.is_none() {
                hwnd = window.hwnd().ok().map(|raw| HWND(raw.0));
            }
            let Some(hwnd) = hwnd else { continue };
            // Hidden from the tray: no hover, no click-outside.
            if !unsafe { IsWindowVisible(hwnd) }.as_bool() {
                continue;
            }
            let region = app
                .state::<HitTestState>()
                .region
                .lock()
                .ok()
                .and_then(|r| *r);
            let Some(region) = region else { continue };

            let mut cursor = POINT::default();
            let mut rect = RECT::default();
            if unsafe { GetCursorPos(&mut cursor) }.is_err() || unsafe { GetWindowRect(hwnd, &mut rect) }.is_err() {
                continue;
            }
            let scale = match unsafe { GetDpiForWindow(hwnd) } {
                0 => 1.0,
                dpi => dpi as f64 / 96.0,
            };

            // Physical screen pixels -> CSS pixels inside the window.
            let local_x = (cursor.x - rect.left) as f64 / scale;
            let local_y = (cursor.y - rect.top) as f64 / scale;
            let inside = region.contains(local_x, local_y);
            let near = region.expanded || region.distance(local_x, local_y) < NEAR;
            interval = if near { FAST } else { SLOW };

            // Reconcile against the real window style every tick, not only on
            // enter/leave: focus changes and clicks inside the notch can make the
            // window drop WS_EX_TRANSPARENT, leaving the whole window blocking clicks.
            if Some(click_through(hwnd)) != Some(!inside) {
                let _ = window.set_ignore_cursor_events(!inside);
                if inside {
                    pending_nudge = true;
                }
            }

            if inside != was_inside {
                was_inside = inside;
                let _ = app.emit_to(crate::window::MAIN_WINDOW_LABEL, EVENT_HOVER, inside);
            }

            // WebView2 ignores a resting cursor until the next WM_MOUSEMOVE once
            // click-through is lifted, so a quick tap right after entering would be
            // lost. Wait until the style change has landed, then send a zero move.
            if pending_nudge && !click_through(hwnd) {
                pending_nudge = false;
                nudge_cursor();
            }

            // High bit set = button currently held.
            let button_down = unsafe {
                (GetAsyncKeyState(VK_LBUTTON.0 as i32) as u16 & 0x8000) != 0
                    || (GetAsyncKeyState(VK_RBUTTON.0 as i32) as u16 & 0x8000) != 0
            };
            if button_down && !button_was_down && region.expanded && !inside {
                let _ = app.emit_to(crate::window::MAIN_WINDOW_LABEL, EVENT_CLICK_OUTSIDE, ());
            }
            button_was_down = button_down;
        }
    });
}

/// Whether the window currently has `WS_EX_TRANSPARENT` (clicks pass through).
#[cfg(windows)]
pub(crate) fn is_click_through(window: &tauri::WebviewWindow) -> Option<bool> {
    // Tauri's HWND comes from a different `windows` version; rewrap the raw pointer.
    Some(click_through(windows::Win32::Foundation::HWND(window.hwnd().ok()?.0)))
}

#[cfg(windows)]
fn click_through(hwnd: windows::Win32::Foundation::HWND) -> bool {
    use windows::Win32::UI::WindowsAndMessaging::{GetWindowLongPtrW, GWL_EXSTYLE, WS_EX_TRANSPARENT};
    let ex_style = unsafe { GetWindowLongPtrW(hwnd, GWL_EXSTYLE) } as u32;
    ex_style & WS_EX_TRANSPARENT.0 != 0
}

/// Sends a zero-distance mouse move so WebView2 notices the cursor.
#[cfg(windows)]
pub(crate) fn nudge_cursor() {
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_MOUSE, MOUSEEVENTF_MOVE, MOUSEINPUT,
    };
    let input = INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
            mi: MOUSEINPUT { dx: 0, dy: 0, mouseData: 0, dwFlags: MOUSEEVENTF_MOVE, time: 0, dwExtraInfo: 0 },
        },
    };
    unsafe {
        SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
    }
}

/// Non-Windows platforms: the window simply stays interactive.
#[cfg(not(windows))]
pub fn start(app: AppHandle) {
    if let Some(window) = crate::window::main_window(&app) {
        let _ = window.set_ignore_cursor_events(false);
    }
}

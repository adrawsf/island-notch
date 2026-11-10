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

    const POLL_INTERVAL: std::time::Duration = std::time::Duration::from_millis(16);

    std::thread::spawn(move || {
        let mut was_inside = false;
        let mut button_was_down = false;
        let mut pending_nudge = false;

        loop {
            std::thread::sleep(POLL_INTERVAL);

            let Some(window) = crate::window::main_window(&app) else { continue };
            // Hidden from the tray: no hover, no click-outside.
            if !window.is_visible().unwrap_or(true) {
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
            if unsafe { GetCursorPos(&mut cursor) }.is_err() {
                continue;
            }
            let (Ok(origin), Ok(scale)) = (window.outer_position(), window.scale_factor()) else {
                continue;
            };

            // Physical screen pixels -> CSS pixels inside the window.
            let local_x = (cursor.x - origin.x) as f64 / scale;
            let local_y = (cursor.y - origin.y) as f64 / scale;
            let inside = region.contains(local_x, local_y);

            // Reconcile against the real window style every tick, not only on
            // enter/leave: focus changes and clicks inside the notch can make the
            // window drop WS_EX_TRANSPARENT, leaving the whole window blocking clicks.
            if is_click_through(&window) != Some(!inside) {
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
            if pending_nudge && is_click_through(&window) == Some(false) {
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
fn is_click_through(window: &tauri::WebviewWindow) -> Option<bool> {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{GetWindowLongPtrW, GWL_EXSTYLE, WS_EX_TRANSPARENT};
    // Tauri's HWND comes from a different `windows` version; rewrap the raw pointer.
    let hwnd = HWND(window.hwnd().ok()?.0);
    let ex_style = unsafe { GetWindowLongPtrW(hwnd, GWL_EXSTYLE) } as u32;
    Some(ex_style & WS_EX_TRANSPARENT.0 != 0)
}

/// Sends a zero-distance mouse move so WebView2 notices the cursor.
#[cfg(windows)]
fn nudge_cursor() {
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

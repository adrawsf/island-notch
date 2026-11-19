//! Teleprompter window (`teleprompter.html`).
//!
//! Opens just below the notch, takes focus (it is driven by the keyboard),
//! and can be hidden from screenshots, recordings and screen sharing.
//!
//! See-through mode: the window passes clicks to whatever is behind it,
//! except over the regions the frontend reports (toolbar, resize grip). A
//! thread polls the cursor, like the notch's hit-test.

use serde::Deserialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, LogicalPosition, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::window::WEBVIEW_BROWSER_ARGS;

pub const LABEL: &str = "teleprompter";
/// Emitted to all windows with the new visibility (bool).
pub const EVENT_VISIBILITY: &str = "teleprompter://visibility";

const WIDTH: f64 = 576.0;
const HEIGHT: f64 = 296.0;
/// Distance from the top of the monitor, below the notch.
const TOP_MARGIN: f64 = 64.0;

fn window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(LABEL)
}

/// A clickable rectangle in CSS px, relative to the window's top-left corner.
#[derive(Debug, Clone, Copy, Deserialize)]
pub struct Rect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

impl Rect {
    fn contains(&self, x: f64, y: f64) -> bool {
        x >= self.x && x <= self.x + self.width && y >= self.y && y <= self.y + self.height
    }
}

#[derive(Default)]
struct ClickThrough {
    enabled: bool,
    regions: Vec<Rect>,
}

static CLICK_THROUGH: Mutex<ClickThrough> = Mutex::new(ClickThrough { enabled: false, regions: Vec::new() });
static WATCHER_STARTED: std::sync::Once = std::sync::Once::new();

/// See-through on/off and the regions that stay clickable while it is on.
#[tauri::command]
pub fn teleprompter_hit_regions(app: AppHandle, click_through: bool, regions: Vec<Rect>) {
    if let Ok(mut state) = CLICK_THROUGH.lock() {
        state.enabled = click_through;
        state.regions = regions;
    }
    if !click_through {
        if let Some(w) = window(&app) {
            let _ = w.set_ignore_cursor_events(false);
        }
    }
    start_watcher(&app);
}

#[cfg(windows)]
fn start_watcher(app: &AppHandle) {
    WATCHER_STARTED.call_once(|| {
        let app = app.clone();
        std::thread::spawn(move || watch(app));
    });
}

#[cfg(not(windows))]
fn start_watcher(_app: &AppHandle) {}

/// Lets clicks through everywhere except over the reported regions.
#[cfg(windows)]
fn watch(app: AppHandle) {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;

    let mut pending_nudge = false;
    loop {
        std::thread::sleep(std::time::Duration::from_millis(30));
        let Some(w) = window(&app) else { continue };
        if !w.is_visible().unwrap_or(false) {
            continue;
        }
        let (enabled, regions) = match CLICK_THROUGH.lock() {
            Ok(s) => (s.enabled, s.regions.clone()),
            Err(_) => continue,
        };
        if !enabled {
            continue;
        }
        let mut cursor = POINT::default();
        if unsafe { GetCursorPos(&mut cursor) }.is_err() {
            continue;
        }
        let (Ok(origin), Ok(scale)) = (w.outer_position(), w.scale_factor()) else { continue };
        let x = (cursor.x - origin.x) as f64 / scale;
        let y = (cursor.y - origin.y) as f64 / scale;
        let clickable = regions.iter().any(|r| r.contains(x, y));
        if crate::hit_test::is_click_through(&w) != Some(!clickable) {
            let _ = w.set_ignore_cursor_events(!clickable);
            pending_nudge = clickable;
        }
        // WebView2 ignores a resting cursor until it moves (see hit_test.rs).
        if pending_nudge && crate::hit_test::is_click_through(&w) == Some(false) {
            pending_nudge = false;
            crate::hit_test::nudge_cursor();
        }
    }
}

/// Opens (or focuses) the teleprompter. Built on its own thread: creating a
/// webview from a sync command deadlocks WebView2.
#[tauri::command]
pub fn teleprompter_open(app: AppHandle, hide_from_capture: bool) {
    std::thread::spawn(move || {
        if let Err(err) = open_blocking(&app, hide_from_capture) {
            eprintln!("[teleprompter] {err}");
        }
    });
}

fn open_blocking(app: &AppHandle, hide_from_capture: bool) -> tauri::Result<()> {
    let w = match window(app) {
        Some(w) => w,
        None => {
            let w = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("teleprompter.html".into()))
                .title("Island Notch Teleprompter")
                .inner_size(WIDTH, HEIGHT)
                .min_inner_size(320.0, 180.0)
                .decorations(false)
                .transparent(true)
                .shadow(false)
                .always_on_top(true)
                .skip_taskbar(true)
                .resizable(true)
                .maximizable(false)
                .minimizable(false)
                .visible(false)
                .additional_browser_args(WEBVIEW_BROWSER_ARGS)
                .build()?;
            place_below_notch(app, &w)?;
            w
        }
    };
    capture::set_excluded(&w, hide_from_capture);
    w.show()?;
    w.set_focus()?;
    let _ = app.emit(EVENT_VISIBILITY, true);
    Ok(())
}

/// Top-center of the monitor the notch is on, just under it.
fn place_below_notch(app: &AppHandle, w: &WebviewWindow) -> tauri::Result<()> {
    let monitor = match crate::window::main_window(app).and_then(|m| m.current_monitor().ok().flatten()) {
        Some(m) => m,
        None => match w.primary_monitor()? {
            Some(m) => m,
            None => return Ok(()),
        },
    };
    let scale = monitor.scale_factor();
    let pos = monitor.position().to_logical::<f64>(scale);
    let size = monitor.size().to_logical::<f64>(scale);
    w.set_position(LogicalPosition::new(pos.x + (size.width - WIDTH) / 2.0, pos.y + TOP_MARGIN))
}

/// Hides the window, and frees it once it stayed closed for a while.
#[tauri::command]
pub fn teleprompter_close(app: AppHandle) -> Result<(), String> {
    if let Some(w) = window(&app) {
        w.hide().map_err(|e| e.to_string())?;
        crate::window::release_when_idle(&app, LABEL);
    }
    let _ = app.emit(EVENT_VISIBILITY, false);
    Ok(())
}

#[tauri::command]
pub fn teleprompter_visible(app: AppHandle) -> bool {
    window(&app).and_then(|w| w.is_visible().ok()).unwrap_or(false)
}

/// Applies the "hide from screen capture" setting to an open teleprompter.
#[tauri::command]
pub fn teleprompter_set_capture_excluded(app: AppHandle, excluded: bool) {
    if let Some(w) = window(&app) {
        capture::set_excluded(&w, excluded);
    }
}

#[cfg(windows)]
mod capture {
    /// WDA_EXCLUDEFROMCAPTURE (Windows 10 2004+): visible on screen, absent
    /// from screenshots, recordings and screen sharing.
    pub fn set_excluded(w: &tauri::WebviewWindow, excluded: bool) {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::{SetWindowDisplayAffinity, WDA_EXCLUDEFROMCAPTURE, WDA_NONE};
        let Ok(raw) = w.hwnd() else { return };
        let affinity = if excluded { WDA_EXCLUDEFROMCAPTURE } else { WDA_NONE };
        if let Err(err) = unsafe { SetWindowDisplayAffinity(HWND(raw.0), affinity) } {
            eprintln!("[teleprompter] display affinity: {err}");
        }
    }
}

#[cfg(not(windows))]
mod capture {
    pub fn set_excluded(_w: &tauri::WebviewWindow, _excluded: bool) {}
}

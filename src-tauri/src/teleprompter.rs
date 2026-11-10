//! Teleprompter window (`teleprompter.html`).
//!
//! Opens just below the notch, takes focus (it is driven by the keyboard),
//! and can be hidden from screenshots, recordings and screen sharing.

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

/// Hides the window; it keeps its position and size for the session.
#[tauri::command]
pub fn teleprompter_close(app: AppHandle) -> Result<(), String> {
    if let Some(w) = window(&app) {
        w.hide().map_err(|e| e.to_string())?;
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

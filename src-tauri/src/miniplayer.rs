//! Floating mini player window (`miniplayer.html`).
//!
//! Created on first open and hidden (not destroyed) on close, so it keeps its
//! position for the session. It never takes focus from the app you are using.

use tauri::{AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::window::WEBVIEW_BROWSER_ARGS;

pub const LABEL: &str = "miniplayer";
/// Emitted to all windows with the new visibility (bool).
pub const EVENT_VISIBILITY: &str = "miniplayer://visibility";

/// First size before the card reports its own (`mini_player_fit`); the window is the card.
const WIDTH: f64 = 360.0;
const HEIGHT: f64 = 120.0;
/// Gap between the card and the work-area edge, in logical px.
const MARGIN: f64 = 16.0;

pub fn window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(LABEL)
}

pub fn is_visible(app: &AppHandle) -> bool {
    window(app).and_then(|w| w.is_visible().ok()).unwrap_or(false)
}

/// Shows or hides the mini player. Runs on its own thread: building a webview
/// from the main thread (tray handler) or a sync command deadlocks WebView2.
pub fn toggle(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        if let Err(err) = set_visible_blocking(&app, !is_visible(&app)) {
            eprintln!("[miniplayer] {err}");
        }
    });
}

fn set_visible_blocking(app: &AppHandle, visible: bool) -> tauri::Result<()> {
    match (window(app), visible) {
        (Some(w), true) => {
            w.show()?;
            apply_no_activate(&w);
        }
        (Some(w), false) => w.hide()?,
        (None, true) => {
            let w = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("miniplayer.html".into()))
                .title("Island Notch Mini Player")
                .inner_size(WIDTH, HEIGHT)
                .decorations(false)
                .transparent(true)
                .shadow(false)
                .always_on_top(true)
                .skip_taskbar(true)
                .resizable(false)
                .maximizable(false)
                .minimizable(false)
                .focused(false)
                .visible(false)
                .additional_browser_args(WEBVIEW_BROWSER_ARGS)
                .build()?;
            place_bottom_right(app, &w)?;
            w.show()?;
            apply_no_activate(&w);
        }
        (None, false) => {}
    }
    let _ = app.emit(EVENT_VISIBILITY, visible);
    crate::tray::refresh_menu(app);
    Ok(())
}

/// Bottom-right of the work area of the monitor the notch is on.
fn place_bottom_right(app: &AppHandle, w: &WebviewWindow) -> tauri::Result<()> {
    let monitor = match crate::window::main_window(app).and_then(|m| m.current_monitor().ok().flatten()) {
        Some(m) => m,
        None => match w.primary_monitor()? {
            Some(m) => m,
            None => return Ok(()),
        },
    };
    let area = monitor.work_area();
    let size = w.outer_size()?;
    let margin = (MARGIN * monitor.scale_factor()).round() as i32;
    let x = area.position.x + area.size.width as i32 - size.width as i32 - margin;
    let y = area.position.y + area.size.height as i32 - size.height as i32 - margin;
    w.set_position(PhysicalPosition::new(x, y))
}

/// Clicks never activate the window (no focus stealing) and it stays topmost.
#[cfg(windows)]
fn apply_no_activate(w: &WebviewWindow) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, GWL_EXSTYLE, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE,
        SWP_NOSIZE, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
    };
    let Ok(raw) = w.hwnd() else { return };
    let hwnd = HWND(raw.0);
    unsafe {
        let style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, style | (WS_EX_NOACTIVATE.0 | WS_EX_TOOLWINDOW.0) as isize);
        let _ = SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
    }
}

#[cfg(not(windows))]
fn apply_no_activate(_w: &WebviewWindow) {}

#[tauri::command]
pub fn mini_player_toggle(app: AppHandle) {
    toggle(&app);
}

#[tauri::command]
pub fn mini_player_hide(app: AppHandle) {
    let app2 = app.clone();
    std::thread::spawn(move || {
        if let Err(err) = set_visible_blocking(&app2, false) {
            eprintln!("[miniplayer] {err}");
        }
    });
}

/// Resizes the window to fit its card (logical px), keeping the bottom-right
/// corner where it is so the player grows up and to the left from its corner.
#[tauri::command]
pub fn mini_player_fit(app: AppHandle, width: f64, height: f64) -> Result<(), String> {
    let Some(w) = window(&app) else { return Ok(()) };
    let width = width.clamp(160.0, 600.0);
    let height = height.clamp(40.0, 720.0);
    let scale = w.scale_factor().map_err(|e| e.to_string())?;
    let pos = w.outer_position().map_err(|e| e.to_string())?;
    let size = w.outer_size().map_err(|e| e.to_string())?;
    let new_width = (width * scale).round() as i32;
    let new_height = (height * scale).round() as i32;
    if (new_width - size.width as i32).abs() <= 1 && (new_height - size.height as i32).abs() <= 1 {
        return Ok(());
    }
    let right = pos.x + size.width as i32;
    let bottom = pos.y + size.height as i32;
    w.set_size(LogicalSize::new(width, height)).map_err(|e| e.to_string())?;
    w.set_position(PhysicalPosition::new(right - new_width, bottom - new_height))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn mini_player_visible(app: AppHandle) -> bool {
    is_visible(&app)
}

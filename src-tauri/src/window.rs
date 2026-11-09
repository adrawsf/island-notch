//! Main notch window placement.

use tauri::{AppHandle, Manager, PhysicalPosition, WebviewWindow};

/// Every webview window MUST use exactly these browser args. WebView2 shares one
/// environment per process, and a window created with different args fails with
/// HRESULT 0x8007139F. Keep this in sync with `tauri.conf.json`.
pub const WEBVIEW_BROWSER_ARGS: &str =
    "--autoplay-policy=no-user-gesture-required --enable-gpu-rasterization --disable-features=CalculateNativeWinOcclusion";

pub const MAIN_WINDOW_LABEL: &str = "main";

pub fn main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(MAIN_WINDOW_LABEL)
}

pub fn setup_main_window(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = main_window(app) {
        position_top_center(&window)?;
        // Start fully click-through; the hit-test thread enables input over the notch.
        window.set_ignore_cursor_events(true)?;
    }
    Ok(())
}

/// Centers the window horizontally at the top edge of the monitor it is on.
pub fn position_top_center(window: &WebviewWindow) -> tauri::Result<()> {
    let monitor = match window.current_monitor()? {
        Some(m) => m,
        None => match window.primary_monitor()? {
            Some(m) => m,
            None => return Ok(()),
        },
    };
    let area = monitor.position();
    let screen = monitor.size();
    let size = window.outer_size()?;
    let x = area.x + (screen.width as i32 - size.width as i32) / 2;
    window.set_position(PhysicalPosition::new(x, area.y))
}

#[tauri::command]
pub fn reposition_main_window(app: AppHandle) -> Result<(), String> {
    match main_window(&app) {
        Some(w) => position_top_center(&w).map_err(|e| e.to_string()),
        None => Err("main window not found".into()),
    }
}

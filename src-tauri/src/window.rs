//! Main notch window placement and visibility.

use tauri::{AppHandle, Emitter, Manager, Monitor, PhysicalPosition, PhysicalSize, WebviewWindow};

/// Every webview window MUST use exactly these browser args. WebView2 shares one
/// environment per process, and a window created with different args fails with
/// HRESULT 0x8007139F. Keep this in sync with `tauri.conf.json`.
pub const WEBVIEW_BROWSER_ARGS: &str =
    "--autoplay-policy=no-user-gesture-required --enable-gpu-rasterization --disable-features=CalculateNativeWinOcclusion";

pub const MAIN_WINDOW_LABEL: &str = "main";

/// Asks the frontend to open or close the notch (shortcut, tray click).
pub const EVENT_TOGGLE: &str = "notch://toggle";

pub fn main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(MAIN_WINDOW_LABEL)
}

pub fn setup_main_window(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = main_window(app) {
        // Primary monitor until the frontend pushes the saved choice.
        position_on_monitor(&window, None)?;
        // Start fully click-through; the hit-test thread enables input over the notch.
        window.set_ignore_cursor_events(true)?;
    }
    Ok(())
}

/// A connected monitor, as listed in the settings window.
#[derive(Debug, Clone)]
pub struct MonitorInfo {
    pub name: String,
    pub primary: bool,
    size: PhysicalSize<u32>,
}

impl MonitorInfo {
    pub fn size(&self) -> PhysicalSize<u32> {
        self.size
    }
}

pub fn monitors(app: &AppHandle) -> Vec<MonitorInfo> {
    let primary = app.primary_monitor().ok().flatten().and_then(|m| m.name().cloned());
    app.available_monitors()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|m| {
            let name = m.name()?.clone();
            Some(MonitorInfo { primary: primary.as_deref() == Some(name.as_str()), size: *m.size(), name })
        })
        .collect()
}

/// Moves the window to the top-center of the named monitor. Falls back to the
/// primary monitor when `name` is `None` or that monitor is disconnected.
pub fn position_on_monitor(window: &WebviewWindow, name: Option<&str>) -> tauri::Result<()> {
    let target = match name {
        Some(name) => window
            .available_monitors()?
            .into_iter()
            .find(|m| m.name().map(String::as_str) == Some(name)),
        None => None,
    };
    let monitor = match target {
        Some(m) => m,
        None => match window.primary_monitor()? {
            Some(m) => m,
            None => return Ok(()),
        },
    };
    center_top(window, &monitor)?;
    // Landing on a monitor with another DPI makes Windows rescale the window
    // after the move, so center once more with the new size.
    center_top(window, &monitor)
}

fn center_top(window: &WebviewWindow, monitor: &Monitor) -> tauri::Result<()> {
    let area = monitor.position();
    let screen = monitor.size();
    let size = window.outer_size()?;
    let x = area.x + (screen.width as i32 - size.width as i32) / 2;
    window.set_position(PhysicalPosition::new(x, area.y))
}

/// Opens/closes the notch, showing the window first if it was hidden.
pub fn toggle_notch(app: &AppHandle) {
    let Some(window) = main_window(app) else { return };
    if !window.is_visible().unwrap_or(true) {
        let _ = window.show();
        crate::tray::refresh_menu(app);
    }
    let _ = app.emit_to(MAIN_WINDOW_LABEL, EVENT_TOGGLE, ());
}

/// Re-applies the saved monitor placement (e.g. after a display change).
#[tauri::command]
pub fn reposition_main_window(app: AppHandle) -> Result<(), String> {
    let monitor = app.state::<crate::shell::ShellState>().current().and_then(|c| c.monitor);
    match main_window(&app) {
        Some(w) => position_on_monitor(&w, monitor.as_deref()).map_err(|e| e.to_string()),
        None => Err("main window not found".into()),
    }
}

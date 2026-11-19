//! Settings window (`settings.html`).
//!
//! Frameless glass window, centered on the notch's monitor. Created on first
//! open and hidden on close, so reopening soon after is instant; destroyed
//! after staying closed a while, to free its memory. Unlike
//! the mini player it takes focus and shows in the taskbar while open.
//!
//! The settings themselves live in the frontend store; this module only owns
//! the window plus the bits the frontend cannot read on its own (monitor list,
//! autostart).

use serde::Serialize;
use tauri::{AppHandle, Emitter, LogicalPosition, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_autostart::ManagerExt;

use crate::window::WEBVIEW_BROWSER_ARGS;

pub const LABEL: &str = "settings";
/// Sent to an already open window with the section id to show.
const EVENT_NAVIGATE: &str = "settings://navigate";

/// Window size = the glass card (no transparent margin around it).
const WIDTH: f64 = 728.0;
const HEIGHT: f64 = 528.0;

fn window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(LABEL)
}

/// Opens (or focuses) the settings window, optionally on one section. Runs on
/// its own thread: building a webview from the tray handler or a sync command
/// deadlocks WebView2.
pub fn open(app: &AppHandle, section: Option<String>) {
    let app = app.clone();
    // Section ids are short lowercase words; anything else is ignored.
    let section = section.filter(|s| !s.is_empty() && s.len() <= 32 && s.chars().all(|c| c.is_ascii_lowercase()));
    std::thread::spawn(move || {
        if let Err(err) = open_blocking(&app, section) {
            eprintln!("[settings] {err}");
        }
    });
}

fn open_blocking(app: &AppHandle, section: Option<String>) -> tauri::Result<()> {
    let w = match window(app) {
        Some(w) => {
            if let Some(section) = &section {
                let _ = w.emit_to(LABEL, EVENT_NAVIGATE, section);
            }
            w
        }
        None => {
            let page = match &section {
                Some(section) => format!("settings.html#{section}"),
                None => "settings.html".to_string(),
            };
            let w = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App(page.into()))
                .title("Pengaturan Island Notch")
                .inner_size(WIDTH, HEIGHT)
                .decorations(false)
                .transparent(true)
                .shadow(false)
                .resizable(false)
                .maximizable(false)
                .visible(false)
                .additional_browser_args(WEBVIEW_BROWSER_ARGS)
                .build()?;
            center_on_notch_monitor(app, &w)?;
            w
        }
    };
    if w.is_minimized().unwrap_or(false) {
        w.unminimize()?;
    }
    w.show()?;
    w.set_focus()?;
    Ok(())
}

/// Center of the monitor the notch is on.
fn center_on_notch_monitor(app: &AppHandle, w: &WebviewWindow) -> tauri::Result<()> {
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
    w.set_position(LogicalPosition::new(
        pos.x + ((size.width - WIDTH) / 2.0).max(0.0),
        pos.y + ((size.height - HEIGHT) / 2.0).max(0.0),
    ))
}

#[tauri::command]
pub fn settings_open(app: AppHandle, section: Option<String>) {
    open(&app, section);
}

#[tauri::command]
pub fn settings_close(app: AppHandle) -> Result<(), String> {
    if let Some(w) = window(&app) {
        w.hide().map_err(|e| e.to_string())?;
        crate::window::release_when_idle(&app, LABEL);
    }
    Ok(())
}

#[tauri::command]
pub fn settings_minimize(app: AppHandle) -> Result<(), String> {
    if let Some(w) = window(&app) {
        w.minimize().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorEntry {
    /// OS name stored in the `monitor` setting.
    name: String,
    width: u32,
    height: u32,
    primary: bool,
}

/// Connected monitors, in OS order.
#[tauri::command]
pub fn monitors_list(app: AppHandle) -> Vec<MonitorEntry> {
    crate::window::monitors(&app)
        .into_iter()
        .map(|m| {
            let size = m.size();
            MonitorEntry { width: size.width, height: size.height, primary: m.primary, name: m.name }
        })
        .collect()
}

#[tauri::command]
pub fn autostart_enabled(app: AppHandle) -> bool {
    app.autolaunch().is_enabled().unwrap_or(false)
}

#[tauri::command]
pub fn autostart_set(app: AppHandle, enabled: bool) -> Result<bool, String> {
    let manager = app.autolaunch();
    let result = if enabled { manager.enable() } else { manager.disable() };
    result.map_err(|e| e.to_string())?;
    Ok(manager.is_enabled().unwrap_or(enabled))
}

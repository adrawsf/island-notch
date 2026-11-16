//! Global shortcuts: open/close the notch, and read text from the screen (OCR).

use std::sync::Mutex;
use tauri::AppHandle;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

/// Id of the registered OCR shortcut; every other shortcut toggles the notch.
static OCR_ID: Mutex<Option<u32>> = Mutex::new(None);

pub fn plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }
            let is_ocr = OCR_ID.lock().ok().and_then(|id| *id) == Some(shortcut.id());
            if is_ocr {
                crate::ocr::start_snip(app);
            } else {
                crate::window::toggle_notch(app);
            }
        })
        .build()
}

/// Errors per shortcut, `None` when it registered (or is off).
#[derive(Debug, Default, Clone)]
pub struct Registered {
    pub toggle: Option<String>,
    pub ocr: Option<String>,
}

/// Replaces the registered shortcuts; `None` turns one off. Accepts the
/// plugin's format, e.g. `Control+Alt+N`.
pub fn apply(app: &AppHandle, toggle: Option<&str>, ocr: Option<&str>) -> Registered {
    let manager = app.global_shortcut();
    let mut out = Registered::default();
    if let Err(err) = manager.unregister_all() {
        out.toggle = Some(err.to_string());
        return out;
    }
    if let Ok(mut id) = OCR_ID.lock() {
        *id = None;
    }

    let parse = |s: &str| s.parse::<Shortcut>().map_err(|e| format!("{s}: {e}"));
    let toggle_id = match toggle.map(parse) {
        Some(Ok(shortcut)) => match manager.register(shortcut) {
            Ok(()) => Some(shortcut.id()),
            Err(err) => {
                out.toggle = Some(format!("{}: {err}", toggle.unwrap_or_default()));
                None
            }
        },
        Some(Err(err)) => {
            out.toggle = Some(err);
            None
        }
        None => None,
    };

    match ocr.map(parse) {
        Some(Ok(shortcut)) if Some(shortcut.id()) == toggle_id => {
            out.ocr = Some("sama dengan shortcut buka/tutup notch".into());
        }
        Some(Ok(shortcut)) => match manager.register(shortcut) {
            Ok(()) => {
                if let Ok(mut id) = OCR_ID.lock() {
                    *id = Some(shortcut.id());
                }
            }
            Err(err) => out.ocr = Some(format!("{}: {err}", ocr.unwrap_or_default())),
        },
        Some(Err(err)) => out.ocr = Some(err),
        None => {}
    }
    out
}

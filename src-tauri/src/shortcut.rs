//! Global shortcut that opens/closes the notch from anywhere.

use tauri::AppHandle;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

pub fn plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                crate::window::toggle_notch(app);
            }
        })
        .build()
}

/// Replaces the registered shortcut. `None` disables it.
/// Accepts the plugin's format, e.g. `Control+Alt+N`.
pub fn apply(app: &AppHandle, shortcut: Option<&str>) -> Result<(), String> {
    let manager = app.global_shortcut();
    manager.unregister_all().map_err(|e| e.to_string())?;
    if let Some(shortcut) = shortcut {
        manager.register(shortcut).map_err(|e| format!("{shortcut}: {e}"))?;
    }
    Ok(())
}

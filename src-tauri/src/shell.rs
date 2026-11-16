//! Shell configuration pushed from the frontend.
//!
//! The frontend settings store (`src/core/settings/settings.ts`) is the single
//! source of truth. Whenever a shell-related setting changes, the notch window
//! calls `apply_shell_config` and this module applies the parts Rust owns:
//! monitor placement and the global shortcuts. Media reads `ignore_video`,
//! the foreground watcher `hide_in_fullscreen`, the clipboard history and OCR
//! their keys, all from the stored config.

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

/// Emitted to all windows after every apply, with the `ApplyResult`.
pub const EVENT_APPLIED: &str = "shell://applied";

/// Mirror of the shell keys in `AppSettings`.
#[derive(Debug, Clone, Default, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ShellConfig {
    /// OS monitor name; `None` = primary monitor.
    pub monitor: Option<String>,
    /// Leave films and other video out of the music views.
    pub ignore_video: bool,
    pub shortcut_enabled: bool,
    pub toggle_shortcut: String,
    /// Hide the notch while a full screen app (game, video) is on its monitor.
    pub hide_in_fullscreen: bool,
    /// Record what is copied (Clipboard tab).
    pub clipboard_history: bool,
    /// History size; pinned items are kept beyond it.
    pub clipboard_max_items: u32,
    /// Global shortcut that reads text from a screen area.
    pub ocr_shortcut_enabled: bool,
    pub ocr_shortcut: String,
    /// BCP-47 tag of the OCR language, or "auto" (the Windows languages).
    pub ocr_language: String,
}

#[derive(Default)]
pub struct ShellState {
    config: Mutex<Option<ShellConfig>>,
    /// Error from the last shortcut registration, kept for late listeners.
    shortcut_error: Mutex<Option<String>>,
    ocr_shortcut_error: Mutex<Option<String>>,
}

impl ShellState {
    /// Last config received from the frontend, if any.
    pub fn current(&self) -> Option<ShellConfig> {
        self.config.lock().ok().and_then(|c| c.clone())
    }
}

#[derive(Debug, Default, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyResult {
    /// Set when the global shortcut could not be registered (taken or invalid).
    pub shortcut_error: Option<String>,
    /// Same for the OCR shortcut.
    pub ocr_shortcut_error: Option<String>,
}

impl ShellState {
    fn result(&self) -> ApplyResult {
        ApplyResult {
            shortcut_error: self.shortcut_error.lock().ok().and_then(|e| e.clone()),
            ocr_shortcut_error: self.ocr_shortcut_error.lock().ok().and_then(|e| e.clone()),
        }
    }
}

#[tauri::command]
pub fn apply_shell_config(app: AppHandle, state: State<'_, ShellState>, config: ShellConfig) -> ApplyResult {
    let previous = match state.config.lock() {
        Ok(mut current) => current.replace(config.clone()),
        Err(_) => None,
    };
    let first = previous.is_none();
    let previous = previous.unwrap_or_default();

    if first || previous.monitor != config.monitor {
        if let Some(window) = crate::window::main_window(&app) {
            if let Err(err) = crate::window::position_on_monitor(&window, config.monitor.as_deref()) {
                eprintln!("[shell] positioning failed: {err}");
            }
        }
    }

    let shortcut_changed = previous.shortcut_enabled != config.shortcut_enabled
        || previous.toggle_shortcut != config.toggle_shortcut
        || previous.ocr_shortcut_enabled != config.ocr_shortcut_enabled
        || previous.ocr_shortcut != config.ocr_shortcut;
    if first || shortcut_changed {
        let toggle = config.shortcut_enabled.then_some(config.toggle_shortcut.as_str());
        let ocr = config.ocr_shortcut_enabled.then_some(config.ocr_shortcut.as_str());
        let registered = crate::shortcut::apply(&app, toggle, ocr);
        if let Ok(mut slot) = state.shortcut_error.lock() {
            *slot = registered.toggle;
        }
        if let Ok(mut slot) = state.ocr_shortcut_error.lock() {
            *slot = registered.ocr;
        }
    }

    if first || previous.clipboard_max_items != config.clipboard_max_items {
        crate::clipboard::apply_config(&app);
    }

    let result = state.result();
    let _ = app.emit(EVENT_APPLIED, result.clone());
    result
}

/// Result of the last apply, for a window that opened after it.
#[tauri::command]
pub fn shell_status(state: State<'_, ShellState>) -> ApplyResult {
    state.result()
}

//! Shell configuration pushed from the frontend.
//!
//! The frontend settings store (`src/core/settings/settings.ts`) is the single
//! source of truth. Whenever a shell-related setting changes, the notch window
//! calls `apply_shell_config` and this module applies the parts Rust owns:
//! monitor placement and the global shortcut. Media reads `ignore_video` from
//! the stored config.

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

/// Emitted to all windows after every apply, with the `ApplyResult`.
pub const EVENT_APPLIED: &str = "shell://applied";

/// Mirror of the shell keys in `AppSettings`.
#[derive(Debug, Clone, Default, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellConfig {
    /// OS monitor name; `None` = primary monitor.
    pub monitor: Option<String>,
    /// Leave films and other video out of the music views.
    pub ignore_video: bool,
    pub shortcut_enabled: bool,
    pub toggle_shortcut: String,
}

#[derive(Default)]
pub struct ShellState {
    config: Mutex<Option<ShellConfig>>,
    /// Error from the last shortcut registration, kept for late listeners.
    shortcut_error: Mutex<Option<String>>,
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

    let shortcut_changed =
        previous.shortcut_enabled != config.shortcut_enabled || previous.toggle_shortcut != config.toggle_shortcut;
    if first || shortcut_changed {
        let shortcut = config.shortcut_enabled.then_some(config.toggle_shortcut.as_str());
        let error = crate::shortcut::apply(&app, shortcut).err();
        if let Ok(mut slot) = state.shortcut_error.lock() {
            *slot = error;
        }
    }

    let result = ApplyResult { shortcut_error: state.shortcut_error.lock().ok().and_then(|e| e.clone()) };
    let _ = app.emit(EVENT_APPLIED, result.clone());
    result
}

/// Result of the last apply, for a window that opened after it.
#[tauri::command]
pub fn shell_status(state: State<'_, ShellState>) -> ApplyResult {
    ApplyResult { shortcut_error: state.shortcut_error.lock().ok().and_then(|e| e.clone()) }
}

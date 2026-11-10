//! Shell configuration pushed from the frontend.
//!
//! The frontend settings store (`src/core/settings/settings.ts`) is the single
//! source of truth. Whenever a shell-related setting changes, the frontend calls
//! `apply_shell_config` and this module applies the parts Rust owns: monitor
//! placement, the global shortcut and the tray menu check marks.

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, State};

/// Mirror of the shell keys in `AppSettings`. Keep the string values in sync
/// with the unions in `settings.ts` and the option lists in `tray.rs`.
#[derive(Debug, Clone, Default, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellConfig {
    /// OS monitor name; `None` = primary monitor.
    pub monitor: Option<String>,
    pub notch_shape: String,
    pub notch_size: String,
    pub theme: String,
    /// Idle widget ids shown in the pill, in order.
    pub idle_widgets: Vec<String>,
    /// Every available idle widget (the registry lives in the frontend).
    pub idle_widget_options: Vec<MenuOption>,
    pub idle_shows_media: bool,
    /// Leave films and other video out of the music views.
    pub ignore_video: bool,
    pub pill_shows_lyrics: bool,
    pub lyrics_source: String,
    /// Every lyrics source (the registry lives in the frontend).
    pub lyrics_source_options: Vec<MenuOption>,
    pub shrink_for_browsers: bool,
    pub shortcut_enabled: bool,
    pub toggle_shortcut: String,
}

#[derive(Debug, Clone, Default, PartialEq, Deserialize)]
pub struct MenuOption {
    pub id: String,
    pub label: String,
}

#[derive(Default)]
pub struct ShellState {
    config: Mutex<Option<ShellConfig>>,
}

impl ShellState {
    /// Last config received from the frontend, if any.
    pub fn current(&self) -> Option<ShellConfig> {
        self.config.lock().ok().and_then(|c| c.clone())
    }
}

#[derive(Debug, Default, Serialize)]
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
    let mut result = ApplyResult::default();

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
        result.shortcut_error = crate::shortcut::apply(&app, shortcut).err();
    }

    crate::tray::refresh_menu(&app);
    result
}

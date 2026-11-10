//! Island Notch backend.
//!
//! Each domain lives in its own module and exposes its commands from there.
//! `run()` only wires plugins, setup and the command list together.

mod foreground;
mod hit_test;
mod lyrics;
mod media;
mod miniplayer;
mod shell;
mod shortcut;
mod teleprompter;
mod tray;
mod window;

pub use window::WEBVIEW_BROWSER_ARGS;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .plugin(shortcut::plugin())
        .manage(hit_test::HitTestState::default())
        .manage(shell::ShellState::default())
        .manage(media::MediaStore::default())
        .setup(|app| {
            window::setup_main_window(app.handle())?;
            tray::create(app.handle())?;
            hit_test::start(app.handle().clone());
            foreground::start(app.handle().clone());
            media::start(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            hit_test::set_hit_region,
            foreground::notch_compact_state,
            shell::apply_shell_config,
            media::media_get_state,
            media::media_control,
            media::media_seek,
            lyrics::lyrics_request,
            miniplayer::mini_player_toggle,
            miniplayer::mini_player_hide,
            miniplayer::mini_player_visible,
            miniplayer::mini_player_fit,
            teleprompter::teleprompter_open,
            teleprompter::teleprompter_close,
            teleprompter::teleprompter_visible,
            teleprompter::teleprompter_set_capture_excluded,
            window::reposition_main_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Island Notch");
}

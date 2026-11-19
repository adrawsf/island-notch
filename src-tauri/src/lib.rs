//! Island Notch backend.
//!
//! Each domain lives in its own module and exposes its commands from there.
//! `run()` only wires plugins, setup and the command list together.

mod clipboard;
mod foreground;
mod hit_test;
#[cfg(windows)]
mod imaging;
mod lyrics;
mod media;
mod media_source;
mod miniplayer;
mod mixer;
mod notifications;
mod ocr;
mod process;
mod settings_window;
mod shelf;
mod shell;
mod shortcut;
mod sysmon;
mod teleprompter;
mod tray;
mod volume;
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
        .manage(clipboard::ClipboardStore::default())
        .manage(shelf::ShelfStore::default())
        .setup(|app| {
            window::setup_main_window(app.handle())?;
            tray::create(app.handle())?;
            hit_test::start(app.handle().clone());
            foreground::start(app.handle().clone());
            media::start(app.handle().clone());
            clipboard::start(app.handle().clone());
            sysmon::start();
            shelf::start(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            hit_test::set_hit_region,
            foreground::notch_compact_state,
            shell::apply_shell_config,
            shell::shell_status,
            settings_window::settings_open,
            settings_window::settings_close,
            settings_window::settings_minimize,
            settings_window::monitors_list,
            settings_window::autostart_enabled,
            settings_window::autostart_set,
            media::media_get_state,
            media::media_control,
            media::media_seek,
            media_source::media_open_source,
            volume::media_volume_get,
            volume::media_volume_set,
            lyrics::lyrics_request,
            miniplayer::mini_player_toggle,
            miniplayer::mini_player_hide,
            miniplayer::mini_player_visible,
            miniplayer::mini_player_fit,
            teleprompter::teleprompter_open,
            teleprompter::teleprompter_close,
            teleprompter::teleprompter_visible,
            teleprompter::teleprompter_set_capture_excluded,
            teleprompter::teleprompter_hit_regions,
            clipboard::clipboard_list,
            clipboard::clipboard_thumb,
            clipboard::clipboard_paste,
            clipboard::clipboard_pin,
            clipboard::clipboard_delete,
            clipboard::clipboard_clear,
            mixer::mixer_state,
            mixer::mixer_set_master,
            mixer::mixer_step_master,
            mixer::mixer_set_app,
            mixer::mixer_set_output,
            mixer::mixer_set_mic_muted,
            mixer::mixer_mic_muted,
            mixer::mixer_app_icon,
            notifications::notif_configure,
            notifications::notif_list,
            notifications::notif_remove,
            notifications::notif_open_app,
            notifications::notif_open_settings,
            notifications::notif_icon,
            shelf::shelf_list,
            shelf::shelf_remove,
            shelf::shelf_clear,
            shelf::shelf_add_text,
            shelf::shelf_open,
            shelf::shelf_reveal,
            shelf::shelf_copy,
            shelf::shelf_thumb,
            shelf::shelf_drag_out,
            sysmon::sysmon_live,
            sysmon::sysmon_brief,
            sysmon::sysmon_disks,
            sysmon::sysmon_processes,
            sysmon::sysmon_end_process,
            ocr::ocr_snip_start,
            ocr::ocr_snip_finish,
            ocr::ocr_languages,
            window::reposition_main_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Island Notch");
}

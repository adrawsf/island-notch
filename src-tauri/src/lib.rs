//! Island Notch backend.
//!
//! Each domain lives in its own module and exposes its commands from there.
//! `run()` only wires plugins, setup and the command list together.

mod hit_test;
mod window;

pub use window::WEBVIEW_BROWSER_ARGS;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(hit_test::HitTestState::default())
        .setup(|app| {
            window::setup_main_window(app.handle())?;
            hit_test::start(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            hit_test::set_hit_region,
            window::reposition_main_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Island Notch");
}

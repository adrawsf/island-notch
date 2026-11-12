//! System tray icon and menu.
//!
//! Left click opens/closes the notch; right click shows a short menu. Every
//! setting lives in the settings window (`settings_window.rs`).

use tauri::menu::{CheckMenuItemBuilder, Menu, MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Wry};

use crate::window::main_window;

pub const TRAY_ID: &str = "main";

const ID_SETTINGS: &str = "settings";
const ID_VISIBLE: &str = "visible";
const ID_MINI_PLAYER: &str = "miniPlayer";
const ID_QUIT: &str = "quit";

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let menu = build_menu(app)?;
    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Island Notch")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| handle_menu(app, event.id().as_ref()))
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                crate::window::toggle_notch(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

/// Rebuilds the menu so labels and check marks match the current state.
pub fn refresh_menu(app: &AppHandle) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else { return };
    match build_menu(app) {
        Ok(menu) => {
            let _ = tray.set_menu(Some(menu));
        }
        Err(err) => eprintln!("[tray] menu rebuild failed: {err}"),
    }
}

fn handle_menu(app: &AppHandle, id: &str) {
    match id {
        ID_SETTINGS => crate::settings_window::open(app, None),
        ID_VISIBLE => {
            if let Some(window) = main_window(app) {
                let visible = window.is_visible().unwrap_or(true);
                let _ = if visible { window.hide() } else { window.show() };
            }
        }
        ID_MINI_PLAYER => crate::miniplayer::toggle(app),
        ID_QUIT => app.exit(0),
        _ => eprintln!("[tray] unknown item {id}"),
    }
    // Clicking a check item flips its mark immediately; rebuild from real state.
    refresh_menu(app);
}

fn build_menu(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let visible = main_window(app).and_then(|w| w.is_visible().ok()).unwrap_or(true);
    MenuBuilder::new(app)
        .item(&MenuItemBuilder::with_id(ID_SETTINGS, "Pengaturan\u{2026}").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id(ID_VISIBLE, if visible { "Sembunyikan notch" } else { "Tampilkan notch" }).build(app)?)
        .item(
            &CheckMenuItemBuilder::with_id(ID_MINI_PLAYER, "Mini player")
                .checked(crate::miniplayer::is_visible(app))
                .build(app)?,
        )
        .separator()
        .item(&MenuItemBuilder::with_id(ID_QUIT, "Keluar").build(app)?)
        .build()
}

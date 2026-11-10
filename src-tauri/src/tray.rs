//! System tray icon and menu.
//!
//! Until the settings window exists (roadmap phase 6) the tray menu is where
//! shell settings are changed. Rust handles the items it owns (visibility,
//! autostart, quit) and forwards every other item to the frontend as
//! `tray://select` with the item id (`<group>:<value>`, e.g. `theme:light`).

use tauri::menu::{CheckMenuItemBuilder, Menu, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Wry};
use tauri_plugin_autostart::ManagerExt;

use crate::shell::ShellState;
use crate::window::{main_window, MAIN_WINDOW_LABEL};

pub const TRAY_ID: &str = "main";
pub const EVENT_TRAY_SELECT: &str = "tray://select";

const ID_VISIBLE: &str = "visible";
const ID_AUTOSTART: &str = "autostart";
const ID_QUIT: &str = "quit";
const ID_SHORTCUT: &str = "shortcut";
const ID_MEDIA_PILL: &str = "mediaPill";
const ID_LYRICS_PILL: &str = "lyricsPill";
const ID_MINI_PLAYER: &str = "miniPlayer";
const ID_SHRINK_BROWSERS: &str = "shrinkForBrowsers";

// Values must match the unions in `src/core/settings/settings.ts`.
const SHAPES: &[(&str, &str)] = &[("notch", "Notch (menempel di atas)"), ("island", "Island (melayang)")];
const SIZES: &[(&str, &str)] = &[("compact", "Kecil"), ("default", "Normal"), ("large", "Besar")];
const THEMES: &[(&str, &str)] = &[("dark", "Gelap"), ("light", "Terang"), ("auto", "Ikuti sistem")];

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
        ID_VISIBLE => {
            if let Some(window) = main_window(app) {
                let visible = window.is_visible().unwrap_or(true);
                let _ = if visible { window.hide() } else { window.show() };
            }
        }
        ID_AUTOSTART => {
            let manager = app.autolaunch();
            let result = if manager.is_enabled().unwrap_or(false) { manager.disable() } else { manager.enable() };
            if let Err(err) = result {
                eprintln!("[tray] autostart toggle failed: {err}");
            }
        }
        ID_MINI_PLAYER => crate::miniplayer::toggle(app),
        ID_QUIT => app.exit(0),
        _ => {
            let _ = app.emit_to(MAIN_WINDOW_LABEL, EVENT_TRAY_SELECT, id);
        }
    }
    // Clicking a check item flips its mark immediately, even when the value did
    // not change (e.g. re-selecting the active theme). Rebuild from real state.
    refresh_menu(app);
}

fn build_menu(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let config = app.state::<ShellState>().current().unwrap_or_default();
    let visible = main_window(app).and_then(|w| w.is_visible().ok()).unwrap_or(true);
    let autostart = app.autolaunch().is_enabled().unwrap_or(false);

    let radio = |group: &str, title: &str, options: &[(&str, &str)], selected: &str| {
        let mut sub = SubmenuBuilder::new(app, title);
        for (value, label) in options {
            let item = CheckMenuItemBuilder::with_id(format!("{group}:{value}"), *label)
                .checked(*value == selected)
                .build(app)?;
            sub = sub.item(&item);
        }
        sub.build()
    };

    let mut monitor_menu = SubmenuBuilder::new(app, "Monitor");
    let auto = CheckMenuItemBuilder::with_id("monitor:auto", "Monitor utama")
        .checked(config.monitor.is_none())
        .build(app)?;
    monitor_menu = monitor_menu.item(&auto).separator();
    for (index, monitor) in crate::window::monitors(app).iter().enumerate() {
        let size = monitor.size();
        let primary = if monitor.primary { " (utama)" } else { "" };
        let label = format!("Layar {} \u{2013} {}\u{00d7}{}{}", index + 1, size.width, size.height, primary);
        let item = CheckMenuItemBuilder::with_id(format!("monitor:{}", monitor.name), label)
            .checked(config.monitor.as_deref() == Some(monitor.name.as_str()))
            .build(app)?;
        monitor_menu = monitor_menu.item(&item);
    }

    // Check items: each widget can be shown or hidden independently.
    let mut idle_menu = SubmenuBuilder::new(app, "Widget idle");
    for option in &config.idle_widget_options {
        let item = CheckMenuItemBuilder::with_id(format!("idle:{}", option.id), &option.label)
            .checked(config.idle_widgets.contains(&option.id))
            .build(app)?;
        idle_menu = idle_menu.item(&item);
    }

    let mut lyrics_menu = SubmenuBuilder::new(app, "Sumber lirik");
    for option in &config.lyrics_source_options {
        let item = CheckMenuItemBuilder::with_id(format!("lyricsSource:{}", option.id), &option.label)
            .checked(config.lyrics_source == option.id)
            .build(app)?;
        lyrics_menu = lyrics_menu.item(&item);
    }

    let shortcut_label = format!("Shortcut buka/tutup ({})", pretty_shortcut(&config.toggle_shortcut));

    MenuBuilder::new(app)
        .item(&MenuItemBuilder::with_id(ID_VISIBLE, if visible { "Sembunyikan notch" } else { "Tampilkan notch" }).build(app)?)
        .item(
            &CheckMenuItemBuilder::with_id(ID_MINI_PLAYER, "Mini player")
                .checked(crate::miniplayer::is_visible(app))
                .build(app)?,
        )
        .separator()
        .item(&monitor_menu.build()?)
        .item(&radio("shape", "Bentuk", SHAPES, &config.notch_shape)?)
        .item(&radio("size", "Ukuran", SIZES, &config.notch_size)?)
        .item(&radio("theme", "Tema", THEMES, &config.theme)?)
        .item(
            &CheckMenuItemBuilder::with_id(ID_SHRINK_BROWSERS, "Kecilkan saat browser")
                .checked(config.shrink_for_browsers)
                .build(app)?,
        )
        .item(&idle_menu.build()?)
        .item(
            &CheckMenuItemBuilder::with_id(ID_MEDIA_PILL, "Tampilkan lagu di pill")
                .checked(config.idle_shows_media)
                .build(app)?,
        )
        .item(&lyrics_menu.build()?)
        .item(
            &CheckMenuItemBuilder::with_id(ID_LYRICS_PILL, "Lirik di pill")
                .checked(config.pill_shows_lyrics)
                .enabled(config.idle_shows_media)
                .build(app)?,
        )
        .separator()
        .item(&CheckMenuItemBuilder::with_id(ID_SHORTCUT, shortcut_label).checked(config.shortcut_enabled).build(app)?)
        .item(&CheckMenuItemBuilder::with_id(ID_AUTOSTART, "Jalan saat login").checked(autostart).build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id(ID_QUIT, "Keluar").build(app)?)
        .build()
}

/// `Control+Alt+N` -> `Ctrl+Alt+N` for display.
fn pretty_shortcut(shortcut: &str) -> String {
    shortcut.replace("CommandOrControl", "Ctrl").replace("Control", "Ctrl")
}

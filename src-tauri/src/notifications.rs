//! Windows notifications for the notch's notification center.
//!
//! Reads the toasts in the Windows Action Center through
//! `UserNotificationListener` (the user allows it once, in Windows' privacy
//! settings). Its change event only works for packaged apps, so a background
//! thread polls every two seconds and tells the frontend what is new.

use serde::Serialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

/// New notifications since the last poll (`Vec<Notif>`), for the notch toasts.
pub const EVENT_NEW: &str = "notif://new";
/// The list or the access status changed.
pub const EVENT_CHANGED: &str = "notif://changed";

const POLL: std::time::Duration = std::time::Duration::from_secs(2);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Notif {
    pub id: u32,
    /// App User Model ID; also opens the app.
    pub app_id: String,
    pub app_name: String,
    pub title: String,
    pub body: String,
    /// Milliseconds since the Unix epoch.
    pub time: i64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotifList {
    /// "allowed", "denied", "unavailable", or "off" (turned off in the settings).
    pub status: String,
    pub items: Vec<Notif>,
}

static ENABLED: AtomicBool = AtomicBool::new(false);
static STARTED: AtomicBool = AtomicBool::new(false);
static STATE: Mutex<Option<NotifList>> = Mutex::new(None);
static ICONS: Mutex<Option<HashMap<String, Option<String>>>> = Mutex::new(None);

fn snapshot() -> NotifList {
    STATE
        .lock()
        .ok()
        .and_then(|s| s.clone())
        .unwrap_or(NotifList { status: if ENABLED.load(Ordering::SeqCst) { "unavailable" } else { "off" }.into(), items: Vec::new() })
}

/// Turns reading Windows notifications on or off. Returns the current list.
#[tauri::command]
pub fn notif_configure(app: AppHandle, enabled: bool) -> NotifList {
    ENABLED.store(enabled, Ordering::SeqCst);
    if !enabled {
        if let Ok(mut s) = STATE.lock() {
            *s = Some(NotifList { status: "off".into(), items: Vec::new() });
        }
        let _ = app.emit(EVENT_CHANGED, ());
    } else if !STARTED.swap(true, Ordering::SeqCst) {
        #[cfg(windows)]
        std::thread::Builder::new().name("notifications".into()).spawn(move || win::poll(app)).ok();
    }
    snapshot()
}

#[tauri::command]
pub fn notif_list() -> NotifList {
    snapshot()
}

/// Removes notifications from the Windows Action Center (and so from the list).
#[tauri::command(async)]
pub fn notif_remove(app: AppHandle, ids: Vec<u32>) {
    #[cfg(windows)]
    win::remove(&ids);
    if let Ok(mut s) = STATE.lock() {
        if let Some(list) = s.as_mut() {
            list.items.retain(|n| !ids.contains(&n.id));
        }
    }
    let _ = app.emit(EVENT_CHANGED, ());
}

/// Opens (or brings forward) the app a notification came from.
#[tauri::command(async)]
pub fn notif_open_app(app_id: String) -> Result<(), String> {
    if app_id.is_empty() {
        return Err("Aplikasinya tidak diketahui".into());
    }
    #[cfg(windows)]
    {
        win::shell_open(&format!("shell:AppsFolder\\{app_id}"))
    }
    #[cfg(not(windows))]
    Err("not supported".into())
}

/// Windows' privacy page where apps get access to notifications.
#[tauri::command(async)]
pub fn notif_open_settings() -> Result<(), String> {
    #[cfg(windows)]
    {
        win::shell_open("ms-settings:privacy-notifications")
    }
    #[cfg(not(windows))]
    Err("not supported".into())
}

/// The app's logo (PNG data URI), once a notification from it has been seen.
#[tauri::command]
pub fn notif_icon(app_id: String) -> Option<String> {
    ICONS.lock().ok().and_then(|i| i.as_ref().and_then(|m| m.get(&app_id).cloned())).flatten()
}

#[cfg(windows)]
mod win {
    use super::{Notif, NotifList, ENABLED, EVENT_CHANGED, EVENT_NEW, ICONS, POLL, STATE};
    use std::collections::{HashMap, HashSet};
    use std::sync::atomic::Ordering;
    use tauri::{AppHandle, Emitter};
    use windows::core::HSTRING;
    use windows::Foundation::Size;
    use windows::Storage::Streams::DataReader;
    use windows::UI::Notifications::Management::{UserNotificationListener, UserNotificationListenerAccessStatus};
    use windows::UI::Notifications::{KnownNotificationBindings, NotificationKinds, UserNotification};

    /// Windows `DateTime` (100 ns since 1601) to Unix milliseconds.
    fn unix_ms(ticks: i64) -> i64 {
        (ticks - 116_444_736_000_000_000) / 10_000
    }

    fn texts(n: &UserNotification) -> Vec<String> {
        (|| -> windows::core::Result<Vec<String>> {
            let binding = n.Notification()?.Visual()?.GetBinding(&KnownNotificationBindings::ToastGeneric()?)?;
            Ok(binding
                .GetTextElements()?
                .into_iter()
                .filter_map(|t| t.Text().ok().map(|s| s.to_string_lossy()))
                .filter(|s| !s.trim().is_empty())
                .collect())
        })()
        .unwrap_or_default()
    }

    fn logo(n: &UserNotification) -> Option<String> {
        use base64::Engine as _;
        let info = n.AppInfo().ok()?.DisplayInfo().ok()?;
        let stream = info.GetLogo(Size { Width: 64.0, Height: 64.0 }).ok()?.OpenReadAsync().ok()?.get().ok()?;
        let size = stream.Size().ok()? as u32;
        if size == 0 || size > 4 * 1024 * 1024 {
            return None;
        }
        let reader = DataReader::CreateDataReader(&stream).ok()?;
        reader.LoadAsync(size).ok()?.get().ok()?;
        let mut bytes = vec![0u8; size as usize];
        reader.ReadBytes(&mut bytes).ok()?;
        let mime = if bytes.starts_with(b"\x89PNG") { "image/png" } else { "image/jpeg" };
        Some(format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes)))
    }

    fn convert(n: &UserNotification) -> Option<Notif> {
        let id = n.Id().ok()?;
        let info = n.AppInfo().ok();
        let app_id = info.as_ref().and_then(|i| i.AppUserModelId().ok()).map(|s| s.to_string_lossy()).unwrap_or_default();
        let app_name = info
            .as_ref()
            .and_then(|i| i.DisplayInfo().ok())
            .and_then(|d| d.DisplayName().ok())
            .map(|s| s.to_string_lossy())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "Aplikasi".into());
        let mut lines = texts(n).into_iter();
        let title = lines.next().unwrap_or_default();
        let body = lines.collect::<Vec<_>>().join("\n");
        let time = n.CreationTime().map(|t| unix_ms(t.UniversalTime)).unwrap_or(0);

        let known = ICONS.lock().ok().is_some_and(|i| i.as_ref().is_some_and(|m| m.contains_key(&app_id)));
        if !known {
            let icon = logo(n);
            if let Ok(mut icons) = ICONS.lock() {
                icons.get_or_insert_with(HashMap::new).insert(app_id.clone(), icon);
            }
        }
        Some(Notif { id, app_id, app_name, title, body, time })
    }

    fn access(listener: &UserNotificationListener) -> &'static str {
        let mut status = listener.GetAccessStatus().unwrap_or(UserNotificationListenerAccessStatus::Unspecified);
        if status == UserNotificationListenerAccessStatus::Unspecified {
            status = listener
                .RequestAccessAsync()
                .and_then(|op| op.get())
                .unwrap_or(UserNotificationListenerAccessStatus::Unspecified);
        }
        match status {
            UserNotificationListenerAccessStatus::Allowed => "allowed",
            UserNotificationListenerAccessStatus::Denied => "denied",
            _ => "unavailable",
        }
    }

    fn set_state(app: &AppHandle, next: NotifList) {
        let changed = STATE.lock().ok().map(|mut s| {
            let changed = s.as_ref().map_or(true, |old| {
                old.status != next.status
                    || old.items.len() != next.items.len()
                    || old.items.iter().zip(&next.items).any(|(a, b)| a.id != b.id)
            });
            *s = Some(next);
            changed
        });
        if changed == Some(true) {
            let _ = app.emit(EVENT_CHANGED, ());
        }
    }

    pub fn poll(app: AppHandle) {
        use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};
        let _ = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
        let listener = match UserNotificationListener::Current() {
            Ok(l) => l,
            Err(e) => {
                eprintln!("[notifications] listener unavailable: {e}");
                set_state(&app, NotifList { status: "unavailable".into(), items: Vec::new() });
                return;
            }
        };
        // Notifications already there at start are listed but not announced.
        let mut seen: Option<HashSet<u32>> = None;
        loop {
            if !ENABLED.load(Ordering::SeqCst) {
                seen = None;
                std::thread::sleep(POLL);
                continue;
            }
            let status = access(&listener);
            let items: Vec<Notif> = if status == "allowed" {
                listener
                    .GetNotificationsAsync(NotificationKinds::Toast)
                    .and_then(|op| op.get())
                    .map(|list| list.into_iter().filter_map(|n| convert(&n)).collect())
                    .unwrap_or_default()
            } else {
                Vec::new()
            };
            let mut items = items;
            items.sort_by(|a, b| b.time.cmp(&a.time));

            if let Some(seen) = &seen {
                let mut fresh: Vec<Notif> = items.iter().filter(|n| !seen.contains(&n.id)).cloned().collect();
                if !fresh.is_empty() {
                    fresh.reverse();
                    let _ = app.emit(EVENT_NEW, fresh);
                }
            }
            if status == "allowed" {
                seen = Some(items.iter().map(|n| n.id).collect());
            }
            set_state(&app, NotifList { status: status.into(), items });
            std::thread::sleep(POLL);
        }
    }

    pub fn remove(ids: &[u32]) {
        let Ok(listener) = UserNotificationListener::Current() else { return };
        for id in ids {
            let _ = listener.RemoveNotification(*id);
        }
    }

    pub fn shell_open(target: &str) -> Result<(), String> {
        use windows::core::w;
        use windows::Win32::UI::Shell::ShellExecuteW;
        use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
        let result = unsafe { ShellExecuteW(None, w!("open"), &HSTRING::from(target), None, None, SW_SHOWNORMAL) };
        if result.0 as isize > 32 {
            Ok(())
        } else {
            Err("Tidak bisa dibuka".into())
        }
    }
}

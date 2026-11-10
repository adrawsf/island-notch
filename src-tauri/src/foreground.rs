//! Watches the foreground window so the notch can get out of the way of a
//! browser's tab strip.
//!
//! Emits `notch://compact` (bool) when it changes: true while a browser is the
//! active window, sits on the notch's monitor and touches the top edge under
//! the notch (maximized, snapped to the top or full screen).

use tauri::{AppHandle, Emitter};

pub const EVENT_COMPACT: &str = "notch://compact";

/// Executables treated as browsers (lowercase file names).
const BROWSERS: &[&str] = &[
    "chrome.exe",
    "msedge.exe",
    "brave.exe",
    "firefox.exe",
    "opera.exe",
    "vivaldi.exe",
    "arc.exe",
    "zen.exe",
    "chromium.exe",
    "thorium.exe",
    "floorp.exe",
    "librewolf.exe",
    "waterfox.exe",
];

#[cfg(windows)]
pub fn start(app: AppHandle) {
    use std::time::Duration;

    const POLL: Duration = Duration::from_millis(400);

    std::thread::spawn(move || {
        let own_pid = std::process::id();
        let mut last = false;
        loop {
            std::thread::sleep(POLL);
            let Some(notch) = crate::window::main_window(&app) else { continue };
            // `None`: our own window is in front (the user is using the notch,
            // mini player or teleprompter); keep the current state.
            let Some(compact) = win::browser_under_notch(&notch, own_pid) else { continue };
            if compact != last {
                last = compact;
                let _ = app.emit_to(crate::window::MAIN_WINDOW_LABEL, EVENT_COMPACT, compact);
            }
        }
    });
}

#[cfg(not(windows))]
pub fn start(_app: AppHandle) {}

#[cfg(windows)]
mod win {
    use super::BROWSERS;
    use windows::Win32::Foundation::{CloseHandle, HWND, RECT};
    use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST};
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowRect, GetWindowThreadProcessId, IsIconic};

    /// Some(true) when a browser should make the notch compact, Some(false)
    /// when not, None when one of our own windows is in front.
    pub fn browser_under_notch(notch: &tauri::WebviewWindow, own_pid: u32) -> Option<bool> {
        unsafe {
            let fg = GetForegroundWindow();
            if fg.0.is_null() {
                return Some(false);
            }
            let mut pid = 0u32;
            GetWindowThreadProcessId(fg, Some(&mut pid));
            if pid == own_pid {
                return None;
            }
            if IsIconic(fg).as_bool() || !is_browser(pid) {
                return Some(false);
            }
            let Ok(raw) = notch.hwnd() else { return Some(false) };
            let notch_hwnd = HWND(raw.0);

            // Same monitor as the notch.
            let monitor = MonitorFromWindow(notch_hwnd, MONITOR_DEFAULTTONEAREST);
            if MonitorFromWindow(fg, MONITOR_DEFAULTTONEAREST) != monitor {
                return Some(false);
            }
            let mut info = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
            if !GetMonitorInfoW(monitor, &mut info).as_bool() {
                return Some(false);
            }

            // Touches the top edge (maximized windows extend a few px past it)
            // and spans the notch's horizontal centre.
            let mut fg_rect = RECT::default();
            let mut notch_rect = RECT::default();
            if GetWindowRect(fg, &mut fg_rect).is_err() || GetWindowRect(notch_hwnd, &mut notch_rect).is_err() {
                return Some(false);
            }
            let top_edge = info.rcMonitor.top;
            let centre_x = (notch_rect.left + notch_rect.right) / 2;
            let touches_top = fg_rect.top <= top_edge + 4;
            let under_notch = fg_rect.left <= centre_x && fg_rect.right >= centre_x;
            Some(touches_top && under_notch)
        }
    }

    fn is_browser(pid: u32) -> bool {
        unsafe {
            let Ok(process) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else { return false };
            let mut buf = [0u16; 260];
            let mut len = buf.len() as u32;
            let ok = QueryFullProcessImageNameW(
                process,
                PROCESS_NAME_WIN32,
                windows::core::PWSTR(buf.as_mut_ptr()),
                &mut len,
            )
            .is_ok();
            let _ = CloseHandle(process);
            if !ok {
                return false;
            }
            let path = String::from_utf16_lossy(&buf[..len as usize]).to_lowercase();
            let exe = path.rsplit(['\\', '/']).next().unwrap_or("");
            BROWSERS.contains(&exe)
        }
    }
}

/// Current state, for a webview that (re)loads after the last change.
#[tauri::command]
pub fn notch_compact_state(app: AppHandle) -> bool {
    #[cfg(windows)]
    {
        if let Some(notch) = crate::window::main_window(&app) {
            return win::browser_under_notch(&notch, std::process::id()).unwrap_or(false);
        }
    }
    let _ = app;
    false
}

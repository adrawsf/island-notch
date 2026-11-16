//! Watches the foreground window so the notch can get out of the way.
//!
//! - Browser under the notch: emits `notch://compact` (bool) when it changes,
//!   true while a browser is the active window, sits on the notch's monitor
//!   and touches the top edge under the notch (maximized, snapped or full
//!   screen). The frontend shrinks the notch to a thin handle.
//! - Full screen app (a game, a video played full screen) on the notch's
//!   monitor: the notch window is hidden outright, and shown again (without
//!   taking focus) when the app leaves full screen. Opening the notch with the
//!   shortcut or the tray during full screen keeps it shown until then.

use std::sync::atomic::{AtomicIsize, AtomicU8, Ordering};
use tauri::{AppHandle, Emitter, Manager};

pub const EVENT_COMPACT: &str = "notch://compact";

/// Nothing hidden for full screen.
const FS_NONE: u8 = 0;
/// Hidden by this module; shown again when full screen ends.
const FS_HIDDEN: u8 = 1;
/// The user brought it back during full screen; leave it alone until it ends.
const FS_USER: u8 = 2;
static FULLSCREEN_STATE: AtomicU8 = AtomicU8::new(FS_NONE);

/// Last foreground window of another app (HWND as isize, 0 = none yet).
static LAST_EXTERNAL: AtomicIsize = AtomicIsize::new(0);

/// The window the user was in before switching to one of ours (the notch):
/// where a clipboard item gets pasted.
pub fn last_external_window() -> Option<isize> {
    match LAST_EXTERNAL.load(Ordering::SeqCst) {
        0 => None,
        hwnd => Some(hwnd),
    }
}

/// The user asked for the notch (shortcut, tray) while it was hidden for a
/// full screen app: keep it shown for the rest of that full screen session.
pub fn user_shown() {
    let _ = FULLSCREEN_STATE.compare_exchange(FS_HIDDEN, FS_USER, Ordering::SeqCst, Ordering::SeqCst);
}

fn hide_in_fullscreen_enabled(app: &AppHandle) -> bool {
    app.state::<crate::shell::ShellState>().current().map(|c| c.hide_in_fullscreen).unwrap_or(true)
}

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
            if let Some(hwnd) = win::external_foreground(own_pid) {
                LAST_EXTERNAL.store(hwnd, Ordering::SeqCst);
            }
            let Some(notch) = crate::window::main_window(&app) else { continue };
            // `None`: our own window is in front (the user is using the notch,
            // mini player or teleprompter); keep the current state.
            let Some(front) = win::inspect(&notch, own_pid) else { continue };
            if front.browser_under_notch != last {
                last = front.browser_under_notch;
                let _ = app.emit_to(crate::window::MAIN_WINDOW_LABEL, EVENT_COMPACT, last);
            }
            update_fullscreen(&app, &notch, front.fullscreen && hide_in_fullscreen_enabled(&app));
        }
    });
}

#[cfg(windows)]
fn update_fullscreen(app: &AppHandle, notch: &tauri::WebviewWindow, fullscreen: bool) {
    let state = FULLSCREEN_STATE.load(Ordering::SeqCst);
    if fullscreen {
        // A notch the user hid from the tray stays as it is (FS_NONE, not visible).
        if state == FS_NONE && notch.is_visible().unwrap_or(false) {
            win::set_shown(notch, false);
            FULLSCREEN_STATE.store(FS_HIDDEN, Ordering::SeqCst);
            crate::tray::refresh_menu(app);
        }
    } else if state != FS_NONE {
        FULLSCREEN_STATE.store(FS_NONE, Ordering::SeqCst);
        if state == FS_HIDDEN {
            win::set_shown(notch, true);
            crate::tray::refresh_menu(app);
        }
    }
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
    use windows::Win32::UI::WindowsAndMessaging::{
        GetClassNameW, GetForegroundWindow, GetWindowLongW, GetWindowRect, GetWindowThreadProcessId, IsIconic, IsZoomed,
        ShowWindow, GWL_STYLE, SW_HIDE, SW_SHOWNOACTIVATE, WS_CAPTION,
    };

    #[derive(Default)]
    pub struct Foreground {
        /// A browser touches the top edge under the notch.
        pub browser_under_notch: bool,
        /// An app covers the whole monitor the notch is on (game, full screen video).
        pub fullscreen: bool,
    }

    /// What the foreground window means for the notch; None when one of our
    /// own windows is in front.
    pub fn inspect(notch: &tauri::WebviewWindow, own_pid: u32) -> Option<Foreground> {
        unsafe {
            let fg = GetForegroundWindow();
            if fg.0.is_null() {
                return Some(Foreground::default());
            }
            let mut pid = 0u32;
            GetWindowThreadProcessId(fg, Some(&mut pid));
            if pid == own_pid {
                return None;
            }
            if IsIconic(fg).as_bool() || is_desktop(fg) {
                return Some(Foreground::default());
            }
            let Ok(raw) = notch.hwnd() else { return Some(Foreground::default()) };
            let notch_hwnd = HWND(raw.0);

            // Same monitor as the notch.
            let monitor = MonitorFromWindow(notch_hwnd, MONITOR_DEFAULTTONEAREST);
            if MonitorFromWindow(fg, MONITOR_DEFAULTTONEAREST) != monitor {
                return Some(Foreground::default());
            }
            let mut info = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
            if !GetMonitorInfoW(monitor, &mut info).as_bool() {
                return Some(Foreground::default());
            }
            let mut fg_rect = RECT::default();
            let mut notch_rect = RECT::default();
            if GetWindowRect(fg, &mut fg_rect).is_err() || GetWindowRect(notch_hwnd, &mut notch_rect).is_err() {
                return Some(Foreground::default());
            }
            let screen = info.rcMonitor;

            // Full screen: covers the whole monitor, taskbar included. A
            // maximized window with an auto-hidden taskbar covers it too, so
            // it must also be borderless or not maximized.
            let covers = fg_rect.left <= screen.left
                && fg_rect.top <= screen.top
                && fg_rect.right >= screen.right
                && fg_rect.bottom >= screen.bottom;
            let captioned = (GetWindowLongW(fg, GWL_STYLE) as u32 & WS_CAPTION.0) == WS_CAPTION.0;
            let fullscreen = covers && (!captioned || !IsZoomed(fg).as_bool());

            // Browser: touches the top edge (maximized windows extend a few px
            // past it) and spans the notch's horizontal centre.
            let centre_x = (notch_rect.left + notch_rect.right) / 2;
            let touches_top = fg_rect.top <= screen.top + 4;
            let under_notch = fg_rect.left <= centre_x && fg_rect.right >= centre_x;
            let browser_under_notch = touches_top && under_notch && is_browser(pid);

            Some(Foreground { browser_under_notch, fullscreen })
        }
    }

    /// The foreground window if it belongs to another process.
    pub fn external_foreground(own_pid: u32) -> Option<isize> {
        unsafe {
            let fg = GetForegroundWindow();
            if fg.0.is_null() {
                return None;
            }
            let mut pid = 0u32;
            GetWindowThreadProcessId(fg, Some(&mut pid));
            (pid != 0 && pid != own_pid).then_some(fg.0 as isize)
        }
    }

    /// The desktop and taskbar can cover the monitor but are not full screen apps.
    fn is_desktop(hwnd: HWND) -> bool {
        let mut buf = [0u16; 64];
        let len = unsafe { GetClassNameW(hwnd, &mut buf) };
        if len <= 0 {
            return false;
        }
        let class = String::from_utf16_lossy(&buf[..len as usize]);
        matches!(class.as_str(), "Progman" | "WorkerW" | "Shell_TrayWnd" | "Shell_SecondaryTrayWnd")
    }

    /// Hides or shows the notch window; showing never takes focus from the
    /// app the user is in.
    pub fn set_shown(notch: &tauri::WebviewWindow, shown: bool) {
        let Ok(raw) = notch.hwnd() else { return };
        unsafe {
            let _ = ShowWindow(HWND(raw.0), if shown { SW_SHOWNOACTIVATE } else { SW_HIDE });
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
            return win::inspect(&notch, std::process::id()).map(|f| f.browser_under_notch).unwrap_or(false);
        }
    }
    let _ = app;
    false
}

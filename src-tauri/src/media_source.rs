//! Brings the app behind the current media session to the front.
//!
//! SMTC only reports an AppUserModelID ("Spotify.exe", "Chrome",
//! "SpotifyAB.SpotifyMusic_x!Spotify"...), not a window or process, so the
//! window is found by matching that id against each window's process name.
//!
//! Browsers share one id across all their windows and profiles, so for them
//! the tabs of every window are read through UI Automation and the tab that
//! plays the track (its name holds the title, or Chrome's "Audio playing"
//! marker) is selected before its window comes forward.

use tauri::{AppHandle, Manager};

use crate::media::MediaStore;

/// Opens the source of the media currently shown. Returns false when nothing
/// could be brought forward.
#[tauri::command]
pub async fn media_open_source(app: AppHandle) -> bool {
    let (app_id, title) = app.state::<MediaStore>().source();
    if app_id.is_empty() {
        return false;
    }
    // UI Automation walks other processes' trees: keep it off the main thread.
    tauri::async_runtime::spawn_blocking(move || open_blocking(&app_id, &title))
        .await
        .unwrap_or(false)
}

fn open_blocking(app_id: &str, title: &str) -> bool {
    #[cfg(windows)]
    {
        let windows = win::app_windows(app_id);
        if is_browser(app_id) {
            if let Some(hwnd) = win::select_playing_tab(&windows, title) {
                return win::focus(hwnd);
            }
        }
        if let Some(&hwnd) = windows.first() {
            if win::focus(hwnd) {
                return true;
            }
        }
        // Store apps can be (re)opened by id even without a window.
        if app_id.contains('!') && is_safe_app_id(app_id) {
            return std::process::Command::new("explorer.exe")
                .arg(format!("shell:AppsFolder\\{app_id}"))
                .spawn()
                .is_ok();
        }
    }
    let _ = (app_id, title);
    false
}

/// Package app ids are `Publisher.Name_hash!App`; anything else is refused.
fn is_safe_app_id(id: &str) -> bool {
    id.len() < 200 && id.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '!' | '-'))
}

/// Browser process names (without ".exe").
const BROWSERS: &[&str] = &[
    "chrome", "msedge", "brave", "firefox", "opera", "vivaldi", "arc", "zen", "chromium", "thorium", "floorp",
    "librewolf", "waterfox",
];

fn is_browser(app_id: &str) -> bool {
    candidate_process_names(app_id).iter().any(|n| BROWSERS.contains(&n.as_str()))
}

/// Process names (without ".exe") an app id may belong to.
fn candidate_process_names(app_id: &str) -> Vec<String> {
    let lower = app_id.to_lowercase();
    // Browsers register under their own names; Firefox under a hash.
    const ALIASES: &[(&str, &str)] = &[
        ("308046b0af4a39cb", "firefox"),
        ("microsoftedge", "msedge"),
        ("msedge", "msedge"),
        ("chrome", "chrome"),
    ];
    let mut names: Vec<String> = ALIASES
        .iter()
        .filter(|(key, _)| lower.contains(key))
        .map(|(_, exe)| exe.to_string())
        .collect();
    // "Spotify.exe" -> "spotify"; "SpotifyAB.SpotifyMusic_x!Spotify" -> "spotify", "spotifymusic".
    names.extend(
        lower
            .split(|c: char| !c.is_ascii_alphanumeric())
            .filter(|w| w.len() >= 3 && *w != "exe")
            .map(str::to_string),
    );
    names
}

/// A browser tab on a music site, read from its name.
#[derive(Clone)]
pub struct MusicTab {
    /// App id the browser uses in SMTC (so "open source" finds it again).
    pub app_id: String,
    pub title: String,
    pub artist: String,
}

/// Chrome-style "this tab is playing" markers, as they appear in tab names.
const AUDIO_MARKERS: &[&str] = &["audio playing", "playing audio", "memutar audio", "audio sedang diputar"];

/// Title and artist from the name of a tab on a known music site, or None
/// for any other tab (films and videos stay out).
fn parse_music_tab(tab_name: &str) -> Option<(String, String)> {
    // Drop the trailing " - Audio playing" marker.
    let lower = tab_name.to_lowercase();
    let cut = AUDIO_MARKERS.iter().filter_map(|m| lower.rfind(m)).min().unwrap_or(tab_name.len());
    let name = tab_name[..cut].trim_end_matches([' ', '-', ',', '–', '—']).trim();

    let strip = |suffixes: &[&str]| -> Option<String> {
        suffixes.iter().find_map(|s| {
            let at = name.to_lowercase().rfind(&s.to_lowercase())?;
            Some(name[..at].trim_end_matches([' ', '|', '-', '–', '—']).trim().to_string())
        })
    };
    // "Title by Artist" (Apple Music, SoundCloud).
    let by = |text: String| -> (String, String) {
        match text.rsplit_once(" by ") {
            Some((title, artist)) => (title.trim().to_string(), artist.trim().to_string()),
            None => (text, String::new()),
        }
    };

    let (title, artist) = if let Some(rest) = strip(&["| YouTube Music", "- YouTube Music"]) {
        (rest, String::new()) // usually "Artist - Title"; the frontend splits it for lyrics
    } else if let Some(rest) = strip(&["– Apple Music", "- Apple Music", "| Apple Music"]) {
        by(rest)
    } else if let Some(rest) = strip(&["| SoundCloud", "- SoundCloud"]) {
        by(rest.trim_start_matches("Stream ").to_string())
    } else if let Some(rest) = strip(&["| Deezer", "- Deezer", "| TIDAL", "- TIDAL"]) {
        match rest.split_once(" - ") {
            Some((title, artist)) => (title.trim().to_string(), artist.trim().to_string()),
            None => (rest, String::new()),
        }
    } else if let Some((title, artist)) = name.split_once(" • ") {
        // Spotify Web: "Title • Artist" while playing.
        (title.trim().to_string(), artist.trim().to_string())
    } else {
        return None;
    };
    (!title.is_empty()).then_some((title, artist))
}

/// SMTC app id for a browser process, so the tab can be found again later.
fn browser_app_id(process: &str) -> String {
    match process {
        "chrome" => "Chrome".into(),
        "msedge" => "MSEdge".into(),
        "firefox" => "308046B0AF4A39CB".into(),
        other => {
            let mut c = other.chars();
            c.next().map(|f| f.to_uppercase().collect::<String>() + c.as_str()).unwrap_or_default()
        }
    }
}

/// The first audibly playing music tab in any browser window (front to back).
#[cfg(windows)]
pub fn find_music_tab() -> Option<MusicTab> {
    win::find_music_tab()
}

/// Every open tab on a known music site, playing or paused.
#[cfg(windows)]
pub fn music_tabs() -> Vec<MusicTab> {
    win::music_tabs()
}

#[cfg(not(windows))]
pub fn music_tabs() -> Vec<MusicTab> {
    Vec::new()
}

#[cfg(not(windows))]
pub fn find_music_tab() -> Option<MusicTab> {
    None
}

/// Lowercase letters and digits only, for loose title comparison.
fn normalize(text: &str) -> String {
    text.chars().filter(|c| c.is_alphanumeric()).flat_map(char::to_lowercase).collect()
}

/// How sure we are that a tab with this name plays the track: its name holds
/// the title (best), it carries the browser's "playing audio" marker, or both.
fn tab_score(tab_name: &str, wanted_title: &str) -> u8 {
    let lower = tab_name.to_lowercase();
    let mut score = 0;
    if wanted_title.chars().count() >= 3 && normalize(tab_name).contains(wanted_title) {
        score += 2;
    }
    if AUDIO_MARKERS.iter().any(|m| lower.contains(m)) {
        score += 1;
    }
    score
}

#[cfg(windows)]
mod win {
    use super::{
        browser_app_id, candidate_process_names, normalize, parse_music_tab, tab_score, MusicTab, AUDIO_MARKERS,
        BROWSERS,
    };
    use windows::core::VARIANT;
    use windows::Win32::Foundation::{BOOL, CloseHandle, HWND, LPARAM};
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED};
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::Accessibility::{
        CUIAutomation, IUIAutomation, IUIAutomationElement, IUIAutomationSelectionItemPattern, TreeScope_Descendants,
        UIA_ControlTypePropertyId, UIA_SelectionItemPatternId, UIA_TabItemControlTypeId,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindow, GetWindowLongPtrW, GetWindowTextLengthW, GetWindowThreadProcessId, IsIconic,
        IsWindowVisible, SetForegroundWindow, ShowWindow, GWL_EXSTYLE, GW_OWNER, SW_RESTORE, WS_EX_TOOLWINDOW,
    };

    /// The app's normal top-level windows, most recently used first.
    pub fn app_windows(app_id: &str) -> Vec<HWND> {
        windows_of(&candidate_process_names(app_id))
            .into_iter()
            .map(|(hwnd, _)| hwnd)
            .collect()
    }

    /// Normal top-level windows of processes named in `names` (front to
    /// back), with each window's process name.
    fn windows_of(names: &[String]) -> Vec<(HWND, String)> {
        if names.is_empty() {
            return Vec::new();
        }
        let own_pid = std::process::id();
        let mut found = Vec::new();
        // EnumWindows walks top-level windows in z-order (front to back).
        let mut visit = |hwnd: HWND| -> bool {
            unsafe {
                if !IsWindowVisible(hwnd).as_bool()
                    || GetWindowTextLengthW(hwnd) == 0
                    || !GetWindow(hwnd, GW_OWNER).unwrap_or_default().0.is_null()
                    || (GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32 & WS_EX_TOOLWINDOW.0) != 0
                {
                    return true;
                }
                let mut pid = 0u32;
                GetWindowThreadProcessId(hwnd, Some(&mut pid));
                if pid != own_pid {
                    if let Some(exe) = process_name(pid) {
                        if names.iter().any(|n| *n == exe) {
                            found.push((hwnd, exe));
                        }
                    }
                }
                true
            }
        };
        unsafe extern "system" fn callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
            let visit = &mut *(lparam.0 as *mut &mut dyn FnMut(HWND) -> bool);
            BOOL::from(visit(hwnd))
        }
        let mut visit_ref: &mut dyn FnMut(HWND) -> bool = &mut visit;
        unsafe {
            let _ = EnumWindows(Some(callback), LPARAM(&mut visit_ref as *mut _ as isize));
        }
        found
    }

    /// The tabs of a window, as (name, element).
    unsafe fn tabs_of(uia: &IUIAutomation, hwnd: HWND) -> Vec<(String, IUIAutomationElement)> {
        let Ok(condition) =
            uia.CreatePropertyCondition(UIA_ControlTypePropertyId, &VARIANT::from(UIA_TabItemControlTypeId.0))
        else {
            return Vec::new();
        };
        let Ok(root) = uia.ElementFromHandle(hwnd) else { return Vec::new() };
        let Ok(tabs) = root.FindAll(TreeScope_Descendants, &condition) else { return Vec::new() };
        (0..tabs.Length().unwrap_or(0))
            .filter_map(|i| tabs.GetElement(i).ok())
            .map(|tab| (tab.CurrentName().map(|n| n.to_string()).unwrap_or_default(), tab))
            .collect()
    }

    unsafe fn automation() -> Option<IUIAutomation> {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER).ok()
    }

    pub fn find_music_tab() -> Option<MusicTab> {
        let names: Vec<String> = BROWSERS.iter().map(|b| b.to_string()).collect();
        unsafe {
            let uia = automation()?;
            for (hwnd, process) in windows_of(&names) {
                for (name, _) in tabs_of(&uia, hwnd) {
                    let lower = name.to_lowercase();
                    if !AUDIO_MARKERS.iter().any(|m| lower.contains(m)) {
                        continue;
                    }
                    if let Some((title, artist)) = parse_music_tab(&name) {
                        return Some(MusicTab { app_id: browser_app_id(&process), title, artist });
                    }
                }
            }
        }
        None
    }

    pub fn music_tabs() -> Vec<MusicTab> {
        let names: Vec<String> = BROWSERS.iter().map(|b| b.to_string()).collect();
        let mut found = Vec::new();
        unsafe {
            let Some(uia) = automation() else { return found };
            for (hwnd, process) in windows_of(&names) {
                for (name, _) in tabs_of(&uia, hwnd) {
                    if let Some((title, artist)) = parse_music_tab(&name) {
                        found.push(MusicTab { app_id: browser_app_id(&process), title, artist });
                    }
                }
            }
        }
        found
    }

    /// Finds the tab playing `title` across `windows`, selects it and returns
    /// its window. Ties go to the most recently used window.
    pub fn select_playing_tab(windows: &[HWND], title: &str) -> Option<HWND> {
        unsafe {
            let uia = automation()?;
            let wanted = normalize(title);
            let mut best: Option<(u8, HWND, IUIAutomationElement)> = None;
            for &hwnd in windows {
                for (name, tab) in tabs_of(&uia, hwnd) {
                    let score = tab_score(&name, &wanted);
                    if score > 0 && best.as_ref().map_or(true, |(s, _, _)| score > *s) {
                        best = Some((score, hwnd, tab));
                    }
                }
            }
            let (_, hwnd, tab) = best?;
            if let Ok(item) = tab.GetCurrentPatternAs::<IUIAutomationSelectionItemPattern>(UIA_SelectionItemPatternId) {
                let _ = item.Select();
            }
            Some(hwnd)
        }
    }

    /// Restores and activates `hwnd`.
    pub fn focus(hwnd: HWND) -> bool {
        unsafe {
            if IsIconic(hwnd).as_bool() {
                let _ = ShowWindow(hwnd, SW_RESTORE);
            }
            if SetForegroundWindow(hwnd).as_bool() {
                return true;
            }
            // Windows may refuse (e.g. from the no-activate mini player) and
            // only flash the taskbar. A synthetic Alt tap releases the
            // foreground lock without any visible effect.
            tap_alt();
            SetForegroundWindow(hwnd).as_bool()
        }
    }

    fn tap_alt() {
        use windows::Win32::UI::Input::KeyboardAndMouse::{
            SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP, VK_MENU,
        };
        let key = |flags| INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT { wVk: VK_MENU, wScan: 0, dwFlags: flags, time: 0, dwExtraInfo: 0 },
            },
        };
        unsafe {
            SendInput(&[key(KEYBD_EVENT_FLAGS(0)), key(KEYEVENTF_KEYUP)], std::mem::size_of::<INPUT>() as i32);
        }
    }

    /// Lowercase executable name without ".exe".
    fn process_name(pid: u32) -> Option<String> {
        unsafe {
            let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
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
                return None;
            }
            let path = String::from_utf16_lossy(&buf[..len as usize]).to_lowercase();
            let file = path.rsplit(['\\', '/']).next()?.to_string();
            Some(file.trim_end_matches(".exe").to_string())
        }
    }
}

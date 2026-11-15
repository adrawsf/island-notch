//! Volume of the app that is playing media, like its slider in the Windows
//! volume mixer.
//!
//! SMTC tells us which app plays (its AppUserModelId, e.g. `Spotify.exe`,
//! `Chrome` or `SpotifyAB.SpotifyMusic_…!Spotify`); Core Audio has one volume
//! per audio session, owned by a process. Sessions on the default output
//! device whose executable matches the app id are adjusted together (a
//! browser plays from several processes). When nothing matches (Firefox
//! reports a hashed id), the one session that is currently making sound is
//! used, if there is exactly one.

use serde::Serialize;

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppVolume {
    /// 0.0 - 1.0
    pub volume: f32,
    pub muted: bool,
}

/// Current volume of the playing app, or None when its audio session is not found.
#[tauri::command(async)]
pub fn media_volume_get(app_id: String) -> Option<AppVolume> {
    win::with_sessions(&app_id, |sessions| {
        let first = sessions.first()?;
        unsafe {
            Some(AppVolume {
                volume: first.GetMasterVolume().ok()?,
                muted: first.GetMute().map(|m| m.as_bool()).unwrap_or(false),
            })
        }
    })
    .flatten()
}

/// Sets the volume (0-1) and/or mute of the playing app. Returns the new state.
#[tauri::command(async)]
pub fn media_volume_set(app_id: String, volume: Option<f32>, muted: Option<bool>) -> Option<AppVolume> {
    win::with_sessions(&app_id, |sessions| {
        for s in sessions {
            unsafe {
                if let Some(v) = volume {
                    let _ = s.SetMasterVolume(v.clamp(0.0, 1.0), std::ptr::null());
                }
                if let Some(m) = muted {
                    let _ = s.SetMute(m, std::ptr::null());
                }
            }
        }
    })?;
    media_volume_get(app_id)
}

#[cfg(windows)]
mod win {
    use windows::core::Interface;
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::Media::Audio::{
        eConsole, eRender, AudioSessionStateActive, IAudioSessionControl2, IAudioSessionManager2, IMMDeviceEnumerator,
        ISimpleAudioVolume, MMDeviceEnumerator,
    };
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED};
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
    };

    struct Candidate {
        volume: ISimpleAudioVolume,
        exe: String,
        active: bool,
    }

    /// Runs `f` with the volume controls of the sessions belonging to `app_id`.
    /// None when Core Audio fails or no session matches.
    pub fn with_sessions<R>(app_id: &str, f: impl FnOnce(&[ISimpleAudioVolume]) -> R) -> Option<R> {
        unsafe {
            // Async commands run on a worker thread; MTA is fine for Core Audio.
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            let candidates = sessions().ok()?;
            let id = app_id.to_lowercase();
            let mut matched: Vec<ISimpleAudioVolume> = candidates
                .iter()
                .filter(|c| matches_app(&id, &c.exe))
                .map(|c| c.volume.clone())
                .collect();
            if matched.is_empty() {
                let active: Vec<&Candidate> = candidates.iter().filter(|c| c.active).collect();
                if active.len() == 1 {
                    matched.push(active[0].volume.clone());
                }
            }
            if matched.is_empty() {
                return None;
            }
            Some(f(&matched))
        }
    }

    /// `exe` is a lowercase file stem ("spotify", "chrome", "msedge").
    fn matches_app(app_id: &str, exe: &str) -> bool {
        if exe.len() < 3 {
            return false;
        }
        let tail = app_id.rsplit('!').next().unwrap_or(app_id);
        app_id == exe || app_id == format!("{exe}.exe") || tail == exe || app_id.contains(exe)
    }

    unsafe fn sessions() -> windows::core::Result<Vec<Candidate>> {
        let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
        let device = enumerator.GetDefaultAudioEndpoint(eRender, eConsole)?;
        let manager: IAudioSessionManager2 = device.Activate(CLSCTX_ALL, None)?;
        let list = manager.GetSessionEnumerator()?;
        let own_pid = std::process::id();
        let mut out = Vec::new();
        for i in 0..list.GetCount()? {
            let Ok(control) = list.GetSession(i) else { continue };
            let Ok(control2) = control.cast::<IAudioSessionControl2>() else { continue };
            // S_OK (0) means it is the system sounds session.
            if control2.IsSystemSoundsSession().0 == 0 {
                continue;
            }
            let pid = control2.GetProcessId().unwrap_or(0);
            if pid == 0 || pid == own_pid {
                continue;
            }
            let Ok(volume) = control.cast::<ISimpleAudioVolume>() else { continue };
            let active = control.GetState().map(|s| s == AudioSessionStateActive).unwrap_or(false);
            out.push(Candidate { volume, exe: exe_stem(pid), active });
        }
        Ok(out)
    }

    fn exe_stem(pid: u32) -> String {
        unsafe {
            let Ok(process) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else { return String::new() };
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
                return String::new();
            }
            let path = String::from_utf16_lossy(&buf[..len as usize]).to_lowercase();
            let file = path.rsplit(['\\', '/']).next().unwrap_or("");
            file.strip_suffix(".exe").unwrap_or(file).to_string()
        }
    }
}

#[cfg(not(windows))]
mod win {
    pub struct ISimpleAudioVolume;
    pub fn with_sessions<R>(_app_id: &str, _f: impl FnOnce(&[ISimpleAudioVolume]) -> R) -> Option<R> {
        None
    }
}

//! Volume mixer (the Suara tab): master volume of the default output, one
//! slider per app that has an audio session on it, the output device, and
//! the default microphone's mute.
//!
//! Apps are grouped by executable (a browser plays from several processes),
//! named after the exe's file description ("Google Chrome") and shown with
//! the exe's icon. Switching the default output uses `IPolicyConfig`, an
//! undocumented but long-stable interface (the same one EarTrumpet and the
//! Windows sound settings use).

use serde::Serialize;
use std::collections::HashMap;
use std::sync::Mutex;

#[derive(Debug, Clone, Copy, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Level {
    /// 0.0 - 1.0
    pub volume: f32,
    pub muted: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Endpoint {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSession {
    /// Stable id for the group: the exe path (lowercase), "system", or "pid:N".
    pub key: String,
    pub name: String,
    /// For the icon; "" when unknown.
    pub exe_path: String,
    pub volume: f32,
    pub muted: bool,
    /// Making sound right now.
    pub active: bool,
    /// The Windows "System sounds" session.
    pub system: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Mic {
    pub name: String,
    pub muted: bool,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MixerState {
    /// Id of the default output, None when there is no output device.
    pub output_id: Option<String>,
    pub outputs: Vec<Endpoint>,
    pub master: Option<Level>,
    pub apps: Vec<AppSession>,
    pub mic: Option<Mic>,
}

/// File descriptions and icons per exe path, for the session.
static NAMES: Mutex<Option<HashMap<String, String>>> = Mutex::new(None);
static ICONS: Mutex<Option<HashMap<String, Option<String>>>> = Mutex::new(None);

fn cached<T: Clone>(cache: &Mutex<Option<HashMap<String, T>>>, key: &str, make: impl FnOnce() -> T) -> T {
    if let Some(hit) = cache.lock().ok().and_then(|c| c.as_ref().and_then(|m| m.get(key).cloned())) {
        return hit;
    }
    let value = make();
    if let Ok(mut c) = cache.lock() {
        c.get_or_insert_with(HashMap::new).insert(key.to_string(), value.clone());
    }
    value
}

/// "Google Chrome" from chrome.exe's version info, else "Chrome".
fn app_name(path: &str) -> String {
    cached(&NAMES, path, || {
        #[cfg(windows)]
        if let Some(name) = win::file_description(path) {
            return name;
        }
        let stem = crate::process::stem_of(path);
        let mut chars = stem.chars();
        chars.next().map(|c| c.to_uppercase().collect::<String>() + chars.as_str()).unwrap_or_default()
    })
}

#[tauri::command(async)]
pub fn mixer_state() -> MixerState {
    #[cfg(windows)]
    {
        win::state()
    }
    #[cfg(not(windows))]
    {
        MixerState::default()
    }
}

/// Sets the master volume (0-1) and/or mute. Returns the new level.
#[tauri::command(async)]
pub fn mixer_set_master(volume: Option<f32>, muted: Option<bool>) -> Option<Level> {
    #[cfg(windows)]
    {
        win::set_master(volume, muted, None)
    }
    #[cfg(not(windows))]
    {
        let _ = (volume, muted);
        None
    }
}

/// Changes the master volume by `delta` (scrolling on the pill).
#[tauri::command(async)]
pub fn mixer_step_master(delta: f32) -> Option<Level> {
    #[cfg(windows)]
    {
        win::set_master(None, None, Some(delta))
    }
    #[cfg(not(windows))]
    {
        let _ = delta;
        None
    }
}

/// Sets the volume and/or mute of every session of one app.
#[tauri::command(async)]
pub fn mixer_set_app(key: String, volume: Option<f32>, muted: Option<bool>) {
    #[cfg(windows)]
    win::set_app(&key, volume, muted);
    #[cfg(not(windows))]
    let _ = (key, volume, muted);
}

/// Makes `id` the default output (for all roles).
#[tauri::command(async)]
pub fn mixer_set_output(id: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        win::set_default_output(&id).map_err(|e| e.to_string())
    }
    #[cfg(not(windows))]
    {
        let _ = id;
        Err("not supported".into())
    }
}

/// Mutes or unmutes the default microphone. Returns the new state.
#[tauri::command(async)]
pub fn mixer_set_mic_muted(muted: bool) -> Option<bool> {
    #[cfg(windows)]
    {
        win::set_mic_muted(Some(muted))
    }
    #[cfg(not(windows))]
    {
        let _ = muted;
        None
    }
}

/// Whether the default microphone is muted; None without a microphone.
#[tauri::command(async)]
pub fn mixer_mic_muted() -> Option<bool> {
    #[cfg(windows)]
    {
        win::set_mic_muted(None)
    }
    #[cfg(not(windows))]
    {
        None
    }
}

/// An exe's icon as a PNG data URI (cached).
#[tauri::command(async)]
pub fn mixer_app_icon(path: String) -> Option<String> {
    if path.is_empty() {
        return None;
    }
    cached(&ICONS, &path, || {
        #[cfg(windows)]
        {
            use base64::Engine as _;
            let png = win::icon_png(&path)?;
            Some(format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(png)))
        }
        #[cfg(not(windows))]
        {
            None
        }
    })
}

#[cfg(windows)]
mod win {
    use super::{AppSession, Endpoint, Level, Mic, MixerState};
    use windows::core::{Interface, GUID, HSTRING, PCWSTR};
    use windows::Win32::Devices::FunctionDiscovery::PKEY_Device_FriendlyName;
    use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
    use windows::Win32::Media::Audio::{
        eCapture, eCommunications, eConsole, eMultimedia, eRender, AudioSessionStateActive, AudioSessionStateExpired,
        EDataFlow, IAudioSessionControl2, IAudioSessionManager2, IMMDevice, IMMDeviceEnumerator, ISimpleAudioVolume,
        MMDeviceEnumerator, DEVICE_STATE_ACTIVE,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoTaskMemFree, CLSCTX_ALL, COINIT_MULTITHREADED, STGM_READ,
    };

    fn init() {
        // Async commands run on worker threads; MTA is fine for Core Audio.
        let _ = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
    }

    fn enumerator() -> windows::core::Result<IMMDeviceEnumerator> {
        unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL) }
    }

    fn default_device(flow: EDataFlow) -> Option<IMMDevice> {
        unsafe { enumerator().ok()?.GetDefaultAudioEndpoint(flow, eConsole).ok() }
    }

    fn device_id(device: &IMMDevice) -> Option<String> {
        unsafe {
            let id = device.GetId().ok()?;
            let text = id.to_string().ok();
            CoTaskMemFree(Some(id.0 as *const core::ffi::c_void));
            text
        }
    }

    fn device_name(device: &IMMDevice) -> String {
        unsafe {
            device
                .OpenPropertyStore(STGM_READ)
                .and_then(|store| store.GetValue(&PKEY_Device_FriendlyName))
                .map(|v| v.to_string())
                .unwrap_or_default()
        }
    }

    fn endpoint_volume(device: &IMMDevice) -> Option<IAudioEndpointVolume> {
        unsafe { device.Activate(CLSCTX_ALL, None).ok() }
    }

    fn level(volume: &IAudioEndpointVolume) -> Option<Level> {
        unsafe {
            Some(Level {
                volume: volume.GetMasterVolumeLevelScalar().ok()?,
                muted: volume.GetMute().ok()?.as_bool(),
            })
        }
    }

    fn outputs(enumerator: &IMMDeviceEnumerator) -> Vec<Endpoint> {
        let mut out = Vec::new();
        unsafe {
            let Ok(list) = enumerator.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE) else { return out };
            for i in 0..list.GetCount().unwrap_or(0) {
                let Ok(device) = list.Item(i) else { continue };
                if let Some(id) = device_id(&device) {
                    out.push(Endpoint { id, name: device_name(&device) });
                }
            }
        }
        out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        out
    }

    /// One app's sessions on the default output.
    struct Group {
        info: AppSession,
        volumes: Vec<ISimpleAudioVolume>,
    }

    fn groups(device: &IMMDevice) -> Vec<Group> {
        let mut out: Vec<Group> = Vec::new();
        unsafe {
            let Ok(manager) = device.Activate::<IAudioSessionManager2>(CLSCTX_ALL, None) else { return out };
            let Ok(list) = manager.GetSessionEnumerator() else { return out };
            let own_pid = std::process::id();
            for i in 0..list.GetCount().unwrap_or(0) {
                let Ok(control) = list.GetSession(i) else { continue };
                let state = control.GetState().unwrap_or(AudioSessionStateExpired);
                if state == AudioSessionStateExpired {
                    continue;
                }
                let Ok(control2) = control.cast::<IAudioSessionControl2>() else { continue };
                let Ok(volume) = control.cast::<ISimpleAudioVolume>() else { continue };
                // S_OK (0) means it is the system sounds session.
                let system = control2.IsSystemSoundsSession().0 == 0;
                let pid = control2.GetProcessId().unwrap_or(0);
                if !system && pid == own_pid {
                    continue;
                }
                let path = if system { String::new() } else { crate::process::exe_path(pid) };
                let key = if system {
                    "system".to_string()
                } else if path.is_empty() {
                    format!("pid:{pid}")
                } else {
                    path.to_lowercase()
                };
                let active = state == AudioSessionStateActive;
                if let Some(group) = out.iter_mut().find(|g| g.info.key == key) {
                    group.info.active |= active;
                    group.volumes.push(volume);
                    continue;
                }
                let name = if system {
                    "Suara sistem".to_string()
                } else if path.is_empty() {
                    format!("Proses {pid}")
                } else {
                    super::app_name(&path)
                };
                let info = AppSession {
                    key,
                    name,
                    exe_path: path,
                    volume: volume.GetMasterVolume().unwrap_or(1.0),
                    muted: volume.GetMute().map(|m| m.as_bool()).unwrap_or(false),
                    active,
                    system,
                };
                out.push(Group { info, volumes: vec![volume] });
            }
        }
        // Playing apps first, then by name; system sounds last.
        out.sort_by(|a, b| {
            (a.info.system, !a.info.active, a.info.name.to_lowercase()).cmp(&(
                b.info.system,
                !b.info.active,
                b.info.name.to_lowercase(),
            ))
        });
        out
    }

    pub fn state() -> MixerState {
        init();
        let Ok(enumerator) = enumerator() else { return MixerState::default() };
        let output = unsafe { enumerator.GetDefaultAudioEndpoint(eRender, eConsole).ok() };
        let mic = default_device(eCapture).and_then(|d| {
            let muted = unsafe { endpoint_volume(&d)?.GetMute().ok()?.as_bool() };
            Some(Mic { name: device_name(&d), muted })
        });
        MixerState {
            output_id: output.as_ref().and_then(device_id),
            outputs: outputs(&enumerator),
            master: output.as_ref().and_then(endpoint_volume).as_ref().and_then(level),
            apps: output.as_ref().map(groups).unwrap_or_default().into_iter().map(|g| g.info).collect(),
            mic,
        }
    }

    pub fn set_master(volume: Option<f32>, muted: Option<bool>, delta: Option<f32>) -> Option<Level> {
        init();
        let endpoint = endpoint_volume(&default_device(eRender)?)?;
        let current = level(&endpoint)?;
        let target = match (volume, delta) {
            (Some(v), _) => Some(v),
            (None, Some(d)) => Some(((current.volume + d) * 100.0).round() / 100.0),
            _ => None,
        };
        unsafe {
            if let Some(v) = target {
                endpoint.SetMasterVolumeLevelScalar(v.clamp(0.0, 1.0), std::ptr::null()).ok()?;
            }
            // Raising the volume unmutes, like the Windows flyout.
            let muted = muted.or((target.unwrap_or(0.0) > current.volume && current.muted).then_some(false));
            if let Some(m) = muted {
                endpoint.SetMute(m, std::ptr::null()).ok()?;
            }
        }
        level(&endpoint)
    }

    pub fn set_app(key: &str, volume: Option<f32>, muted: Option<bool>) {
        init();
        let Some(device) = default_device(eRender) else { return };
        let Some(group) = groups(&device).into_iter().find(|g| g.info.key == key) else { return };
        for v in &group.volumes {
            unsafe {
                if let Some(level) = volume {
                    let _ = v.SetMasterVolume(level.clamp(0.0, 1.0), std::ptr::null());
                }
                if let Some(m) = muted {
                    let _ = v.SetMute(m, std::ptr::null());
                }
            }
        }
    }

    pub fn set_mic_muted(muted: Option<bool>) -> Option<bool> {
        init();
        let endpoint = endpoint_volume(&default_device(eCapture)?)?;
        unsafe {
            if let Some(m) = muted {
                endpoint.SetMute(m, std::ptr::null()).ok()?;
            }
            Some(endpoint.GetMute().ok()?.as_bool())
        }
    }

    const CLSID_POLICY_CONFIG: GUID = GUID::from_u128(0x870af99c_171d_4f9e_af0d_e63df40c2bc9);
    const IID_POLICY_CONFIG: GUID = GUID::from_u128(0xf8679f50_850a_41cf_9c72_430f290290c8);
    /// Index of SetDefaultEndpoint in IPolicyConfig's vtable (after IUnknown's 3 and 10 others).
    const SET_DEFAULT_ENDPOINT: usize = 13;

    pub fn set_default_output(id: &str) -> windows::core::Result<()> {
        init();
        type SetDefaultEndpoint =
            unsafe extern "system" fn(*mut core::ffi::c_void, PCWSTR, i32) -> windows::core::HRESULT;
        unsafe {
            let unknown: windows::core::IUnknown = CoCreateInstance(&CLSID_POLICY_CONFIG, None, CLSCTX_ALL)?;
            let mut raw = std::ptr::null_mut();
            unknown.query(&IID_POLICY_CONFIG, &mut raw).ok()?;
            // Takes ownership of the reference QueryInterface added.
            let policy = windows::core::IUnknown::from_raw(raw);
            let vtable = *(policy.as_raw() as *const *const usize);
            let set: SetDefaultEndpoint = std::mem::transmute(*vtable.add(SET_DEFAULT_ENDPOINT));
            let id = HSTRING::from(id);
            for role in [eConsole, eMultimedia, eCommunications] {
                set(policy.as_raw(), PCWSTR(id.as_ptr()), role.0).ok()?;
            }
        }
        Ok(())
    }

    /// FileDescription from the exe's version info.
    pub fn file_description(path: &str) -> Option<String> {
        use windows::Win32::Storage::FileSystem::{GetFileVersionInfoSizeW, GetFileVersionInfoW, VerQueryValueW};
        unsafe {
            let file = HSTRING::from(path);
            let size = GetFileVersionInfoSizeW(&file, None);
            if size == 0 {
                return None;
            }
            let mut data = vec![0u8; size as usize];
            GetFileVersionInfoW(&file, 0, size, data.as_mut_ptr().cast()).ok()?;
            let mut ptr = std::ptr::null_mut();
            let mut len = 0u32;
            let translation = HSTRING::from("\\VarFileInfo\\Translation");
            let (lang, codepage) = if VerQueryValueW(data.as_ptr().cast(), &translation, &mut ptr, &mut len).as_bool()
                && len >= 4
            {
                let pair = ptr as *const u16;
                (*pair, *pair.add(1))
            } else {
                (0x0409, 0x04b0)
            };
            let key = HSTRING::from(format!("\\StringFileInfo\\{lang:04x}{codepage:04x}\\FileDescription"));
            if !VerQueryValueW(data.as_ptr().cast(), &key, &mut ptr, &mut len).as_bool() || len == 0 {
                return None;
            }
            let text = std::slice::from_raw_parts(ptr as *const u16, len as usize);
            let text = String::from_utf16_lossy(text).trim_end_matches('\0').trim().to_string();
            (!text.is_empty()).then_some(text)
        }
    }

    /// The exe's icon at 64 px, as PNG.
    pub fn icon_png(path: &str) -> Option<Vec<u8>> {
        use windows::Win32::Graphics::Gdi::{
            DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
            DIB_RGB_COLORS,
        };
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::{DestroyIcon, GetIconInfo, PrivateExtractIconsW, HICON, ICONINFO};

        const SIZE: i32 = 64;
        let wide: Vec<u16> = path.encode_utf16().collect();
        if wide.len() >= 260 {
            return None;
        }
        let mut name = [0u16; 260];
        name[..wide.len()].copy_from_slice(&wide);
        unsafe {
            let mut icons = [HICON::default()];
            let mut ids = [0u32];
            let count = PrivateExtractIconsW(&name, 0, SIZE, SIZE, Some(&mut icons), Some(ids.as_mut_ptr()), 0);
            if count == 0 || count == u32::MAX || icons[0].is_invalid() {
                return None;
            }
            let icon = icons[0];
            let mut info = ICONINFO::default();
            let got = GetIconInfo(icon, &mut info).is_ok();
            let mut result = None;
            if got && !info.hbmColor.is_invalid() {
                let mut bitmap = BITMAP::default();
                GetObjectW(info.hbmColor, std::mem::size_of::<BITMAP>() as i32, Some((&mut bitmap as *mut BITMAP).cast()));
                let (w, h) = (bitmap.bmWidth, bitmap.bmHeight);
                if w > 0 && h > 0 {
                    let mut bmi = BITMAPINFO {
                        bmiHeader: BITMAPINFOHEADER {
                            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                            biWidth: w,
                            biHeight: -h,
                            biPlanes: 1,
                            biBitCount: 32,
                            biCompression: BI_RGB.0,
                            ..Default::default()
                        },
                        ..Default::default()
                    };
                    let mut pixels = vec![0u8; (w * h * 4) as usize];
                    let screen = GetDC(HWND::default());
                    let lines =
                        GetDIBits(screen, info.hbmColor, 0, h as u32, Some(pixels.as_mut_ptr().cast()), &mut bmi, DIB_RGB_COLORS);
                    ReleaseDC(HWND::default(), screen);
                    if lines != 0 {
                        // Old icons without alpha: opaque.
                        if pixels.chunks_exact(4).all(|p| p[3] == 0) {
                            pixels.chunks_exact_mut(4).for_each(|p| p[3] = 255);
                        }
                        let image = crate::imaging::Bgra { pixels, width: w as u32, height: h as u32 };
                        result = crate::imaging::encode_png(&image, None).ok();
                    }
                }
            }
            if got {
                let _ = DeleteObject(info.hbmColor);
                let _ = DeleteObject(info.hbmMask);
            }
            let _ = DestroyIcon(icon);
            result
        }
    }
}

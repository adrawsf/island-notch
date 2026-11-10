//! Now-playing media via Windows SMTC (System Media Transport Controls).
//!
//! A polling thread picks the active session, reads metadata, timeline and
//! artwork, and emits `media://state` whenever something meaningful changes.
//! Position is sent with the time it was sampled so the frontend can
//! interpolate the progress bar between updates instead of us spamming events.

use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

pub const EVENT_MEDIA_STATE: &str = "media://state";

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaState {
    /// False when no session is open; every other field is then empty.
    pub active: bool,
    pub app_id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub is_playing: bool,
    /// Playback position at `sampled_at_ms`.
    pub position_ms: u64,
    pub duration_ms: u64,
    /// Unix time (ms) when `position_ms` was valid.
    pub sampled_at_ms: u64,
    pub can_play_pause: bool,
    pub can_next: bool,
    pub can_previous: bool,
    pub can_seek: bool,
    /// Cover art as a data URI.
    pub artwork: Option<String>,
}

impl MediaState {
    /// Equal apart from the timeline fields that change every tick.
    fn same_content(&self, other: &MediaState) -> bool {
        let strip = |s: &MediaState| MediaState { position_ms: 0, sampled_at_ms: 0, ..s.clone() };
        strip(self) == strip(other)
    }

    /// Where the position should be now if playback continued normally.
    fn predicted_position(&self, now_ms: u64) -> u64 {
        if self.is_playing {
            self.position_ms + now_ms.saturating_sub(self.sampled_at_ms)
        } else {
            self.position_ms
        }
    }
}

#[derive(Default)]
pub struct MediaStore {
    last: Mutex<MediaState>,
}

/// Latest state, for a frontend that (re)loads after the last event.
#[tauri::command]
pub fn media_get_state(store: State<'_, MediaStore>) -> MediaState {
    store.last.lock().map(|s| s.clone()).unwrap_or_default()
}

#[cfg(windows)]
mod smtc {
    use super::*;
    use windows::Media::Control::{
        GlobalSystemMediaTransportControlsSession as Session,
        GlobalSystemMediaTransportControlsSessionManager as Manager,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status,
    };

    /// 100 ns ticks between 1601-01-01 (Windows) and 1970-01-01 (Unix).
    const EPOCH_DIFF_TICKS: i64 = 116_444_736_000_000_000;
    const MAX_ARTWORK_BYTES: u64 = 8_000_000;

    pub fn now_ms() -> u64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0)
    }

    pub fn init_com() {
        use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};
        let _ = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
    }

    pub fn request_manager() -> Option<Manager> {
        Manager::RequestAsync().and_then(|op| op.get()).ok()
    }

    fn status(session: &Session) -> Status {
        session
            .GetPlaybackInfo()
            .and_then(|p| p.PlaybackStatus())
            .unwrap_or(Status::Closed)
    }

    /// Playing session first, then the one we showed last, then Windows' pick.
    pub fn pick_session(manager: &Manager, last_app_id: &str) -> Option<Session> {
        let sessions: Vec<Session> = manager.GetSessions().map(|v| v.into_iter().collect()).unwrap_or_default();
        let open = |s: &&Session| status(s) != Status::Closed && !is_ignored(s);
        if let Some(s) = sessions.iter().filter(open).find(|s| status(s) == Status::Playing) {
            return Some(s.clone());
        }
        if !last_app_id.is_empty() {
            if let Some(s) = sessions.iter().filter(open).find(|s| app_id(s) == last_app_id) {
                return Some(s.clone());
            }
        }
        manager.GetCurrentSession().ok().filter(|s| status(s) != Status::Closed && !is_ignored(s))
    }

    /// Apps that register SMTC sessions without being media players.
    fn is_ignored(session: &Session) -> bool {
        let id = app_id(session).to_lowercase();
        id.contains("screensketch") || id.contains("snipping")
    }

    pub fn app_id(session: &Session) -> String {
        session.SourceAppUserModelId().map(|s| s.to_string()).unwrap_or_default()
    }

    /// Reads everything except artwork.
    pub fn read_state(session: &Session) -> Option<MediaState> {
        let props = session.TryGetMediaPropertiesAsync().and_then(|op| op.get()).ok()?;
        let playback = session.GetPlaybackInfo().ok()?;
        let controls = playback.Controls().ok();
        let flag = |f: &dyn Fn(&windows::Media::Control::GlobalSystemMediaTransportControlsSessionPlaybackControls) -> windows::core::Result<bool>| {
            controls.as_ref().and_then(|c| f(c).ok()).unwrap_or(false)
        };
        let is_playing = playback.PlaybackStatus().map(|s| s == Status::Playing).unwrap_or(false);

        let now = now_ms();
        let (position_ms, duration_ms) = match session.GetTimelineProperties() {
            Ok(t) => {
                let ticks = |r: windows::core::Result<windows::Foundation::TimeSpan>| r.map(|t| t.Duration).unwrap_or(0);
                let start = ticks(t.StartTime());
                let end = ticks(t.EndTime());
                let position = ticks(t.Position());
                let duration_ms = ((end - start).max(0) / 10_000) as u64;
                let mut position_ms = ((position - start).max(0) / 10_000) as u64;
                // SMTC only refreshes Position occasionally; advance it by the
                // time elapsed since LastUpdatedTime while playing.
                let updated = t.LastUpdatedTime().map(|d| d.UniversalTime).unwrap_or(0);
                if is_playing && updated > EPOCH_DIFF_TICKS {
                    let updated_ms = ((updated - EPOCH_DIFF_TICKS) / 10_000) as u64;
                    position_ms += now.saturating_sub(updated_ms);
                }
                if duration_ms > 0 {
                    position_ms = position_ms.min(duration_ms);
                }
                (position_ms, duration_ms)
            }
            Err(_) => (0, 0),
        };

        Some(MediaState {
            active: true,
            app_id: app_id(session),
            title: props.Title().map(|s| s.to_string()).unwrap_or_default(),
            artist: props.Artist().map(|s| s.to_string()).unwrap_or_default(),
            album: props.AlbumTitle().map(|s| s.to_string()).unwrap_or_default(),
            is_playing,
            position_ms,
            duration_ms,
            sampled_at_ms: now,
            can_play_pause: flag(&|c| c.IsPlayPauseToggleEnabled()),
            can_next: flag(&|c| c.IsNextEnabled()),
            can_previous: flag(&|c| c.IsPreviousEnabled()),
            can_seek: flag(&|c| c.IsPlaybackPositionEnabled()) && duration_ms > 0,
            artwork: None,
        })
    }

    /// Cover art as a data URI, or None if the app has not provided one (yet).
    pub fn read_artwork(session: &Session) -> Option<String> {
        use base64::Engine as _;
        use windows::Storage::Streams::DataReader;

        let props = session.TryGetMediaPropertiesAsync().and_then(|op| op.get()).ok()?;
        let stream = props.Thumbnail().ok()?.OpenReadAsync().and_then(|op| op.get()).ok()?;
        let size = stream.Size().ok()?;
        if size == 0 || size > MAX_ARTWORK_BYTES {
            return None;
        }
        let reader = DataReader::CreateDataReader(&stream).ok()?;
        let loaded = reader.LoadAsync(size as u32).and_then(|op| op.get()).ok()?;
        let mut bytes = vec![0u8; loaded as usize];
        reader.ReadBytes(&mut bytes).ok()?;
        if bytes.len() < 100 {
            return None;
        }
        let mime = if bytes.starts_with(b"\x89PNG") {
            "image/png"
        } else if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
            "image/webp"
        } else if bytes.starts_with(b"BM") {
            "image/bmp"
        } else {
            "image/jpeg"
        };
        Some(format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(&bytes)))
    }
}

#[cfg(windows)]
pub fn start(app: AppHandle) {
    use tauri::Emitter;

    const POLL_INTERVAL: std::time::Duration = std::time::Duration::from_millis(500);
    /// Re-emit while playing even without changes, to correct drift.
    const HEARTBEAT_MS: u64 = 5_000;
    /// A position jump bigger than this (seek) is emitted immediately.
    const SEEK_THRESHOLD_MS: u64 = 1_500;
    /// Ticks after a track change during which artwork is (re)read, since apps
    /// often publish the new cover late or briefly keep the previous one.
    const ARTWORK_SETTLE_TICKS: u32 = 8;

    std::thread::spawn(move || {
        smtc::init_com();
        let mut manager = smtc::request_manager();
        let mut last_emitted = MediaState::default();
        let mut track_key = String::new();
        let mut ticks_since_change: u32 = 0;
        let mut artwork: Option<String> = None;
        let mut previous_artwork: Option<String> = None;

        loop {
            std::thread::sleep(POLL_INTERVAL);
            if manager.is_none() {
                manager = smtc::request_manager();
            }
            let Some(mgr) = &manager else { continue };

            let session = smtc::pick_session(mgr, &last_emitted.app_id);
            let mut state = match session.as_ref().and_then(smtc::read_state) {
                Some(s) => s,
                None => MediaState { sampled_at_ms: smtc::now_ms(), ..Default::default() },
            };

            if state.active {
                let key = format!("{}\u{1f}{}\u{1f}{}", state.app_id, state.title, state.artist);
                if key != track_key {
                    track_key = key;
                    ticks_since_change = 0;
                    previous_artwork = artwork.take();
                } else {
                    ticks_since_change = ticks_since_change.saturating_add(1);
                }
                let settling = ticks_since_change <= ARTWORK_SETTLE_TICKS;
                if artwork.is_none() || settling {
                    if let Some(read) = session.as_ref().and_then(smtc::read_artwork) {
                        // Ignore the previous track's cover while the app catches up.
                        let stale = settling && previous_artwork.as_deref() == Some(read.as_str());
                        if !stale {
                            artwork = Some(read);
                        }
                    }
                }
                state.artwork = artwork.clone();
            } else {
                track_key.clear();
                artwork = None;
                previous_artwork = None;
            }

            let now = state.sampled_at_ms;
            let drift = state.position_ms.abs_diff(last_emitted.predicted_position(now));
            let heartbeat = state.is_playing && now.saturating_sub(last_emitted.sampled_at_ms) >= HEARTBEAT_MS;
            if !state.same_content(&last_emitted) || drift > SEEK_THRESHOLD_MS || heartbeat {
                if let Ok(mut stored) = app.state::<MediaStore>().last.lock() {
                    *stored = state.clone();
                }
                // All windows: the notch and the mini player both show it.
                let _ = app.emit(EVENT_MEDIA_STATE, &state);
                last_emitted = state;
            }
        }
    });
}

#[cfg(not(windows))]
pub fn start(_app: AppHandle) {}

/// `playPause`, `next` or `previous` on the active session.
#[tauri::command]
pub async fn media_control(store: State<'_, MediaStore>, action: String) -> Result<(), String> {
    let last_app_id = store.last.lock().map(|s| s.app_id.clone()).unwrap_or_default();
    run_on_session(last_app_id, move |session| {
        let op = match action.as_str() {
            "playPause" => session.TryTogglePlayPauseAsync(),
            "next" => session.TrySkipNextAsync(),
            "previous" => session.TrySkipPreviousAsync(),
            other => return Err(format!("unknown media action: {other}")),
        };
        op.and_then(|o| o.get()).map(|_| ()).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn media_seek(store: State<'_, MediaStore>, position_ms: u64) -> Result<(), String> {
    let last_app_id = store.last.lock().map(|s| s.app_id.clone()).unwrap_or_default();
    run_on_session(last_app_id, move |session| {
        let start = session
            .GetTimelineProperties()
            .and_then(|t| t.StartTime())
            .map(|t| t.Duration)
            .unwrap_or(0);
        let ticks = start + position_ms as i64 * 10_000;
        session
            .TryChangePlaybackPositionAsync(ticks)
            .and_then(|o| o.get())
            .map(|_| ())
            .map_err(|e| e.to_string())
    })
    .await
}

#[cfg(windows)]
async fn run_on_session<F>(last_app_id: String, f: F) -> Result<(), String>
where
    F: FnOnce(&windows::Media::Control::GlobalSystemMediaTransportControlsSession) -> Result<(), String>
        + Send
        + 'static,
{
    tauri::async_runtime::spawn_blocking(move || {
        smtc::init_com();
        let manager = smtc::request_manager().ok_or("SMTC unavailable")?;
        let session = smtc::pick_session(&manager, &last_app_id).ok_or("no media session")?;
        f(&session)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(not(windows))]
async fn run_on_session<F>(_last_app_id: String, _f: F) -> Result<(), String> {
    Err("media control is only supported on Windows".into())
}

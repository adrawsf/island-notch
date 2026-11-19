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
    /// Read from a browser tab's name because Windows reports no music
    /// session for it: no timeline, controls or artwork.
    pub tab_only: bool,
    /// With `tab_only`: the position is estimated (no real timeline), close
    /// enough for synced lyrics.
    pub timeline_estimated: bool,
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

impl MediaStore {
    /// App id and title of the session shown last.
    pub fn source(&self) -> (String, String) {
        self.last.lock().map(|s| (s.app_id.clone(), s.title.clone())).unwrap_or_default()
    }
}

/// Whether two titles name the same track, allowing for extras like
/// "Artist - " in tab names ("Artist - Song" vs "Song").
pub(crate) fn same_title(a: &str, b: &str) -> bool {
    let norm = |s: &str| s.to_lowercase().chars().filter(|c| c.is_alphanumeric()).collect::<String>();
    let (a, b) = (norm(a), norm(b));
    !a.is_empty() && !b.is_empty() && (a.contains(&b) || b.contains(&a))
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

    /// Which session to show, in order: one that is playing, the one shown
    /// last, Windows' pick (the one used last), then any other open one with
    /// paused players first. With `skip_video`, films and other video are
    /// passed over (see `is_video`), so music paused for a film still shows
    /// even though the film was clicked last.
    pub fn pick_session(manager: &Manager, last_app_id: &str, skip_video: bool) -> Option<Session> {
        let sessions: Vec<Session> = manager.GetSessions().map(|v| v.into_iter().collect()).unwrap_or_default();
        let candidates: Vec<&Session> = sessions
            .iter()
            .filter(|s| status(s) != Status::Closed && !is_ignored(s, skip_video))
            .collect();
        // Several playing (music on, a video started next to it): a dedicated
        // player (Spotify, Apple Music...) is music, then keep the one shown
        // so far, so clicking a video does not take the notch from the song.
        let playing: Vec<&Session> = candidates.iter().copied().filter(|s| status(s) == Status::Playing).collect();
        if let Some(s) = playing
            .iter()
            .find(|s| !is_browser_id(&app_id(s).to_lowercase()))
            .or_else(|| playing.iter().find(|s| !last_app_id.is_empty() && app_id(s) == last_app_id))
            .or_else(|| playing.first())
        {
            return Some((*s).clone());
        }
        if !last_app_id.is_empty() {
            if let Some(s) = candidates.iter().find(|s| app_id(s) == last_app_id) {
                return Some((*s).clone());
            }
        }
        if let Ok(current) = manager.GetCurrentSession() {
            let current_id = app_id(&current);
            if let Some(s) = candidates.iter().find(|s| app_id(s) == current_id) {
                return Some((*s).clone());
            }
        }
        candidates
            .iter()
            .find(|s| status(s) == Status::Paused)
            .or_else(|| candidates.first())
            .map(|s| (*s).clone())
    }

    /// Sessions the notch should not treat as music.
    fn is_ignored(session: &Session, skip_video: bool) -> bool {
        let id = app_id(session).to_lowercase();
        // Apps that register SMTC sessions without being media players.
        if id.contains("screensketch") || id.contains("snipping") {
            return true;
        }
        skip_video && is_video(session, &id)
    }

    /// Words that identify a browser in an SMTC app id ("Chrome", "MSEdge",
    /// "TheBrowserCompany.Arc_x!Arc"...). Firefox registers under a hash.
    const BROWSER_WORDS: &[&str] = &[
        "chrome", "msedge", "microsoftedge", "brave", "firefox", "308046b0af4a39cb", "opera", "vivaldi", "arc", "zen",
        "chromium", "thorium", "floorp", "librewolf", "waterfox",
    ];

    /// Compared word by word, so short names like "arc" never match inside
    /// other words ("search").
    fn is_browser_id(id_lower: &str) -> bool {
        id_lower
            .split(|c: char| !c.is_ascii_alphanumeric())
            .any(|word| BROWSER_WORDS.contains(&word))
    }

    /// A film or other video rather than music:
    /// - the app says so (desktop video players report the Video type), or
    /// - a browser session that is not a tab on a known music site (YouTube
    ///   Music, Spotify, SoundCloud, Apple Music, Deezer, TIDAL). Browsers
    ///   report every tab as Music, and video sites such as YouTube fill in
    ///   an "artist" (the channel), so only the site tells them apart.
    fn is_video(session: &Session, id_lower: &str) -> bool {
        use windows::Media::MediaPlaybackType;
        let reported_video = session
            .GetPlaybackInfo()
            .and_then(|p| p.PlaybackType())
            .and_then(|t| t.Value())
            .map(|t| t == MediaPlaybackType::Video)
            .unwrap_or(false);
        if reported_video {
            return true;
        }
        if !is_browser_id(id_lower) {
            return false;
        }
        let title = session
            .TryGetMediaPropertiesAsync()
            .and_then(|op| op.get())
            .and_then(|p| p.Title())
            .map(|t| t.to_string())
            .unwrap_or_default();
        // A paused song keeps its session even when its tab name no longer
        // shows the song (Spotify Web shows "Spotify – Web Player" then).
        let shown = LAST_MUSIC_TITLE.lock().map(|t| t.clone()).unwrap_or_default();
        if super::same_title(&shown, &title) {
            return false;
        }
        !music_tabs().iter().any(|tab| super::same_title(&tab.title, &title))
    }

    /// Title of the song shown last, so it is not dropped once paused.
    static LAST_MUSIC_TITLE: Mutex<String> = Mutex::new(String::new());

    pub fn remember_music(title: &str) {
        if let Ok(mut t) = LAST_MUSIC_TITLE.lock() {
            if *t != title {
                *t = title.to_string();
            }
        }
    }

    /// Music-site tabs, read at most every couple of seconds (UI Automation is slow).
    fn music_tabs() -> Vec<crate::media_source::MusicTab> {
        use std::time::{Duration, Instant};
        static CACHE: Mutex<Option<(Instant, Vec<crate::media_source::MusicTab>)>> = Mutex::new(None);
        const MAX_AGE: Duration = Duration::from_millis(5000);
        if let Ok(cache) = CACHE.lock() {
            if let Some((at, tabs)) = cache.as_ref() {
                if at.elapsed() < MAX_AGE {
                    return tabs.clone();
                }
            }
        }
        let tabs = crate::media_source::music_tabs();
        if let Ok(mut cache) = CACHE.lock() {
            *cache = Some((Instant::now(), tabs.clone()));
        }
        tabs
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
            tab_only: false,
            timeline_estimated: false,
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
        // Browser-tab fallback, rescanned every few ticks while Windows
        // reports no music (UI Automation is too heavy for every tick).
        const TAB_SCAN_EVERY: u32 = 6;
        let mut tab_scan_ticks = TAB_SCAN_EVERY;
        let mut tab_state: Option<MediaState> = None;
        const TAB_SCAN_FOLLOW: u32 = 2;
        // The last song Windows reported with a real timeline.
        let mut last_real: Option<MediaState> = None;

        loop {
            std::thread::sleep(POLL_INTERVAL);
            if manager.is_none() {
                manager = smtc::request_manager();
            }
            let Some(mgr) = &manager else { continue };

            let session = smtc::pick_session(mgr, &last_emitted.app_id, ignore_video(&app));
            let mut state = match session.as_ref().and_then(smtc::read_state) {
                Some(s) => s,
                None => MediaState { sampled_at_ms: smtc::now_ms(), ..Default::default() },
            };

            if state.active {
                smtc::remember_music(&state.title);
            }

            // Chrome reports only its most recently used media to Windows, so
            // music in one tab disappears once a film in another was clicked.
            // Then read the playing music tab's name instead.
            // The tab gives no position, so the lyrics run on an estimated
            // clock: carried on from the song's last real position when it is
            // the same song, else started when the new song first shows up.
            if state.active {
                tab_state = None;
                tab_scan_ticks = TAB_SCAN_EVERY;
            } else {
                tab_scan_ticks += 1;
                // Rescan faster while following a tab, to catch the next song quickly.
                let every = if tab_state.is_some() { TAB_SCAN_FOLLOW } else { TAB_SCAN_EVERY };
                if tab_scan_ticks >= every {
                    tab_scan_ticks = 0;
                    let now = smtc::now_ms();
                    tab_state = crate::media_source::find_music_tab().map(|tab| {
                        if let Some(same) = tab_state.as_ref().filter(|t| same_title(&t.title, &tab.title)) {
                            return same.clone();
                        }
                        match last_real.as_ref().filter(|r| same_title(&r.title, &tab.title)) {
                            // Same names as before, so the lyrics already found stay.
                            Some(real) => MediaState {
                                position_ms: real.predicted_position(now),
                                sampled_at_ms: now,
                                is_playing: true,
                                tab_only: true,
                                timeline_estimated: true,
                                can_play_pause: false,
                                can_next: false,
                                can_previous: false,
                                can_seek: false,
                                ..real.clone()
                            },
                            None => MediaState {
                                active: true,
                                app_id: tab.app_id,
                                title: tab.title,
                                artist: tab.artist,
                                is_playing: true,
                                tab_only: true,
                                timeline_estimated: true,
                                // Found up to one scan after it started.
                                position_ms: TAB_SCAN_FOLLOW as u64 * POLL_INTERVAL.as_millis() as u64 / 2,
                                sampled_at_ms: now,
                                ..Default::default()
                            },
                        }
                    });
                }
                if let Some(tab) = &tab_state {
                    let now = state.sampled_at_ms;
                    state = MediaState { position_ms: tab.predicted_position(now), sampled_at_ms: now, ..tab.clone() };
                }
            }

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

            if state.active && !state.tab_only {
                last_real = Some(state.clone());
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

/// The "ignore video" setting, as last pushed by the frontend (on by default).
fn ignore_video(app: &AppHandle) -> bool {
    app.state::<crate::shell::ShellState>()
        .current()
        .map(|c| c.ignore_video)
        .unwrap_or(true)
}

/// `playPause`, `next` or `previous` on the active session.
#[tauri::command]
pub async fn media_control(app: AppHandle, store: State<'_, MediaStore>, action: String) -> Result<(), String> {
    let last_app_id = store.last.lock().map(|s| s.app_id.clone()).unwrap_or_default();
    run_on_session(last_app_id, ignore_video(&app), move |session| {
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
pub async fn media_seek(app: AppHandle, store: State<'_, MediaStore>, position_ms: u64) -> Result<(), String> {
    let last_app_id = store.last.lock().map(|s| s.app_id.clone()).unwrap_or_default();
    run_on_session(last_app_id, ignore_video(&app), move |session| {
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
async fn run_on_session<F>(last_app_id: String, skip_video: bool, f: F) -> Result<(), String>
where
    F: FnOnce(&windows::Media::Control::GlobalSystemMediaTransportControlsSession) -> Result<(), String>
        + Send
        + 'static,
{
    tauri::async_runtime::spawn_blocking(move || {
        smtc::init_com();
        let manager = smtc::request_manager().ok_or("SMTC unavailable")?;
        let session = smtc::pick_session(&manager, &last_app_id, skip_video).ok_or("no media session")?;
        f(&session)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(not(windows))]
async fn run_on_session<F>(_last_app_id: String, _skip_video: bool, _f: F) -> Result<(), String> {
    Err("media control is only supported on Windows".into())
}

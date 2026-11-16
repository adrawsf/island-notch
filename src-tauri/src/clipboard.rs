//! Clipboard history (the Clipboard tab).
//!
//! A thread watches the clipboard sequence number; new text or images go to
//! the top of the history, and copying something already there moves it up.
//! The history lives in the app data folder: `clipboard/history.json`, plus a
//! PNG and a small thumbnail per image. Pinned items are never trimmed.
//!
//! Clicking an item writes it back to the clipboard and, when asked, pastes it
//! into the app that was in front before the notch (Ctrl+V via SendInput).

use serde::{Deserialize, Serialize};
use std::hash::{Hash, Hasher};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

/// Emitted to all windows when the history changes (no payload).
pub const EVENT_CHANGED: &str = "clipboard://changed";

const DEFAULT_MAX_ITEMS: usize = 100;
/// Longer text is not recorded.
const MAX_TEXT_CHARS: usize = 1_000_000;
/// Characters sent to the list.
const PREVIEW_CHARS: usize = 400;
/// Larger images are not recorded.
const MAX_IMAGE_PIXELS: u64 = 40_000_000;
/// Thumbnails fit in this box (px).
const THUMB_BOX: (u32, u32) = (360, 160);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Text,
    Image,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Item {
    id: u64,
    kind: Kind,
    #[serde(default)]
    text: String,
    #[serde(default)]
    width: u32,
    #[serde(default)]
    height: u32,
    #[serde(default)]
    pinned: bool,
    created_at: u64,
    /// App it was copied from ("chrome"), "" if unknown.
    #[serde(default)]
    source: String,
    hash: u64,
}

/// One row of the list as the frontend sees it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    id: u64,
    kind: Kind,
    /// Start of the text (empty for images).
    preview: String,
    /// Length of the whole text in characters.
    chars: usize,
    width: u32,
    height: u32,
    pinned: bool,
    created_at: u64,
    source: String,
}

impl From<&Item> for Entry {
    fn from(item: &Item) -> Self {
        Entry {
            id: item.id,
            kind: item.kind,
            preview: item.text.chars().take(PREVIEW_CHARS).collect(),
            chars: item.text.chars().count(),
            width: item.width,
            height: item.height,
            pinned: item.pinned,
            created_at: item.created_at,
            source: item.source.clone(),
        }
    }
}

#[derive(Default)]
pub struct ClipboardStore {
    inner: Mutex<History>,
}

#[derive(Default)]
struct History {
    /// Newest first.
    items: Vec<Item>,
    dir: Option<PathBuf>,
    last_id: u64,
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

impl History {
    fn load(&mut self, dir: PathBuf) {
        let _ = std::fs::create_dir_all(dir.join("images"));
        if let Ok(raw) = std::fs::read(dir.join("history.json")) {
            match serde_json::from_slice::<Vec<Item>>(&raw) {
                Ok(items) => self.items = items,
                Err(err) => eprintln!("[clipboard] history.json unreadable: {err}"),
            }
        }
        self.last_id = self.items.iter().map(|i| i.id).max().unwrap_or(0);
        self.dir = Some(dir);
    }

    fn save(&self) {
        let Some(dir) = &self.dir else { return };
        let Ok(json) = serde_json::to_vec(&self.items) else { return };
        let tmp = dir.join("history.json.tmp");
        if std::fs::write(&tmp, json).is_ok() {
            let _ = std::fs::rename(&tmp, dir.join("history.json"));
        }
    }

    fn image_path(&self, id: u64, thumb: bool) -> Option<PathBuf> {
        let name = if thumb { format!("{id}.thumb.png") } else { format!("{id}.png") };
        self.dir.as_ref().map(|d| d.join("images").join(name))
    }

    fn next_id(&mut self) -> u64 {
        self.last_id = now_ms().max(self.last_id + 1);
        self.last_id
    }

    /// Moves an identical item to the top. True if there was one.
    fn bump(&mut self, kind: Kind, hash: u64, text: &str, source: &str) -> bool {
        let Some(index) =
            self.items.iter().position(|i| i.kind == kind && i.hash == hash && (kind == Kind::Image || i.text == text))
        else {
            return false;
        };
        let mut item = self.items.remove(index);
        item.created_at = now_ms();
        if !source.is_empty() {
            item.source = source.to_string();
        }
        self.items.insert(0, item);
        true
    }

    fn remove_files(&self, item: &Item) {
        if item.kind == Kind::Image {
            for thumb in [false, true] {
                if let Some(path) = self.image_path(item.id, thumb) {
                    let _ = std::fs::remove_file(path);
                }
            }
        }
    }

    /// Drops the oldest unpinned items beyond `max`.
    fn trim(&mut self, max: usize) -> bool {
        let mut changed = false;
        while self.items.len() > max {
            let Some(index) = self.items.iter().rposition(|i| !i.pinned) else { break };
            let item = self.items.remove(index);
            self.remove_files(&item);
            changed = true;
        }
        changed
    }
}

/// History on/off and its size, from the settings the notch pushed.
fn config(app: &AppHandle) -> (bool, usize) {
    match app.state::<crate::shell::ShellState>().current() {
        Some(c) => (c.clipboard_history, (c.clipboard_max_items as usize).clamp(10, 1000)),
        None => (true, DEFAULT_MAX_ITEMS),
    }
}

fn changed(app: &AppHandle) {
    let _ = app.emit(EVENT_CHANGED, ());
}

fn with_history<R>(app: &AppHandle, f: impl FnOnce(&mut History) -> R) -> Option<R> {
    let store = app.state::<ClipboardStore>();
    let mut history = store.inner.lock().ok()?;
    Some(f(&mut history))
}

fn hash_of(kind: Kind, bytes: &[u8], extra: (u32, u32)) -> u64 {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    kind.hash(&mut hasher);
    extra.hash(&mut hasher);
    bytes.hash(&mut hasher);
    hasher.finish()
}

/// Loads the saved history and starts watching the clipboard.
pub fn start(app: AppHandle) {
    if let Ok(dir) = app.path().app_data_dir() {
        with_history(&app, |h| h.load(dir.join("clipboard")));
    }
    #[cfg(windows)]
    std::thread::spawn(move || win::watch(app));
}

/// Re-applies the size limit after the setting changed.
pub fn apply_config(app: &AppHandle) {
    let (_, max) = config(app);
    if with_history(app, |h| {
        let trimmed = h.trim(max);
        if trimmed {
            h.save();
        }
        trimmed
    }) == Some(true)
    {
        changed(app);
    }
}

/// Something new on the clipboard: put it at the top.
#[cfg(windows)]
fn record(app: &AppHandle, content: win::Content, source: String) {
    let (_, max) = config(app);
    match content {
        win::Content::Text(text) => {
            let hash = hash_of(Kind::Text, text.as_bytes(), (0, 0));
            with_history(app, |h| {
                if !h.bump(Kind::Text, hash, &text, &source) {
                    let id = h.next_id();
                    h.items.insert(
                        0,
                        Item {
                            id,
                            kind: Kind::Text,
                            text,
                            width: 0,
                            height: 0,
                            pinned: false,
                            created_at: now_ms(),
                            source,
                            hash,
                        },
                    );
                }
                h.trim(max);
                h.save();
            });
        }
        win::Content::Image(image) => {
            let hash = hash_of(Kind::Image, &image.pixels, (image.width, image.height));
            let bumped = with_history(app, |h| {
                let bumped = h.bump(Kind::Image, hash, "", &source);
                if bumped {
                    h.save();
                }
                bumped
            });
            if bumped != Some(false) {
                if bumped.is_some() {
                    changed(app);
                }
                return;
            }
            // Encode outside the lock: a big screenshot takes a moment.
            let Some((id, full, thumb)) = with_history(app, |h| {
                let id = h.next_id();
                Some((id, h.image_path(id, false)?, h.image_path(id, true)?))
            })
            .flatten() else {
                return;
            };
            let (w, h) = (image.width, image.height);
            let scale = (THUMB_BOX.0 as f64 / w as f64).min(THUMB_BOX.1 as f64 / h as f64).min(1.0);
            let thumb_size = ((w as f64 * scale).round() as u32, (h as f64 * scale).round() as u32);
            let encoded = crate::imaging::encode_png(&image, None)
                .and_then(|png| Ok((png, crate::imaging::encode_png(&image, Some(thumb_size))?)));
            let (png, thumb_png) = match encoded {
                Ok(pair) => pair,
                Err(err) => {
                    eprintln!("[clipboard] encode image: {err}");
                    return;
                }
            };
            if std::fs::write(&full, png).is_err() || std::fs::write(&thumb, thumb_png).is_err() {
                return;
            }
            with_history(app, |hist| {
                hist.items.insert(
                    0,
                    Item {
                        id,
                        kind: Kind::Image,
                        text: String::new(),
                        width: w,
                        height: h,
                        pinned: false,
                        created_at: now_ms(),
                        source,
                        hash,
                    },
                );
                hist.trim(max);
                hist.save();
            });
        }
    }
    changed(app);
}

/// Puts text on the clipboard (it then shows up in the history too).
pub fn write_text(app: &AppHandle, text: &str) -> Result<(), String> {
    #[cfg(windows)]
    {
        win::write(owner(app), &win::Content::Text(text.to_string()), None)
    }
    #[cfg(not(windows))]
    {
        let _ = (app, text);
        Err("clipboard not supported".into())
    }
}

#[cfg(windows)]
fn owner(app: &AppHandle) -> windows::Win32::Foundation::HWND {
    crate::window::main_window(app)
        .and_then(|w| w.hwnd().ok())
        .map(|h| windows::Win32::Foundation::HWND(h.0))
        .unwrap_or_default()
}

// ---------- Commands ----------

/// The history, newest first, filtered by `query` (text, or the source app).
#[tauri::command]
pub fn clipboard_list(store: State<'_, ClipboardStore>, query: Option<String>) -> Vec<Entry> {
    let Ok(history) = store.inner.lock() else { return Vec::new() };
    let query = query.map(|q| q.trim().to_lowercase()).filter(|q| !q.is_empty());
    history
        .items
        .iter()
        .filter(|item| match &query {
            None => true,
            Some(q) => item.text.to_lowercase().contains(q) || item.source.contains(q),
        })
        .map(Entry::from)
        .collect()
}

/// An image item's thumbnail as a data URI.
#[tauri::command]
pub fn clipboard_thumb(store: State<'_, ClipboardStore>, id: u64) -> Option<String> {
    use base64::Engine as _;
    let path = store.inner.lock().ok()?.image_path(id, true)?;
    let bytes = std::fs::read(path).ok()?;
    Some(format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes)))
}

/// Copies an item back to the clipboard; with `paste`, also pastes it into
/// the app that was in front before the notch. The notch closes itself first.
#[tauri::command]
pub fn clipboard_paste(app: AppHandle, store: State<'_, ClipboardStore>, id: u64, paste: bool) -> Result<(), String> {
    let (item, png_path) = {
        let history = store.inner.lock().map_err(|e| e.to_string())?;
        let item = history.items.iter().find(|i| i.id == id).cloned().ok_or("item tidak ada")?;
        let png = history.image_path(id, false);
        (item, png)
    };
    #[cfg(windows)]
    {
        let content = match item.kind {
            Kind::Text => win::Content::Text(item.text),
            Kind::Image => {
                let path = png_path.ok_or("gambar tidak ada")?;
                let png = std::fs::read(path).map_err(|e| e.to_string())?;
                let image = crate::imaging::decode(&png).map_err(|e| e.to_string())?;
                return finish_paste(&app, win::Content::Image(image), Some(png), paste);
            }
        };
        finish_paste(&app, content, None, paste)
    }
    #[cfg(not(windows))]
    {
        let _ = (app, item, png_path, paste);
        Err("clipboard not supported".into())
    }
}

#[cfg(windows)]
fn finish_paste(app: &AppHandle, content: win::Content, png: Option<Vec<u8>>, paste: bool) -> Result<(), String> {
    win::write(owner(app), &content, png.as_deref())?;
    if paste {
        std::thread::spawn(win::paste_into_previous_app);
    }
    Ok(())
}

#[tauri::command]
pub fn clipboard_pin(app: AppHandle, id: u64, pinned: bool) {
    with_history(&app, |h| {
        if let Some(item) = h.items.iter_mut().find(|i| i.id == id) {
            item.pinned = pinned;
        }
        h.save();
    });
    changed(&app);
}

#[tauri::command]
pub fn clipboard_delete(app: AppHandle, id: u64) {
    with_history(&app, |h| {
        if let Some(index) = h.items.iter().position(|i| i.id == id) {
            let item = h.items.remove(index);
            h.remove_files(&item);
        }
        h.save();
    });
    changed(&app);
}

/// Clears the history except pinned items.
#[tauri::command]
pub fn clipboard_clear(app: AppHandle) {
    with_history(&app, |h| {
        let (keep, drop): (Vec<Item>, Vec<Item>) = std::mem::take(&mut h.items).into_iter().partition(|i| i.pinned);
        for item in &drop {
            h.remove_files(item);
        }
        h.items = keep;
        h.save();
    });
    changed(&app);
}

#[cfg(windows)]
mod win {
    use crate::imaging::Bgra;
    use tauri::AppHandle;
    use windows::core::w;
    use windows::Win32::Foundation::{GlobalFree, HANDLE, HGLOBAL, HWND};
    use windows::Win32::System::DataExchange::{
        CloseClipboard, EmptyClipboard, GetClipboardData, GetClipboardOwner, GetClipboardSequenceNumber,
        IsClipboardFormatAvailable, OpenClipboard, RegisterClipboardFormatW, SetClipboardData,
    };
    use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock, GMEM_MOVEABLE};
    use windows::Win32::System::Ole::{CF_DIB, CF_UNICODETEXT};
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP, VIRTUAL_KEY,
        VK_CONTROL,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowThreadProcessId, IsWindow, SetForegroundWindow,
    };

    pub enum Content {
        Text(String),
        Image(Bgra),
    }

    const POLL: std::time::Duration = std::time::Duration::from_millis(300);

    pub fn watch(app: AppHandle) {
        // MTA for the WinRT image encoder.
        let _ = unsafe {
            windows::Win32::System::Com::CoInitializeEx(None, windows::Win32::System::Com::COINIT_MULTITHREADED)
        };
        let mut last = unsafe { GetClipboardSequenceNumber() };
        loop {
            std::thread::sleep(POLL);
            let seq = unsafe { GetClipboardSequenceNumber() };
            if seq == last {
                continue;
            }
            last = seq;
            if !super::config(&app).0 {
                continue;
            }
            if let Some((content, source)) = read() {
                super::record(&app, content, source);
            }
        }
    }

    /// Closes the clipboard when dropped.
    struct Open;

    impl Open {
        fn new(owner: HWND) -> Option<Open> {
            // Another app may hold it for a moment.
            for _ in 0..10 {
                if unsafe { OpenClipboard(owner) }.is_ok() {
                    return Some(Open);
                }
                std::thread::sleep(std::time::Duration::from_millis(20));
            }
            None
        }
    }

    impl Drop for Open {
        fn drop(&mut self) {
            let _ = unsafe { CloseClipboard() };
        }
    }

    fn png_format() -> u32 {
        unsafe { RegisterClipboardFormatW(w!("PNG")) }
    }

    /// A copy of the clipboard's data in `format`.
    unsafe fn global_bytes(format: u32) -> Option<Vec<u8>> {
        let handle = GetClipboardData(format).ok()?;
        let global = HGLOBAL(handle.0);
        let size = GlobalSize(global);
        let ptr = GlobalLock(global) as *const u8;
        if ptr.is_null() {
            return None;
        }
        let bytes = if size == 0 { Vec::new() } else { std::slice::from_raw_parts(ptr, size).to_vec() };
        let _ = GlobalUnlock(global);
        Some(bytes)
    }

    /// Text first (a spreadsheet copy is text plus a picture of it), then an image.
    fn read() -> Option<(Content, String)> {
        let open = Open::new(HWND::default())?;
        let source = unsafe { source_app() };
        unsafe {
            if IsClipboardFormatAvailable(CF_UNICODETEXT.0 as u32).is_ok() {
                if let Some(bytes) = global_bytes(CF_UNICODETEXT.0 as u32) {
                    let units: Vec<u16> =
                        bytes.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).take_while(|&u| u != 0).collect();
                    let text = String::from_utf16_lossy(&units);
                    if !text.trim().is_empty() && text.chars().count() <= super::MAX_TEXT_CHARS {
                        return Some((Content::Text(text), source));
                    }
                    return None;
                }
            }
            let png = png_format();
            if png != 0 && IsClipboardFormatAvailable(png).is_ok() {
                if let Some(bytes) = global_bytes(png) {
                    drop(open);
                    let image = crate::imaging::decode(&bytes).ok()?;
                    return within_limits(&image).then_some((Content::Image(image), source));
                }
            }
            if IsClipboardFormatAvailable(CF_DIB.0 as u32).is_ok() {
                let bytes = global_bytes(CF_DIB.0 as u32)?;
                drop(open);
                let image = parse_dib(&bytes)?;
                return Some((Content::Image(image), source));
            }
        }
        None
    }

    fn within_limits(image: &Bgra) -> bool {
        image.width > 0 && image.height > 0 && (image.width as u64 * image.height as u64) <= super::MAX_IMAGE_PIXELS
    }

    /// The app that put the data there, "" for ourselves or unknown.
    unsafe fn source_app() -> String {
        let Ok(owner) = GetClipboardOwner() else { return String::new() };
        let mut pid = 0u32;
        GetWindowThreadProcessId(owner, Some(&mut pid));
        if pid == 0 || pid == std::process::id() {
            return String::new();
        }
        crate::process::exe_stem(pid)
    }

    fn u32_at(b: &[u8], at: usize) -> u32 {
        u32::from_le_bytes([b[at], b[at + 1], b[at + 2], b[at + 3]])
    }

    /// CF_DIB (BITMAPINFOHEADER + pixels), 24 or 32 bits, to top-down BGRA.
    fn parse_dib(b: &[u8]) -> Option<Bgra> {
        if b.len() < 40 {
            return None;
        }
        let header = u32_at(b, 0) as usize;
        let width = u32_at(b, 4) as i32;
        let height = u32_at(b, 8) as i32;
        let bpp = u16::from_le_bytes([b[14], b[15]]) as usize;
        let compression = u32_at(b, 16);
        let colors = u32_at(b, 32) as usize;
        const BI_RGB: u32 = 0;
        const BI_BITFIELDS: u32 = 3;
        if width <= 0 || height == 0 || !(bpp == 24 || bpp == 32) {
            return None;
        }
        if !(compression == BI_RGB || (compression == BI_BITFIELDS && bpp == 32)) {
            return None;
        }
        let (w, h) = (width as usize, height.unsigned_abs() as usize);
        if (w as u64 * h as u64) > super::MAX_IMAGE_PIXELS {
            return None;
        }
        let top_down = height < 0;
        let mut offset = header + colors * 4;
        if compression == BI_BITFIELDS && header == 40 {
            offset += 12;
        }
        let stride = (w * bpp).div_ceil(32) * 4;
        if offset + stride * h > b.len() {
            return None;
        }
        let step = bpp / 8;
        let mut pixels = vec![0u8; w * h * 4];
        let mut any_alpha = false;
        for row in 0..h {
            let src_row = if top_down { row } else { h - 1 - row };
            let src = offset + src_row * stride;
            for x in 0..w {
                let s = src + x * step;
                let d = (row * w + x) * 4;
                pixels[d..d + 3].copy_from_slice(&b[s..s + 3]);
                let alpha = if bpp == 32 { b[s + 3] } else { 255 };
                any_alpha |= alpha != 0;
                pixels[d + 3] = alpha;
            }
        }
        // Most 32-bit DIBs leave the 4th byte at zero: treat them as opaque.
        if !any_alpha {
            for px in pixels.chunks_exact_mut(4) {
                px[3] = 255;
            }
        }
        Some(Bgra { pixels, width: w as u32, height: h as u32 })
    }

    /// Top-down BGRA to a bottom-up 32-bit CF_DIB.
    fn to_dib(image: &Bgra) -> Vec<u8> {
        let (w, h) = (image.width as usize, image.height as usize);
        let mut out = Vec::with_capacity(40 + w * h * 4);
        out.extend_from_slice(&40u32.to_le_bytes());
        out.extend_from_slice(&(w as i32).to_le_bytes());
        out.extend_from_slice(&(h as i32).to_le_bytes());
        out.extend_from_slice(&1u16.to_le_bytes()); // planes
        out.extend_from_slice(&32u16.to_le_bytes()); // bits per pixel
        out.extend_from_slice(&0u32.to_le_bytes()); // BI_RGB
        out.extend_from_slice(&((w * h * 4) as u32).to_le_bytes());
        out.extend_from_slice(&[0u8; 16]); // resolution, colours
        for row in (0..h).rev() {
            out.extend_from_slice(&image.pixels[row * w * 4..(row + 1) * w * 4]);
        }
        out
    }

    /// Hands `bytes` to the clipboard as `format` (the clipboard must be open).
    unsafe fn set_bytes(format: u32, bytes: &[u8]) -> Result<(), String> {
        let global = GlobalAlloc(GMEM_MOVEABLE, bytes.len().max(1)).map_err(|e| e.to_string())?;
        let ptr = GlobalLock(global) as *mut u8;
        if ptr.is_null() {
            let _ = GlobalFree(global);
            return Err("GlobalLock failed".into());
        }
        std::ptr::copy_nonoverlapping(bytes.as_ptr(), ptr, bytes.len());
        let _ = GlobalUnlock(global);
        if let Err(err) = SetClipboardData(format, HANDLE(global.0)) {
            let _ = GlobalFree(global);
            return Err(err.to_string());
        }
        Ok(())
    }

    pub fn write(owner: HWND, content: &Content, png: Option<&[u8]>) -> Result<(), String> {
        let _open = Open::new(owner).ok_or("clipboard sedang dipakai app lain")?;
        unsafe {
            EmptyClipboard().map_err(|e| e.to_string())?;
            match content {
                Content::Text(text) => {
                    let mut units: Vec<u16> = text.encode_utf16().collect();
                    units.push(0);
                    let bytes: Vec<u8> = units.iter().flat_map(|u| u.to_le_bytes()).collect();
                    set_bytes(CF_UNICODETEXT.0 as u32, &bytes)
                }
                Content::Image(image) => {
                    set_bytes(CF_DIB.0 as u32, &to_dib(image))?;
                    // Apps that read PNG keep the transparency.
                    if let Some(png) = png {
                        let format = png_format();
                        if format != 0 {
                            let _ = set_bytes(format, png);
                        }
                    }
                    Ok(())
                }
            }
        }
    }

    /// Brings back the app the user was in and sends Ctrl+V to it.
    pub fn paste_into_previous_app() {
        // Let the notch collapse first.
        std::thread::sleep(std::time::Duration::from_millis(150));
        unsafe {
            let front = GetForegroundWindow();
            let mut pid = 0u32;
            if !front.0.is_null() {
                GetWindowThreadProcessId(front, Some(&mut pid));
            }
            if front.0.is_null() || pid == std::process::id() {
                let Some(target) = crate::foreground::last_external_window() else { return };
                let target = HWND(target as *mut core::ffi::c_void);
                if !IsWindow(target).as_bool() || !SetForegroundWindow(target).as_bool() {
                    return;
                }
                std::thread::sleep(std::time::Duration::from_millis(80));
            }
            let key = |vk: VIRTUAL_KEY, up: bool| INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 {
                    ki: KEYBDINPUT {
                        wVk: vk,
                        wScan: 0,
                        dwFlags: if up { KEYEVENTF_KEYUP } else { KEYBD_EVENT_FLAGS(0) },
                        time: 0,
                        dwExtraInfo: 0,
                    },
                },
            };
            let v = VIRTUAL_KEY(0x56);
            let inputs = [key(VK_CONTROL, false), key(v, false), key(v, true), key(VK_CONTROL, true)];
            SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
        }
    }
}

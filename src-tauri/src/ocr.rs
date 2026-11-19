//! Text from the screen (OCR).
//!
//! The OCR shortcut or the Clipboard tab opens a dim overlay (`snip.html`)
//! over the monitor under the cursor. The user drags a box, the overlay
//! hides, and this module captures that area, reads it with Windows OCR
//! (`Windows.Media.Ocr`, the OCR languages installed in Windows) and copies
//! the text. The notch shows the outcome as a toast (`ocr://result`).

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::window::WEBVIEW_BROWSER_ARGS;

pub const LABEL: &str = "snip";
/// Emitted to the notch with an `OcrOutcome`.
pub const EVENT_RESULT: &str = "ocr://result";
/// Emitted to the overlay each time it is shown, to reset its state.
const EVENT_START: &str = "snip://start";

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrOutcome {
    /// The text copied to the clipboard; None when nothing was read.
    text: Option<String>,
    error: Option<String>,
}

/// The selected box in CSS px, relative to the overlay's top-left corner.
#[derive(Debug, Clone, Copy, Deserialize)]
pub struct Rect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct OcrLanguage {
    tag: String,
    name: String,
}

fn window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(LABEL)
}

/// Opens the overlay. From the shortcut handler and the command.
pub fn start_snip(app: &AppHandle) {
    let app = app.clone();
    // Own thread: building a webview from a command deadlocks WebView2.
    std::thread::spawn(move || {
        if let Err(err) = open_blocking(&app) {
            eprintln!("[ocr] overlay: {err}");
        }
    });
}

#[tauri::command]
pub fn ocr_snip_start(app: AppHandle) {
    start_snip(&app);
}

/// The monitor under the cursor, in physical px.
fn target_monitor(app: &AppHandle) -> Option<(PhysicalPosition<i32>, PhysicalSize<u32>)> {
    let monitor = app
        .cursor_position()
        .ok()
        .and_then(|p| app.monitor_from_point(p.x, p.y).ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten())?;
    Some((*monitor.position(), *monitor.size()))
}

fn open_blocking(app: &AppHandle) -> tauri::Result<()> {
    let Some((position, size)) = target_monitor(app) else { return Ok(()) };
    let w = match window(app) {
        Some(w) => w,
        None => WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("snip.html".into()))
            .title("Island Notch OCR")
            .decorations(false)
            .transparent(true)
            .shadow(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .maximizable(false)
            .minimizable(false)
            .visible(false)
            .additional_browser_args(WEBVIEW_BROWSER_ARGS)
            .build()?,
    };
    w.set_position(position)?;
    w.set_size(size)?;
    exclude_from_capture(&w);
    w.show()?;
    // Moving between monitors with different scaling can resize it: set again.
    w.set_size(size)?;
    w.set_focus()?;
    let _ = app.emit_to(LABEL, EVENT_START, ());
    Ok(())
}

/// The overlay finished: `rect` is the dragged box, None when cancelled.
#[tauri::command]
pub fn ocr_snip_finish(app: AppHandle, rect: Option<Rect>) {
    let Some(w) = window(&app) else { return };
    let origin = w.inner_position().unwrap_or_default();
    let scale = w.scale_factor().unwrap_or(1.0);
    let _ = w.hide();
    crate::window::release_when_idle(&app, LABEL);
    let Some(rect) = rect else { return };
    let region = (
        origin.x + (rect.x * scale).round() as i32,
        origin.y + (rect.y * scale).round() as i32,
        (rect.width * scale).round() as i32,
        (rect.height * scale).round() as i32,
    );
    if region.2 < 4 || region.3 < 4 {
        return;
    }
    std::thread::spawn(move || {
        // Let the overlay disappear from the screen first.
        std::thread::sleep(std::time::Duration::from_millis(60));
        let outcome = read_region(&app, region);
        let _ = app.emit_to(crate::window::MAIN_WINDOW_LABEL, EVENT_RESULT, outcome);
    });
}

fn language_setting(app: &AppHandle) -> String {
    app.state::<crate::shell::ShellState>()
        .current()
        .map(|c| c.ocr_language)
        .filter(|l| !l.is_empty())
        .unwrap_or_else(|| "auto".into())
}

fn read_region(app: &AppHandle, region: (i32, i32, i32, i32)) -> OcrOutcome {
    #[cfg(windows)]
    {
        match win::recognize(region, &language_setting(app)) {
            Ok(text) if text.trim().is_empty() => OcrOutcome::default(),
            Ok(text) => match crate::clipboard::write_text(app, &text) {
                Ok(()) => OcrOutcome { text: Some(text), error: None },
                Err(err) => OcrOutcome { text: None, error: Some(err) },
            },
            Err(err) => OcrOutcome { text: None, error: Some(err) },
        }
    }
    #[cfg(not(windows))]
    {
        let _ = (app, region);
        OcrOutcome { text: None, error: Some("OCR hanya ada di Windows".into()) }
    }
}

/// OCR languages installed in Windows.
#[tauri::command]
pub fn ocr_languages() -> Vec<OcrLanguage> {
    #[cfg(windows)]
    {
        win::languages()
    }
    #[cfg(not(windows))]
    {
        Vec::new()
    }
}

/// The overlay must not end up in the capture (nor in screenshots).
fn exclude_from_capture(w: &WebviewWindow) {
    #[cfg(windows)]
    {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::{SetWindowDisplayAffinity, WDA_EXCLUDEFROMCAPTURE};
        if let Ok(raw) = w.hwnd() {
            let _ = unsafe { SetWindowDisplayAffinity(HWND(raw.0), WDA_EXCLUDEFROMCAPTURE) };
        }
    }
    #[cfg(not(windows))]
    let _ = w;
}

#[cfg(windows)]
mod win {
    use super::OcrLanguage;
    use crate::imaging::Bgra;
    use windows::core::HSTRING;
    use windows::Globalization::Language;
    use windows::Graphics::Imaging::{BitmapPixelFormat, SoftwareBitmap};
    use windows::Media::Ocr::{OcrEngine, OcrLine};
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC, GetDIBits, ReleaseDC,
        SelectObject, SetStretchBltMode, StretchBlt, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, CAPTUREBLT, DIB_RGB_COLORS,
        HALFTONE, ROP_CODE, SRCCOPY,
    };
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};

    const NO_LANGUAGE: &str =
        "Windows belum punya bahasa OCR. Tambahkan bahasa (dengan fitur OCR) di Pengaturan Windows → Waktu & bahasa.";

    pub fn languages() -> Vec<OcrLanguage> {
        let _ = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
        let Ok(list) = OcrEngine::AvailableRecognizerLanguages() else { return Vec::new() };
        list.into_iter()
            .filter_map(|l| {
                Some(OcrLanguage { tag: l.LanguageTag().ok()?.to_string(), name: l.DisplayName().ok()?.to_string() })
            })
            .collect()
    }

    fn engine(language: &str) -> Option<OcrEngine> {
        if language != "auto" {
            let picked = Language::CreateLanguage(&HSTRING::from(language))
                .and_then(|l| OcrEngine::TryCreateFromLanguage(&l));
            if let Ok(engine) = picked {
                return Some(engine);
            }
        }
        OcrEngine::TryCreateFromUserProfileLanguages()
            .ok()
            .or_else(|| {
                // No profile language has OCR: take any installed one.
                let first = OcrEngine::AvailableRecognizerLanguages().ok()?.into_iter().next()?;
                OcrEngine::TryCreateFromLanguage(&first).ok()
            })
    }

    /// Reads the text in a screen area (physical px).
    pub fn recognize((x, y, w, h): (i32, i32, i32, i32), language: &str) -> Result<String, String> {
        let _ = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
        let engine = engine(language).ok_or(NO_LANGUAGE)?;
        // Small text reads better enlarged; the engine has a size limit.
        let max_dim = OcrEngine::MaxImageDimension().unwrap_or(2600) as f64;
        let scale = (max_dim / w.max(h) as f64).min(2.0);
        let image = capture(x, y, w, h, scale).ok_or("Gagal mengambil gambar layar")?;
        let bitmap = crate::imaging::buffer(&image.pixels)
            .and_then(|buf| {
                SoftwareBitmap::CreateCopyFromBuffer(
                    &buf,
                    BitmapPixelFormat::Bgra8,
                    image.width as i32,
                    image.height as i32,
                )
            })
            .map_err(|e| e.to_string())?;
        let result = engine.RecognizeAsync(&bitmap).and_then(|op| op.get()).map_err(|e| e.to_string())?;
        let lines = result.Lines().map_err(|e| e.to_string())?;
        Ok(lines.into_iter().map(|line| line_text(&line)).collect::<Vec<_>>().join("\n"))
    }

    /// Words joined by spaces, except between Chinese/Japanese characters.
    fn line_text(line: &OcrLine) -> String {
        let Ok(words) = line.Words() else { return line.Text().map(|t| t.to_string()).unwrap_or_default() };
        let mut out = String::new();
        for word in words {
            let Ok(text) = word.Text() else { continue };
            let text = text.to_string();
            if let (Some(prev), Some(next)) = (out.chars().last(), text.chars().next()) {
                if !(is_cjk(prev) && is_cjk(next)) {
                    out.push(' ');
                }
            }
            out.push_str(&text);
        }
        out
    }

    /// Han, kana and full-width forms (written without spaces). Not Hangul.
    fn is_cjk(c: char) -> bool {
        matches!(c as u32, 0x3000..=0x30FF | 0x3400..=0x4DBF | 0x4E00..=0x9FFF | 0xF900..=0xFAFF | 0xFF00..=0xFFEF)
    }

    /// Copies a screen area, scaled by `scale`, to top-down BGRA.
    fn capture(x: i32, y: i32, w: i32, h: i32, scale: f64) -> Option<Bgra> {
        let dw = ((w as f64 * scale).round() as i32).max(1);
        let dh = ((h as f64 * scale).round() as i32).max(1);
        unsafe {
            let screen = GetDC(HWND::default());
            if screen.is_invalid() {
                return None;
            }
            let memory = CreateCompatibleDC(screen);
            let bitmap = CreateCompatibleBitmap(screen, dw, dh);
            let previous = SelectObject(memory, bitmap);
            let rop = ROP_CODE(SRCCOPY.0 | CAPTUREBLT.0);
            let copied = if dw == w && dh == h {
                BitBlt(memory, 0, 0, w, h, screen, x, y, rop).is_ok()
            } else {
                SetStretchBltMode(memory, HALFTONE);
                StretchBlt(memory, 0, 0, dw, dh, screen, x, y, w, h, rop).as_bool()
            };
            // GetDIBits wants the bitmap out of the DC.
            SelectObject(memory, previous);

            let mut info = BITMAPINFO {
                bmiHeader: BITMAPINFOHEADER {
                    biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                    biWidth: dw,
                    biHeight: -dh,
                    biPlanes: 1,
                    biBitCount: 32,
                    biCompression: BI_RGB.0,
                    ..Default::default()
                },
                ..Default::default()
            };
            let mut pixels = vec![0u8; dw as usize * dh as usize * 4];
            let lines = if copied {
                GetDIBits(
                    memory,
                    bitmap,
                    0,
                    dh as u32,
                    Some(pixels.as_mut_ptr().cast()),
                    &mut info,
                    DIB_RGB_COLORS,
                )
            } else {
                0
            };
            let _ = DeleteObject(bitmap);
            let _ = DeleteDC(memory);
            ReleaseDC(HWND::default(), screen);
            if lines == 0 {
                return None;
            }
            for px in pixels.chunks_exact_mut(4) {
                px[3] = 255;
            }
            Some(Bgra { pixels, width: dw as u32, height: dh as u32 })
        }
    }
}

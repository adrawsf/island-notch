//! Drop Shelf: files, text and links dropped on the notch, kept until removed
//! and dragged out again into any app.
//!
//! Files are kept by path (nothing is copied). The notch window gets its own
//! OLE drop target (in place of WebView2's) so it can take text and links as
//! well as files, and tell the frontend when a drag enters so the notch can
//! open on the Shelf tab. Dragging out uses the shell's own drag (with the
//! Explorer drag image).

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

pub const EVENT_CHANGED: &str = "shelf://changed";
/// `true` when a drag we can take enters the notch, `false` when it leaves or drops.
pub const EVENT_DRAG: &str = "shelf://drag";

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub id: String,
    /// "file", "text" or "link".
    pub kind: String,
    /// File path, the text, or the URL.
    pub value: String,
    pub added: u64,
}

/// An item as the frontend sees it, with what is known about the file now.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemView {
    #[serde(flatten)]
    pub item: Item,
    pub name: String,
    pub exists: bool,
    pub is_dir: bool,
    pub size: u64,
}

#[derive(Default)]
pub struct ShelfStore {
    items: Mutex<Vec<Item>>,
    file: Mutex<Option<PathBuf>>,
}

impl ShelfStore {
    fn save(&self, items: &[Item]) {
        let Some(path) = self.file.lock().ok().and_then(|f| f.clone()) else { return };
        if let Some(dir) = path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        if let Ok(json) = serde_json::to_vec_pretty(items) {
            let _ = std::fs::write(path, json);
        }
    }

    fn update(&self, app: &AppHandle, change: impl FnOnce(&mut Vec<Item>)) {
        let Ok(mut items) = self.items.lock() else { return };
        change(&mut items);
        self.save(&items);
        drop(items);
        let _ = app.emit(EVENT_CHANGED, ());
    }

    fn get(&self, ids: &[String]) -> Vec<Item> {
        let items = self.items.lock().map(|i| i.clone()).unwrap_or_default();
        items.into_iter().filter(|i| ids.contains(&i.id)).collect()
    }
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// Adds dropped content; newest first, the same file or text only once.
pub fn add(app: &AppHandle, kind: &str, values: Vec<String>) {
    let store = app.state::<ShelfStore>();
    store.update(app, |items| {
        let base = now_ms();
        for (n, value) in values.into_iter().enumerate() {
            let value = if kind == "file" { value } else { value.trim().to_string() };
            if value.is_empty() {
                continue;
            }
            items.retain(|i| !(i.kind == kind && i.value == value));
            items.insert(
                0,
                Item { id: format!("{base}-{n}"), kind: kind.to_string(), value, added: base },
            );
        }
    });
}

/// Loads the saved shelf and takes over drops on the notch window.
pub fn start(app: AppHandle) {
    if let Ok(dir) = app.path().app_data_dir() {
        let path = dir.join("shelf.json");
        let items = std::fs::read(&path)
            .ok()
            .and_then(|raw| serde_json::from_slice::<Vec<Item>>(&raw).ok())
            .unwrap_or_default();
        let store = app.state::<ShelfStore>();
        if let Ok(mut i) = store.items.lock() {
            *i = items;
        }
        if let Ok(mut f) = store.file.lock() {
            *f = Some(path);
        };
    }
    #[cfg(windows)]
    win::install_drop_target(app);
}

fn view(item: Item) -> ItemView {
    let (name, exists, is_dir, size) = if item.kind == "file" {
        let path = std::path::Path::new(&item.value);
        let meta = std::fs::metadata(path).ok();
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| item.value.clone());
        (name, meta.is_some(), meta.as_ref().is_some_and(|m| m.is_dir()), meta.map(|m| m.len()).unwrap_or(0))
    } else {
        (String::new(), true, false, 0)
    };
    ItemView { item, name, exists, is_dir, size }
}

#[tauri::command(async)]
pub fn shelf_list(store: tauri::State<'_, ShelfStore>) -> Vec<ItemView> {
    let items = store.items.lock().map(|i| i.clone()).unwrap_or_default();
    items.into_iter().map(view).collect()
}

#[tauri::command(async)]
pub fn shelf_remove(app: AppHandle, ids: Vec<String>) {
    app.state::<ShelfStore>().update(&app, |items| items.retain(|i| !ids.contains(&i.id)));
}

#[tauri::command(async)]
pub fn shelf_clear(app: AppHandle) {
    app.state::<ShelfStore>().update(&app, |items| items.clear());
}

/// Adds text (pasted into the shelf with Ctrl+V).
#[tauri::command(async)]
pub fn shelf_add_text(app: AppHandle, text: String) {
    let kind = if is_link(&text) { "link" } else { "text" };
    add(&app, kind, vec![text]);
}

fn is_link(text: &str) -> bool {
    let t = text.trim();
    (t.starts_with("http://") || t.starts_with("https://")) && !t.contains(char::is_whitespace)
}

/// Opens a file or link with its default app; text is copied instead.
#[tauri::command(async)]
pub fn shelf_open(app: AppHandle, id: String) -> Result<(), String> {
    let Some(item) = app.state::<ShelfStore>().get(&[id]).pop() else { return Err("Item tidak ada".into()) };
    if item.kind == "text" {
        return crate::clipboard::write_text(&app, &item.value);
    }
    #[cfg(windows)]
    {
        win::open(&item.value)
    }
    #[cfg(not(windows))]
    Err("not supported".into())
}

/// Shows the file in Explorer, selected.
#[tauri::command(async)]
pub fn shelf_reveal(app: AppHandle, id: String) -> Result<(), String> {
    let Some(item) = app.state::<ShelfStore>().get(&[id]).pop() else { return Err("Item tidak ada".into()) };
    #[cfg(windows)]
    {
        win::reveal(&item.value)
    }
    #[cfg(not(windows))]
    {
        let _ = item;
        Err("not supported".into())
    }
}

/// Copies the text, the link, or the file's path.
#[tauri::command(async)]
pub fn shelf_copy(app: AppHandle, id: String) -> Result<(), String> {
    let Some(item) = app.state::<ShelfStore>().get(&[id]).pop() else { return Err("Item tidak ada".into()) };
    crate::clipboard::write_text(&app, &item.value)
}

/// Thumbnail (images, videos, documents) or icon of a file, as a PNG data URI.
#[tauri::command(async)]
pub fn shelf_thumb(path: String) -> Option<String> {
    #[cfg(windows)]
    {
        use base64::Engine as _;
        win::thumbnail(&path).map(|png| format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(png)))
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        None
    }
}

/// Starts dragging items out of the shelf. Call while the mouse button is held.
#[tauri::command]
pub fn shelf_drag_out(app: AppHandle, ids: Vec<String>) {
    let items = app.state::<ShelfStore>().get(&ids);
    if items.is_empty() {
        return;
    }
    #[cfg(windows)]
    {
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || win::drag_out(&handle, items));
    }
}

#[cfg(windows)]
mod win {
    use super::Item;
    use std::sync::atomic::{AtomicBool, Ordering};
    use tauri::{AppHandle, Emitter};
    use windows::core::{implement, w, HRESULT, HSTRING, PCWSTR};
    use windows::Win32::Foundation::{BOOL, HGLOBAL, HWND, LPARAM, POINTL, SIZE};
    use windows::Win32::System::Com::{IDataObject, DVASPECT_CONTENT, FORMATETC, STGMEDIUM, STGMEDIUM_0, TYMED_HGLOBAL};
    use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
    use windows::Win32::System::Ole::{
        IDropSource, IDropSource_Impl, IDropTarget, IDropTarget_Impl, RegisterDragDrop, ReleaseStgMedium, RevokeDragDrop,
        CF_HDROP, CF_UNICODETEXT, DROPEFFECT, DROPEFFECT_COPY, DROPEFFECT_LINK, DROPEFFECT_NONE,
    };
    use windows::Win32::System::SystemServices::{MK_LBUTTON, MODIFIERKEYS_FLAGS};
    use windows::Win32::UI::Shell::{DragQueryFileW, HDROP};

    /// A drag out of the shelf is running: its drops on the notch are ignored.
    static DRAGGING_OUT: AtomicBool = AtomicBool::new(false);

    fn format(cf: u16) -> FORMATETC {
        FORMATETC { cfFormat: cf, ptd: std::ptr::null_mut(), dwAspect: DVASPECT_CONTENT.0, lindex: -1, tymed: TYMED_HGLOBAL.0 as u32 }
    }

    fn url_format() -> u16 {
        use windows::Win32::System::DataExchange::RegisterClipboardFormatW;
        unsafe { RegisterClipboardFormatW(w!("UniformResourceLocatorW")) as u16 }
    }

    fn has(data: &IDataObject, cf: u16) -> bool {
        unsafe { data.QueryGetData(&format(cf)) }.is_ok()
    }

    /// What a drag carries that the shelf can take.
    fn kind_of(data: &IDataObject) -> Option<&'static str> {
        if has(data, CF_HDROP.0) {
            Some("file")
        } else if has(data, url_format()) {
            Some("link")
        } else if has(data, CF_UNICODETEXT.0) {
            Some("text")
        } else {
            None
        }
    }

    fn read_files(data: &IDataObject) -> Vec<String> {
        let mut paths = Vec::new();
        unsafe {
            let Ok(mut medium) = data.GetData(&format(CF_HDROP.0)) else { return paths };
            let hdrop = HDROP(medium.u.hGlobal.0);
            let count = DragQueryFileW(hdrop, u32::MAX, None);
            for i in 0..count {
                let len = DragQueryFileW(hdrop, i, None) as usize;
                let mut buf = vec![0u16; len + 1];
                DragQueryFileW(hdrop, i, Some(&mut buf));
                paths.push(String::from_utf16_lossy(&buf[..len]));
            }
            ReleaseStgMedium(&mut medium);
        }
        paths
    }

    fn read_text(data: &IDataObject, cf: u16) -> Option<String> {
        unsafe {
            let mut medium = data.GetData(&format(cf)).ok()?;
            let ptr = GlobalLock(medium.u.hGlobal) as *const u16;
            let text = if ptr.is_null() { None } else { PCWSTR(ptr).to_string().ok() };
            let _ = GlobalUnlock(medium.u.hGlobal);
            ReleaseStgMedium(&mut medium);
            text
        }
    }

    /// Copy if the source allows it, else link (the shelf only keeps a reference).
    fn effect_for(allowed: DROPEFFECT) -> DROPEFFECT {
        if allowed.0 & DROPEFFECT_COPY.0 != 0 {
            DROPEFFECT_COPY
        } else if allowed.0 & DROPEFFECT_LINK.0 != 0 {
            DROPEFFECT_LINK
        } else {
            DROPEFFECT_NONE
        }
    }

    #[implement(IDropTarget)]
    struct DropTarget {
        app: AppHandle,
        accepting: std::cell::Cell<bool>,
    }

    impl IDropTarget_Impl for DropTarget_Impl {
        fn DragEnter(
            &self,
            data: Option<&IDataObject>,
            _keys: MODIFIERKEYS_FLAGS,
            _pt: &POINTL,
            effect: *mut DROPEFFECT,
        ) -> windows::core::Result<()> {
            let accepting = !DRAGGING_OUT.load(Ordering::SeqCst) && data.and_then(kind_of).is_some();
            self.accepting.set(accepting);
            unsafe { *effect = if accepting { effect_for(*effect) } else { DROPEFFECT_NONE } };
            if accepting {
                let _ = self.app.emit(super::EVENT_DRAG, true);
            }
            Ok(())
        }

        fn DragOver(&self, _keys: MODIFIERKEYS_FLAGS, _pt: &POINTL, effect: *mut DROPEFFECT) -> windows::core::Result<()> {
            unsafe { *effect = if self.accepting.get() { effect_for(*effect) } else { DROPEFFECT_NONE } };
            Ok(())
        }

        fn DragLeave(&self) -> windows::core::Result<()> {
            if self.accepting.replace(false) {
                let _ = self.app.emit(super::EVENT_DRAG, false);
            }
            Ok(())
        }

        fn Drop(
            &self,
            data: Option<&IDataObject>,
            _keys: MODIFIERKEYS_FLAGS,
            _pt: &POINTL,
            effect: *mut DROPEFFECT,
        ) -> windows::core::Result<()> {
            let accepting = self.accepting.replace(false);
            let _ = self.app.emit(super::EVENT_DRAG, false);
            let Some(data) = data.filter(|_| accepting) else {
                unsafe { *effect = DROPEFFECT_NONE };
                return Ok(());
            };
            unsafe { *effect = effect_for(*effect) };
            match kind_of(data) {
                Some("file") => super::add(&self.app, "file", read_files(data)),
                Some("link") => {
                    if let Some(url) = read_text(data, url_format()) {
                        super::add(&self.app, "link", vec![url]);
                    }
                }
                Some(_) => {
                    if let Some(text) = read_text(data, CF_UNICODETEXT.0) {
                        let kind = if super::is_link(&text) { "link" } else { "text" };
                        super::add(&self.app, kind, vec![text]);
                    }
                }
                None => {}
            }
            Ok(())
        }
    }

    fn child_windows(parent: HWND) -> Vec<HWND> {
        use windows::Win32::UI::WindowsAndMessaging::EnumChildWindows;
        unsafe extern "system" fn collect(hwnd: HWND, lparam: LPARAM) -> BOOL {
            (*(lparam.0 as *mut Vec<HWND>)).push(hwnd);
            true.into()
        }
        let mut out: Vec<HWND> = Vec::new();
        unsafe {
            let _ = EnumChildWindows(parent, Some(collect), LPARAM(&mut out as *mut Vec<HWND> as isize));
        }
        out
    }

    fn main_hwnd(app: &AppHandle) -> Option<HWND> {
        crate::window::main_window(app).and_then(|w| w.hwnd().ok()).map(|h| HWND(h.0))
    }

    /// Replaces WebView2's drop targets on the notch window with ours. WebView2
    /// creates its child windows asynchronously, so this retries for a while.
    pub fn install_drop_target(app: AppHandle) {
        std::thread::spawn(move || {
            for _ in 0..20 {
                std::thread::sleep(std::time::Duration::from_millis(700));
                let (tx, rx) = std::sync::mpsc::channel();
                let handle = app.clone();
                let sent = app.run_on_main_thread(move || {
                    let Some(top) = main_hwnd(&handle) else {
                        let _ = tx.send(false);
                        return;
                    };
                    let children = child_windows(top);
                    let target: IDropTarget = DropTarget { app: handle.clone(), accepting: false.into() }.into();
                    let mut installed = 0;
                    for hwnd in std::iter::once(top).chain(children.iter().copied()) {
                        unsafe {
                            let _ = RevokeDragDrop(hwnd);
                            if RegisterDragDrop(hwnd, &target).is_ok() {
                                installed += 1;
                            }
                        }
                    }
                    // The top window alone is not enough: drops land on WebView2's children.
                    let _ = tx.send(installed > 1);
                });
                if sent.is_ok() && rx.recv().unwrap_or(false) {
                    return;
                }
            }
            eprintln!("[shelf] could not take over drops on the notch window");
        });
    }

    #[implement(IDropSource)]
    struct DropSource;

    impl IDropSource_Impl for DropSource_Impl {
        fn QueryContinueDrag(&self, escape: BOOL, keys: MODIFIERKEYS_FLAGS) -> HRESULT {
            use windows::Win32::Foundation::{DRAGDROP_S_CANCEL, DRAGDROP_S_DROP};
            if escape.as_bool() {
                DRAGDROP_S_CANCEL
            } else if keys.0 & MK_LBUTTON.0 == 0 {
                DRAGDROP_S_DROP
            } else {
                HRESULT(0)
            }
        }

        fn GiveFeedback(&self, _effect: DROPEFFECT) -> HRESULT {
            windows::Win32::Foundation::DRAGDROP_S_USEDEFAULTCURSORS
        }
    }

    fn text_object(text: &str) -> Option<IDataObject> {
        use windows::Win32::UI::Shell::SHCreateDataObject;
        let wide: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();
        unsafe {
            let data: IDataObject = SHCreateDataObject(None, None, None).ok()?;
            let global: HGLOBAL = GlobalAlloc(GMEM_MOVEABLE, wide.len() * 2).ok()?;
            let ptr = GlobalLock(global) as *mut u16;
            if ptr.is_null() {
                return None;
            }
            std::ptr::copy_nonoverlapping(wide.as_ptr(), ptr, wide.len());
            let _ = GlobalUnlock(global);
            let medium = STGMEDIUM {
                tymed: TYMED_HGLOBAL.0 as u32,
                u: STGMEDIUM_0 { hGlobal: global },
                pUnkForRelease: std::mem::ManuallyDrop::new(None),
            };
            data.SetData(&format(CF_UNICODETEXT.0), &medium, true).ok()?;
            Some(data)
        }
    }

    fn files_object(paths: &[String]) -> Option<IDataObject> {
        use windows::Win32::UI::Shell::{Common::ITEMIDLIST, ILCreateFromPathW, ILFree, SHCreateDataObject};
        unsafe {
            let pidls: Vec<*mut ITEMIDLIST> = paths
                .iter()
                .map(|p| ILCreateFromPathW(&HSTRING::from(p.as_str())))
                .filter(|p| !p.is_null())
                .collect();
            if pidls.is_empty() {
                return None;
            }
            let list: Vec<*const ITEMIDLIST> = pidls.iter().map(|p| *p as *const _).collect();
            let data = SHCreateDataObject::<_, IDataObject>(None, Some(&list), None).ok();
            for p in pidls {
                ILFree(Some(p));
            }
            data
        }
    }

    /// Runs the drag (on the main thread); returns when it is dropped or cancelled.
    pub fn drag_out(app: &AppHandle, items: Vec<Item>) {
        use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON};
        use windows::Win32::UI::Shell::SHDoDragDrop;
        // The button was released before we got here: dropping now would land wherever the cursor is.
        if unsafe { GetAsyncKeyState(VK_LBUTTON.0 as i32) } as u16 & 0x8000 == 0 {
            return;
        }
        let files: Vec<String> = items
            .iter()
            .filter(|i| i.kind == "file" && std::path::Path::new(&i.value).exists())
            .map(|i| i.value.clone())
            .collect();
        let data = if !files.is_empty() {
            files_object(&files)
        } else {
            let text = items.iter().map(|i| i.value.as_str()).collect::<Vec<_>>().join("\n");
            text_object(&text)
        };
        let Some(data) = data else { return };
        let source: IDropSource = DropSource.into();
        DRAGGING_OUT.store(true, Ordering::SeqCst);
        let hwnd = main_hwnd(app).unwrap_or_default();
        unsafe {
            // Copy, not move: the originals stay where they are (and in the shelf).
            let _ = SHDoDragDrop(hwnd, &data, &source, DROPEFFECT(DROPEFFECT_COPY.0 | DROPEFFECT_LINK.0));
        }
        DRAGGING_OUT.store(false, Ordering::SeqCst);
    }

    fn com_init() {
        use windows::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED};
        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        }
    }

    pub fn open(target: &str) -> Result<(), String> {
        use windows::Win32::UI::Shell::ShellExecuteW;
        use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
        com_init();
        let result = unsafe { ShellExecuteW(None, w!("open"), &HSTRING::from(target), None, None, SW_SHOWNORMAL) };
        // Values above 32 mean success.
        if result.0 as isize > 32 {
            Ok(())
        } else {
            Err("Tidak bisa dibuka".into())
        }
    }

    pub fn reveal(path: &str) -> Result<(), String> {
        use windows::Win32::UI::Shell::{ILCreateFromPathW, ILFree, SHOpenFolderAndSelectItems};
        com_init();
        unsafe {
            let pidl = ILCreateFromPathW(&HSTRING::from(path));
            if pidl.is_null() {
                return Err("File tidak ditemukan".into());
            }
            let result = SHOpenFolderAndSelectItems(pidl, None, 0);
            ILFree(Some(pidl));
            result.map_err(|e| e.message())
        }
    }

    /// Explorer's thumbnail (or icon) for a path, as PNG.
    pub fn thumbnail(path: &str) -> Option<Vec<u8>> {
        use windows::Win32::Graphics::Gdi::{
            DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
            DIB_RGB_COLORS,
        };
        use windows::Win32::UI::Shell::{IShellItemImageFactory, SHCreateItemFromParsingName, SIIGBF_BIGGERSIZEOK};
        const SIZE: i32 = 128;
        com_init();
        unsafe {
            let factory: IShellItemImageFactory = SHCreateItemFromParsingName(&HSTRING::from(path), None).ok()?;
            let bitmap = factory.GetImage(SIZE { cx: SIZE, cy: SIZE }, SIIGBF_BIGGERSIZEOK).ok()?;
            let mut info = BITMAP::default();
            GetObjectW(bitmap, std::mem::size_of::<BITMAP>() as i32, Some((&mut info as *mut BITMAP).cast()));
            let (w, h) = (info.bmWidth, info.bmHeight.abs());
            let mut result = None;
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
                let lines = GetDIBits(screen, bitmap, 0, h as u32, Some(pixels.as_mut_ptr().cast()), &mut bmi, DIB_RGB_COLORS);
                ReleaseDC(HWND::default(), screen);
                if lines != 0 {
                    // Photo thumbnails come without alpha: opaque.
                    if pixels.chunks_exact(4).all(|p| p[3] == 0) {
                        pixels.chunks_exact_mut(4).for_each(|p| p[3] = 255);
                    }
                    let image = crate::imaging::Bgra { pixels, width: w as u32, height: h as u32 };
                    result = crate::imaging::encode_png(&image, None).ok();
                }
            }
            let _ = DeleteObject(bitmap);
            result
        }
    }
}

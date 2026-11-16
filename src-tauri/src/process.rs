//! Small helpers about other processes.

/// Lowercase executable name without `.exe` ("spotify"), or "" if unknown.
#[cfg(windows)]
pub fn exe_stem(pid: u32) -> String {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
    };

    unsafe {
        let Ok(process) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else { return String::new() };
        let mut buf = [0u16; 260];
        let mut len = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(process, PROCESS_NAME_WIN32, windows::core::PWSTR(buf.as_mut_ptr()), &mut len)
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

#[cfg(not(windows))]
pub fn exe_stem(_pid: u32) -> String {
    String::new()
}

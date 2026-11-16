//! Small helpers about other processes.

/// Full path of the process's executable, or "" if unknown.
#[cfg(windows)]
pub fn exe_path(pid: u32) -> String {
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
        if ok {
            String::from_utf16_lossy(&buf[..len as usize])
        } else {
            String::new()
        }
    }
}

#[cfg(not(windows))]
pub fn exe_path(_pid: u32) -> String {
    String::new()
}

/// Lowercase executable name without `.exe` from a path ("spotify").
pub fn stem_of(path: &str) -> String {
    let path = path.to_lowercase();
    let file = path.rsplit(['\\', '/']).next().unwrap_or("");
    file.strip_suffix(".exe").unwrap_or(file).to_string()
}

/// Lowercase executable name without `.exe` ("spotify"), or "" if unknown.
pub fn exe_stem(pid: u32) -> String {
    stem_of(&exe_path(pid))
}

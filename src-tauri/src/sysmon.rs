//! System monitor: CPU, memory, GPU, network, disks, battery and the
//! heaviest apps.
//!
//! A background thread samples the cheap numbers once a second and keeps the
//! last minute for the graphs and for the alerts. GPU counters are read only
//! while something showed them recently (the Sistem tab), and the process list
//! only on request.

use serde::Serialize;
use std::collections::VecDeque;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

/// Samples kept (one per second).
const HISTORY: usize = 60;
/// Samples a level must stay high before it counts as sustained.
const SUSTAINED: usize = 30;
/// GPU counters keep being read this long after the last `sysmon_live`.
const GPU_DEMAND_SECS: u64 = 5;

#[derive(Clone, Copy, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Sample {
    /// Percent, 0-100.
    pub cpu: f32,
    pub ram: f32,
    pub gpu: Option<f32>,
    /// Bytes per second.
    pub down: f64,
    pub up: f64,
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Memory {
    pub used: u64,
    pub total: u64,
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Gpu {
    pub name: String,
    pub usage: f32,
    pub memory_used: u64,
    pub memory_total: u64,
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Battery {
    pub percent: u8,
    pub charging: bool,
    pub plugged: bool,
    /// Estimated seconds left on battery, if Windows knows.
    pub seconds_left: Option<u32>,
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Live {
    pub cpu_name: String,
    pub cores: u32,
    pub memory: Memory,
    pub gpus: Vec<Gpu>,
    pub battery: Option<Battery>,
    /// Oldest first; the last one is the current reading.
    pub history: Vec<Sample>,
}

/// What the pill widgets and the alerts need, without waking the GPU counters.
#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Brief {
    pub current: Sample,
    pub battery: Option<Battery>,
    /// Lowest CPU/RAM percent over the last 30 s (None until 30 s of samples).
    pub cpu_sustained: Option<f32>,
    pub ram_sustained: Option<f32>,
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Disk {
    /// "C:\".
    pub root: String,
    pub label: String,
    pub free: u64,
    pub total: u64,
    pub removable: bool,
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppUsage {
    /// Lowercase exe path; every process of the app shares it.
    pub key: String,
    pub name: String,
    pub exe_path: String,
    pub cpu: f32,
    /// Private working set in bytes (Task Manager's "Memory").
    pub memory: u64,
    pub processes: u32,
    /// False for Windows' own programs and this app.
    pub can_end: bool,
}

#[derive(Default)]
struct Store {
    history: VecDeque<Sample>,
    memory: Memory,
    gpus: Vec<Gpu>,
    battery: Option<Battery>,
}

static STORE: Mutex<Option<Store>> = Mutex::new(None);
static GPU_DEMAND: AtomicU64 = AtomicU64::new(0);

fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn with_store<T>(f: impl FnOnce(&mut Store) -> T) -> T {
    let mut guard = STORE.lock().unwrap_or_else(|e| e.into_inner());
    f(guard.get_or_insert_with(Store::default))
}

fn sustained(history: &VecDeque<Sample>, pick: impl Fn(&Sample) -> f32) -> Option<f32> {
    if history.len() < SUSTAINED {
        return None;
    }
    history.iter().rev().take(SUSTAINED).map(pick).reduce(f32::min)
}

/// Starts the once-a-second sampler.
pub fn start() {
    #[cfg(windows)]
    std::thread::Builder::new()
        .name("sysmon".into())
        .spawn(win::sampler)
        .ok();
}

#[tauri::command(async)]
pub fn sysmon_live() -> Live {
    GPU_DEMAND.store(now_secs(), Ordering::Relaxed);
    let (cpu_name, cores) = cpu_info();
    with_store(|s| Live {
        cpu_name,
        cores,
        memory: s.memory.clone(),
        gpus: s.gpus.clone(),
        battery: s.battery.clone(),
        history: s.history.iter().copied().collect(),
    })
}

#[tauri::command(async)]
pub fn sysmon_brief() -> Brief {
    with_store(|s| Brief {
        current: s.history.back().copied().unwrap_or_default(),
        battery: s.battery.clone(),
        cpu_sustained: sustained(&s.history, |x| x.cpu),
        ram_sustained: sustained(&s.history, |x| x.ram),
    })
}

#[tauri::command(async)]
pub fn sysmon_disks() -> Vec<Disk> {
    #[cfg(windows)]
    {
        win::disks()
    }
    #[cfg(not(windows))]
    {
        Vec::new()
    }
}

/// The five heaviest apps, by "cpu" or "memory".
#[tauri::command(async)]
pub fn sysmon_processes(sort: String) -> Vec<AppUsage> {
    #[cfg(windows)]
    {
        let mut apps = win::apps();
        if sort == "memory" {
            apps.sort_by(|a, b| b.memory.cmp(&a.memory));
        } else {
            apps.sort_by(|a, b| b.cpu.total_cmp(&a.cpu).then(b.memory.cmp(&a.memory)));
        }
        apps.truncate(5);
        apps
    }
    #[cfg(not(windows))]
    {
        let _ = sort;
        Vec::new()
    }
}

/// Ends every process of the app. Returns how many were ended.
#[tauri::command(async)]
pub fn sysmon_end_process(key: String) -> Result<u32, String> {
    #[cfg(windows)]
    {
        win::end_app(&key)
    }
    #[cfg(not(windows))]
    {
        let _ = key;
        Err("not supported".into())
    }
}

fn cpu_info() -> (String, u32) {
    static INFO: std::sync::OnceLock<(String, u32)> = std::sync::OnceLock::new();
    INFO.get_or_init(|| {
        #[cfg(windows)]
        {
            win::cpu_info()
        }
        #[cfg(not(windows))]
        {
            (String::new(), 0)
        }
    })
    .clone()
}

#[cfg(windows)]
mod win {
    use super::{AppUsage, Battery, Disk, Gpu, Memory, Sample, Store, GPU_DEMAND, GPU_DEMAND_SECS, HISTORY};
    use std::collections::HashMap;
    use std::sync::atomic::Ordering;
    use std::sync::Mutex;
    use std::time::{Duration, Instant};
    use windows::core::{w, HSTRING, PCWSTR};
    use windows::Win32::Foundation::{CloseHandle, FILETIME, HANDLE};
    use windows::Win32::System::Threading::{
        GetActiveProcessorCount, GetProcessTimes, GetSystemTimes, OpenProcess, TerminateProcess,
        PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_TERMINATE,
    };

    fn ticks(t: FILETIME) -> u64 {
        ((t.dwHighDateTime as u64) << 32) | t.dwLowDateTime as u64
    }

    fn wide_str(buf: &[u16]) -> String {
        let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
        String::from_utf16_lossy(&buf[..end])
    }

    pub fn cpu_info() -> (String, u32) {
        use windows::Win32::System::Registry::{RegGetValueW, HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ};
        let cores = unsafe { GetActiveProcessorCount(0xffff) };
        let mut buf = [0u16; 128];
        let mut len = (buf.len() * 2) as u32;
        let ok = unsafe {
            RegGetValueW(
                HKEY_LOCAL_MACHINE,
                w!("HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0"),
                w!("ProcessorNameString"),
                RRF_RT_REG_SZ,
                None,
                Some(buf.as_mut_ptr().cast()),
                Some(&mut len),
            )
        }
        .is_ok();
        let name = if ok { wide_str(&buf).split_whitespace().collect::<Vec<_>>().join(" ") } else { String::new() };
        (name, cores)
    }

    // ---------- Sampler ----------

    struct Cpu {
        last: Option<(u64, u64)>,
    }

    impl Cpu {
        /// Busy percent since the previous call.
        fn read(&mut self) -> f32 {
            let (mut idle, mut kernel, mut user) = (FILETIME::default(), FILETIME::default(), FILETIME::default());
            if unsafe { GetSystemTimes(Some(&mut idle), Some(&mut kernel), Some(&mut user)) }.is_err() {
                return 0.0;
            }
            // Kernel time includes idle time.
            let total = ticks(kernel) + ticks(user);
            let idle = ticks(idle);
            let percent = match self.last {
                Some((t, i)) if total > t => {
                    let busy = (total - t).saturating_sub(idle.saturating_sub(i));
                    busy as f32 / (total - t) as f32 * 100.0
                }
                _ => 0.0,
            };
            self.last = Some((total, idle));
            percent.clamp(0.0, 100.0)
        }
    }

    fn memory() -> Memory {
        use windows::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
        let mut status = MEMORYSTATUSEX { dwLength: std::mem::size_of::<MEMORYSTATUSEX>() as u32, ..Default::default() };
        if unsafe { GlobalMemoryStatusEx(&mut status) }.is_err() {
            return Memory::default();
        }
        Memory { used: status.ullTotalPhys.saturating_sub(status.ullAvailPhys), total: status.ullTotalPhys }
    }

    fn battery() -> Option<Battery> {
        use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
        let mut status = SYSTEM_POWER_STATUS::default();
        unsafe { GetSystemPowerStatus(&mut status) }.ok()?;
        // 128: no system battery; 255: unknown.
        if status.BatteryFlag & 128 != 0 || status.BatteryFlag == 255 || status.BatteryLifePercent > 100 {
            return None;
        }
        Some(Battery {
            percent: status.BatteryLifePercent,
            charging: status.BatteryFlag & 8 != 0,
            plugged: status.ACLineStatus == 1,
            seconds_left: (status.BatteryLifeTime != u32::MAX && status.ACLineStatus != 1).then_some(status.BatteryLifeTime),
        })
    }

    struct Network {
        last: Option<(Instant, u64, u64)>,
    }

    impl Network {
        /// Total bytes received and sent by physical adapters.
        fn totals() -> Option<(u64, u64)> {
            use windows::Win32::NetworkManagement::IpHelper::{FreeMibTable, GetIfTable2, MIB_IF_TABLE2};
            let mut table: *mut MIB_IF_TABLE2 = std::ptr::null_mut();
            unsafe {
                if GetIfTable2(&mut table).is_err() || table.is_null() {
                    return None;
                }
                let rows = std::slice::from_raw_parts((*table).Table.as_ptr(), (*table).NumEntries as usize);
                let (mut down, mut up) = (0u64, 0u64);
                for row in rows {
                    let flags = row.InterfaceAndOperStatusFlags._bitfield;
                    // Hardware interfaces only, and not their filter layers (they repeat the same bytes).
                    let hardware = flags & 1 != 0;
                    let filter = flags & 2 != 0;
                    const LOOPBACK: u32 = 24;
                    if hardware && !filter && row.Type != LOOPBACK {
                        down += row.InOctets;
                        up += row.OutOctets;
                    }
                }
                FreeMibTable(table.cast());
                Some((down, up))
            }
        }

        /// Bytes per second since the previous call.
        fn read(&mut self) -> (f64, f64) {
            let Some((down, up)) = Self::totals() else { return (0.0, 0.0) };
            let now = Instant::now();
            let rate = match self.last {
                Some((at, d, u)) => {
                    let secs = now.duration_since(at).as_secs_f64().max(0.001);
                    (down.saturating_sub(d) as f64 / secs, up.saturating_sub(u) as f64 / secs)
                }
                None => (0.0, 0.0),
            };
            self.last = Some((now, down, up));
            rate
        }
    }

    /// GPU usage and memory from the same counters Task Manager uses.
    struct GpuCounters {
        query: isize,
        engines: isize,
        dedicated: isize,
        shared: isize,
        adapters: Vec<Adapter>,
    }

    struct Adapter {
        /// "luid_0x00000000_0x0000d1f2", as in the counter instance names.
        luid: String,
        name: String,
        dedicated_total: u64,
        shared_total: u64,
    }

    /// Counter values per instance name.
    fn counter_array(counter: isize) -> Vec<(String, f64)> {
        use windows::Win32::System::Performance::{
            PdhGetFormattedCounterArrayW, PDH_FMT, PDH_FMT_COUNTERVALUE_ITEM_W, PDH_FMT_DOUBLE, PDH_MORE_DATA,
        };
        // PDH_FMT_NOCAP100: memory counters are bytes, not percent.
        let format = PDH_FMT(PDH_FMT_DOUBLE.0 | 0x8000);
        let (mut size, mut count) = (0u32, 0u32);
        unsafe {
            if PdhGetFormattedCounterArrayW(counter, format, &mut size, &mut count, None) != PDH_MORE_DATA || size == 0 {
                return Vec::new();
            }
            let item = std::mem::size_of::<PDH_FMT_COUNTERVALUE_ITEM_W>();
            let mut buf = vec![0u64; (size as usize).div_ceil(8).max(item.div_ceil(8))];
            let items = buf.as_mut_ptr() as *mut PDH_FMT_COUNTERVALUE_ITEM_W;
            if PdhGetFormattedCounterArrayW(counter, format, &mut size, &mut count, Some(items)) != 0 {
                return Vec::new();
            }
            std::slice::from_raw_parts(items, count as usize)
                .iter()
                .filter(|i| i.FmtValue.CStatus == 0)
                .map(|i| (i.szName.to_string().unwrap_or_default().to_lowercase(), i.FmtValue.Anonymous.doubleValue))
                .collect()
        }
    }

    impl GpuCounters {
        fn open() -> Option<Self> {
            use windows::Win32::System::Performance::{PdhAddEnglishCounterW, PdhOpenQueryW};
            let adapters = adapters();
            if adapters.is_empty() {
                return None;
            }
            let mut query = 0isize;
            unsafe {
                if PdhOpenQueryW(PCWSTR::null(), 0, &mut query) != 0 {
                    return None;
                }
                let add = |path: PCWSTR| {
                    let mut counter = 0isize;
                    (PdhAddEnglishCounterW(query, path, 0, &mut counter) == 0).then_some(counter)
                };
                let engines = add(w!("\\GPU Engine(*)\\Utilization Percentage"));
                let dedicated = add(w!("\\GPU Adapter Memory(*)\\Dedicated Usage")).unwrap_or(0);
                let shared = add(w!("\\GPU Adapter Memory(*)\\Shared Usage")).unwrap_or(0);
                let Some(engines) = engines else {
                    windows::Win32::System::Performance::PdhCloseQuery(query);
                    return None;
                };
                Some(Self { query, engines, dedicated, shared, adapters })
            }
        }

        fn collect(&self) {
            unsafe { windows::Win32::System::Performance::PdhCollectQueryData(self.query) };
        }

        fn read(&self) -> Vec<Gpu> {
            self.collect();
            // Per adapter and engine type ("3d", "copy", "videodecode"...): the
            // sum over processes. The adapter's usage is its busiest engine type.
            let mut per_engine: HashMap<(usize, String), f64> = HashMap::new();
            for (name, value) in counter_array(self.engines) {
                let Some(adapter) = self.adapters.iter().position(|a| name.contains(&a.luid)) else { continue };
                let kind = name.rsplit("engtype_").next().unwrap_or("").to_string();
                *per_engine.entry((adapter, kind)).or_default() += value;
            }
            let memory = |counter: isize| {
                let mut per_adapter = vec![0u64; self.adapters.len()];
                if counter != 0 {
                    for (name, value) in counter_array(counter) {
                        if let Some(i) = self.adapters.iter().position(|a| name.contains(&a.luid)) {
                            per_adapter[i] += value.max(0.0) as u64;
                        }
                    }
                }
                per_adapter
            };
            let dedicated = memory(self.dedicated);
            let shared = memory(self.shared);
            self.adapters
                .iter()
                .enumerate()
                .map(|(i, a)| {
                    let usage = per_engine
                        .iter()
                        .filter(|((adapter, _), _)| *adapter == i)
                        .map(|(_, v)| *v)
                        .fold(0.0, f64::max);
                    // Integrated GPUs have (almost) no memory of their own: show the shared memory instead.
                    let integrated = a.dedicated_total < 512 * 1024 * 1024;
                    Gpu {
                        name: a.name.clone(),
                        usage: usage.clamp(0.0, 100.0) as f32,
                        memory_used: if integrated { shared[i] } else { dedicated[i] },
                        memory_total: if integrated { a.shared_total } else { a.dedicated_total },
                    }
                })
                .collect()
        }
    }

    impl Drop for GpuCounters {
        fn drop(&mut self) {
            unsafe { windows::Win32::System::Performance::PdhCloseQuery(self.query) };
        }
    }

    /// Hardware graphics adapters, discrete ones first.
    fn adapters() -> Vec<Adapter> {
        use windows::Win32::Graphics::Dxgi::{CreateDXGIFactory1, IDXGIFactory1};
        let Ok(factory) = (unsafe { CreateDXGIFactory1::<IDXGIFactory1>() }) else { return Vec::new() };
        let mut out: Vec<Adapter> = Vec::new();
        for i in 0.. {
            let Ok(adapter) = (unsafe { factory.EnumAdapters1(i) }) else { break };
            let Ok(desc) = (unsafe { adapter.GetDesc1() }) else { continue };
            // DXGI_ADAPTER_FLAG_SOFTWARE, and Microsoft's Basic Render Driver.
            if desc.Flags & 2 != 0 || desc.VendorId == 0x1414 {
                continue;
            }
            let luid = format!(
                "luid_0x{:08x}_0x{:08x}",
                desc.AdapterLuid.HighPart as u32, desc.AdapterLuid.LowPart
            );
            if out.iter().any(|a| a.luid == luid) {
                continue;
            }
            out.push(Adapter {
                luid,
                name: wide_str(&desc.Description).trim().to_string(),
                dedicated_total: desc.DedicatedVideoMemory as u64,
                shared_total: desc.SharedSystemMemory as u64,
            });
        }
        out.sort_by(|a, b| b.dedicated_total.cmp(&a.dedicated_total));
        out
    }

    pub fn sampler() {
        let mut cpu = Cpu { last: None };
        let mut net = Network { last: None };
        let mut gpu: Option<GpuCounters> = None;
        let mut tick = 0u64;
        cpu.read();
        net.read();
        loop {
            std::thread::sleep(Duration::from_secs(1));
            tick += 1;
            let wanted = super::now_secs().saturating_sub(GPU_DEMAND.load(Ordering::Relaxed)) <= GPU_DEMAND_SECS;
            if wanted && gpu.is_none() {
                gpu = GpuCounters::open();
                // Rate counters need a first reading to compare against.
                if let Some(g) = &gpu {
                    g.collect();
                }
            } else if !wanted {
                gpu = None;
            }
            let gpus = gpu.as_ref().map(|g| g.read());
            let (down, up) = net.read();
            let memory = memory();
            let sample = Sample {
                cpu: cpu.read(),
                ram: if memory.total > 0 { memory.used as f32 / memory.total as f32 * 100.0 } else { 0.0 },
                gpu: gpus.as_ref().and_then(|g| g.first()).map(|g| g.usage),
                down,
                up,
            };
            // Battery state changes slowly.
            let battery = (tick % 5 == 1).then(battery);
            super::with_store(|s: &mut Store| {
                if s.history.len() >= HISTORY {
                    s.history.pop_front();
                }
                s.history.push_back(sample);
                s.memory = memory;
                if let Some(gpus) = gpus {
                    s.gpus = gpus;
                }
                if let Some(battery) = battery {
                    s.battery = battery;
                }
            });
        }
    }

    // ---------- Disks ----------

    pub fn disks() -> Vec<Disk> {
        use windows::Win32::Storage::FileSystem::{
            GetDiskFreeSpaceExW, GetDriveTypeW, GetLogicalDriveStringsW, GetVolumeInformationW,
        };
        const REMOVABLE: u32 = 2;
        const FIXED: u32 = 3;
        let mut buf = [0u16; 512];
        let len = unsafe { GetLogicalDriveStringsW(Some(&mut buf)) } as usize;
        buf[..len.min(buf.len())]
            .split(|&c| c == 0)
            .filter(|r| !r.is_empty())
            .filter_map(|root| {
                let root = String::from_utf16_lossy(root);
                let path = HSTRING::from(root.as_str());
                let kind = unsafe { GetDriveTypeW(&path) };
                if kind != FIXED && kind != REMOVABLE {
                    return None;
                }
                let (mut free, mut total) = (0u64, 0u64);
                unsafe { GetDiskFreeSpaceExW(&path, Some(&mut free), Some(&mut total), None) }.ok()?;
                if total == 0 {
                    return None;
                }
                let mut label = [0u16; 261];
                let _ = unsafe { GetVolumeInformationW(&path, Some(&mut label), None, None, None, None) };
                Some(Disk { root, label: wide_str(&label), free, total, removable: kind == REMOVABLE })
            })
            .collect()
    }

    // ---------- Processes ----------

    struct Proc {
        pid: u32,
        path: String,
        cpu_time: u64,
        memory: u64,
    }

    fn processes() -> Vec<Proc> {
        use windows::Win32::System::Diagnostics::ToolHelp::{
            CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
        };
        use windows::Win32::System::ProcessStatus::{
            GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS, PROCESS_MEMORY_COUNTERS_EX2,
        };
        let own = std::process::id();
        let mut pids = Vec::new();
        unsafe {
            let Ok(snapshot) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else { return Vec::new() };
            let mut entry = PROCESSENTRY32W { dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32, ..Default::default() };
            let mut ok = Process32FirstW(snapshot, &mut entry).is_ok();
            while ok {
                if entry.th32ProcessID > 4 && entry.th32ProcessID != own {
                    pids.push(entry.th32ProcessID);
                }
                ok = Process32NextW(snapshot, &mut entry).is_ok();
            }
            let _ = CloseHandle(snapshot);
        }
        pids.into_iter()
            .filter_map(|pid| unsafe {
                let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
                let (mut created, mut exited, mut kernel, mut user) =
                    (FILETIME::default(), FILETIME::default(), FILETIME::default(), FILETIME::default());
                let times = GetProcessTimes(process, &mut created, &mut exited, &mut kernel, &mut user).is_ok();
                let mut counters = PROCESS_MEMORY_COUNTERS_EX2 {
                    cb: std::mem::size_of::<PROCESS_MEMORY_COUNTERS_EX2>() as u32,
                    ..Default::default()
                };
                let memory = if GetProcessMemoryInfo(process, &mut counters as *mut _ as *mut PROCESS_MEMORY_COUNTERS, counters.cb)
                    .is_ok()
                {
                    counters.PrivateWorkingSetSize as u64
                } else {
                    let mut basic = PROCESS_MEMORY_COUNTERS {
                        cb: std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32,
                        ..Default::default()
                    };
                    let _ = GetProcessMemoryInfo(process, &mut basic, basic.cb);
                    basic.WorkingSetSize as u64
                };
                let _ = CloseHandle(process);
                let path = crate::process::exe_path(pid);
                (times && !path.is_empty()).then(|| Proc { pid, path, cpu_time: ticks(kernel) + ticks(user), memory })
            })
            .collect()
    }

    /// CPU time per pid at the previous listing.
    static LAST: Mutex<Option<(Instant, HashMap<u32, u64>)>> = Mutex::new(None);

    fn protected(key: &str) -> bool {
        let windows_dir = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".into()).to_lowercase();
        let own = std::env::current_exe().map(|p| p.to_string_lossy().to_lowercase()).unwrap_or_default();
        key.starts_with(&format!("{windows_dir}\\")) || key == own
    }

    pub fn apps() -> Vec<AppUsage> {
        let fresh = LAST.lock().ok().and_then(|l| l.as_ref().map(|(at, _)| at.elapsed() < Duration::from_secs(10)));
        if fresh != Some(true) {
            // No recent listing to compare with: take one now.
            remember(&processes());
            std::thread::sleep(Duration::from_millis(400));
        }
        let procs = processes();
        let previous = LAST.lock().ok().and_then(|mut l| l.take());
        remember(&procs);
        let Some((at, previous)) = previous else { return Vec::new() };
        // FILETIME ticks are 100 ns.
        let elapsed = at.elapsed().as_nanos() as f64 / 100.0;
        let cores = super::cpu_info().1.max(1) as f64;

        let mut apps: HashMap<String, AppUsage> = HashMap::new();
        for p in procs {
            let key = p.path.to_lowercase();
            let cpu = previous.get(&p.pid).map(|&t| p.cpu_time.saturating_sub(t) as f64 / elapsed / cores * 100.0);
            let app = apps.entry(key.clone()).or_insert_with(|| AppUsage {
                name: crate::mixer::app_name(&p.path),
                exe_path: p.path.clone(),
                can_end: !protected(&key),
                key,
                ..Default::default()
            });
            app.cpu += cpu.unwrap_or(0.0) as f32;
            app.memory += p.memory;
            app.processes += 1;
        }
        apps.into_values()
            .map(|mut a| {
                a.cpu = a.cpu.clamp(0.0, 100.0);
                a
            })
            .collect()
    }

    fn remember(procs: &[Proc]) {
        if let Ok(mut last) = LAST.lock() {
            *last = Some((Instant::now(), procs.iter().map(|p| (p.pid, p.cpu_time)).collect()));
        }
    }

    pub fn end_app(key: &str) -> Result<u32, String> {
        let key = key.to_lowercase();
        if protected(&key) {
            return Err("Program Windows tidak bisa diakhiri dari sini".into());
        }
        let mut ended = 0;
        let mut failed = 0;
        for p in processes().into_iter().filter(|p| p.path.to_lowercase() == key) {
            unsafe {
                let Ok(process): windows::core::Result<HANDLE> = OpenProcess(PROCESS_TERMINATE, false, p.pid) else {
                    failed += 1;
                    continue;
                };
                if TerminateProcess(process, 1).is_ok() {
                    ended += 1;
                } else {
                    failed += 1;
                }
                let _ = CloseHandle(process);
            }
        }
        if ended == 0 && failed > 0 {
            Err("Akses ditolak (aplikasinya mungkin berjalan sebagai administrator)".into())
        } else {
            Ok(ended)
        }
    }
}

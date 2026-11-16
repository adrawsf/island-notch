/**
 * Frontend side of `src-tauri/src/sysmon.rs`. The backend samples once a
 * second; these hooks poll it only while something on screen uses them.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { BatteryCharging, BatteryFull, BatteryLow, BatteryMedium } from "lucide-react";

export interface Sample {
  cpu: number;
  ram: number;
  gpu: number | null;
  /** Bytes per second. */
  down: number;
  up: number;
}

export interface Gpu {
  name: string;
  usage: number;
  memoryUsed: number;
  memoryTotal: number;
}

export interface Battery {
  percent: number;
  charging: boolean;
  plugged: boolean;
  secondsLeft: number | null;
}

export interface Live {
  cpuName: string;
  cores: number;
  memory: { used: number; total: number };
  gpus: Gpu[];
  battery: Battery | null;
  history: Sample[];
}

export interface Brief {
  current: Sample;
  battery: Battery | null;
  cpuSustained: number | null;
  ramSustained: number | null;
}

export interface Disk {
  root: string;
  label: string;
  free: number;
  total: number;
  removable: boolean;
}

export interface AppUsage {
  key: string;
  name: string;
  exePath: string;
  cpu: number;
  memory: number;
  processes: number;
  canEnd: boolean;
}

export type AppSort = "cpu" | "memory";

const GB = 1024 ** 3;
const DEMO_MODE = !isTauri() && import.meta.env.DEV;

// ---------- Sample data for a plain browser (`npm run dev`) ----------

function wave(i: number, base: number, swing: number) {
  return Math.max(0, Math.min(100, base + Math.sin(i / 4) * swing + Math.sin(i / 1.7) * swing * 0.4));
}

function demoHistory(t: number): Sample[] {
  return Array.from({ length: 60 }, (_, k) => {
    const i = t + k;
    return {
      cpu: wave(i, 28, 14),
      ram: wave(i / 6, 62, 2),
      gpu: wave(i + 9, 18, 12),
      down: Math.max(0, 1.6e6 + Math.sin(i / 3) * 1.4e6),
      up: Math.max(0, 1.2e5 + Math.sin(i / 2) * 9e4),
    };
  });
}

const DEMO_BATTERY: Battery = { percent: 76, charging: false, plugged: false, secondsLeft: 3 * 3600 + 20 * 60 };

function demoLive(t: number): Live {
  return {
    cpuName: "AMD Ryzen 7 5800H with Radeon Graphics",
    cores: 16,
    memory: { used: 9.9 * GB, total: 15.4 * GB },
    gpus: [
      { name: "NVIDIA GeForce RTX 3060 Laptop GPU", usage: wave(t + 68, 18, 12), memoryUsed: 1.8 * GB, memoryTotal: 6 * GB },
    ],
    battery: DEMO_BATTERY,
    history: demoHistory(t),
  };
}

const DEMO_APPS: AppUsage[] = [
  { key: "chrome", name: "Google Chrome", exePath: "", cpu: 12.4, memory: 2.1 * GB, processes: 23, canEnd: true },
  { key: "code", name: "Visual Studio Code", exePath: "", cpu: 6.1, memory: 1.3 * GB, processes: 11, canEnd: true },
  { key: "spotify", name: "Spotify", exePath: "", cpu: 2.3, memory: 0.42 * GB, processes: 6, canEnd: true },
  { key: "dwm", name: "Desktop Window Manager", exePath: "", cpu: 1.8, memory: 0.18 * GB, processes: 1, canEnd: false },
  { key: "discord", name: "Discord", exePath: "", cpu: 0.6, memory: 0.38 * GB, processes: 7, canEnd: true },
];

const DEMO_DISKS: Disk[] = [
  { root: "C:\\", label: "Windows", free: 84 * GB, total: 476 * GB, removable: false },
  { root: "D:\\", label: "Data", free: 312 * GB, total: 931 * GB, removable: false },
];

// ---------- Hooks ----------

function call<T>(command: string, args: Record<string, unknown> = {}): Promise<T | null> {
  return invoke<T>(command, args).catch((err) => {
    console.error(`[sysmon] ${command}`, err);
    return null;
  });
}

/** Polls `read` every `ms` while mounted (and `enabled`). */
function usePoll<T>(read: () => Promise<T | null>, ms: number, deps: unknown[], enabled = true): T | null {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    const tick = () =>
      read().then((v) => {
        if (current && v !== null) setValue(v);
      });
    tick();
    const t = setInterval(tick, ms);
    return () => {
      current = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled]);
  return value;
}

let demoTick = 0;

/** Everything for the Sistem tab, refreshed every second. */
export function useLive(): Live | null {
  return usePoll(() => (DEMO_MODE ? Promise.resolve(demoLive(demoTick++)) : call<Live>("sysmon_live")), 1000, []);
}

export function useDisks(): Disk[] | null {
  return usePoll(() => (DEMO_MODE ? Promise.resolve(DEMO_DISKS) : call<Disk[]>("sysmon_disks")), 30_000, []);
}

export function useTopApps(sort: AppSort, refreshKey: number): AppUsage[] | null {
  return usePoll(
    () => {
      if (!DEMO_MODE) return call<AppUsage[]>("sysmon_processes", { sort });
      const apps = [...DEMO_APPS];
      apps.sort((a, b) => (sort === "memory" ? b.memory - a.memory : b.cpu - a.cpu));
      return Promise.resolve(apps);
    },
    2000,
    [sort, refreshKey],
  );
}

/** Ends every process of an app. Resolves to an error message, or null. */
export async function endApp(key: string): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    await invoke<number>("sysmon_end_process", { key });
    return null;
  } catch (err) {
    return String(err);
  }
}

// The pill widgets and the alerts share one slow poll.
const BRIEF_POLL_MS = 2000;
let brief: Brief | null = DEMO_MODE
  ? { current: demoHistory(0)[59], battery: DEMO_BATTERY, cpuSustained: null, ramSustained: null }
  : null;
let briefUsers = 0;
let briefTimer: ReturnType<typeof setInterval> | null = null;
const briefListeners = new Set<() => void>();

async function readBrief() {
  if (DEMO_MODE) {
    const sample = demoHistory(demoTick++)[59];
    brief = { ...brief!, current: sample };
  } else {
    const next = await call<Brief>("sysmon_brief");
    if (!next) return;
    brief = next;
  }
  briefListeners.forEach((l) => l());
}

/** CPU, RAM, network and battery at a glance, every 2 s. */
export function useBrief(): Brief | null {
  useEffect(() => {
    if (!isTauri() && !DEMO_MODE) return;
    if (briefUsers++ === 0) {
      readBrief();
      briefTimer = setInterval(readBrief, BRIEF_POLL_MS);
    }
    return () => {
      if (--briefUsers === 0 && briefTimer) {
        clearInterval(briefTimer);
        briefTimer = null;
      }
    };
  }, []);
  return useSyncExternalStore(
    (l) => {
      briefListeners.add(l);
      return () => briefListeners.delete(l);
    },
    () => brief,
  );
}

// ---------- Formatting ----------

export function batteryIcon(battery: Battery) {
  if (battery.charging || battery.plugged) return BatteryCharging;
  if (battery.percent <= 20) return BatteryLow;
  if (battery.percent <= 60) return BatteryMedium;
  return BatteryFull;
}

/** "1.4 GB", "312 MB". */
export function formatBytes(bytes: number): string {
  if (bytes >= 1000 * 1024 ** 3) return `${(bytes / 1024 ** 4).toFixed(1)} TB`;
  if (bytes >= GB) return `${(bytes / GB).toFixed(bytes >= 100 * GB ? 0 : 1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

/** "1.2 MB/s", "340 KB/s". */
export function formatRate(bytesPerSecond: number): string {
  if (bytesPerSecond >= 1024 ** 2) return `${(bytesPerSecond / 1024 ** 2).toFixed(1)} MB/s`;
  if (bytesPerSecond >= 1024) return `${Math.round(bytesPerSecond / 1024)} KB/s`;
  return `${Math.round(bytesPerSecond)} B/s`;
}

/** "3 j 20 m", "45 m". */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h} j ${m} m` : `${m} m`;
}

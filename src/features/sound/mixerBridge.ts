/**
 * Frontend side of `src-tauri/src/mixer.rs`: one shared mixer state per
 * window, polled while the Suara tab is open, plus a slower poll of the
 * microphone mute for the pill. Changes show at once (optimistic) and polls
 * do not snap sliders back while a change is in flight.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";

export interface Level {
  volume: number;
  muted: boolean;
}

export interface Endpoint {
  id: string;
  name: string;
}

export interface AppSession {
  key: string;
  name: string;
  exePath: string;
  volume: number;
  muted: boolean;
  active: boolean;
  system: boolean;
}

export interface MixerState {
  outputId: string | null;
  outputs: Endpoint[];
  master: Level | null;
  apps: AppSession[];
  mic: { name: string; muted: boolean } | null;
}

const EMPTY: MixerState = { outputId: null, outputs: [], master: null, apps: [], mic: null };

/** Sample state for the UI in a plain browser (`npm run dev`). */
const DEMO: MixerState = {
  outputId: "spk",
  outputs: [
    { id: "spk", name: "Speakers (Realtek(R) Audio)" },
    { id: "hp", name: "Headphones (WH-1000XM4)" },
    { id: "hdmi", name: "LG ULTRAGEAR (NVIDIA High Definition Audio)" },
  ],
  master: { volume: 0.45, muted: false },
  apps: [
    { key: "spotify", name: "Spotify", exePath: "", volume: 0.8, muted: false, active: true, system: false },
    { key: "chrome", name: "Google Chrome", exePath: "", volume: 1, muted: false, active: true, system: false },
    { key: "discord", name: "Discord", exePath: "", volume: 0.6, muted: true, active: false, system: false },
    { key: "system", name: "Suara sistem", exePath: "", volume: 0.5, muted: false, active: false, system: true },
  ],
  mic: { name: "Microphone Array (Realtek(R) Audio)", muted: false },
};

const MIXER_POLL_MS = 1000;
const MIC_POLL_MS = 3000;
/** How long a change blocks polls from overwriting it. */
const SETTLE_MS = 700;

let state: MixerState = isTauri() || !import.meta.env.DEV ? EMPTY : DEMO;
let settleUntil = 0;
let users = 0;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function emit(next: MixerState) {
  state = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function settle() {
  settleUntil = Date.now() + SETTLE_MS;
}

async function refresh() {
  if (!isTauri() || Date.now() < settleUntil) return;
  const next = await invoke<MixerState>("mixer_state").catch(() => null);
  if (next && Date.now() >= settleUntil) {
    emit(next);
    if (next.mic) setMic(next.mic.muted);
  }
}

/** The mixer; polls while any component uses it. */
export function useMixer(): MixerState {
  useEffect(() => {
    if (!isTauri()) return;
    refresh();
    users++;
    timer ??= setInterval(refresh, MIXER_POLL_MS);
    return () => {
      users--;
      if (users === 0 && timer) {
        clearInterval(timer);
        timer = null;
      }
    };
  }, []);
  return useSyncExternalStore(subscribe, () => state);
}

function call<T>(command: string, args: Record<string, unknown>): Promise<T | null> {
  if (!isTauri()) return Promise.resolve(null);
  return invoke<T>(command, args).catch((err) => {
    console.error(`[mixer] ${command}`, err);
    return null;
  });
}

const clamp = (v: number) => Math.max(0, Math.min(1, v));

/** Raising the volume unmutes, like the Windows flyout. */
function unmuteOnRaise(current: Level, change: { volume?: number; muted?: boolean }): boolean | undefined {
  if (change.muted !== undefined) return change.muted;
  return change.volume !== undefined && change.volume > current.volume && current.muted ? false : undefined;
}

export function setMaster(change: { volume?: number; muted?: boolean }): void {
  if (!state.master) return;
  const volume = change.volume === undefined ? undefined : clamp(change.volume);
  const muted = unmuteOnRaise(state.master, { ...change, volume });
  emit({ ...state, master: { volume: volume ?? state.master.volume, muted: muted ?? state.master.muted } });
  settle();
  call("mixer_set_master", { volume: volume ?? null, muted: muted ?? null });
}

export function setAppLevel(key: string, change: { volume?: number; muted?: boolean }): void {
  const app = state.apps.find((a) => a.key === key);
  if (!app) return;
  const volume = change.volume === undefined ? undefined : clamp(change.volume);
  const muted = unmuteOnRaise(app, { ...change, volume });
  emit({
    ...state,
    apps: state.apps.map((a) =>
      a.key === key ? { ...a, volume: volume ?? a.volume, muted: muted ?? a.muted } : a,
    ),
  });
  settle();
  call("mixer_set_app", { key, volume: volume ?? null, muted: muted ?? null });
}

export function setOutput(id: string): void {
  emit({ ...state, outputId: id });
  settle();
  call("mixer_set_output", { id }).then(() => {
    // The new device has its own volume and sessions.
    settleUntil = 0;
    refresh();
  });
}

/** Scrolling on the pill: master volume by `delta`. Resolves to the new level. */
export async function stepMaster(delta: number): Promise<Level | null> {
  if (!isTauri()) {
    if (!state.master) return null;
    const master = { volume: Math.round(clamp(state.master.volume + delta) * 100) / 100, muted: false };
    emit({ ...state, master });
    return master;
  }
  const level = await call<Level>("mixer_step_master", { delta });
  if (level) emit({ ...state, master: level });
  return level;
}

// ---------- Microphone (also shown on the pill) ----------

let micMuted: boolean | null = state.mic?.muted ?? null;
const micListeners = new Set<() => void>();

function setMic(muted: boolean | null) {
  if (muted === micMuted) return;
  micMuted = muted;
  micListeners.forEach((l) => l());
}

export function setMicMuted(muted: boolean): void {
  setMic(muted);
  if (state.mic) emit({ ...state, mic: { ...state.mic, muted } });
  settle();
  call<boolean>("mixer_set_mic_muted", { muted }).then((m) => m !== null && setMic(m));
}

/** Whether the default microphone is muted (null: no microphone). */
export function useMicMuted(): boolean | null {
  useEffect(() => {
    if (!isTauri()) return;
    const read = () => call<boolean | null>("mixer_mic_muted", {}).then((m) => setMic(m));
    read();
    const t = setInterval(read, MIC_POLL_MS);
    return () => clearInterval(t);
  }, []);
  return useSyncExternalStore(
    (l) => {
      micListeners.add(l);
      return () => micListeners.delete(l);
    },
    () => micMuted,
  );
}

// ---------- App icons ----------

const icons = new Map<string, Promise<string | null>>();

/** The exe's icon (data URI), cached for the session. */
export function useAppIcon(exePath: string): string | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!isTauri() || !exePath) return;
    let current = true;
    let load = icons.get(exePath);
    if (!load) {
      load = call<string | null>("mixer_app_icon", { path: exePath });
      icons.set(exePath, load);
    }
    load.then((s) => current && setSrc(s));
    return () => {
      current = false;
    };
  }, [exePath]);
  return src;
}

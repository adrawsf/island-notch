/**
 * Volume of the app playing media (src-tauri/src/volume.rs). One shared,
 * lightly polled value per window, so a change in the Windows mixer shows up
 * here too. Outside Tauri, or when the app's audio session is not found, the
 * volume is null and the controls hide.
 */
import { useEffect, useSyncExternalStore } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { MediaState } from "./mediaBridge";

export interface AppVolume {
  volume: number;
  muted: boolean;
}

const POLL_MS = 2000;
/** Wheel / keyboard step. */
export const VOLUME_STEP = 0.05;

let appId = "";
let current: AppVolume | null = null;
let users = 0;
let timer: ReturnType<typeof setInterval> | null = null;
/** A set in flight: polls must not snap the slider back meanwhile. */
let settingUntil = 0;
const listeners = new Set<() => void>();

function emit(next: AppVolume | null) {
  if (next?.volume === current?.volume && next?.muted === current?.muted) return;
  current = next;
  listeners.forEach((l) => l());
}

async function refresh() {
  if (!isTauri() || !appId || Date.now() < settingUntil) return;
  const id = appId;
  const v = await invoke<AppVolume | null>("media_volume_get", { appId: id }).catch(() => null);
  if (id === appId && Date.now() >= settingUntil) emit(v);
}

/** Sets the volume (0-1) and/or mute; the UI updates at once. */
export function setAppVolume(change: { volume?: number; muted?: boolean }): void {
  if (!isTauri() || !appId || !current) return;
  const volume = change.volume === undefined ? undefined : Math.max(0, Math.min(1, change.volume));
  // Raising the volume unmutes, like the Windows mixer.
  const muted = change.muted ?? (volume !== undefined && volume > 0 && current.muted ? false : undefined);
  emit({ volume: volume ?? current.volume, muted: muted ?? current.muted });
  settingUntil = Date.now() + 600;
  invoke<AppVolume | null>("media_volume_set", { appId, volume: volume ?? null, muted: muted ?? null })
    .then((v) => {
      if (v && Date.now() >= settingUntil) emit(v);
    })
    .catch((err) => console.error("[volume] set", err));
}

/** Nudges the volume by `delta` (e.g. ±VOLUME_STEP). Returns the new level, or null. */
export function stepAppVolume(delta: number): number | null {
  if (!current) return null;
  const next = Math.round(Math.max(0, Math.min(1, current.volume + delta)) * 100) / 100;
  setAppVolume({ volume: next });
  return next;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The playing app's volume; polls while any component uses it. */
export function useAppVolume(media: MediaState): AppVolume | null {
  const id = media.active ? media.appId : "";

  useEffect(() => {
    if (!isTauri()) return;
    if (id !== appId) {
      appId = id;
      emit(null);
    }
    refresh();
    users++;
    timer ??= setInterval(refresh, POLL_MS);
    return () => {
      users--;
      if (users === 0 && timer) {
        clearInterval(timer);
        timer = null;
      }
    };
  }, [id]);

  return useSyncExternalStore(subscribe, () => current);
}

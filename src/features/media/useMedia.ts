/**
 * Now-playing state shared by every component (tab, pill, shell).
 * One Tauri subscription for the whole app, started on first use.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { EMPTY_MEDIA, getMediaState, onMediaState, type MediaState } from "./mediaBridge";
import { DEMO_MEDIA_ENABLED, demoMedia } from "./demoMedia";

let current: MediaState = EMPTY_MEDIA;
let started = false;
const listeners = new Set<() => void>();

function set(next: MediaState) {
  current = next;
  listeners.forEach((l) => l());
}

function start() {
  if (started) return;
  started = true;
  if (!isTauri() && DEMO_MEDIA_ENABLED) {
    set(demoMedia());
    return;
  }
  onMediaState(set);
  // Catch up on state emitted before this webview loaded (or after HMR).
  getMediaState().then((s) => {
    if (s.sampledAtMs >= current.sampledAtMs) set(s);
  });
}

function subscribeMedia(listener: () => void): () => void {
  start();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useMedia(): MediaState {
  return useSyncExternalStore(subscribeMedia, () => current);
}

/**
 * Live playback position, interpolated between SMTC updates while playing.
 * Re-renders only the component that uses it.
 */
/** Playback position at `now`, interpolated while playing. */
export function positionAt(media: MediaState, now: number): number {
  if (!media.isPlaying) return media.positionMs;
  const position = media.positionMs + Math.max(0, now - media.sampledAtMs);
  return media.durationMs > 0 ? Math.min(position, media.durationMs) : position;
}

/**
 * A value derived from the playback position, checked every `intervalMs` but
 * re-rendering only when it changes (e.g. the current lyric line), so a
 * collapsed notch is not redrawn several times a second for nothing.
 */
export function useFromPosition<T>(media: MediaState, derive: (positionMs: number) => T, intervalMs = 200): T {
  const [value, setValue] = useState(() => derive(positionAt(media, Date.now())));
  const deriveRef = useRef(derive);
  deriveRef.current = derive;

  useEffect(() => {
    const tick = () => setValue(deriveRef.current(positionAt(media, Date.now())));
    tick();
    if (!media.isPlaying) return;
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [media, intervalMs]);

  return value;
}

export function useMediaPosition(media: MediaState, intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!media.isPlaying) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [media.isPlaying, intervalMs]);

  if (!media.isPlaying) return media.positionMs;
  const elapsed = Math.max(0, now - media.sampledAtMs);
  const position = media.positionMs + elapsed;
  return media.durationMs > 0 ? Math.min(position, media.durationMs) : position;
}

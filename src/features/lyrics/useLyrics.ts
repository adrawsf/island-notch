/**
 * Lyrics for the playing track, shared by every component, plus the
 * per-track timing offset. Each track is looked up once per source and
 * session (results, misses and errors cached).
 */
import { useEffect, useSyncExternalStore } from "react";
import { useSettings } from "../../core/settings/useSettings";
import { persistedValue } from "../../core/storage/persistedValue";
import type { MediaState } from "../media/mediaBridge";
import { useFromPosition, useMediaPosition } from "../media/useMedia";
import { currentLineIndex } from "./lyricsText";
import { findLyrics } from "./sources";
import type { Lyrics, LyricsSource } from "./types";

export type LyricsResult =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "found"; lyrics: Lyrics }
  | { status: "notFound" }
  | { status: "error"; message: string; at: number };

const IDLE: LyricsResult = { status: "idle" };
const LOADING: LyricsResult = { status: "loading" };
/** Bounded cache: source + track key -> result. */
const MAX_CACHED = 50;
/** A failed lookup (offline, timeout) is retried after this long. */
const ERROR_RETRY_MS = 30_000;

const cache = new Map<string, LyricsResult>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

/** Identifies a track across reads (duration rounded: players jitter by a few ms). */
export function trackKey(media: MediaState): string {
  return [media.title, media.artist, media.album, Math.round(media.durationMs / 1000)].join("\u001f").toLowerCase();
}

function store(key: string, result: LyricsResult) {
  cache.delete(key);
  cache.set(key, result);
  while (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value as string);
  emit();
}

function load(key: string, media: MediaState, source: LyricsSource) {
  const cached = cache.get(key);
  if (cached && !(cached.status === "error" && Date.now() - cached.at > ERROR_RETRY_MS)) return;
  store(key, LOADING);
  findLyrics({ title: media.title, artist: media.artist, album: media.album, durationMs: media.durationMs }, source)
    .then((lyrics) => store(key, lyrics ? { status: "found", lyrics } : { status: "notFound" }))
    .catch((err) => {
      console.error("[lyrics]", err);
      store(key, { status: "error", message: String(err), at: Date.now() });
    });
}

function subscribeLyrics(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Lyrics for `media` from the source chosen in settings. Nothing is fetched
 * (and nothing leaves the machine) unless `enabled` is true and a titled
 * track is active.
 */
export function useLyrics(media: MediaState, enabled: boolean): LyricsResult {
  const { lyricsSource } = useSettings();
  const track = media.active && media.title ? trackKey(media) : "";
  const key = track ? `${lyricsSource}\u001e${track}` : "";
  const wanted = enabled && key !== "";

  useEffect(() => {
    if (wanted) load(key, media, lyricsSource);
    // `media` changes every tick; the key captures what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, key]);

  return useSyncExternalStore(subscribeLyrics, () => (wanted ? cache.get(key) ?? LOADING : IDLE));
}

// ---- Timing offset ----

/** Most recent tracks kept; older offsets are dropped. */
const MAX_OFFSETS = 300;
export const OFFSET_STEP_MS = 500;
export const OFFSET_LIMIT_MS = 10_000;

/**
 * Per-track lyrics offset in ms. Positive = lyrics later (they were running
 * ahead of the singer), negative = earlier.
 */
const offsets = persistedValue<Record<string, number>>("lyricsOffsets", {}, (raw) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).filter(
      (e): e is [string, number] => typeof e[1] === "number" && Number.isFinite(e[1]),
    ),
  );
});

export function useLyricsOffset(media: MediaState): number {
  const all = offsets.use();
  return media.active ? (all[trackKey(media)] ?? 0) : 0;
}

/** Nudges the current track's offset by `deltaMs`; `null` resets it. */
export function adjustLyricsOffset(media: MediaState, deltaMs: number | null): void {
  const current = offsets.get()[trackKey(media)] ?? 0;
  setLyricsOffset(media, deltaMs === null ? 0 : current + deltaMs);
}

/** Sets the current track's offset (ms, clamped); 0 removes it. */
export function setLyricsOffset(media: MediaState, offsetMs: number): void {
  const key = trackKey(media);
  const next = Math.round(Math.max(-OFFSET_LIMIT_MS, Math.min(OFFSET_LIMIT_MS, offsetMs)));
  offsets.set((all) => {
    if ((all[key] ?? 0) === next) return all;
    const rest = { ...all };
    delete rest[key];
    if (next === 0) return rest;
    // Re-insert last so the oldest entries are the first to go.
    const entries = Object.entries(rest);
    const kept = entries.slice(Math.max(0, entries.length - (MAX_OFFSETS - 1)));
    return { ...Object.fromEntries(kept), [key]: next };
  });
}

/** Index of the line being sung (offset applied); re-renders only when it changes. */
export function useLyricLineIndex(media: MediaState, lines: Lyrics["lines"]): number {
  const offset = useLyricsOffset(media);
  return useFromPosition(media, (position) => currentLineIndex(lines, position - offset));
}

/** Playback position as the lyrics should see it (offset applied). */
export function useLyricPosition(media: MediaState, intervalMs = 200): number {
  const position = useMediaPosition(media, intervalMs);
  return position - useLyricsOffset(media);
}

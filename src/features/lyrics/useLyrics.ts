/**
 * Lyrics for the playing track, shared by every component.
 * Each track is looked up once per session (results, misses and errors cached).
 */
import { useEffect, useSyncExternalStore } from "react";
import type { MediaState } from "../media/mediaBridge";
import { findLyrics, type Lyrics } from "./lrclib";

export type LyricsResult =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "found"; lyrics: Lyrics }
  | { status: "notFound" }
  | { status: "error"; message: string; at: number };

const IDLE: LyricsResult = { status: "idle" };
const LOADING: LyricsResult = { status: "loading" };
/** Bounded cache: track key -> result. */
const MAX_CACHED = 50;
/** A failed lookup (offline, timeout) is retried after this long. */
const ERROR_RETRY_MS = 30_000;

const cache = new Map<string, LyricsResult>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function trackKey(media: MediaState): string {
  // Duration is rounded: some players report it a few ms differently per read.
  return [media.title, media.artist, media.album, Math.round(media.durationMs / 1000)].join("\u001f").toLowerCase();
}

function store(key: string, result: LyricsResult) {
  cache.delete(key);
  cache.set(key, result);
  while (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value as string);
  emit();
}

function load(key: string, media: MediaState) {
  const cached = cache.get(key);
  if (cached && !(cached.status === "error" && Date.now() - cached.at > ERROR_RETRY_MS)) return;
  store(key, LOADING);
  findLyrics({ title: media.title, artist: media.artist, album: media.album, durationMs: media.durationMs })
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
 * Lyrics for `media`. Nothing is fetched (and nothing leaves the machine)
 * unless `enabled` is true and a titled track is active.
 */
export function useLyrics(media: MediaState, enabled: boolean): LyricsResult {
  const key = media.active && media.title ? trackKey(media) : "";
  const wanted = enabled && key !== "";

  useEffect(() => {
    if (wanted) load(key, media);
    // `media` changes every tick; the key captures what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, key]);

  return useSyncExternalStore(subscribeLyrics, () => (wanted ? cache.get(key) ?? LOADING : IDLE));
}

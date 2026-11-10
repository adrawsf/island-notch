/**
 * Frontend side of `src-tauri/src/media.rs` (Windows SMTC).
 * Outside Tauri there is never an active session.
 */
import { invoke, isTauri } from "@tauri-apps/api/core";
import { subscribe } from "../../core/tauriEvents";

export interface MediaState {
  active: boolean;
  appId: string;
  title: string;
  artist: string;
  album: string;
  isPlaying: boolean;
  /** Position at `sampledAtMs`; use `useMediaPosition` for the live value. */
  positionMs: number;
  durationMs: number;
  sampledAtMs: number;
  canPlayPause: boolean;
  canNext: boolean;
  canPrevious: boolean;
  canSeek: boolean;
  /** Cover art data URI. */
  artwork: string | null;
  /**
   * Read from a browser tab's name (Windows reports no session for it):
   * no position, controls or artwork, so lyrics cannot be synced.
   */
  tabOnly: boolean;
}

export type MediaAction = "playPause" | "next" | "previous";

export const EMPTY_MEDIA: MediaState = {
  active: false,
  appId: "",
  title: "",
  artist: "",
  album: "",
  isPlaying: false,
  positionMs: 0,
  durationMs: 0,
  sampledAtMs: 0,
  canPlayPause: false,
  canNext: false,
  canPrevious: false,
  canSeek: false,
  artwork: null,
  tabOnly: false,
};

const EVENT_MEDIA_STATE = "media://state";

export async function getMediaState(): Promise<MediaState> {
  if (!isTauri()) return EMPTY_MEDIA;
  try {
    return await invoke<MediaState>("media_get_state");
  } catch (err) {
    console.error("[media] media_get_state", err);
    return EMPTY_MEDIA;
  }
}

export function mediaControl(action: MediaAction): void {
  if (!isTauri()) return;
  invoke("media_control", { action }).catch((err) => console.error(`[media] ${action}`, err));
}

/** Brings the app playing the media to the front (a browser comes forward as its latest window). */
export async function openMediaSource(): Promise<boolean> {
  if (!isTauri()) return false;
  return invoke<boolean>("media_open_source").catch(() => false);
}

export function mediaSeek(positionMs: number): void {
  if (!isTauri()) return;
  invoke("media_seek", { positionMs: Math.max(0, Math.round(positionMs)) }).catch((err) =>
    console.error("[media] seek", err),
  );
}

export const onMediaState = (handler: (state: MediaState) => void) =>
  subscribe<MediaState>(EVENT_MEDIA_STATE, handler);

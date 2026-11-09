/**
 * Frontend side of the Rust hit-test module (`src-tauri/src/hit_test.rs`).
 * Outside Tauri (plain browser) every call is a no-op.
 */
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface HitRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  expanded: boolean;
}

const EVENT_HOVER = "notch://hover";
const EVENT_CLICK_OUTSIDE = "notch://click-outside";

export function reportHitRegion(region: HitRegion): void {
  if (!isTauri()) return;
  invoke("set_hit_region", { region }).catch((err) => console.error("[notch] set_hit_region", err));
}

/** Subscribes to a Tauri event and returns a synchronous unsubscribe. */
function subscribe<T>(event: string, handler: (payload: T) => void): () => void {
  if (!isTauri()) return () => {};
  let disposed = false;
  let unlisten: (() => void) | null = null;
  listen<T>(event, (e) => handler(e.payload)).then((fn) => {
    if (disposed) fn();
    else unlisten = fn;
  });
  return () => {
    disposed = true;
    unlisten?.();
  };
}

export const onNotchHover = (handler: (inside: boolean) => void) => subscribe<boolean>(EVENT_HOVER, handler);
export const onClickOutside = (handler: () => void) => subscribe<null>(EVENT_CLICK_OUTSIDE, () => handler());

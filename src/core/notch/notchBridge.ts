/**
 * Frontend side of the Rust hit-test module (`src-tauri/src/hit_test.rs`).
 * Outside Tauri (plain browser) every call is a no-op.
 */
import { invoke, isTauri } from "@tauri-apps/api/core";
import { subscribe } from "../tauriEvents";

export interface HitRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  expanded: boolean;
}

const EVENT_HOVER = "notch://hover";
const EVENT_CLICK_OUTSIDE = "notch://click-outside";
const EVENT_TOGGLE = "notch://toggle";
const EVENT_COMPACT = "notch://compact";

export function reportHitRegion(region: HitRegion): void {
  if (!isTauri()) return;
  invoke("set_hit_region", { region }).catch((err) => console.error("[notch] set_hit_region", err));
}

export const onNotchHover = (handler: (inside: boolean) => void) => subscribe<boolean>(EVENT_HOVER, handler);
export const onClickOutside = (handler: () => void) => subscribe<null>(EVENT_CLICK_OUTSIDE, () => handler());
/** A browser touching the top edge is in front (see src-tauri/src/foreground.rs). */
export const onCompactChange = (handler: (compact: boolean) => void) => subscribe<boolean>(EVENT_COMPACT, handler);

export async function getCompactState(): Promise<boolean> {
  if (!isTauri()) return false;
  return invoke<boolean>("notch_compact_state").catch(() => false);
}

/** Global shortcut or a left click on the tray icon. */
export const onToggleRequest = (handler: () => void) => subscribe<null>(EVENT_TOGGLE, () => handler());

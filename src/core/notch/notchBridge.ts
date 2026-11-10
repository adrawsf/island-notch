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

export function reportHitRegion(region: HitRegion): void {
  if (!isTauri()) return;
  invoke("set_hit_region", { region }).catch((err) => console.error("[notch] set_hit_region", err));
}

export const onNotchHover = (handler: (inside: boolean) => void) => subscribe<boolean>(EVENT_HOVER, handler);
export const onClickOutside = (handler: () => void) => subscribe<null>(EVENT_CLICK_OUTSIDE, () => handler());
/** Global shortcut or a left click on the tray icon. */
export const onToggleRequest = (handler: () => void) => subscribe<null>(EVENT_TOGGLE, () => handler());

/**
 * Frontend side of `src-tauri/src/shell.rs` and `tray.rs`.
 * Outside Tauri every call is a no-op.
 */
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { AppSettings } from "../settings/settings";
import { subscribe } from "../tauriEvents";

/** Settings Rust needs: placement, shortcut, and tray check marks. */
export type ShellConfig = Pick<
  AppSettings,
  | "monitor"
  | "notchShape"
  | "notchSize"
  | "theme"
  | "idleWidgets"
  | "idleShowsMedia"
  | "pillShowsLyrics"
  | "lyricsSource"
  | "shortcutEnabled"
  | "toggleShortcut"
> & {
  /** Every available idle widget, so the tray can list them (the registry lives in the frontend). */
  idleWidgetOptions: { id: string; label: string }[];
  /** Every lyrics source, so the tray can list them. */
  lyricsSourceOptions: { id: string; label: string }[];
};

export interface ApplyResult {
  shortcutError: string | null;
}

const EVENT_TRAY_SELECT = "tray://select";

export async function applyShellConfig(config: ShellConfig): Promise<ApplyResult | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<ApplyResult>("apply_shell_config", { config });
  } catch (err) {
    console.error("[shell] apply_shell_config", err);
    return null;
  }
}

/** A tray menu item the frontend owns, as `<group>:<value>` (e.g. `theme:light`). */
export const onTraySelect = (handler: (id: string) => void) => subscribe<string>(EVENT_TRAY_SELECT, handler);

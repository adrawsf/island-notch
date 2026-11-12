/**
 * Frontend side of `src-tauri/src/shell.rs` and `settings_window.rs`.
 * Outside Tauri every call is a no-op.
 */
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { AppSettings } from "../settings/settings";
import { subscribe } from "../tauriEvents";

/** Settings Rust needs: placement, the global shortcut, and the video filter. */
export type ShellConfig = Pick<AppSettings, "monitor" | "ignoreVideo" | "shortcutEnabled" | "toggleShortcut">;

export interface ApplyResult {
  shortcutError: string | null;
}

export interface MonitorEntry {
  /** OS name, stored in the `monitor` setting. */
  name: string;
  width: number;
  height: number;
  primary: boolean;
}

const EVENT_APPLIED = "shell://applied";

export async function applyShellConfig(config: ShellConfig): Promise<ApplyResult | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<ApplyResult>("apply_shell_config", { config });
  } catch (err) {
    console.error("[shell] apply_shell_config", err);
    return null;
  }
}

/** Result of the last apply (e.g. a shortcut that could not be registered). */
export async function getShellStatus(): Promise<ApplyResult | null> {
  if (!isTauri()) return null;
  return invoke<ApplyResult>("shell_status").catch(() => null);
}

/** Every apply, in any window. */
export const onShellApplied = (handler: (result: ApplyResult) => void) =>
  subscribe<ApplyResult>(EVENT_APPLIED, handler);

function call(command: string): void {
  if (isTauri()) invoke(command).catch((err) => console.error(`[shell] ${command}`, err));
}

/** Opens the settings window, optionally on one section (e.g. "home"). */
export function openSettingsWindow(section?: string): void {
  if (isTauri()) invoke("settings_open", { section: section ?? null }).catch((err) => console.error("[shell] settings_open", err));
}

/** Another window asked the open settings window to show a section. */
export const onSettingsNavigate = (handler: (section: string) => void) => subscribe<string>("settings://navigate", handler);
export const closeSettingsWindow = () => call("settings_close");
export const minimizeSettingsWindow = () => call("settings_minimize");

export async function listMonitors(): Promise<MonitorEntry[]> {
  if (!isTauri()) return [];
  return invoke<MonitorEntry[]>("monitors_list").catch(() => []);
}

export async function getAutostart(): Promise<boolean> {
  if (!isTauri()) return false;
  return invoke<boolean>("autostart_enabled").catch(() => false);
}

/** Returns the state Windows actually ended up with. */
export async function setAutostart(enabled: boolean): Promise<boolean> {
  if (!isTauri()) return enabled;
  return invoke<boolean>("autostart_set", { enabled });
}

/**
 * App settings: one typed schema, one source of defaults.
 *
 * Every key has a default and a validator. A value read from disk is used only
 * if it passes the validator, so a missing key (`undefined`), `null`, or a
 * value of the wrong type always falls back to the default instead of silently
 * turning a feature off.
 */
import { load, type Store } from "@tauri-apps/plugin-store";
import { isTauri } from "@tauri-apps/api/core";

// String unions below are mirrored in `src-tauri/src/tray.rs` (menu options).
export type NotchShape = "notch" | "island";
export type NotchSize = "compact" | "default" | "large";
export type ThemeMode = "dark" | "light" | "auto";

export interface AppSettings {
  /** Hovering the collapsed notch expands it. */
  expandOnHover: boolean;
  /** How long the expanded notch stays open after the cursor leaves. */
  closeDelayMs: number;
  /** Tab shown when the notch opens; null = first tab in the registry. */
  lastTabId: string | null;
  /** OS monitor name the notch lives on; null = primary monitor. */
  monitor: string | null;
  /** "notch" hugs the top edge, "island" floats a little below it. */
  notchShape: NotchShape;
  /** Overall scale of the notch. */
  notchSize: NotchSize;
  theme: ThemeMode;
  /** Idle widget ids shown in the collapsed pill, in order (see src/app/idle). */
  idleWidgets: string[];
  /** While media plays, the pill shows the track instead of the idle widget. */
  idleShowsMedia: boolean;
  /** Films and other video (browser tabs without an artist) are not treated as music. */
  ignoreVideo: boolean;
  /** The media pill shows the current synced lyric line (from the chosen lyrics source). */
  pillShowsLyrics: boolean;
  /** The mini player shows the current and next lyric line. */
  miniPlayerLyrics: boolean;
  /** Compact mini player: cover + lyrics only. */
  miniPlayerCompact: boolean;
  /** Where lyrics come from: "auto" or one provider id (see src/features/lyrics/sources.ts). */
  lyricsSource: "auto" | "lrclib" | "netease" | "kugou" | "qqmusic" | "genius";
  /** The Media tab shows lyrics instead of track details. */
  mediaLyricsOpen: boolean;
  /** Shrink the notch to a thin handle while a browser's tab strip is under it. */
  shrinkForBrowsers: boolean;
  /** Global shortcut that opens/closes the notch. */
  shortcutEnabled: boolean;
  /** Shortcut in the global-shortcut plugin format, e.g. "Control+Alt+N". */
  toggleShortcut: string;
  /** Pomodoro moves to the next phase by itself; off = wait and count the extra time. */
  pomodoroAutoAdvance: boolean;
  /** Pomodoro phase lengths in minutes. */
  pomodoroFocusMin: number;
  pomodoroShortBreakMin: number;
  pomodoroLongBreakMin: number;
  /** Ambient sound during focus sessions ("none" = silent). */
  ambienceSound: "none" | "rain" | "ocean" | "fire" | "wind" | "brown" | "pink" | "white";
  /** Ambience volume, 0-1. */
  ambienceVolume: number;
  /** Teleprompter reading text size (px), scroll speed (px/s) and countdown (s). */
  teleprompterFontSize: number;
  teleprompterSpeed: number;
  teleprompterCountdown: number;
  /** Keep the teleprompter out of screenshots, recordings and screen sharing. */
  teleprompterHideFromCapture: boolean;
  /** The first-run hint toast has been shown. */
  welcomeShown: boolean;
}

type Validator<T> = (value: unknown) => value is T;

const isBoolean: Validator<boolean> = (v): v is boolean => typeof v === "boolean";
const isNonNegativeNumber: Validator<number> = (v): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;
const isStringOrNull: Validator<string | null> = (v): v is string | null =>
  v === null || typeof v === "string";
const isNonEmptyString: Validator<string> = (v): v is string => typeof v === "string" && v.trim() !== "";
const isMinutes: Validator<number> = (v): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 180;
/** Up to 8 distinct short ids. Unknown ids are tolerated and skipped when rendering. */
const isIdList: Validator<string[]> = (v): v is string[] =>
  Array.isArray(v) &&
  v.length <= 8 &&
  v.every((x) => typeof x === "string" && x.length > 0 && x.length <= 40) &&
  new Set(v).size === v.length;
const inRange =
  (min: number, max: number): Validator<number> =>
  (v): v is number =>
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const oneOf =
  <T extends string>(...values: T[]): Validator<T> =>
  (v): v is T =>
    values.includes(v as T);

const SCHEMA: { [K in keyof AppSettings]: { default: AppSettings[K]; valid: Validator<AppSettings[K]> } } = {
  expandOnHover: { default: true, valid: isBoolean },
  closeDelayMs: { default: 600, valid: isNonNegativeNumber },
  lastTabId: { default: null, valid: isStringOrNull },
  monitor: { default: null, valid: isStringOrNull },
  notchShape: { default: "notch", valid: oneOf("notch", "island") },
  notchSize: { default: "default", valid: oneOf("compact", "default", "large") },
  theme: { default: "dark", valid: oneOf("dark", "light", "auto") },
  idleWidgets: { default: ["clock"], valid: isIdList },
  idleShowsMedia: { default: true, valid: isBoolean },
  ignoreVideo: { default: true, valid: isBoolean },
  pillShowsLyrics: { default: true, valid: isBoolean },
  mediaLyricsOpen: { default: false, valid: isBoolean },
  lyricsSource: { default: "auto", valid: oneOf("auto", "lrclib", "netease", "kugou", "qqmusic", "genius") },
  miniPlayerLyrics: { default: true, valid: isBoolean },
  miniPlayerCompact: { default: false, valid: isBoolean },
  shrinkForBrowsers: { default: true, valid: isBoolean },
  shortcutEnabled: { default: true, valid: isBoolean },
  toggleShortcut: { default: "Control+Alt+N", valid: isNonEmptyString },
  pomodoroAutoAdvance: { default: true, valid: isBoolean },
  pomodoroFocusMin: { default: 25, valid: isMinutes },
  pomodoroShortBreakMin: { default: 5, valid: isMinutes },
  pomodoroLongBreakMin: { default: 15, valid: isMinutes },
  ambienceSound: { default: "none", valid: oneOf("none", "rain", "ocean", "fire", "wind", "brown", "pink", "white") },
  ambienceVolume: { default: 0.5, valid: inRange(0, 1) },
  teleprompterFontSize: { default: 28, valid: inRange(14, 72) },
  teleprompterSpeed: { default: 40, valid: inRange(10, 200) },
  teleprompterCountdown: { default: 3, valid: inRange(0, 10) },
  teleprompterHideFromCapture: { default: true, valid: isBoolean },
  welcomeShown: { default: false, valid: isBoolean },
};

const STORE_FILE = "settings.json";

function defaults(): AppSettings {
  const out = {} as Record<string, unknown>;
  for (const key of Object.keys(SCHEMA) as (keyof AppSettings)[]) out[key] = SCHEMA[key].default;
  return out as unknown as AppSettings;
}

let current: AppSettings = defaults();
let store: Store | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

/** Reads every key from disk, keeping the default for anything missing or invalid. */
export async function loadSettings(): Promise<void> {
  if (!isTauri()) return; // Plain browser (vite dev): run on defaults.
  try {
    store = await load(STORE_FILE, { autoSave: 200, defaults: {} });
    const next = defaults() as unknown as Record<string, unknown>;
    for (const key of Object.keys(SCHEMA) as (keyof AppSettings)[]) {
      const value = await store.get(key);
      if (SCHEMA[key].valid(value)) next[key] = value;
    }
    current = next as unknown as AppSettings;
    emit();
    // Another window (notch / mini player) changed a setting: adopt it.
    await store.onChange((key, value) => {
      if (!(key in SCHEMA)) return;
      const k = key as keyof AppSettings;
      if (!SCHEMA[k].valid(value) || current[k] === value) return;
      current = { ...current, [k]: value };
      emit();
    });
  } catch (err) {
    console.error("[settings] load failed, using defaults", err);
  }
}

export function getSettings(): AppSettings {
  return current;
}

/**
 * Saves one setting. Invalid values are ignored, so callers may pass unchecked
 * input (e.g. a tray menu id) cast to the key's type.
 */
export function updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
  if (!SCHEMA[key].valid(value) || current[key] === value) return;
  current = { ...current, [key]: value };
  emit();
  store?.set(key, value).catch((err) => console.error(`[settings] save ${key} failed`, err));
}

export function subscribeSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

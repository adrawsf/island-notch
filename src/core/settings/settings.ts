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

export interface AppSettings {
  /** Hovering the collapsed notch expands it. */
  expandOnHover: boolean;
  /** How long the expanded notch stays open after the cursor leaves. */
  closeDelayMs: number;
  /** Tab shown when the notch opens; null = first tab in the registry. */
  lastTabId: string | null;
}

type Validator<T> = (value: unknown) => value is T;

const isBoolean: Validator<boolean> = (v): v is boolean => typeof v === "boolean";
const isNonNegativeNumber: Validator<number> = (v): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;
const isStringOrNull: Validator<string | null> = (v): v is string | null =>
  v === null || typeof v === "string";

const SCHEMA: { [K in keyof AppSettings]: { default: AppSettings[K]; valid: Validator<AppSettings[K]> } } = {
  expandOnHover: { default: true, valid: isBoolean },
  closeDelayMs: { default: 600, valid: isNonNegativeNumber },
  lastTabId: { default: null, valid: isStringOrNull },
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
  } catch (err) {
    console.error("[settings] load failed, using defaults", err);
  }
}

export function getSettings(): AppSettings {
  return current;
}

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

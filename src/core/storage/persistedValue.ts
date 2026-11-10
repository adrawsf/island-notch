/**
 * A single persisted value (feature data such as to-dos or notes), separate
 * from settings. Backed by a plugin-store file, validated on load, and kept in
 * sync across windows. Outside Tauri it lives in memory only.
 */
import { useSyncExternalStore } from "react";
import { load, type Store } from "@tauri-apps/plugin-store";
import { isTauri } from "@tauri-apps/api/core";

const DATA_FILE = "data.json";
let storePromise: Promise<Store> | null = null;

function dataStore(): Promise<Store> {
  storePromise ??= load(DATA_FILE, { autoSave: 300, defaults: {} });
  return storePromise;
}

/** JSON with object keys sorted, so values round-tripped through Rust compare equal. */
function stableJson(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}

export interface PersistedValue<T> {
  get(): T;
  set(next: T | ((prev: T) => T)): void;
  subscribe(listener: () => void): () => void;
  /** React hook: the current value, re-rendering on change. */
  use(): T;
}

/**
 * `validate` receives raw disk data and must return a valid T or null (null
 * keeps the fallback, so corrupt or missing data never breaks the feature).
 */
export function persistedValue<T>(key: string, fallback: T, validate: (raw: unknown) => T | null): PersistedValue<T> {
  let current = fallback;
  const listeners = new Set<() => void>();
  // Our own writes come back as change events, possibly after newer local
  // edits; ignoring them prevents fast typing from being reverted.
  const ownWrites = new Set<string>();
  const emit = () => listeners.forEach((l) => l());

  if (isTauri()) {
    dataStore()
      .then(async (store) => {
        const raw = await store.get(key);
        const valid = raw === undefined ? null : validate(raw);
        if (valid !== null) {
          current = valid;
          emit();
        }
        await store.onKeyChange(key, (value) => {
          const json = stableJson(value);
          if (ownWrites.delete(json)) return;
          const next = value === undefined ? null : validate(value);
          if (next !== null && next !== current) {
            current = next;
            emit();
          }
        });
      })
      .catch((err) => console.error(`[storage] load ${key} failed`, err));
  }

  const value: PersistedValue<T> = {
    get: () => current,
    set(next) {
      current = typeof next === "function" ? (next as (prev: T) => T)(current) : next;
      emit();
      if (isTauri()) {
        dataStore()
          .then((store) => {
            ownWrites.add(stableJson(current));
            return store.set(key, current);
          })
          .catch((err) => console.error(`[storage] save ${key} failed`, err));
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    use: () => useSyncExternalStore(value.subscribe, value.get),
  };
  return value;
}

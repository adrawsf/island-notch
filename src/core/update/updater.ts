/**
 * In-app updates from GitHub Releases (Tauri updater plugin). The notch checks
 * a little after start and then every few hours; a newer version shows a toast,
 * and clicking it downloads and installs (the installer restarts the app).
 */
import { useEffect, useSyncExternalStore } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { showToast } from "../toast/toastQueue";

const FIRST_CHECK_MS = 30_000;
const CHECK_EVERY_MS = 6 * 60 * 60_000;

export type UpdateState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "none" }
  | { status: "available"; version: string; notes: string }
  | { status: "installing"; percent: number | null }
  | { status: "error"; message: string };

let state: UpdateState = { status: "idle" };
let pending: Update | null = null;
const listeners = new Set<() => void>();

function set(next: UpdateState) {
  state = next;
  listeners.forEach((l) => l());
}

export function useUpdateState(): UpdateState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

/** Looks for a newer release. Resolves to the new version, or null. */
export async function checkForUpdate(): Promise<string | null> {
  if (!isTauri()) return null;
  set({ status: "checking" });
  try {
    const update = await check();
    pending = update;
    if (!update) {
      set({ status: "none" });
      return null;
    }
    set({ status: "available", version: update.version, notes: update.body ?? "" });
    return update.version;
  } catch (err) {
    set({ status: "error", message: String(err) });
    return null;
  }
}

/** Downloads and runs the installer of the update found by `checkForUpdate`. */
export async function installUpdate(): Promise<void> {
  if (!pending) return;
  let total = 0;
  let received = 0;
  set({ status: "installing", percent: null });
  try {
    await pending.downloadAndInstall((event) => {
      if (event.event === "Started") total = event.data.contentLength ?? 0;
      if (event.event === "Progress") {
        received += event.data.chunkLength;
        set({ status: "installing", percent: total > 0 ? Math.round((received / total) * 100) : null });
      }
    });
  } catch (err) {
    set({ status: "error", message: String(err) });
  }
}

/** Notch window: periodic checks, announced with a toast. */
export function useUpdateChecks() {
  useEffect(() => {
    if (!isTauri() || import.meta.env.DEV) return;
    let announced = "";
    const run = async () => {
      const version = await checkForUpdate();
      if (version && version !== announced) {
        announced = version;
        showToast({
          title: `Island Notch ${version} tersedia`,
          body: "Klik untuk memperbarui sekarang.",
          durationMs: 10_000,
          onClick: () => void installUpdate(),
        });
      }
    };
    const first = setTimeout(run, FIRST_CHECK_MS);
    const every = setInterval(run, CHECK_EVERY_MS);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }, []);
}

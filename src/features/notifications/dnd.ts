/**
 * Do not disturb for the notch: its own switch (for a while or until turned
 * off) and, optionally, Windows' Do not disturb / Focus. While on, toasts are
 * recorded in the notification center but never pop up.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { updateSetting } from "../../core/settings/settings";
import { useSettings } from "../../core/settings/useSettings";
import { setToastsQuiet } from "../../core/toast/toastQueue";

const WINDOWS_POLL_MS = 3000;
/** `notchDndUntil` value for "until turned off". */
export const DND_FOREVER = -1;

// ---------- Windows' Do not disturb, as last read ----------

let windowsDnd = false;
const listeners = new Set<() => void>();

function setWindowsDnd(next: boolean) {
  if (next === windowsDnd) return;
  windowsDnd = next;
  listeners.forEach((l) => l());
}

export function useWindowsDnd(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => windowsDnd,
  );
}

// ---------- The notch's own switch ----------

export function notchDndOn(until: number, now = Date.now()): boolean {
  return until === DND_FOREVER || until > now;
}

/** Turns the notch's Do not disturb on for `minutes`, until turned off (`"forever"`), or off (0). */
export function setNotchDnd(minutes: number | "forever"): void {
  updateSetting("notchDndUntil", minutes === "forever" ? DND_FOREVER : minutes > 0 ? Date.now() + minutes * 60_000 : 0);
}

/** Until tomorrow 07:00, in minutes from now. */
export function minutesUntilMorning(now = new Date()): number {
  const morning = new Date(now);
  morning.setHours(7, 0, 0, 0);
  if (morning <= now) morning.setDate(morning.getDate() + 1);
  return Math.ceil((morning.getTime() - now.getTime()) / 60_000);
}

/** Whether the notch is quiet now, and why. Re-renders when a timed DND ends. */
export function useDnd(): { quiet: boolean; notch: boolean; windows: boolean; until: number } {
  const { notchDndUntil, followWindowsDnd } = useSettings();
  const win = useWindowsDnd();
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    if (notchDndUntil <= 0) return;
    const t = setTimeout(() => setNow(Date.now()), Math.max(0, notchDndUntil - Date.now()) + 50);
    return () => clearTimeout(t);
  }, [notchDndUntil]);

  const notch = notchDndOn(notchDndUntil, now);
  const windows = followWindowsDnd && win;
  return { quiet: notch || windows, notch, windows: win, until: notchDndUntil };
}

/** Notch window: reads Windows' DND and silences the toast queue. */
export function useDndController() {
  const { quiet, notch, until } = useDnd();

  useEffect(() => {
    if (!isTauri()) return;
    const check = () =>
      invoke<boolean>("notif_dnd_active")
        .then(setWindowsDnd)
        .catch(() => {});
    check();
    const t = setInterval(check, WINDOWS_POLL_MS);
    return () => clearInterval(t);
  }, []);

  useEffect(() => setToastsQuiet(quiet), [quiet]);

  // A timed DND that ran out is cleared, so the switch reads "off" again.
  useEffect(() => {
    if (until > 0 && !notch) updateSetting("notchDndUntil", 0);
  }, [until, notch]);
}

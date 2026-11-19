/**
 * Frontend side of `src-tauri/src/notifications.rs` (Windows notifications),
 * plus the history of the notch's own toasts.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { subscribe } from "../../core/tauriEvents";
import { persistedValue } from "../../core/storage/persistedValue";

export interface WinNotif {
  id: number;
  appId: string;
  appName: string;
  title: string;
  body: string;
  time: number;
}

export type AccessStatus = "allowed" | "denied" | "unavailable" | "off";

export interface NotifList {
  status: AccessStatus;
  items: WinNotif[];
}

const DEMO_MODE = !isTauri() && import.meta.env.DEV;
const MIN = 60_000;

let demo: NotifList = {
  status: "allowed",
  items: DEMO_MODE
    ? [
        { id: 1, appId: "wa", appName: "WhatsApp", title: "Rina", body: "Jadi berangkat jam berapa? Aku udah di stasiun.", time: Date.now() - 2 * MIN },
        { id: 2, appId: "wa", appName: "WhatsApp", title: "Grup Kantor", body: "Budi: file presentasinya udah aku upload ya", time: Date.now() - 14 * MIN },
        { id: 3, appId: "discord", appName: "Discord", title: "#general", body: "dimas: ada yang mau main malam ini?", time: Date.now() - 40 * MIN },
        { id: 4, appId: "outlook", appName: "Outlook", title: "Undangan rapat: Review Q4", body: "Kamis, 10.00–11.00 · Ruang Kenari", time: Date.now() - 3 * 60 * MIN },
      ]
    : [],
};
const demoListeners = new Set<() => void>();

/** The Windows notifications, refreshed when the backend says they changed. */
export function useWindowsNotifications(): NotifList | null {
  const [list, setList] = useState<NotifList | null>(null);
  useEffect(() => {
    if (!isTauri()) return;
    let current = true;
    const load = () => invoke<NotifList>("notif_list").then((l) => current && setList(l)).catch(() => {});
    load();
    const off = subscribe(EVENT_CHANGED, load);
    return () => {
      current = false;
      off();
    };
  }, []);
  const demoList = useSyncExternalStore(
    (l) => {
      demoListeners.add(l);
      return () => demoListeners.delete(l);
    },
    () => demo,
  );
  return DEMO_MODE ? demoList : list;
}

const EVENT_NEW = "notif://new";
const EVENT_CHANGED = "notif://changed";

export function onNewNotifications(handler: (items: WinNotif[]) => void): () => void {
  return subscribe<WinNotif[]>(EVENT_NEW, handler);
}

/** Turns reading Windows notifications on or off (notch window). */
export function configureNotifications(enabled: boolean): void {
  if (isTauri()) invoke("notif_configure", { enabled }).catch((err) => console.error("[notif] configure", err));
}

export function removeNotifications(ids: number[]): void {
  if (DEMO_MODE) {
    demo = { ...demo, items: demo.items.filter((n) => !ids.includes(n.id)) };
    demoListeners.forEach((l) => l());
  } else if (isTauri()) {
    invoke("notif_remove", { ids }).catch((err) => console.error("[notif] remove", err));
  }
}

/** Opens the sending app. Resolves to an error message, or null. */
export async function openNotificationApp(appId: string): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    await invoke("notif_open_app", { appId });
    return null;
  } catch (err) {
    return String(err);
  }
}

export function openNotificationSettings(): void {
  if (isTauri()) invoke("notif_open_settings").catch(() => {});
}

const icons = new Map<string, Promise<string | null>>();

export function notificationIcon(appId: string): Promise<string | null> {
  if (!isTauri() || !appId) return Promise.resolve(null);
  let icon = icons.get(appId);
  if (!icon) {
    icon = invoke<string | null>("notif_icon", { appId }).catch(() => null);
    // Not known yet (first notification still being read): try again next time.
    icon.then((s) => s === null && icons.delete(appId));
    icons.set(appId, icon);
  }
  return icon;
}

export function useNotificationIcon(appId: string): string | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    notificationIcon(appId).then((s) => current && setSrc(s));
    return () => {
      current = false;
    };
  }, [appId]);
  return src;
}

// ---------- The notch's own toasts ----------

export interface NotchEntry {
  id: string;
  title: string;
  body: string;
  time: number;
}

const HISTORY_MAX = 50;

function validHistory(raw: unknown): NotchEntry[] | null {
  if (!Array.isArray(raw)) return null;
  return raw
    .filter(
      (e): e is NotchEntry =>
        typeof e === "object" && e !== null && typeof e.id === "string" && typeof e.title === "string" && typeof e.time === "number",
    )
    .map((e) => ({ ...e, body: typeof e.body === "string" ? e.body : "" }))
    .slice(0, HISTORY_MAX);
}

export const notchHistory = persistedValue<NotchEntry[]>(
  "notchToastHistory",
  DEMO_MODE
    ? [
        { id: "d1", title: "Fokus selesai", body: "Waktunya istirahat 5 menit.", time: Date.now() - 25 * MIN },
        { id: "d2", title: "Teks disalin", body: "Invoice #2026-114 jatuh tempo 30 November", time: Date.now() - 90 * MIN },
      ]
    : [],
  validHistory,
);

export function recordNotchToast(title: string, body: string | undefined): void {
  const time = Date.now();
  notchHistory.set((prev) => [{ id: `${time}-${Math.random().toString(36).slice(2, 7)}`, title, body: body ?? "", time }, ...prev].slice(0, HISTORY_MAX));
}

// ---------- Formatting ----------

/** "baru saja", "5 mnt", "2 j", "kemarin", "12 Nov". */
export function relativeTime(ms: number, now = Date.now()): string {
  const diff = Math.max(0, now - ms);
  if (diff < MIN) return "baru saja";
  if (diff < 60 * MIN) return `${Math.floor(diff / MIN)} mnt`;
  if (diff < 24 * 60 * MIN) return `${Math.floor(diff / (60 * MIN))} j`;
  if (diff < 48 * 60 * MIN) return "kemarin";
  return new Date(ms).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

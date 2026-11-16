/**
 * Frontend side of `src-tauri/src/shelf.rs`. In a plain browser the shelf
 * shows sample items and actions only change that local list.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { subscribe } from "../../core/tauriEvents";

export interface ShelfItem {
  id: string;
  kind: "file" | "text" | "link";
  /** File path, the text, or the URL. */
  value: string;
  added: number;
  /** File name (files only). */
  name: string;
  exists: boolean;
  isDir: boolean;
  size: number;
}

const DEMO_MODE = !isTauri() && import.meta.env.DEV;

function demoFile(id: string, value: string, extra: Partial<ShelfItem> = {}): ShelfItem {
  return {
    id,
    kind: "file",
    value,
    added: 0,
    name: value.split("\\").pop() ?? value,
    exists: true,
    isDir: false,
    size: 2_400_000,
    ...extra,
  };
}

let demoItems: ShelfItem[] = DEMO_MODE
  ? [
      demoFile("1", "C:\\Users\\me\\Pictures\\Screenshot 2026-11-16 101530.png"),
      demoFile("2", "C:\\Users\\me\\Documents\\Laporan kuartal 3 final revisi.pdf"),
      demoFile("3", "C:\\Users\\me\\Downloads\\assets", { isDir: true, size: 0 }),
      { id: "4", kind: "link", value: "https://github.com/tauri-apps/tauri", added: 0, name: "", exists: true, isDir: false, size: 0 },
      { id: "5", kind: "text", value: "Meeting jam 3 sore di ruang Kenari, bawa laptop dan charger.", added: 0, name: "", exists: true, isDir: false, size: 0 },
      demoFile("6", "C:\\Users\\me\\Desktop\\old-notes.txt", { exists: false }),
    ]
  : [];

function call<T = void>(command: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!isTauri()) return Promise.resolve(null);
  return invoke<T>(command, args).catch((err) => {
    console.error(`[shelf] ${command}`, err);
    throw err;
  });
}

/** The shelf, refreshed when the backend says it changed. */
export function useShelf(): ShelfItem[] | null {
  const [items, setItems] = useState<ShelfItem[] | null>(DEMO_MODE ? demoItems : null);
  useEffect(() => {
    if (!isTauri()) return;
    let current = true;
    const load = () =>
      invoke<ShelfItem[]>("shelf_list")
        .then((list) => current && setItems(list))
        .catch((err) => console.error("[shelf] list", err));
    load();
    const off = subscribe(EVENT_CHANGED, load);
    // Files can be moved or deleted while the tab is open.
    const t = setInterval(load, 5000);
    return () => {
      current = false;
      off();
      clearInterval(t);
    };
  }, []);
  const demo = useSyncExternalStore(subscribeDemo, () => demoItems);
  return DEMO_MODE ? demo : items;
}

const demoListeners = new Set<() => void>();
function subscribeDemo(l: () => void) {
  demoListeners.add(l);
  return () => demoListeners.delete(l);
}
function setDemo(next: ShelfItem[]) {
  demoItems = next;
  demoListeners.forEach((l) => l());
}

const EVENT_CHANGED = "shelf://changed";
const EVENT_DRAG = "shelf://drag";

/** A drag the shelf can take entered (`true`) or left (`false`) the notch. */
export function onShelfDrag(handler: (active: boolean) => void): () => void {
  return subscribe<boolean>(EVENT_DRAG, handler);
}

export function removeItems(ids: string[]): void {
  if (DEMO_MODE) setDemo(demoItems.filter((i) => !ids.includes(i.id)));
  else call("shelf_remove", { ids }).catch(() => {});
}

export function clearShelf(): void {
  if (DEMO_MODE) setDemo([]);
  else call("shelf_clear").catch(() => {});
}

export function addText(text: string): void {
  if (DEMO_MODE) {
    const link = /^https?:\/\/\S+$/.test(text.trim());
    setDemo([
      { id: String(Date.now()), kind: link ? "link" : "text", value: text.trim(), added: Date.now(), name: "", exists: true, isDir: false, size: 0 },
      ...demoItems,
    ]);
  } else call("shelf_add_text", { text }).catch(() => {});
}

/** Opens a file or link; text is copied. Resolves to an error message, or null. */
export async function openItem(id: string): Promise<string | null> {
  try {
    await call("shelf_open", { id });
    return null;
  } catch (err) {
    return String(err);
  }
}

export async function revealItem(id: string): Promise<string | null> {
  try {
    await call("shelf_reveal", { id });
    return null;
  } catch (err) {
    return String(err);
  }
}

export async function copyItem(id: string): Promise<string | null> {
  try {
    await call("shelf_copy", { id });
    return null;
  } catch (err) {
    return String(err);
  }
}

/** Hands the drag to Windows. Call while the mouse button is still held. */
export function dragOut(ids: string[]): void {
  call("shelf_drag_out", { ids }).catch(() => {});
}

const thumbs = new Map<string, Promise<string | null>>();

/** Explorer's thumbnail or icon for a file, cached for the session. */
export function useThumb(path: string | null): string | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!path || !isTauri()) return;
    let current = true;
    let load = thumbs.get(path);
    if (!load) {
      load = invoke<string | null>("shelf_thumb", { path }).catch(() => null);
      thumbs.set(path, load);
    }
    load.then((s) => current && setSrc(s));
    return () => {
      current = false;
    };
  }, [path]);
  return src;
}

/** "2.4 MB". */
export function formatSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/**
 * Frontend side of `src-tauri/src/clipboard.rs` and `ocr.rs`.
 * Outside Tauri the history is empty and every action is a no-op.
 */
import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { subscribe } from "../../core/tauriEvents";

export interface ClipboardEntry {
  id: number;
  kind: "text" | "image";
  /** Start of the text (empty for images). */
  preview: string;
  /** Length of the whole text. */
  chars: number;
  width: number;
  height: number;
  pinned: boolean;
  createdAt: number;
  /** App it was copied from ("chrome"), "" if unknown. */
  source: string;
}

export interface OcrOutcome {
  text: string | null;
  error: string | null;
}

export interface OcrLanguage {
  tag: string;
  name: string;
}

function call(command: string, args?: Record<string, unknown>): void {
  if (isTauri()) invoke(command, args).catch((err) => console.error(`[clipboard] ${command}`, err));
}

/** Sample rows for the UI in a plain browser (`npm run dev`). */
const DEMO: ClipboardEntry[] = import.meta.env.DEV
  ? [
      { id: 3, kind: "text", preview: "https://tauri.app/start/", chars: 24, width: 0, height: 0, pinned: true, createdAt: Date.now() - 86_400_000, source: "chrome" },
      { id: 2, kind: "text", preview: "Rapat tim jam 3 sore di ruang Kenari.\nBawa laptop dan catatan sprint.", chars: 68, width: 0, height: 0, pinned: false, createdAt: Date.now() - 60_000, source: "discord" },
      { id: 1, kind: "image", preview: "", chars: 0, width: 1280, height: 720, pinned: false, createdAt: Date.now() - 3_600_000, source: "snippingtool" },
    ]
  : [];

/** The history (newest first), refreshed whenever it changes. */
export function useClipboardHistory(query: string): ClipboardEntry[] {
  const [entries, setEntries] = useState<ClipboardEntry[]>([]);
  useEffect(() => {
    if (!isTauri()) {
      const q = query.trim().toLowerCase();
      setEntries(DEMO.filter((e) => !q || e.preview.toLowerCase().includes(q) || e.source.includes(q)));
      return;
    }
    let current = true;
    const load = () =>
      invoke<ClipboardEntry[]>("clipboard_list", { query: query || null })
        .then((list) => current && setEntries(list))
        .catch((err) => console.error("[clipboard] list", err));
    load();
    const off = subscribe("clipboard://changed", load);
    return () => {
      current = false;
      off();
    };
  }, [query]);
  return entries;
}

const thumbs = new Map<number, Promise<string | null>>();

/** An image item's thumbnail (data URI), cached for the session. */
export function useThumbnail(id: number): string | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!isTauri()) return;
    let current = true;
    let load = thumbs.get(id);
    if (!load) {
      load = invoke<string | null>("clipboard_thumb", { id }).catch(() => null);
      thumbs.set(id, load);
    }
    load.then((s) => current && setSrc(s));
    return () => {
      current = false;
    };
  }, [id]);
  return src;
}

/** Copies an item back; with `paste`, also pastes it into the previous app. */
export async function applyEntry(id: number, paste: boolean): Promise<void> {
  if (!isTauri()) return;
  await invoke("clipboard_paste", { id, paste });
}

export const pinEntry = (id: number, pinned: boolean) => call("clipboard_pin", { id, pinned });
export const deleteEntry = (id: number) => {
  thumbs.delete(id);
  call("clipboard_delete", { id });
};
/** Everything except pinned items. */
export const clearHistory = () => call("clipboard_clear");

/** Opens the overlay to pick a screen area to read text from. */
export const startOcrSnip = () => call("ocr_snip_start");

export const onOcrResult = (handler: (outcome: OcrOutcome) => void) => subscribe<OcrOutcome>("ocr://result", handler);

export async function listOcrLanguages(): Promise<OcrLanguage[]> {
  if (!isTauri()) return [];
  return invoke<OcrLanguage[]>("ocr_languages").catch(() => []);
}

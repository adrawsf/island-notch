/**
 * Notch notifications: a FIFO queue shown one at a time in the collapsed notch.
 *
 * Any feature can call `showToast()`. The shell shows the head of the queue
 * while the notch is collapsed and dismisses it after `durationMs`; while the
 * notch is expanded, toasts wait their turn.
 */
import { useSyncExternalStore } from "react";

export interface NotchToast {
  id: number;
  title: string;
  body?: string;
  durationMs: number;
  /** Image (data URI) shown instead of the bell, e.g. the sending app's logo. */
  icon?: string;
  /** Clicking the toast runs this (it is dismissed either way). */
  onClick?: () => void;
  /** Where it came from: "windows" toasts are already in the notification center. */
  source?: "notch" | "windows";
}

export type ToastInput = Omit<NotchToast, "id" | "durationMs"> & { durationMs?: number };

const DEFAULT_DURATION_MS = 3500;
/** Oldest toasts are dropped beyond this, so a burst can't stall the notch. */
const MAX_QUEUE = 5;

let queue: NotchToast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const addedListeners = new Set<(toast: NotchToast) => void>();

function emit() {
  listeners.forEach((l) => l());
}

/** Windows' "Do not disturb" is on: toasts are recorded but not shown. */
let quiet = false;

export function setToastsQuiet(next: boolean): void {
  if (quiet === next) return;
  quiet = next;
  if (quiet && queue.length > 0) {
    queue = [];
    emit();
  }
}

export function showToast({ durationMs = DEFAULT_DURATION_MS, source = "notch", ...rest }: ToastInput): number {
  const toast: NotchToast = { id: nextId++, durationMs, source, ...rest };
  if (!quiet) {
    queue = [...queue, toast].slice(-MAX_QUEUE);
    emit();
  }
  addedListeners.forEach((l) => l(toast));
  return toast.id;
}

/** Every toast as it is queued (the notification center keeps a history). */
export function onToastAdded(listener: (toast: NotchToast) => void): () => void {
  addedListeners.add(listener);
  return () => addedListeners.delete(listener);
}

export function dismissToast(id: number): void {
  const next = queue.filter((t) => t.id !== id);
  if (next.length === queue.length) return;
  queue = next;
  emit();
}

function currentToast(): NotchToast | null {
  return queue[0] ?? null;
}

function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The toast at the head of the queue, or null. */
export function useCurrentToast(): NotchToast | null {
  return useSyncExternalStore(subscribeToasts, currentToast);
}

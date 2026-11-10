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
}

export interface ToastInput {
  title: string;
  body?: string;
  durationMs?: number;
}

const DEFAULT_DURATION_MS = 3500;
/** Oldest toasts are dropped beyond this, so a burst can't stall the notch. */
const MAX_QUEUE = 5;

let queue: NotchToast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function showToast({ title, body, durationMs = DEFAULT_DURATION_MS }: ToastInput): number {
  const toast: NotchToast = { id: nextId++, title, body, durationMs };
  queue = [...queue, toast].slice(-MAX_QUEUE);
  emit();
  return toast.id;
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

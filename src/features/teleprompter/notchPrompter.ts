/**
 * Whether the teleprompter is running inside the notch (Prompter tab). While
 * it is, the notch stays open: leaving it with the cursor or clicking
 * elsewhere does not close it (the exit button, Esc and the shortcut do).
 */
import { useSyncExternalStore } from "react";

let active = false;
const listeners = new Set<() => void>();

export function isPrompterInNotch(): boolean {
  return active;
}

export function setPrompterInNotch(next: boolean): void {
  if (next === active) return;
  active = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePrompterInNotch(): boolean {
  return useSyncExternalStore(subscribe, isPrompterInNotch);
}

import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/**
 * Subscribes to a Tauri event and returns a synchronous unsubscribe, so it can
 * be returned straight from a `useEffect`. Outside Tauri it is a no-op.
 */
export function subscribe<T>(event: string, handler: (payload: T) => void): () => void {
  if (!isTauri()) return () => {};
  let disposed = false;
  let unlisten: (() => void) | null = null;
  listen<T>(event, (e) => handler(e.payload)).then((fn) => {
    if (disposed) fn();
    else unlisten = fn;
  });
  return () => {
    disposed = true;
    unlisten?.();
  };
}

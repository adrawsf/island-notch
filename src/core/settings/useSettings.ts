import { useSyncExternalStore } from "react";
import { getSettings, subscribeSettings, type AppSettings } from "./settings";

/** Current settings; re-renders when any setting changes. */
export function useSettings(): AppSettings {
  return useSyncExternalStore(subscribeSettings, getSettings);
}

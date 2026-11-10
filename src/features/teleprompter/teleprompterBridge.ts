/** Frontend side of `src-tauri/src/teleprompter.rs`. */
import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { subscribe } from "../../core/tauriEvents";

const EVENT_VISIBILITY = "teleprompter://visibility";

const call = (cmd: string, args?: Record<string, unknown>) => {
  if (isTauri()) invoke(cmd, args).catch((err) => console.error(`[teleprompter] ${cmd}`, err));
};

export const openTeleprompter = (hideFromCapture: boolean) => call("teleprompter_open", { hideFromCapture });
export const closeTeleprompter = () => call("teleprompter_close");
export const setCaptureExcluded = (excluded: boolean) => call("teleprompter_set_capture_excluded", { excluded });

/** Whether the teleprompter window is showing. */
export function useTeleprompterVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!isTauri()) return;
    invoke<boolean>("teleprompter_visible").then(setVisible).catch(() => {});
    return subscribe<boolean>(EVENT_VISIBILITY, setVisible);
  }, []);
  return visible;
}

/** Frontend side of `src-tauri/src/miniplayer.rs`. */
import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { subscribe } from "../../core/tauriEvents";

const EVENT_VISIBILITY = "miniplayer://visibility";

export function toggleMiniPlayer(): void {
  if (isTauri()) invoke("mini_player_toggle").catch((err) => console.error("[miniplayer] toggle", err));
}

export function hideMiniPlayer(): void {
  if (isTauri()) invoke("mini_player_hide").catch((err) => console.error("[miniplayer] hide", err));
}

/** Whether the mini player window is showing. */
export function useMiniPlayerVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!isTauri()) return;
    invoke<boolean>("mini_player_visible").then(setVisible).catch(() => {});
    return subscribe<boolean>(EVENT_VISIBILITY, setVisible);
  }, []);
  return visible;
}

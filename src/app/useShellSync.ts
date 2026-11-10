/**
 * Keeps the Rust shell (monitor, global shortcut, video filter) in sync with
 * settings. Runs in the notch window only; other windows change settings
 * through the shared store and this hook picks the change up.
 */
import { useEffect, useRef } from "react";
import { applyShellConfig } from "../core/shell/shellBridge";
import { getSettings, updateSetting } from "../core/settings/settings";
import { useSettings } from "../core/settings/useSettings";
import { showToast } from "../core/toast/toastQueue";
import { prettyShortcut } from "../shared/format";

export function useShellSync() {
  const s = useSettings();
  const lastError = useRef<string | null>(null);

  useEffect(() => {
    applyShellConfig({
      monitor: s.monitor,
      ignoreVideo: s.ignoreVideo,
      shortcutEnabled: s.shortcutEnabled,
      toggleShortcut: s.toggleShortcut,
    }).then((result) => {
      const error = result?.shortcutError ?? null;
      // Rust keeps reporting a failed shortcut; toast only when it changes.
      if (error && error !== lastError.current) {
        showToast({ title: "Shortcut tidak bisa dipasang", body: error, durationMs: 6000 });
      }
      lastError.current = error;
    });
  }, [s.monitor, s.ignoreVideo, s.shortcutEnabled, s.toggleShortcut]);

  // First run: tell the user where things are.
  useEffect(() => {
    const { welcomeShown, shortcutEnabled, toggleShortcut } = getSettings();
    if (welcomeShown) return;
    updateSetting("welcomeShown", true);
    showToast({
      title: "Island Notch aktif",
      body: shortcutEnabled
        ? `${prettyShortcut(toggleShortcut)} untuk buka/tutup · pengaturan di tombol ⚙`
        : "Pengaturan lewat tombol ⚙ atau ikon tray",
      durationMs: 5000,
    });
  }, []);
}

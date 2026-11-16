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
  const lastOcrError = useRef<string | null>(null);

  useEffect(() => {
    applyShellConfig({
      monitor: s.monitor,
      ignoreVideo: s.ignoreVideo,
      shortcutEnabled: s.shortcutEnabled,
      toggleShortcut: s.toggleShortcut,
      hideInFullscreen: s.hideInFullscreen,
      clipboardHistory: s.clipboardHistory,
      clipboardMaxItems: s.clipboardMaxItems,
      ocrShortcutEnabled: s.ocrShortcutEnabled,
      ocrShortcut: s.ocrShortcut,
      ocrLanguage: s.ocrLanguage,
    }).then((result) => {
      // Rust keeps reporting a failed shortcut; toast only when it changes.
      const error = result?.shortcutError ?? null;
      if (error && error !== lastError.current) {
        showToast({ title: "Shortcut tidak bisa dipasang", body: error, durationMs: 6000 });
      }
      lastError.current = error;
      const ocrError = result?.ocrShortcutError ?? null;
      if (ocrError && ocrError !== lastOcrError.current) {
        showToast({ title: "Shortcut OCR tidak bisa dipasang", body: ocrError, durationMs: 6000 });
      }
      lastOcrError.current = ocrError;
    });
  }, [
    s.monitor,
    s.ignoreVideo,
    s.shortcutEnabled,
    s.toggleShortcut,
    s.hideInFullscreen,
    s.clipboardHistory,
    s.clipboardMaxItems,
    s.ocrShortcutEnabled,
    s.ocrShortcut,
    s.ocrLanguage,
  ]);

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

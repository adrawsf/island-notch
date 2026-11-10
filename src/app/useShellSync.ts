/**
 * Keeps the Rust shell (monitor, global shortcut, tray) in sync with settings,
 * and applies tray menu selections back to settings.
 */
import { useEffect } from "react";
import { applyShellConfig, onTraySelect } from "../core/shell/shellBridge";
import {
  getSettings,
  updateSetting,
  type NotchShape,
  type NotchSize,
  type ThemeMode,
} from "../core/settings/settings";
import { useSettings } from "../core/settings/useSettings";
import { showToast } from "../core/toast/toastQueue";
import { prettyShortcut } from "../shared/format";
import { IDLE_WIDGETS } from "./idle/idleWidgets";
import { LYRICS_SOURCE_OPTIONS } from "../features/lyrics/sources";
import type { LyricsSource } from "../features/lyrics/types";

export function useShellSync() {
  const s = useSettings();

  useEffect(() => {
    applyShellConfig({
      monitor: s.monitor,
      notchShape: s.notchShape,
      notchSize: s.notchSize,
      theme: s.theme,
      idleWidgets: s.idleWidgets,
      idleWidgetOptions: IDLE_WIDGETS.map(({ id, label }) => ({ id, label })),
      idleShowsMedia: s.idleShowsMedia,
      pillShowsLyrics: s.pillShowsLyrics,
      lyricsSource: s.lyricsSource,
      lyricsSourceOptions: LYRICS_SOURCE_OPTIONS,
      shrinkForBrowsers: s.shrinkForBrowsers,
      shortcutEnabled: s.shortcutEnabled,
      toggleShortcut: s.toggleShortcut,
    }).then((result) => {
      if (result?.shortcutError) {
        showToast({ title: "Shortcut tidak bisa dipasang", body: result.shortcutError, durationMs: 6000 });
      }
    });
  }, [s.monitor, s.notchShape, s.notchSize, s.theme, s.idleWidgets, s.idleShowsMedia, s.pillShowsLyrics, s.lyricsSource, s.shrinkForBrowsers, s.shortcutEnabled, s.toggleShortcut]);

  useEffect(() => onTraySelect(applyTraySelection), []);

  // First run: tell the user where things are.
  useEffect(() => {
    const { welcomeShown, shortcutEnabled, toggleShortcut } = getSettings();
    if (welcomeShown) return;
    updateSetting("welcomeShown", true);
    showToast({
      title: "Island Notch aktif",
      body: shortcutEnabled
        ? `${prettyShortcut(toggleShortcut)} untuk buka/tutup · atur lewat ikon tray`
        : "Atur lewat ikon tray",
      durationMs: 5000,
    });
  }, []);
}

/** `<group>:<value>` from the tray. Invalid values are rejected by `updateSetting`. */
function applyTraySelection(id: string) {
  const sep = id.indexOf(":");
  const group = sep < 0 ? id : id.slice(0, sep);
  const value = sep < 0 ? "" : id.slice(sep + 1);
  switch (group) {
    case "monitor":
      updateSetting("monitor", value === "auto" ? null : value);
      break;
    case "shape":
      updateSetting("notchShape", value as NotchShape);
      break;
    case "size":
      updateSetting("notchSize", value as NotchSize);
      break;
    case "theme":
      updateSetting("theme", value as ThemeMode);
      break;
    case "idle":
      toggleIdleWidget(value);
      break;
    case "mediaPill":
      updateSetting("idleShowsMedia", !getSettings().idleShowsMedia);
      break;
    case "lyricsSource":
      updateSetting("lyricsSource", value as LyricsSource);
      break;
    case "lyricsPill":
      updateSetting("pillShowsLyrics", !getSettings().pillShowsLyrics);
      break;
    case "shrinkForBrowsers":
      updateSetting("shrinkForBrowsers", !getSettings().shrinkForBrowsers);
      break;
    case "shortcut":
      updateSetting("shortcutEnabled", !getSettings().shortcutEnabled);
      break;
    default:
      console.warn("[tray] unknown item", id);
  }
}

/** Tray check item for an idle widget: remove it, or add it at the end. */
function toggleIdleWidget(id: string) {
  if (!IDLE_WIDGETS.some((w) => w.id === id)) return;
  const current = getSettings().idleWidgets;
  updateSetting("idleWidgets", current.includes(id) ? current.filter((w) => w !== id) : [...current, id]);
}

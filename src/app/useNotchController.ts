/**
 * Open/close state of the notch and which tab is active.
 *
 * Inputs: hover enter/leave (Rust hit-test events in Tauri, DOM events in a
 * plain browser), clicks on the pill, clicks outside the expanded notch, and
 * toggle requests (global shortcut, tray icon click).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { onClickOutside, onNotchHover, onToggleRequest } from "../core/notch/notchBridge";
import { updateSetting } from "../core/settings/settings";
import { useSettings } from "../core/settings/useSettings";
import { findTab } from "./tabs/registry";
import { hideTooltip } from "../shared/ui/TooltipLayer";

const HOVER_OPEN_DELAY_MS = 120;

/** A text field inside the notch has focus: leaving with the cursor must not close it. */
function isEditing(): boolean {
  return document.activeElement?.matches("input, textarea, [contenteditable='true']") ?? false;
}

interface NotchControllerOptions {
  /** Hovering does not open the notch (e.g. a toast is showing and should be clickable). */
  suppressHoverOpen?: boolean;
}

/**
 * The notch always opens on the tab the user last picked (`lastTabId`),
 * whatever is playing or counting down.
 */
export function useNotchController({ suppressHoverOpen = false }: NotchControllerOptions = {}) {
  const settings = useSettings();
  const [expanded, setExpanded] = useState(false);
  const [activeTabId, setActiveTabId] = useState(() => findTab(settings.lastTabId).id);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Latest settings without re-subscribing the event listeners.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const suppressHoverOpenRef = useRef(suppressHoverOpen);
  suppressHoverOpenRef.current = suppressHoverOpen;

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  // Every open/close goes through here.
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const setOpen = useCallback((next: boolean) => {
    // Drop keyboard focus on close so typing never goes into a hidden field.
    if (!next) {
      (document.activeElement as HTMLElement | null)?.blur?.();
      hideTooltip();
    }
    expandedRef.current = next;
    setExpanded(next);
  }, []);

  const open = useCallback(() => {
    clearTimer();
    setOpen(true);
  }, [setOpen]);

  const close = useCallback(() => {
    clearTimer();
    setOpen(false);
  }, [setOpen]);

  const toggle = useCallback(() => {
    clearTimer();
    setOpen(!expandedRef.current);
  }, [setOpen]);

  const handleHover = useCallback(
    (inside: boolean) => {
      clearTimer();
      if (!inside) hideTooltip();
      const { expandOnHover, closeDelayMs } = settingsRef.current;
      if (inside) {
        if (expandOnHover && !suppressHoverOpenRef.current) {
          timer.current = setTimeout(() => setOpen(true), HOVER_OPEN_DELAY_MS);
        }
      } else if (!isEditing()) {
        // While typing, only a click outside, Escape or the shortcut closes it.
        timer.current = setTimeout(() => setOpen(false), closeDelayMs);
      }
    },
    [setOpen],
  );

  const selectTab = useCallback((id: string) => {
    setActiveTabId(id);
    updateSetting("lastTabId", id);
  }, []);

  useEffect(() => {
    const offHover = onNotchHover(handleHover);
    const offOutside = onClickOutside(close);
    const offToggle = onToggleRequest(toggle);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && expandedRef.current) close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      offHover();
      offOutside();
      offToggle();
      clearTimer();
    };
  }, [handleHover, close, toggle]);

  return { expanded, activeTab: findTab(activeTabId), open, close, handleHover, selectTab };
}

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
/** Over the media pill the notch waits a little longer, so the wheel can reach the volume first. */
const WHEEL_HOVER_OPEN_DELAY_MS = 350;

/** A text field inside the notch has focus: leaving with the cursor must not close it. */
function isEditing(): boolean {
  return document.activeElement?.matches("input, textarea, [contenteditable='true']") ?? false;
}

interface NotchControllerOptions {
  /** Hovering does not open the notch (e.g. a toast is showing and should be clickable). */
  suppressHoverOpen?: boolean;
  /** The collapsed pill takes the wheel (volume): open on hover a bit later. */
  wheelPill?: boolean;
  /**
   * Stay open: leaving with the cursor, clicking outside and Escape do not
   * close it (the teleprompter runs in the notch). The shortcut still does.
   */
  holdOpen?: boolean;
}

/**
 * The notch always opens on the tab the user last picked (`lastTabId`),
 * whatever is playing or counting down.
 */
export function useNotchController({
  suppressHoverOpen = false,
  wheelPill = false,
  holdOpen = false,
}: NotchControllerOptions = {}) {
  const settings = useSettings();
  const [expanded, setExpanded] = useState(false);
  const [activeTabId, setActiveTabId] = useState(() => findTab(settings.lastTabId).id);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Latest settings without re-subscribing the event listeners.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const suppressHoverOpenRef = useRef(suppressHoverOpen);
  suppressHoverOpenRef.current = suppressHoverOpen;
  const wheelPillRef = useRef(wheelPill);
  wheelPillRef.current = wheelPill;
  const holdOpenRef = useRef(holdOpen);
  holdOpenRef.current = holdOpen;
  /** The wheel was used on the pill: no hover-open until the cursor leaves. */
  const heldRef = useRef(false);

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
      if (!inside) heldRef.current = false;
      if (inside) {
        if (expandOnHover && !suppressHoverOpenRef.current && !heldRef.current) {
          const delay = wheelPillRef.current && !expandedRef.current ? WHEEL_HOVER_OPEN_DELAY_MS : HOVER_OPEN_DELAY_MS;
          timer.current = setTimeout(() => setOpen(true), delay);
        }
      } else if (!isEditing() && !holdOpenRef.current) {
        // While typing, only a click outside, Escape or the shortcut closes it.
        timer.current = setTimeout(() => setOpen(false), closeDelayMs);
      }
    },
    [setOpen],
  );

  /** Keeps the collapsed notch collapsed while the cursor stays on it (wheel on the pill). */
  const holdCollapsed = useCallback(() => {
    if (expandedRef.current) return;
    heldRef.current = true;
    clearTimer();
  }, []);

  const selectTab = useCallback((id: string) => {
    setActiveTabId(id);
    updateSetting("lastTabId", id);
  }, []);

  useEffect(() => {
    const offHover = onNotchHover(handleHover);
    const offOutside = onClickOutside(() => {
      if (!holdOpenRef.current) close();
    });
    const offToggle = onToggleRequest(toggle);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && expandedRef.current && !holdOpenRef.current) close();
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

  return { expanded, activeTab: findTab(activeTabId), open, close, handleHover, holdCollapsed, selectTab };
}

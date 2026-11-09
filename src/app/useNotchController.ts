/**
 * Open/close state of the notch and which tab is active.
 *
 * Inputs: hover enter/leave (Rust hit-test events in Tauri, DOM events in a
 * plain browser), clicks on the pill, and clicks outside the expanded notch.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { onClickOutside, onNotchHover } from "../core/notch/notchBridge";
import { updateSetting } from "../core/settings/settings";
import { useSettings } from "../core/settings/useSettings";
import { findTab } from "./tabs/registry";

const HOVER_OPEN_DELAY_MS = 120;

export function useNotchController() {
  const settings = useSettings();
  const [expanded, setExpanded] = useState(false);
  const [activeTabId, setActiveTabId] = useState(() => findTab(settings.lastTabId).id);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Latest settings without re-subscribing the event listeners.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const open = useCallback(() => {
    clearTimer();
    setExpanded(true);
  }, []);

  const close = useCallback(() => {
    clearTimer();
    setExpanded(false);
  }, []);

  const handleHover = useCallback((inside: boolean) => {
    clearTimer();
    const { expandOnHover, closeDelayMs } = settingsRef.current;
    if (inside) {
      if (expandOnHover) timer.current = setTimeout(() => setExpanded(true), HOVER_OPEN_DELAY_MS);
    } else {
      timer.current = setTimeout(() => setExpanded(false), closeDelayMs);
    }
  }, []);

  const selectTab = useCallback((id: string) => {
    setActiveTabId(id);
    updateSetting("lastTabId", id);
  }, []);

  useEffect(() => {
    const offHover = onNotchHover(handleHover);
    const offOutside = onClickOutside(close);
    return () => {
      offHover();
      offOutside();
      clearTimer();
    };
  }, [handleHover, close]);

  return { expanded, activeTab: findTab(activeTabId), open, close, handleHover, selectTab };
}

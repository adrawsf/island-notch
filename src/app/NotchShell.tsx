import { Suspense, useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { isTauri } from "@tauri-apps/api/core";
import { reportHitRegion } from "../core/notch/notchBridge";
import type { NotchSize } from "../core/settings/settings";
import { useSettings } from "../core/settings/useSettings";
import { dismissToast, useCurrentToast } from "../core/toast/toastQueue";
import { useResolvedTheme } from "../shared/useResolvedTheme";
import { MediaPill } from "../features/media/MediaPill";
import { useMedia } from "../features/media/useMedia";
import { useMiniPlayerVisible } from "../features/media/miniPlayerBridge";
import { PomodoroPill } from "../features/pomodoro/PomodoroPill";
import { usePomodoro } from "../features/pomodoro/pomodoroStore";
import { DEFAULT_TAB_WIDTH, preloadPanels } from "./tabs/registry";
import type { TabSize } from "./tabs/types";
import { useNotchController } from "./useNotchController";
import { useTrackPeek } from "./useTrackPeek";
import { useBrowserCompact } from "./useBrowserCompact";
import { CollapsedPill } from "./CollapsedPill";
import { Measure } from "./Measure";
import { NotchToastView } from "./NotchToastView";
import { TabBar } from "./TabBar";

const IN_TAURI = isTauri();
/** Jelly spring for the outline: overshoots a little and settles, like the Dynamic Island. */
const SPRING = { type: "spring", stiffness: 300, damping: 19, mass: 0.9 } as const;
const CONTENT_FADE = { duration: 0.2, ease: [0.2, 0.8, 0.2, 1] } as const;
/** Gap between the screen edge and the notch in "island" shape (CSS px, unscaled). */
const ISLAND_TOP_GAP = 10;
const SIZE_ZOOM: Record<NotchSize, number> = { compact: 0.9, default: 1, large: 1.15 };
/** Size used before anything has been measured. */
const INITIAL_SIZE: TabSize = { width: 120, height: 34 };
/** Expanded notch grows sideways, not down: content past this scrolls inside its panel. */
const MAX_HEIGHT = 340;
/** Radius of the concave "ears" joining a flush notch to the screen edge. */
const EAR_STYLE = { "--ear": "10px" } as CSSProperties;

type View = "expanded" | "toast" | "collapsed";
type IdleKind = "handle" | "pomodoro" | "media" | "widget";
/** Hover target around the thin handle: wider than the line, as short as it (CSS px). */
const HANDLE_HIT = { width: 120, height: 6 };

/** The notch: a liquid-glass island that hugs whatever it is showing. */
export function NotchShell() {
  const toast = useCurrentToast();
  const media = useMedia();
  const pomo = usePomodoro();
  const settings = useSettings();
  const miniPlayerVisible = useMiniPlayerVisible();
  // Idle content priority: a pomodoro in progress, then media, then the idle
  // widgets. Media is skipped while the mini player shows it instead.
  const mediaInPill = media.active && settings.idleShowsMedia && !miniPlayerVisible;
  // While the focus timer owns the pill, a new track still shows its title
  // for a moment before the timer comes back.
  // A browser under the notch: shrink to a thin handle so its tabs stay
  // clickable; hovering the handle still opens the notch.
  const compact = useBrowserCompact() && settings.shrinkForBrowsers;
  const peekTrack = useTrackPeek(media, pomo.started && mediaInPill && !compact);
  const idle: IdleKind = compact
    ? "handle"
    : pomo.started && !peekTrack
      ? "pomodoro"
      : mediaInPill
        ? "media"
        : "widget";
  const notch = useNotchController({
    suppressHoverOpen: toast !== null,
  });
  const theme = useResolvedTheme(settings.theme);

  useEffect(preloadPanels, []);

  // Toasts wait while the notch is expanded.
  const view: View = notch.expanded ? "expanded" : toast ? "toast" : "collapsed";
  const sizeKey = view === "expanded" ? `tab:${notch.activeTab.id}` : view === "toast" ? "toast" : `idle:${idle}`;

  // Natural size of each view's content, reported by <Measure>.
  const [sizes, setSizes] = useState<Record<string, TabSize>>({});
  const onSize = useCallback((key: string, s: TabSize) => {
    setSizes((prev) => (prev[key]?.width === s.width && prev[key]?.height === s.height ? prev : { ...prev, [key]: s }));
  }, []);
  // Until a view is measured, hold the previous size instead of jumping.
  const lastSize = useRef(INITIAL_SIZE);
  const measured = sizes[sizeKey] ?? lastSize.current;
  const size = { width: measured.width, height: Math.min(measured.height, MAX_HEIGHT) };
  lastSize.current = size;

  const island = settings.notchShape === "island";
  const zoom = SIZE_ZOOM[settings.notchSize];
  // The handle hugs the screen edge even in island shape, to stay clear of the tabs.
  const handle = view === "collapsed" && idle === "handle";
  const topGap = island && !handle ? ISLAND_TOP_GAP : 0;
  // Capsule when collapsed; rounder corners as it grows.
  const radius = view === "expanded" ? 28 : view === "toast" ? 24 : size.height / 2;

  // Auto-dismiss the visible toast.
  useEffect(() => {
    if (view !== "toast" || !toast) return;
    const id = setTimeout(() => dismissToast(toast.id), toast.durationMs);
    return () => clearTimeout(id);
  }, [view, toast]);

  // Tell the Rust hit-test where the notch is (window CSS px). The target size
  // is reported immediately so the region never lags behind the animation.
  useEffect(() => {
    const width = handle ? Math.max(size.width * zoom, HANDLE_HIT.width) : size.width * zoom;
    const height = handle ? HANDLE_HIT.height : size.height * zoom;
    reportHitRegion({
      x: (window.innerWidth - width) / 2,
      y: topGap,
      width,
      height,
      expanded: notch.expanded,
    });
  }, [size.width, size.height, zoom, topGap, notch.expanded, handle]);

  const { Panel } = notch.activeTab;
  const contentKey = view === "expanded" ? "expanded" : view === "toast" ? `toast-${toast?.id}` : `idle-${idle}`;

  return (
    <div className="flex h-full w-full justify-center" style={{ paddingTop: topGap }}>
      {/* Sizing wrapper: animates the outline size. The glass surface fills it
          and clips the content; the ears sit outside that clip. */}
      <motion.div
        data-theme={theme}
        className="relative"
        // `zoom` scales layout too, so the hit region above is simply size * zoom.
        style={{ zoom }}
        initial={false}
        animate={{ width: size.width, height: size.height }}
        transition={SPRING}
        // In Tauri the Rust hit-test is the single hover source. DOM events would
        // disagree with it mid-animation (the region jumps to the target size
        // while the div is still growing) and could close the notch under the cursor.
        onMouseEnter={IN_TAURI ? undefined : () => notch.handleHover(true)}
        onMouseLeave={IN_TAURI ? undefined : () => notch.handleHover(false)}
      >
        {!island && (
          <>
            <span className="notch-ear notch-ear-left" style={EAR_STYLE} aria-hidden />
            <span className="notch-ear notch-ear-right" style={EAR_STYLE} aria-hidden />
          </>
        )}
        <motion.div
          className={`glass absolute inset-0 overflow-hidden text-notch-fg ${island ? "" : "glass-flush"}`}
          initial={false}
          animate={{
            borderTopLeftRadius: island ? radius : 0,
            borderTopRightRadius: island ? radius : 0,
            borderBottomLeftRadius: radius,
            borderBottomRightRadius: radius,
          }}
          transition={SPRING}
        >
          {/* Views cross-fade on top of each other, anchored top-center, so the
              next view is measured immediately and the outline morphs to it. */}
          <AnimatePresence initial={false}>
            <motion.div
              key={contentKey}
              className="absolute left-1/2 top-0"
              style={{ x: "-50%", originY: 0 }}
              initial={{ opacity: 0, scale: 0.9, filter: "blur(6px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 0.97, filter: "blur(6px)" }}
              transition={CONTENT_FADE}
            >
              {view === "expanded" && (
                <Measure id={sizeKey} onSize={onSize} style={{ width: notch.activeTab.width ?? DEFAULT_TAB_WIDTH }}>
                  <TabBar activeId={notch.activeTab.id} onSelect={notch.selectTab} />
                  <div className="px-6 pb-5 pt-1">
                    <Suspense fallback={<div className="h-24" />}>
                      <motion.div
                        key={notch.activeTab.id}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={CONTENT_FADE}
                      >
                        <Panel requestClose={notch.close} />
                      </motion.div>
                    </Suspense>
                  </div>
                </Measure>
              )}
              {view === "toast" && toast && (
                <Measure id={sizeKey} onSize={onSize}>
                  <NotchToastView toast={toast} onDismiss={() => dismissToast(toast.id)} />
                </Measure>
              )}
              {view === "collapsed" && (
                <Measure id={sizeKey} onSize={onSize}>
                  {idle === "pomodoro" && <PomodoroPill pomo={pomo} onClick={notch.open} />}
                  {idle === "media" && (
                    <MediaPill media={media} showLyrics={settings.pillShowsLyrics && !peekTrack} onClick={notch.open} />
                  )}
                  {idle === "widget" && <CollapsedPill widgets={settings.idleWidgets} onClick={notch.open} />}
                  {idle === "handle" && <div className="h-1.5 w-10" aria-label="Notch (diperkecil)" />}
                </Measure>
              )}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </div>
  );
}

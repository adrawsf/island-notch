import { Suspense, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { reportHitRegion } from "../core/notch/notchBridge";
import { COLLAPSED_SIZE, DEFAULT_TAB_SIZE } from "./tabs/registry";
import { useNotchController } from "./useNotchController";
import { CollapsedPill } from "./CollapsedPill";
import { TabBar } from "./TabBar";

const SPRING = { type: "spring", stiffness: 420, damping: 36, mass: 0.9 } as const;

/** The notch: a black island pinned to the top-center of the window. */
export function NotchShell() {
  const notch = useNotchController();
  const size = notch.expanded ? notch.activeTab.size ?? DEFAULT_TAB_SIZE : COLLAPSED_SIZE;
  const radius = notch.expanded ? 28 : 17;

  // Tell the Rust hit-test where the notch is. The target size is reported
  // immediately so the region never lags behind the animation.
  useEffect(() => {
    reportHitRegion({
      x: (window.innerWidth - size.width) / 2,
      y: 0,
      width: size.width,
      height: size.height,
      expanded: notch.expanded,
    });
  }, [size.width, size.height, notch.expanded]);

  const { Panel } = notch.activeTab;

  return (
    <div className="flex h-full w-full justify-center">
      <motion.div
        className="overflow-hidden bg-notch-bg text-white shadow-[0_8px_32px_rgba(0,0,0,0.45)]"
        style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0 }}
        initial={false}
        animate={{
          width: size.width,
          height: size.height,
          borderBottomLeftRadius: radius,
          borderBottomRightRadius: radius,
        }}
        transition={SPRING}
        onMouseEnter={() => notch.handleHover(true)}
        onMouseLeave={() => notch.handleHover(false)}
      >
        <AnimatePresence mode="wait" initial={false}>
          {notch.expanded ? (
            <motion.div
              key="expanded"
              className="flex h-full flex-col"
              initial={{ opacity: 0, filter: "blur(6px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, filter: "blur(6px)" }}
              transition={{ duration: 0.16 }}
            >
              <TabBar activeId={notch.activeTab.id} onSelect={notch.selectTab} />
              <div className="relative min-h-0 flex-1 px-5 pb-4">
                <Suspense fallback={null}>
                  <Panel requestClose={notch.close} />
                </Suspense>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="collapsed"
              className="h-full"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
            >
              <CollapsedPill onClick={notch.open} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

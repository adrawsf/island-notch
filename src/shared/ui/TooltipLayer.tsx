import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Hover delay before a tooltip shows, like the system's. */
const SHOW_DELAY_MS = 450;
const GAP = 6;
const EDGE = 6;
/** Dispatch on `window` to hide any tooltip (e.g. the notch lost the cursor). */
export const HIDE_TOOLTIP_EVENT = "island:hide-tooltip";

export function hideTooltip(): void {
  window.dispatchEvent(new Event(HIDE_TOOLTIP_EVENT));
}

/** The element, or any text inside it, is cut off (ellipsis or overflow). */
function isTruncated(el: HTMLElement): boolean {
  const cut = (n: Element) => n.scrollWidth > n.clientWidth + 1;
  return cut(el) || Array.from(el.querySelectorAll("*")).some(cut);
}

interface Tip {
  text: string;
  anchor: DOMRect;
  theme: string;
}

/**
 * Glass tooltips for the whole window, in place of the native `title` box.
 *
 * Mark an element with `data-tip="…"`. Add `data-tip-truncated` to show the
 * tip only when the element's text is actually cut off (long titles). Mount
 * once per window.
 */
export function TooltipLayer() {
  const [tip, setTip] = useState<Tip | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let target: HTMLElement | null = null;
    // A click-through window gets no pointerleave, and views unmount under
    // the cursor: drop the tip once its element is gone.
    const watchdog = setInterval(() => {
      if (target && !target.isConnected) hide();
    }, 300);

    const hide = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      target = null;
      setTip(null);
    };

    const onOver = (e: PointerEvent) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-tip]");
      if (el === target) return;
      hide();
      if (!el) return;
      const text = el.dataset.tip?.trim();
      if (!text) return;
      if (el.hasAttribute("data-tip-truncated") && !isTruncated(el)) return;
      target = el;
      timer = setTimeout(() => {
        if (!target?.isConnected) return;
        const theme = target.closest<HTMLElement>("[data-theme]")?.dataset.theme ?? "dark";
        setTip({ text, anchor: target.getBoundingClientRect(), theme });
      }, SHOW_DELAY_MS);
    };

    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("keydown", hide, true);
    document.addEventListener("wheel", hide, { capture: true, passive: true });
    window.addEventListener("blur", hide);
    window.addEventListener(HIDE_TOOLTIP_EVENT, hide);
    document.documentElement.addEventListener("pointerleave", hide);
    return () => {
      hide();
      clearInterval(watchdog);
      window.removeEventListener(HIDE_TOOLTIP_EVENT, hide);
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("keydown", hide, true);
      document.removeEventListener("wheel", hide, true);
      window.removeEventListener("blur", hide);
      document.documentElement.removeEventListener("pointerleave", hide);
    };
  }, []);

  return tip ? createPortal(<TooltipBubble tip={tip} />, document.body) : null;
}

function TooltipBubble({ tip }: { tip: Tip }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Below the anchor, or above when there is no room; kept inside the window.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const a = tip.anchor;
    const below = a.bottom + GAP;
    const top = below + height <= window.innerHeight - EDGE ? below : Math.max(EDGE, a.top - GAP - height);
    const centred = a.left + a.width / 2 - width / 2;
    const left = Math.max(EDGE, Math.min(window.innerWidth - width - EDGE, centred));
    setPos({ left, top });
  }, [tip]);

  return (
    <div
      ref={ref}
      data-theme={tip.theme}
      role="tooltip"
      className="glass pointer-events-none fixed z-[1000] max-w-[260px] rounded-xl px-2.5 py-1.5 text-[11px] leading-snug text-notch-fg"
      style={{
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        opacity: pos ? 1 : 0,
        transition: "opacity 120ms ease",
      }}
    >
      {tip.text}
    </div>
  );
}

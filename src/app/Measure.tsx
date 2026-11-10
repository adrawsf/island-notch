import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import type { TabSize } from "./tabs/types";

interface MeasureProps {
  /** Which view this content belongs to; reported with every size. */
  id: string;
  onSize: (id: string, size: TabSize) => void;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/**
 * Reports the natural size of its content. Measured before paint on mount (so
 * the notch never flashes at the wrong size) and again whenever it changes.
 * `offsetWidth/Height` ignore transforms, so enter/exit scale animations do
 * not disturb the result.
 */
export function Measure({ id, onSize, className = "", style, children }: MeasureProps) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const report = () => onSize(id, { width: el.offsetWidth, height: el.offsetHeight });
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, [id, onSize]);

  return (
    <div ref={ref} className={`w-max ${className}`} style={style}>
      {children}
    </div>
  );
}

import { Fragment } from "react";
import { resolveIdleWidgets } from "./idle/idleWidgets";

interface CollapsedPillProps {
  /** Widget ids from the `idleWidgets` setting, in display order. */
  widgets: string[];
  onClick: () => void;
}

/**
 * The idle notch: the chosen widgets side by side, and nothing more. Its
 * width is exactly its content plus padding, so one widget makes a small
 * pill and three make a wider one. With no widgets it is a small blank pill.
 */
export function CollapsedPill({ widgets, onClick }: CollapsedPillProps) {
  const items = resolveIdleWidgets(widgets);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Buka notch"
      className="flex h-8 min-w-[64px] items-center justify-center gap-2 px-3.5 text-[13px] tracking-tight"
    >
      {items.map(({ id, Component }, i) => (
        <Fragment key={id}>
          {i > 0 && <span className="h-1 w-1 rounded-full bg-notch-fg/30" aria-hidden />}
          <Component />
        </Fragment>
      ))}
    </button>
  );
}

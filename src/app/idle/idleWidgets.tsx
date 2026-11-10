/**
 * Idle widgets: small pieces of content shown in the collapsed notch when
 * nothing else (pomodoro, media, toast) is live. The user picks which ones,
 * in order, via the `idleWidgets` setting; the pill hugs whatever they render.
 *
 * To add a widget: write a component that renders a short inline row (text,
 * an icon) and add it to IDLE_WIDGETS. The tray lists it automatically.
 */
import type { ComponentType } from "react";
import { useNow } from "../../shared/useNow";
import { formatClock, formatShortDate } from "../../shared/format";

export interface IdleWidgetDefinition {
  /** Stable id stored in settings. */
  id: string;
  /** Name shown in the tray menu. */
  label: string;
  Component: ComponentType;
}

function Clock() {
  const now = useNow(1000);
  return <span className="font-semibold tabular-nums">{formatClock(now)}</span>;
}

function DateWidget() {
  const now = useNow(60_000);
  return <span className="font-medium text-notch-muted">{formatShortDate(now)}</span>;
}

export const IDLE_WIDGETS: IdleWidgetDefinition[] = [
  { id: "clock", label: "Jam", Component: Clock },
  { id: "date", label: "Tanggal", Component: DateWidget },
];

/** Known widgets in the user's order; unknown ids (e.g. a removed widget) are skipped. */
export function resolveIdleWidgets(ids: string[]): IdleWidgetDefinition[] {
  return ids.flatMap((id) => IDLE_WIDGETS.find((w) => w.id === id) ?? []);
}

import type { TabPanelProps } from "../../app/tabs/types";
import { formatClock, formatLongDate } from "../../shared/format";
import { useNow } from "../../shared/useNow";

/** Placeholder home tab: clock and date. Media and widgets arrive in later phases. */
export default function HomePanel(_props: TabPanelProps) {
  const now = useNow(1000);
  return (
    <div className="flex items-center justify-center gap-5 py-2">
      <span className="text-4xl font-semibold tabular-nums tracking-tight">{formatClock(now)}</span>
      <span className="h-8 w-px bg-notch-fg/15" aria-hidden />
      <span className="text-sm leading-snug text-notch-muted">{formatLongDate(now)}</span>
    </div>
  );
}

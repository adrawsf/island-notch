import type { TabPanelProps } from "../../app/tabs/types";
import { formatClock, formatLongDate } from "../../shared/format";
import { useNow } from "../../shared/useNow";

/** Placeholder home tab: clock and date. Media and widgets arrive in later phases. */
export default function HomePanel(_props: TabPanelProps) {
  const now = useNow(1000);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1">
      <span className="text-5xl font-semibold tabular-nums tracking-tight">{formatClock(now)}</span>
      <span className="text-sm text-notch-muted">{formatLongDate(now)}</span>
    </div>
  );
}

import { useNow } from "../shared/useNow";
import { formatClock } from "../shared/format";

interface CollapsedPillProps {
  onClick: () => void;
}

/** Content of the collapsed notch. Idle widgets will be configurable later. */
export function CollapsedPill({ onClick }: CollapsedPillProps) {
  const now = useNow(1000);
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-full w-full items-center justify-center text-[13px] font-semibold tabular-nums tracking-tight"
    >
      {formatClock(now)}
    </button>
  );
}

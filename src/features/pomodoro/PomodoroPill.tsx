import { formatCountdown, PHASE_COLOR, PHASE_LABEL, useRemainingMs, type PomodoroState } from "./pomodoroStore";

interface PomodoroPillProps {
  pomo: PomodoroState;
  onClick: () => void;
}

/** Collapsed-notch countdown while a pomodoro phase is in progress. */
export function PomodoroPill({ pomo, onClick }: PomodoroPillProps) {
  const left = useRemainingMs(pomo);
  const color = PHASE_COLOR[pomo.phase];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${PHASE_LABEL[pomo.phase]}: ${formatCountdown(left)} tersisa`}
      className="flex h-8 items-center justify-center gap-2 px-3.5 text-[13px] font-semibold tabular-nums"
    >
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${pomo.running ? "animate-pulse" : ""}`}
        style={{ backgroundColor: color }}
      />
      <span className="text-notch-muted">{PHASE_LABEL[pomo.phase]}</span>
      <span>{formatCountdown(left)}</span>
    </button>
  );
}

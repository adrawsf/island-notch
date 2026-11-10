import {
  formatCountdown,
  formatOvertime,
  PHASE_COLOR,
  PHASE_LABEL,
  useTimer,
  type PomodoroState,
} from "./pomodoroStore";

interface PomodoroPillProps {
  pomo: PomodoroState;
  onClick: () => void;
}

/** Collapsed-notch countdown while a pomodoro phase is in progress; counts the extra time in overtime. */
export function PomodoroPill({ pomo, onClick }: PomodoroPillProps) {
  const { remaining, overtime } = useTimer(pomo);
  const color = PHASE_COLOR[pomo.phase];
  const time = pomo.overtime ? formatOvertime(overtime) : formatCountdown(remaining);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={
        pomo.overtime
          ? `${PHASE_LABEL[pomo.phase]} selesai, lebih ${time.slice(1)}`
          : `${PHASE_LABEL[pomo.phase]}: ${time} tersisa`
      }
      className="flex h-8 items-center justify-center gap-2 px-3.5 text-[13px] font-semibold tabular-nums"
    >
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${pomo.running ? "animate-pulse" : ""}`}
        style={{ backgroundColor: color }}
      />
      <span className="text-notch-muted">{PHASE_LABEL[pomo.phase]}</span>
      <span style={pomo.overtime ? { color } : undefined}>{time}</span>
    </button>
  );
}

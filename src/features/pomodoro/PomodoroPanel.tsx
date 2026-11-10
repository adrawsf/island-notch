import { Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import type { TabPanelProps } from "../../app/tabs/types";
import { updateSetting, type AppSettings } from "../../core/settings/settings";
import { useSettings } from "../../core/settings/useSettings";
import {
  formatCountdown,
  pause,
  PHASE_COLOR,
  PHASE_LABEL,
  phaseDurationMs,
  reset,
  skip,
  start,
  usePomodoro,
  useRemainingMs,
} from "./pomodoroStore";

const RING_RADIUS = 44;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/** Pomodoro tab: progress ring, controls and phase lengths. */
export default function PomodoroPanel(_props: TabPanelProps) {
  const pomo = usePomodoro();
  const left = useRemainingMs(pomo);
  const progress = 1 - left / phaseDurationMs(pomo.phase);
  const color = PHASE_COLOR[pomo.phase];

  return (
    <div className="flex items-center gap-6">
      <div className="relative h-[88px] w-[88px] shrink-0">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden>
          <circle cx="50" cy="50" r={RING_RADIUS} fill="none" strokeWidth="6" className="stroke-notch-fg/10" />
          <circle
            cx="50"
            cy="50"
            r={RING_RADIUS}
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            stroke={color}
            strokeDasharray={RING_LENGTH}
            strokeDashoffset={RING_LENGTH * (1 - Math.min(1, Math.max(0, progress)))}
            style={{ transition: "stroke-dashoffset 250ms linear" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-semibold tabular-nums tracking-tight">{formatCountdown(left)}</span>
          <span className="text-[10px] font-medium" style={{ color }}>
            {PHASE_LABEL[pomo.phase]}
          </span>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={pomo.running ? pause : start}
            className="flex h-10 items-center gap-2 rounded-full px-5 text-sm font-semibold text-white shadow-[inset_0_1px_0.5px_rgba(255,255,255,0.5),0_4px_12px_-2px_rgba(0,0,0,0.35)] transition-[opacity,transform] hover:opacity-90 active:scale-95"
            style={{ backgroundColor: color }}
          >
            {pomo.running ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
            {pomo.running ? "Jeda" : pomo.started ? "Lanjut" : "Mulai"}
          </button>
          <button
            type="button"
            onClick={skip}
            className="glass-button flex h-10 w-10 items-center justify-center rounded-full text-notch-muted hover:text-notch-fg"
            aria-label="Lewati fase"
            title="Lewati fase"
          >
            <SkipForward size={17} />
          </button>
          <button
            type="button"
            onClick={reset}
            className="glass-button flex h-10 w-10 items-center justify-center rounded-full text-notch-muted hover:text-notch-fg"
            aria-label="Ulang dari awal"
            title="Ulang dari awal"
          >
            <RotateCcw size={16} />
          </button>
        </div>
        <div className="text-xs text-notch-muted">
          {pomo.completedFocus > 0 ? `${pomo.completedFocus} sesi fokus selesai` : "Belum ada sesi fokus selesai"}
        </div>
      </div>
      <DurationSettings />
    </div>
  );
}

const DURATIONS: { key: keyof AppSettings; label: string }[] = [
  { key: "pomodoroFocusMin", label: "Fokus" },
  { key: "pomodoroShortBreakMin", label: "Rehat" },
  { key: "pomodoroLongBreakMin", label: "Panjang" },
];

/** Phase lengths in minutes; invalid input is ignored by the settings validator. */
function DurationSettings() {
  const settings = useSettings();
  return (
    <div className="flex shrink-0 flex-col items-end gap-1.5 text-xs text-notch-muted" title="Durasi dalam menit">
      {DURATIONS.map(({ key, label }) => (
        <label key={key} className="flex items-center gap-1.5">
          {label}
          <input
            type="number"
            min={1}
            max={180}
            value={settings[key] as number}
            onChange={(e) => updateSetting(key, Number(e.target.value) as never)}
            className="glass-well h-6 w-11 rounded-full px-1.5 text-center text-notch-fg outline-none [appearance:textfield]"
          />
        </label>
      ))}
    </div>
  );
}

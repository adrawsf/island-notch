import { ChevronsRight, Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import type { TabPanelProps } from "../../app/tabs/types";
import { updateSetting } from "../../core/settings/settings";
import { useSettings } from "../../core/settings/useSettings";
import { Stepper } from "../../shared/ui/Stepper";
import { AmbiencePicker } from "./ambience/AmbiencePicker";
import {
  formatCountdown,
  formatOvertime,
  pause,
  PHASE_COLOR,
  PHASE_LABEL,
  phaseDurationMs,
  proceed,
  reset,
  skip,
  start,
  upcomingPhase,
  usePomodoro,
  useTimer,
} from "./pomodoroStore";

const RING_RADIUS = 44;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/** Pomodoro tab: progress ring, controls, phase lengths and focus ambience. */
export default function PomodoroPanel(_props: TabPanelProps) {
  const pomo = usePomodoro();
  const { pomodoroAutoAdvance } = useSettings();
  const { remaining, overtime } = useTimer(pomo);
  const progress = pomo.overtime ? 1 : 1 - remaining / phaseDurationMs(pomo.phase);
  const color = PHASE_COLOR[pomo.phase];
  const next = upcomingPhase(pomo);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-6">
        <div className="relative h-[88px] w-[88px] shrink-0">
          <svg
            viewBox="0 0 100 100"
            className={`h-full w-full -rotate-90 ${pomo.overtime ? "animate-pulse" : ""}`}
            aria-hidden
          >
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
            <span className="text-xl font-semibold tabular-nums tracking-tight" style={pomo.overtime ? { color } : undefined}>
              {pomo.overtime ? formatOvertime(overtime) : formatCountdown(remaining)}
            </span>
            <span className="text-[10px] font-medium" style={{ color }}>
              {pomo.overtime ? "Lebih waktu" : PHASE_LABEL[pomo.phase]}
            </span>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex items-center gap-2">
            {pomo.overtime ? (
              <button
                type="button"
                onClick={proceed}
                className="flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-white shadow-[inset_0_1px_0.5px_rgba(255,255,255,0.5),0_4px_12px_-2px_rgba(0,0,0,0.35)] transition-[opacity,transform] hover:opacity-90 active:scale-95"
                style={{ backgroundColor: PHASE_COLOR[next] }}
                data-tip={`Mulai ${PHASE_LABEL[next].toLowerCase()} sekarang`}
              >
                <ChevronsRight size={17} />
                Lanjut: {next === "focus" ? "Fokus" : "Istirahat"}
              </button>
            ) : (
              <button
                type="button"
                onClick={pomo.running ? pause : start}
                className="flex h-10 items-center gap-2 rounded-full px-5 text-sm font-semibold text-white shadow-[inset_0_1px_0.5px_rgba(255,255,255,0.5),0_4px_12px_-2px_rgba(0,0,0,0.35)] transition-[opacity,transform] hover:opacity-90 active:scale-95"
                style={{ backgroundColor: color }}
              >
                {pomo.running ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                {pomo.running ? "Jeda" : pomo.started ? "Lanjutkan" : "Mulai"}
              </button>
            )}
            {!pomo.overtime && (
              <button
                type="button"
                onClick={skip}
                className="glass-button flex h-10 w-10 items-center justify-center rounded-full text-notch-muted hover:text-notch-fg"
                aria-label="Lewati fase"
                data-tip="Lewati fase"
              >
                <SkipForward size={17} />
              </button>
            )}
            <button
              type="button"
              onClick={reset}
              className="glass-button flex h-10 w-10 items-center justify-center rounded-full text-notch-muted hover:text-notch-fg"
              aria-label="Ulang dari awal"
              data-tip="Ulang dari awal"
            >
              <RotateCcw size={16} />
            </button>
          </div>
          <div className="flex items-center gap-3 text-xs text-notch-muted">
            <span className="min-w-0 truncate">
              {pomo.completedFocus} sesi selesai
            </span>
            <Switch
              checked={pomodoroAutoAdvance}
              onChange={(v) => updateSetting("pomodoroAutoAdvance", v)}
              label="Otomatis lanjut"
              tip={
                pomodoroAutoAdvance
                  ? "Fase berikutnya mulai sendiri saat waktu habis"
                  : "Saat waktu habis, kelebihannya dihitung sampai kamu klik Lanjut"
              }
            />
          </div>
        </div>
        <DurationSettings />
      </div>
      <div className="glass-well rounded-full px-3 py-1">
        <AmbiencePicker />
      </div>
    </div>
  );
}

/** Small glass toggle switch with a label. */
function Switch({
  checked,
  onChange,
  label,
  tip,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  tip: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex shrink-0 items-center gap-1.5 text-xs text-notch-muted hover:text-notch-fg"
      data-tip={tip}
    >
      <span
        className={`relative h-4 w-7 rounded-full transition-colors ${checked ? "bg-notch-accent" : "glass-well"}`}
        aria-hidden
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-[left] duration-200 ${
            checked ? "left-[14px]" : "left-0.5"
          }`}
        />
      </span>
      {label}
    </button>
  );
}

const DURATIONS: { key: "pomodoroFocusMin" | "pomodoroShortBreakMin" | "pomodoroLongBreakMin"; label: string; name: string }[] = [
  { key: "pomodoroFocusMin", label: "Fokus", name: "Durasi fokus (menit)" },
  { key: "pomodoroShortBreakMin", label: "Rehat", name: "Durasi istirahat (menit)" },
  { key: "pomodoroLongBreakMin", label: "Panjang", name: "Durasi istirahat panjang (menit)" },
];

/** Phase lengths in minutes (1-180). */
function DurationSettings() {
  const settings = useSettings();
  return (
    <div className="flex shrink-0 flex-col items-end gap-1.5 text-xs text-notch-muted" data-tip="Durasi dalam menit">
      {DURATIONS.map(({ key, label, name }) => (
        <div key={key} className="flex items-center gap-2">
          {label}
          <Stepper value={settings[key]} min={1} max={180} onChange={(v) => updateSetting(key, v)} label={name} />
        </div>
      ))}
    </div>
  );
}

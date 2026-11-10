/**
 * Pomodoro timer. Lives at module level so it keeps running while the notch
 * is collapsed or another tab is open; announces phase ends with a toast.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { getSettings, subscribeSettings } from "../../core/settings/settings";
import { showToast } from "../../core/toast/toastQueue";

export type Phase = "focus" | "shortBreak" | "longBreak";

export interface PomodoroState {
  phase: Phase;
  running: boolean;
  /** The current phase has been started (running, or paused part-way). */
  started: boolean;
  /** When the running phase ends (ms epoch); null while paused. */
  endsAt: number | null;
  /** Time left while paused. */
  remainingMs: number;
  /** Focus sessions finished since the last reset. */
  completedFocus: number;
}

/** Every Nth finished focus session is followed by a long break. */
const LONG_BREAK_EVERY = 4;
const TICK_MS = 500;

export const PHASE_LABEL: Record<Phase, string> = {
  focus: "Fokus",
  shortBreak: "Istirahat",
  longBreak: "Istirahat panjang",
};

export const PHASE_COLOR: Record<Phase, string> = {
  focus: "#ff6b5b",
  shortBreak: "#34c759",
  longBreak: "#30b0ff",
};

export function phaseDurationMs(phase: Phase): number {
  const s = getSettings();
  const min = phase === "focus" ? s.pomodoroFocusMin : phase === "shortBreak" ? s.pomodoroShortBreakMin : s.pomodoroLongBreakMin;
  return min * 60_000;
}

let state: PomodoroState = {
  phase: "focus",
  running: false,
  started: false,
  endsAt: null,
  remainingMs: phaseDurationMs("focus"),
  completedFocus: 0,
};
let ticker: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function set(next: PomodoroState) {
  state = next;
  if (state.running && !ticker) ticker = setInterval(tick, TICK_MS);
  if (!state.running && ticker) {
    clearInterval(ticker);
    ticker = null;
  }
  listeners.forEach((l) => l());
}

function tick() {
  if (state.running && state.endsAt !== null && Date.now() >= state.endsAt) finishPhase();
}

function nextPhase(completedFocus: number, phase: Phase): Phase {
  if (phase !== "focus") return "focus";
  return completedFocus % LONG_BREAK_EVERY === 0 ? "longBreak" : "shortBreak";
}

/** Moves to the next phase, paused, so the user decides when it starts. */
function finishPhase() {
  const completedFocus = state.completedFocus + (state.phase === "focus" ? 1 : 0);
  const phase = nextPhase(completedFocus, state.phase);
  const minutes = Math.round(phaseDurationMs(phase) / 60_000);
  showToast(
    state.phase === "focus"
      ? { title: "Sesi fokus selesai", body: `Waktunya ${PHASE_LABEL[phase].toLowerCase()} ${minutes} menit`, durationMs: 8000 }
      : { title: "Istirahat selesai", body: `Siap fokus ${minutes} menit lagi?`, durationMs: 8000 },
  );
  set({ phase, running: false, started: false, endsAt: null, remainingMs: phaseDurationMs(phase), completedFocus });
}

export function remainingMs(s: PomodoroState, now = Date.now()): number {
  return s.running && s.endsAt !== null ? Math.max(0, s.endsAt - now) : s.remainingMs;
}


export function start() {
  if (state.running) return;
  set({ ...state, running: true, started: true, endsAt: Date.now() + state.remainingMs });
}

export function pause() {
  if (!state.running) return;
  set({ ...state, running: false, endsAt: null, remainingMs: remainingMs(state) });
}

export function skip() {
  const phase = nextPhase(state.completedFocus + (state.phase === "focus" ? 1 : 0), state.phase);
  set({
    ...state,
    phase,
    running: false,
    started: false,
    endsAt: null,
    remainingMs: phaseDurationMs(phase),
    completedFocus: state.completedFocus + (state.phase === "focus" ? 1 : 0),
  });
}

export function reset() {
  set({ phase: "focus", running: false, started: false, endsAt: null, remainingMs: phaseDurationMs("focus"), completedFocus: 0 });
}

/**
 * Settings loaded or a duration changed: a phase that has not started takes
 * the new length; a started one keeps its countdown.
 */
subscribeSettings(() => {
  const full = phaseDurationMs(state.phase);
  if (!state.started && state.remainingMs !== full) set({ ...state, remainingMs: full });
});

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePomodoro(): PomodoroState {
  return useSyncExternalStore(subscribe, () => state);
}

/** Live time left, refreshed while running. */
export function useRemainingMs(s: PomodoroState): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!s.running) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [s.running]);
  return remainingMs(s, s.running ? now : undefined);
}

/** 83_000 -> "1:23" */
export function formatCountdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

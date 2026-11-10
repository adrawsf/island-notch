/**
 * Pomodoro timer. Lives at module level so it keeps running while the notch
 * is collapsed or another tab is open; announces phase ends with a toast.
 *
 * When a phase ends it either moves on by itself (`pomodoroAutoAdvance`) or
 * keeps counting the extra time ("overtime") until the user clicks Lanjut.
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
  /** Manual mode: the phase has ended and extra time is being counted. */
  overtime: boolean;
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
  overtime: false,
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
  if (!state.running || state.endsAt === null || Date.now() < state.endsAt) return;
  if (getSettings().pomodoroAutoAdvance) {
    advance(true, "auto");
  } else if (!state.overtime) {
    // Keep running so the extra time keeps counting; the user moves on.
    const next = nextPhase(state.completedFocus + (state.phase === "focus" ? 1 : 0), state.phase);
    showToast({
      title: state.phase === "focus" ? "Sesi fokus selesai" : "Istirahat selesai",
      body: `Klik Lanjut untuk ${PHASE_LABEL[next].toLowerCase()} · waktu lebih dihitung`,
      durationMs: 8000,
    });
    set({ ...state, overtime: true });
  }
}

function nextPhase(completedFocus: number, phase: Phase): Phase {
  if (phase !== "focus") return "focus";
  return completedFocus % LONG_BREAK_EVERY === 0 ? "longBreak" : "shortBreak";
}

/**
 * Moves to the next phase. `autoStart` runs it immediately; otherwise it waits
 * paused. `reason` "auto" announces the change with a toast.
 */
function advance(autoStart: boolean, reason: "auto" | "user") {
  const completedFocus = state.completedFocus + (state.phase === "focus" ? 1 : 0);
  const phase = nextPhase(completedFocus, state.phase);
  const duration = phaseDurationMs(phase);
  if (reason === "auto") {
    const minutes = Math.round(duration / 60_000);
    showToast({
      title: state.phase === "focus" ? "Sesi fokus selesai" : "Istirahat selesai",
      body: `${PHASE_LABEL[phase]} ${minutes} menit dimulai`,
      durationMs: 6000,
    });
  }
  set({
    phase,
    running: autoStart,
    started: autoStart,
    endsAt: autoStart ? Date.now() + duration : null,
    remainingMs: duration,
    completedFocus,
    overtime: false,
  });
}

export function remainingMs(s: PomodoroState, now = Date.now()): number {
  return s.running && s.endsAt !== null ? Math.max(0, s.endsAt - now) : s.remainingMs;
}

/** Extra time past the end of the phase (manual mode), 0 otherwise. */
export function overtimeMs(s: PomodoroState, now = Date.now()): number {
  return s.overtime && s.endsAt !== null ? Math.max(0, now - s.endsAt) : 0;
}

/** The phase that comes after the current one. */
export function upcomingPhase(s: PomodoroState): Phase {
  return nextPhase(s.completedFocus + (s.phase === "focus" ? 1 : 0), s.phase);
}

export function start() {
  if (state.running) return;
  set({ ...state, running: true, started: true, endsAt: Date.now() + state.remainingMs });
}

export function pause() {
  // In overtime the phase is over; "pausing" would just lose the count.
  if (!state.running || state.overtime) return;
  set({ ...state, running: false, endsAt: null, remainingMs: remainingMs(state) });
}

/** Overtime: end this phase and start the next one now. */
export function proceed() {
  advance(true, "user");
}

/** Skips to the next phase; it starts right away if auto-advance is on and the timer was running. */
export function skip() {
  advance(getSettings().pomodoroAutoAdvance && state.running, "user");
}

export function reset() {
  set({
    phase: "focus",
    running: false,
    started: false,
    endsAt: null,
    remainingMs: phaseDurationMs("focus"),
    completedFocus: 0,
    overtime: false,
  });
}

/**
 * Settings loaded or a duration changed: a phase that has not started takes
 * the new length; a started one keeps its countdown.
 */
subscribeSettings(() => {
  const full = phaseDurationMs(state.phase);
  if (!state.started && state.remainingMs !== full) set({ ...state, remainingMs: full });
});

/** Current state, for non-React code (e.g. the ambience controller). */
export function getPomodoro(): PomodoroState {
  return state;
}

export function subscribePomodoro(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePomodoro(): PomodoroState {
  return useSyncExternalStore(subscribePomodoro, () => state);
}

/** Live time left and overtime, refreshed while running. */
export function useTimer(s: PomodoroState): { remaining: number; overtime: number } {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!s.running) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [s.running]);
  const at = s.running ? now : undefined;
  return { remaining: remainingMs(s, at), overtime: overtimeMs(s, at) };
}

/** Live time left, refreshed while running. */
export function useRemainingMs(s: PomodoroState): number {
  return useTimer(s).remaining;
}

/** 83_000 -> "1:23" */
export function formatCountdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Overtime counts up from the end, so it floors: 83_400 -> "1:23". */
export function formatOvertime(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `+${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

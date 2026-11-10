/**
 * Ambience playback for focus sessions. One AudioContext, one sound at a
 * time; switching sounds crossfades. The controller plays the chosen sound
 * while a focus phase is running and fades it out otherwise.
 */
import { getSettings, subscribeSettings } from "../../../core/settings/settings";
import { getPomodoro, subscribePomodoro } from "../pomodoroStore";
import { buildAmbience, type AmbienceId } from "./sounds";

const FADE_S = 1.2;
const PREVIEW_MS = 3000;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let current: { id: AmbienceId; out: GainNode; stop: () => void } | null = null;
let previewTimer: ReturnType<typeof setTimeout> | null = null;

function audio(): { ctx: AudioContext; master: GainNode } {
  if (!ctx || !master) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return { ctx, master };
}

/** Perceived loudness is roughly logarithmic; square the slider value. */
function setMasterVolume(volume: number) {
  const { ctx, master } = audio();
  master.gain.setTargetAtTime(Math.max(0, Math.min(1, volume)) ** 2, ctx.currentTime, 0.05);
}

function fadeOutCurrent() {
  if (!current || !ctx) return;
  const { out, stop } = current;
  const now = ctx.currentTime;
  out.gain.cancelScheduledValues(now);
  out.gain.setValueAtTime(out.gain.value, now);
  out.gain.linearRampToValueAtTime(0, now + FADE_S);
  setTimeout(() => {
    stop();
    out.disconnect();
  }, FADE_S * 1000 + 100);
  current = null;
}

function play(id: AmbienceId) {
  if (current?.id === id) return;
  const { ctx, master } = audio();
  setMasterVolume(getSettings().ambienceVolume);
  fadeOutCurrent();
  const out = ctx.createGain();
  out.gain.setValueAtTime(0, ctx.currentTime);
  out.gain.linearRampToValueAtTime(1, ctx.currentTime + FADE_S);
  out.connect(master);
  current = { id, out, stop: buildAmbience(ctx, id, out) };
}

/** What should be playing right now, according to the timer and settings. */
function wanted(): AmbienceId | null {
  const { ambienceSound } = getSettings();
  const pomo = getPomodoro();
  return ambienceSound !== "none" && pomo.running && pomo.phase === "focus" ? ambienceSound : null;
}

function sync() {
  if (previewTimer) return; // a preview is playing; it syncs when it ends
  const id = wanted();
  if (id) play(id);
  else fadeOutCurrent();
}

/** Plays `id` for a few seconds so it can be heard while picking. */
export function previewAmbience(id: AmbienceId): void {
  if (wanted()) return; // already audible through the session
  if (previewTimer) clearTimeout(previewTimer);
  play(id);
  previewTimer = setTimeout(() => {
    previewTimer = null;
    sync();
  }, PREVIEW_MS);
}

let started = false;

/** Starts following the pomodoro timer. Call once from the notch window. */
export function startAmbienceController(): void {
  if (started) return;
  started = true;
  let lastVolume = getSettings().ambienceVolume;
  const onChange = () => {
    const { ambienceVolume } = getSettings();
    // Only touch audio once it exists; play() applies the volume on start.
    if (ctx && ambienceVolume !== lastVolume) setMasterVolume(ambienceVolume);
    lastVolume = ambienceVolume;
    sync();
  };
  subscribePomodoro(onChange);
  subscribeSettings(onChange);
  onChange();
}

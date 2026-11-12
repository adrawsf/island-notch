/**
 * Hourly chime: two soft synthesized bell notes on the hour, silent during
 * the quiet hours. The controller runs in the notch window only.
 */
import { getSettings } from "../../core/settings/settings";

const CHECK_MS = 10_000;

let ctx: AudioContext | null = null;

function audio(): AudioContext {
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

/** One bell-like note: a sine with a soft overtone and a long decay. */
function bell(ac: AudioContext, freq: number, at: number, gain: number) {
  const out = ac.createGain();
  out.gain.setValueAtTime(0, at);
  out.gain.linearRampToValueAtTime(gain, at + 0.01);
  out.gain.exponentialRampToValueAtTime(0.0001, at + 2.2);
  out.connect(ac.destination);
  for (const [mult, level] of [
    [1, 1],
    [2.76, 0.18],
    [5.4, 0.05],
  ]) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = "sine";
    osc.frequency.value = freq * mult;
    g.gain.value = level;
    osc.connect(g).connect(out);
    osc.start(at);
    osc.stop(at + 2.3);
  }
}

/** Plays the chime now (also used by the "test" button in settings). */
export function playChime(): void {
  try {
    const ac = audio();
    const t = ac.currentTime + 0.05;
    bell(ac, 1046.5, t, 0.16); // C6
    bell(ac, 784, t + 0.32, 0.14); // G5
  } catch (err) {
    console.error("[chime] play failed", err);
  }
}

/** True when `hour` falls in [start, end), wrapping past midnight when start > end. */
export function isQuietHour(hour: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

let started = false;

/** Starts chiming on the hour. Call once from the notch window. */
export function startChimeController(): void {
  if (started) return;
  started = true;
  // The hour already chimed (or the one we started in, so launching at 10.00:30 stays quiet).
  let lastHour = new Date().getHours();
  setInterval(() => {
    const now = new Date();
    const hour = now.getHours();
    if (hour === lastHour) return;
    lastHour = hour;
    // Only right on the hour: after sleep/hibernate the first check may be much later.
    if (now.getMinutes() !== 0) return;
    const s = getSettings();
    if (!s.hourlyChime) return;
    if (s.chimeQuietHours && isQuietHour(hour, s.chimeQuietStart, s.chimeQuietEnd)) return;
    playChime();
  }, CHECK_MS);
}

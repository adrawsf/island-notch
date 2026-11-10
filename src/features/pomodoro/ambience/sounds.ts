/**
 * Ambient sounds synthesised with Web Audio: no audio files, seamless loops.
 * Each sound builds its graph into `out` and returns a stop function.
 */

export type AmbienceId = "rain" | "ocean" | "fire" | "wind" | "brown" | "pink" | "white";

export type NoiseColor = "white" | "pink" | "brown";

/** Seconds of noise per buffer; long enough that the loop is not audible. */
const NOISE_SECONDS = 8;
const noiseCache = new Map<NoiseColor, AudioBuffer>();

/** A stereo noise buffer (each channel independent, for width). */
function noiseBuffer(ctx: AudioContext, color: NoiseColor): AudioBuffer {
  const cached = noiseCache.get(color);
  if (cached && cached.sampleRate === ctx.sampleRate) return cached;
  const length = NOISE_SECONDS * ctx.sampleRate;
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    // Pink: Paul Kellet's refined filter. Brown: leaky integrator.
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      if (color === "white") {
        data[i] = white * 0.5;
      } else if (color === "pink") {
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.969 * b2 + white * 0.153852;
        b3 = 0.8665 * b3 + white * 0.3104856;
        b4 = 0.55 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.016898;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      } else {
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      }
    }
    // Crossfade the ends so the loop point is inaudible.
    const fade = Math.floor(ctx.sampleRate * 0.05);
    for (let i = 0; i < fade; i++) {
      const t = i / fade;
      data[length - fade + i] = data[length - fade + i] * (1 - t) + data[i] * t;
    }
  }
  noiseCache.set(color, buffer);
  return buffer;
}

function noiseSource(ctx: AudioContext, color: NoiseColor): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, color);
  src.loop = true;
  // Random start so layered sources never line up.
  src.start(0, Math.random() * NOISE_SECONDS);
  return src;
}

function filter(ctx: AudioContext, type: BiquadFilterType, frequency: number, q = 0.7): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = frequency;
  f.Q.value = q;
  return f;
}

function gain(ctx: AudioContext, value: number): GainNode {
  const g = ctx.createGain();
  g.gain.value = value;
  return g;
}

/** A slow sine LFO added onto `param` (value ± depth). */
function lfo(ctx: AudioContext, param: AudioParam, rateHz: number, depth: number): OscillatorNode {
  const osc = ctx.createOscillator();
  osc.frequency.value = rateHz;
  const amount = gain(ctx, depth);
  osc.connect(amount).connect(param);
  osc.start();
  return osc;
}

/**
 * Short filtered noise bursts at random intervals (raindrops, fire crackles).
 * Returns a function that stops the scheduler.
 */
function sprinkle(
  ctx: AudioContext,
  out: AudioNode,
  opts: { perSecond: number; minHz: number; maxHz: number; length: number; level: number },
): () => void {
  const burst = noiseBuffer(ctx, "white");
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  const schedule = () => {
    if (stopped) return;
    // Schedule a small batch ahead so timer jitter is not audible.
    const now = ctx.currentTime;
    for (let i = 0; i < Math.max(1, Math.round(opts.perSecond / 4)); i++) {
      const at = now + Math.random() * 0.25;
      const src = ctx.createBufferSource();
      src.buffer = burst;
      const band = filter(ctx, "bandpass", opts.minHz + Math.random() * (opts.maxHz - opts.minHz), 6);
      const env = ctx.createGain();
      const peak = opts.level * (0.3 + Math.random() * 0.7);
      env.gain.setValueAtTime(0, at);
      env.gain.linearRampToValueAtTime(peak, at + 0.002);
      env.gain.exponentialRampToValueAtTime(0.0001, at + opts.length * (0.5 + Math.random()));
      src.connect(band).connect(env).connect(out);
      src.start(at, Math.random() * (NOISE_SECONDS - 1), opts.length * 2);
    }
    timer = setTimeout(schedule, 250);
  };
  schedule();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

type Stop = () => void;

function build(ctx: AudioContext, id: AmbienceId, out: AudioNode): Stop {
  const sources: AudioScheduledSourceNode[] = [];
  const stops: Stop[] = [];
  const add = <T extends AudioScheduledSourceNode>(n: T) => (sources.push(n), n);

  switch (id) {
    case "white":
    case "pink":
    case "brown": {
      const level = id === "white" ? 0.3 : id === "pink" ? 0.5 : 0.45;
      add(noiseSource(ctx, id)).connect(gain(ctx, level)).connect(out);
      break;
    }
    case "rain": {
      // Steady hiss of rain + low patter + individual drops.
      add(noiseSource(ctx, "pink"))
        .connect(filter(ctx, "highpass", 500))
        .connect(filter(ctx, "lowpass", 7000))
        .connect(gain(ctx, 0.6))
        .connect(out);
      add(noiseSource(ctx, "brown")).connect(filter(ctx, "lowpass", 400)).connect(gain(ctx, 0.25)).connect(out);
      stops.push(sprinkle(ctx, out, { perSecond: 40, minHz: 2500, maxHz: 7000, length: 0.03, level: 0.12 }));
      break;
    }
    case "ocean": {
      // Low surf whose volume and brightness swell like waves (~9 s period).
      const swell = gain(ctx, 0.3);
      const tone = filter(ctx, "lowpass", 700);
      add(lfo(ctx, swell.gain, 0.11, 0.22));
      add(lfo(ctx, tone.frequency, 0.11, 450));
      add(noiseSource(ctx, "brown")).connect(tone).connect(swell).connect(out);
      const foam = gain(ctx, 0.08);
      add(lfo(ctx, foam.gain, 0.11, 0.07));
      add(noiseSource(ctx, "pink")).connect(filter(ctx, "highpass", 2000)).connect(foam).connect(out);
      break;
    }
    case "fire": {
      // Warm roar + random crackles and pops.
      const roar = gain(ctx, 0.5);
      add(lfo(ctx, roar.gain, 0.3, 0.12));
      add(noiseSource(ctx, "brown")).connect(filter(ctx, "lowpass", 350)).connect(roar).connect(out);
      stops.push(sprinkle(ctx, out, { perSecond: 14, minHz: 1500, maxHz: 6000, length: 0.015, level: 0.5 }));
      stops.push(sprinkle(ctx, out, { perSecond: 3, minHz: 300, maxHz: 900, length: 0.06, level: 0.35 }));
      break;
    }
    case "wind": {
      // Band of noise whose pitch and strength drift slowly.
      const band = filter(ctx, "bandpass", 500, 1.2);
      const gust = gain(ctx, 0.85);
      add(lfo(ctx, band.frequency, 0.07, 300));
      add(lfo(ctx, gust.gain, 0.05, 0.4));
      add(noiseSource(ctx, "pink")).connect(band).connect(gust).connect(out);
      add(noiseSource(ctx, "brown")).connect(filter(ctx, "lowpass", 200)).connect(gain(ctx, 0.2)).connect(out);
      break;
    }
  }

  return () => {
    stops.forEach((s) => s());
    sources.forEach((s) => {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    });
  };
}

export const AMBIENCE_SOUNDS: { id: AmbienceId; label: string }[] = [
  { id: "rain", label: "Hujan" },
  { id: "ocean", label: "Ombak" },
  { id: "fire", label: "Api unggun" },
  { id: "wind", label: "Angin" },
  { id: "brown", label: "Brown noise" },
  { id: "pink", label: "Pink noise" },
  { id: "white", label: "White noise" },
];

export { build as buildAmbience };

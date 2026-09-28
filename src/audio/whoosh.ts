/** The sound effects there are. */
export type SfxName = 'travel' | 'transitionOut' | 'transitionIn';

export const SFX_NAMES: readonly SfxName[] = ['travel', 'transitionOut', 'transitionIn'];

export interface SfxOptions {
  /** Galaxy travel: the trip's cruise time (distance / max speed); longer trips whoosh longer. */
  seconds?: number;
}

/**
 * One whoosh: band-passed noise whose centre frequency sweeps from → peak → to,
 * under a gain envelope (fast attack, long release), panned across the
 * stereo field, with a low oscillator "body" underneath.
 */
export interface WhooshSpec {
  /** Seconds (galaxy travel: the length for a zero-length trip). */
  duration: number;
  /** Galaxy travel only: the duration is clamped to [minDuration, maxDuration]. */
  minDuration: number;
  maxDuration: number;
  /** Band-pass centre, Hz, at the start, peak and end. */
  from: number;
  peak: number;
  to: number;
  /** When the sweep peaks, as a fraction of the duration. */
  peakAt: number;
  /** Band-pass Q (~1 = broad and breathy, higher = more whistly). */
  q: number;
  /** Seconds to reach full level. */
  attack: number;
  /** Release curve exponent: higher fades faster after the peak. */
  release: number;
  /** Noise gain at the envelope's peak. */
  level: number;
  /** Body oscillator frequency, Hz, start → end, and its gain at the peak. */
  bodyFrom: number;
  bodyTo: number;
  bodyLevel: number;
  /** Stereo position, -1 (left) … 1 (right), start → end. */
  panFrom: number;
  panTo: number;
}

/**
 * Tunables per effect (bound to the 'Sound FX' debug folder). Levels are
 * set so a whoosh peaks ~3 dB above the music + ambience (short-term RMS,
 * default volumes): noticeable, not startling.
 */
export const sfxParams: Record<SfxName, WhooshSpec> = {
  // A long pass-by: rises as the ship sets off, falls away as it cruises.
  travel: {
    duration: 1.4,
    minDuration: 1.6,
    maxDuration: 4.5,
    from: 160,
    peak: 1300,
    to: 220,
    peakAt: 0.3,
    q: 0.9,
    attack: 0.3,
    release: 1.6,
    level: 1.05,
    bodyFrom: 75,
    bodyTo: 38,
    bodyLevel: 0.22,
    panFrom: -0.7,
    panTo: 0.7,
  },
  // Zooming out: the sweep rises as the view pulls away.
  transitionOut: {
    duration: 1.3,
    minDuration: 1.3,
    maxDuration: 1.3,
    from: 200,
    peak: 1900,
    to: 1300,
    peakAt: 0.7,
    q: 1.1,
    attack: 0.5,
    release: 1.2,
    level: 1.4,
    bodyFrom: 55,
    bodyTo: 90,
    bodyLevel: 0.16,
    panFrom: -0.35,
    panTo: 0.35,
  },
  // Zooming in: the mirror image, falling as the view dives in.
  transitionIn: {
    duration: 1.4,
    minDuration: 1.4,
    maxDuration: 1.4,
    from: 1500,
    peak: 1900,
    to: 260,
    peakAt: 0.15,
    q: 1.1,
    attack: 0.15,
    release: 1.4,
    level: 0.95,
    bodyFrom: 90,
    bodyTo: 40,
    bodyLevel: 0.2,
    panFrom: 0.35,
    panTo: -0.35,
  },
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smooth = (u: number) => u * u * (3 - 2 * u);
const logLerp = (a: number, b: number, u: number) => a * Math.pow(b / a, u);

/** Length of a whoosh in seconds. Galaxy travel grows with the trip, capped. */
export function whooshDuration(spec: WhooshSpec, opts: SfxOptions = {}): number {
  const base = spec.duration + Math.max(0, opts.seconds ?? 0);
  return clamp(base, spec.minDuration, Math.max(spec.minDuration, spec.maxDuration));
}

/** Envelope (0–1) at time `t` of a whoosh `duration` long: silent at both ends, 1 at the attack. */
export function whooshEnvelope(spec: WhooshSpec, duration: number, t: number): number {
  if (t <= 0 || t >= duration) return 0;
  const attack = Math.min(spec.attack, duration * 0.4);
  if (t < attack) return Math.sin((Math.PI / 2) * (t / attack)) ** 2;
  const u = (t - attack) / (duration - attack);
  return Math.pow(1 - u, spec.release);
}

/** Band-pass centre (Hz) at time `t`: from → peak (at peakAt) → to, eased and in log space. */
export function whooshFrequency(spec: WhooshSpec, duration: number, t: number): number {
  const u = clamp(t / duration, 0, 1);
  const p = clamp(spec.peakAt, 0, 1);
  if (u < p) return logLerp(spec.from, spec.peak, smooth(u / p));
  if (p >= 1) return spec.peak;
  return logLerp(spec.peak, spec.to, smooth((u - p) / (1 - p)));
}

export interface WhooshCurves {
  duration: number;
  /** Noise gain, band-pass frequency, body gain, body frequency and pan, sampled evenly over the duration. */
  gain: Float32Array<ArrayBuffer>;
  frequency: Float32Array<ArrayBuffer>;
  bodyGain: Float32Array<ArrayBuffer>;
  bodyFrequency: Float32Array<ArrayBuffer>;
  pan: Float32Array<ArrayBuffer>;
}

/** Automation curves for one whoosh (for `AudioParam.setValueCurveAtTime`). */
export function whooshCurves(spec: WhooshSpec, opts: SfxOptions = {}, samplesPerSecond = 100): WhooshCurves {
  const duration = whooshDuration(spec, opts);
  const n = Math.max(2, Math.ceil(duration * samplesPerSecond) + 1);
  const curves: WhooshCurves = {
    duration,
    gain: new Float32Array(n),
    frequency: new Float32Array(n),
    bodyGain: new Float32Array(n),
    bodyFrequency: new Float32Array(n),
    pan: new Float32Array(n),
  };
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const t = u * duration;
    const env = whooshEnvelope(spec, duration, t);
    curves.gain[i] = env * spec.level;
    curves.frequency[i] = whooshFrequency(spec, duration, t);
    curves.bodyGain[i] = env * spec.bodyLevel;
    curves.bodyFrequency[i] = logLerp(spec.bodyFrom, spec.bodyTo, smooth(u));
    curves.pan[i] = clamp(spec.panFrom + (spec.panTo - spec.panFrom) * u, -1, 1);
  }
  return curves;
}

/** Mixer channels, each with its own volume slider. */
export type AudioChannel = 'music' | 'ambience' | 'sfx';

/** Player-facing volume settings. Slider values are 0–1; `muted` silences everything. */
export interface AudioSettings {
  master: number;
  music: number;
  ambience: number;
  /** Sound effects (the "Effects" slider). */
  sfx: number;
  muted: boolean;
}

// The ambience track is ~8 dB louder than the music, so it starts lower to sit at the same level.
export const DEFAULT_AUDIO_SETTINGS: Readonly<AudioSettings> = {
  master: 0.8,
  music: 0.8,
  ambience: 0.5,
  sfx: 0.7,
  muted: false,
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Settings from stored JSON. Missing, malformed or out-of-range fields fall
 * back to (or are clamped towards) the defaults, so a bad value never
 * breaks audio.
 */
export function parseAudioSettings(json: string | null): AudioSettings {
  const out = { ...DEFAULT_AUDIO_SETTINGS };
  if (!json) return out;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return out;
  }
  if (typeof raw !== 'object' || raw === null) return out;
  const r = raw as Record<string, unknown>;
  for (const key of ['master', 'music', 'ambience', 'sfx'] as const) {
    const v = r[key];
    if (typeof v === 'number' && Number.isFinite(v)) out[key] = clamp01(v);
  }
  if (typeof r.muted === 'boolean') out.muted = r.muted;
  return out;
}

/** Slider position → linear gain. Squared, so the slider feels roughly even to the ear. */
export function sliderToGain(v: number): number {
  const c = clamp01(v);
  return c * c;
}

/** The linear gain a channel should play at under these settings. */
export function channelGain(s: AudioSettings, channel: AudioChannel): number {
  return s.muted ? 0 : sliderToGain(s.master) * sliderToGain(s[channel]);
}

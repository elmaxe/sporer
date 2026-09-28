import { describe, expect, it } from 'vitest';
import { crossfadeLoop } from '../src/audio/loop';
import { channelGain, DEFAULT_AUDIO_SETTINGS, parseAudioSettings, sliderToGain } from '../src/audio/settings';
import {
  SFX_NAMES,
  sfxParams,
  whooshCurves,
  whooshDuration,
  whooshEnvelope,
  whooshFrequency,
  type WhooshSpec,
} from '../src/audio/whoosh';

describe('parseAudioSettings', () => {
  it('falls back to the defaults for missing or broken input', () => {
    expect(parseAudioSettings(null)).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(parseAudioSettings('not json')).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(parseAudioSettings('42')).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(parseAudioSettings('null')).toEqual(DEFAULT_AUDIO_SETTINGS);
  });

  it('keeps valid fields, clamps ranges and ignores wrong types', () => {
    const s = parseAudioSettings(JSON.stringify({ master: 0.3, music: 7, ambience: 'loud', sfx: null, muted: true }));
    expect(s).toEqual({
      master: 0.3,
      music: 1,
      ambience: DEFAULT_AUDIO_SETTINGS.ambience,
      sfx: DEFAULT_AUDIO_SETTINGS.sfx,
      muted: true,
    });
    expect(parseAudioSettings('{"master": -1}').master).toBe(0);
  });

  it('round-trips through JSON', () => {
    const s = { master: 0.25, music: 0.5, ambience: 0.75, sfx: 0.4, muted: true };
    expect(parseAudioSettings(JSON.stringify(s))).toEqual(s);
  });

  it('loads settings saved before the Effects slider existed', () => {
    const old = { master: 0.25, music: 0.5, ambience: 0.75, muted: false };
    expect(parseAudioSettings(JSON.stringify(old))).toEqual({ ...old, sfx: DEFAULT_AUDIO_SETTINGS.sfx });
  });
});

describe('gains', () => {
  it('maps sliders to gain on a squared curve', () => {
    expect(sliderToGain(0)).toBe(0);
    expect(sliderToGain(0.5)).toBe(0.25);
    expect(sliderToGain(1)).toBe(1);
    expect(sliderToGain(2)).toBe(1);
  });

  it('multiplies master and channel, and mute silences', () => {
    const s = { master: 0.5, music: 1, ambience: 0.5, sfx: 0.5, muted: false };
    expect(channelGain(s, 'music')).toBeCloseTo(0.25);
    expect(channelGain(s, 'ambience')).toBeCloseTo(0.0625);
    expect(channelGain(s, 'sfx')).toBeCloseTo(0.0625);
    expect(channelGain({ ...s, muted: true }, 'music')).toBe(0);
    expect(channelGain({ ...s, muted: true }, 'sfx')).toBe(0);
  });
});

describe('crossfadeLoop', () => {
  const ramp = (n: number) => Float32Array.from({ length: n }, (_, i) => i);

  it('shortens by the overlap and leaves the rest untouched', () => {
    const [out] = crossfadeLoop([ramp(100)], 10);
    expect(out.length).toBe(90);
    for (let i = 10; i < 90; i++) expect(out[i]).toBe(i);
  });

  it('loops without a jump: the end runs into the old tail, and the head fades in', () => {
    const n = 1000;
    const k = 100;
    const src = Float32Array.from({ length: n }, (_, i) => Math.sin(i * 0.1));
    const [out] = crossfadeLoop([src], k);
    // Wrapping from out[899] (= src[899]) lands exactly on what followed it: src[900].
    expect(out[0]).toBeCloseTo(src[n - k], 6);
    // By the end of the fade it's back to the original head, joining the untouched rest.
    expect(Math.abs(out[k - 1] - src[k - 1])).toBeLessThan(0.03);
    expect(out[k]).toBe(src[k]);
  });

  it('keeps constant power across the crossfade', () => {
    // Equal-power fade: sin² + cos² = 1 at every sample.
    const k = 64;
    const [a] = crossfadeLoop([new Float32Array(2 * k).fill(1)], k);
    const [b] = crossfadeLoop([Float32Array.from({ length: 2 * k }, (_, i) => (i < k ? 1 : 0))], k);
    const [c] = crossfadeLoop([Float32Array.from({ length: 2 * k }, (_, i) => (i < k ? 0 : 1))], k);
    for (let i = 0; i < k; i++) {
      expect(b[i] ** 2 + c[i] ** 2).toBeCloseTo(1, 5);
      expect(a[i]).toBeGreaterThanOrEqual(1 - 1e-6);
    }
  });

  it('handles each channel and clamps oversized overlaps', () => {
    const out = crossfadeLoop([ramp(10), ramp(10)], 50);
    expect(out).toHaveLength(2);
    expect(out[0].length).toBe(5);
    expect(crossfadeLoop([ramp(10)], 0)[0]).toEqual(ramp(10));
  });
});

describe('whoosh', () => {
  const spec: WhooshSpec = {
    duration: 1,
    minDuration: 1.5,
    maxDuration: 4,
    from: 200,
    peak: 1600,
    to: 300,
    peakAt: 0.25,
    q: 1,
    attack: 0.2,
    release: 1.5,
    level: 1,
    bodyFrom: 80,
    bodyTo: 40,
    bodyLevel: 0.2,
    panFrom: -0.5,
    panTo: 0.5,
  };

  it('grows with the trip, within the limits', () => {
    expect(whooshDuration(spec)).toBe(1.5);
    expect(whooshDuration(spec, { seconds: 1.5 })).toBe(2.5);
    expect(whooshDuration(spec, { seconds: 100 })).toBe(4);
    expect(whooshDuration(spec, { seconds: -3 })).toBe(1.5);
    // Transitions have a fixed length.
    for (const name of ['transitionOut', 'transitionIn'] as const) {
      const s = sfxParams[name];
      expect(whooshDuration(s, { seconds: 10 })).toBe(s.duration);
    }
  });

  it('is silent at both ends and peaks at the attack', () => {
    expect(whooshEnvelope(spec, 2, 0)).toBe(0);
    expect(whooshEnvelope(spec, 2, 2)).toBe(0);
    expect(whooshEnvelope(spec, 2, 0.2)).toBeCloseTo(1);
    expect(whooshEnvelope(spec, 2, 0.1)).toBeLessThan(1);
    // Rises monotonically, then falls monotonically.
    let prev = -1;
    for (let t = 0; t <= 0.2; t += 0.01) {
      const v = whooshEnvelope(spec, 2, t);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = v;
    }
    for (let t = 0.21; t < 2; t += 0.01) {
      const v = whooshEnvelope(spec, 2, t);
      expect(v).toBeLessThanOrEqual(prev + 1e-9);
      prev = v;
    }
  });

  it('keeps the attack inside short whooshes', () => {
    expect(whooshEnvelope({ ...spec, attack: 5 }, 1, 0.4)).toBeCloseTo(1);
  });

  it('sweeps from → peak → to', () => {
    expect(whooshFrequency(spec, 2, 0)).toBeCloseTo(200);
    expect(whooshFrequency(spec, 2, 0.5)).toBeCloseTo(1600);
    expect(whooshFrequency(spec, 2, 2)).toBeCloseTo(300);
    expect(whooshFrequency({ ...spec, peakAt: 1 }, 2, 2)).toBeCloseTo(1600);
    expect(whooshFrequency({ ...spec, peakAt: 0 }, 2, 0)).toBeCloseTo(1600);
    for (let t = 0; t <= 2; t += 0.05) {
      const f = whooshFrequency(spec, 2, t);
      expect(f).toBeGreaterThanOrEqual(200 - 1e-6);
      expect(f).toBeLessThanOrEqual(1600 + 1e-6);
    }
  });

  it('zooming out sweeps up and zooming in sweeps down', () => {
    const out = sfxParams.transitionOut;
    const into = sfxParams.transitionIn;
    expect(out.to).toBeGreaterThan(out.from);
    expect(into.to).toBeLessThan(into.from);
  });

  it('builds curves that are valid automation for every effect', () => {
    for (const name of SFX_NAMES) {
      const c = whooshCurves(sfxParams[name], { seconds: 2 });
      const n = c.gain.length;
      expect(n).toBeGreaterThan(10);
      for (const curve of [c.frequency, c.bodyGain, c.bodyFrequency, c.pan]) expect(curve.length).toBe(n);
      expect(c.gain[0]).toBe(0);
      expect(c.gain[n - 1]).toBe(0);
      expect(c.bodyGain[n - 1]).toBe(0);
      expect(Math.max(...c.gain)).toBeCloseTo(sfxParams[name].level, 1);
      for (let i = 0; i < n; i++) {
        for (const curve of [c.gain, c.frequency, c.bodyGain, c.bodyFrequency, c.pan]) {
          expect(Number.isFinite(curve[i])).toBe(true);
        }
        expect(c.frequency[i]).toBeGreaterThan(20);
        expect(Math.abs(c.pan[i])).toBeLessThanOrEqual(1);
      }
    }
  });
});

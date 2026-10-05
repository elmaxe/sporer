import { describe, expect, it } from 'vitest';
import { AMBIENT_CUES, cueParams, groupCueFiles, SOUND_CUES, VariantPicker } from '../src/audio/cues';
import { starMix, starsMix, starSoundParams, type StarMix } from '../src/audio/starMix';
import { Rng } from '../src/gen/rng';
import { VENT_CUE, eruptionLoudness, ventLevel, ventPitch, ventSoundParams, ventsLevel } from '../src/audio/ventMix';
import { crossfadeLoop } from '../src/audio/loop';
import { channelGain, DEFAULT_AUDIO_SETTINGS, parseAudioSettings, sliderToGain } from '../src/audio/settings';

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

describe('groupCueFiles', () => {
  it('sorts audio files into cues by folder, ignoring anything else', () => {
    const cues = groupCueFiles({
      '../assets/audio/sfx/select/b.mp3': '/b.mp3',
      '../assets/audio/sfx/select/a.OGG': '/a.ogg',
      '../assets/audio/sfx/reentry/roar.wav': '/r.wav',
      '../assets/audio/sfx/select/notes.txt': '/notes.txt',
      '../assets/audio/sfx/unknown/x.mp3': '/x.mp3',
    });
    expect(cues.select).toEqual(['/a.ogg', '/b.mp3']);
    expect(cues.reentry).toEqual(['/r.wav']);
    expect(cues.leavePlanet).toEqual([]);
    expect(Object.keys(cues).sort()).toEqual([...SOUND_CUES].sort());
  });
});

describe('VariantPicker', () => {
  it('has nothing to pick without variants, and always the one with one', () => {
    const picker = new VariantPicker(new Rng(1));
    expect(picker.next('select', 0)).toBe(-1);
    for (let i = 0; i < 5; i++) expect(picker.next('reentry', 1)).toBe(0);
  });

  it('never repeats a variant back to back, and uses them all', () => {
    const picker = new VariantPicker(new Rng(7));
    const seen = new Set<number>();
    let last = -1;
    for (let i = 0; i < 200; i++) {
      const v = picker.next('select', 4);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(4);
      expect(v).not.toBe(last);
      seen.add(v);
      last = v;
    }
    expect(seen.size).toBe(4);
  });

  it('keeps each cue separate', () => {
    const picker = new VariantPicker(new Rng(3));
    const a = picker.next('select', 2);
    picker.next('leavePlanet', 2);
    expect(picker.next('select', 2)).toBe(1 - a);
  });
});

describe('cueParams', () => {
  it('loops exactly the travel, projectile, beam and ambient cues', () => {
    for (const cue of SOUND_CUES) {
      const spec = cueParams[cue];
      const ambient = (AMBIENT_CUES as readonly string[]).includes(cue);
      expect(spec.loop).toBe(ambient || cue === 'systemTravel' || cue === 'interstellarTravel' || cue === 'busterFlight' || cue === 'abductBeam' || cue === 'exportBeam' || cue === 'laserBeam');
      expect(spec.channel).toBe(ambient ? 'ambience' : 'sfx');
    }
  });
});

describe('starMix', () => {
  const mix = (d: number, r: number): StarMix => starMix(d, r, { near: 0, far: 0 });
  const unit = (r: number) => r + starSoundParams.scale;

  it('is all near at the surface and all far well out', () => {
    expect(mix(30, 30)).toEqual({ near: 1, far: 0 });
    const out = mix(30 + unit(30) * (starSoundParams.nearTo + 1), 30);
    expect(out.near).toBeCloseTo(0, 12);
    expect(out.far).toBeGreaterThan(0);
  });

  it('crossfades at equal power and fades with distance', () => {
    let last = Infinity;
    for (let d = 30; d < 3000; d += 10) {
      const { near, far } = mix(d, 30);
      const power = near * near + far * far;
      expect(power).toBeLessThanOrEqual(1 + 1e-12);
      expect(power).toBeLessThanOrEqual(last + 1e-12);
      last = power;
    }
    // Half strength at `reach` units up.
    const half = mix(30 + unit(30) * starSoundParams.reach, 30);
    expect(Math.hypot(half.near, half.far)).toBeCloseTo(0.5, 12);
  });

  it('sounds near from further out for a bigger star', () => {
    expect(mix(200, 90).near).toBeGreaterThan(mix(200 - 90 + 7, 7).near);
  });

  it('adds stars by power, capped at 1', () => {
    const out: StarMix = { near: 0, far: 0 };
    starsMix([30, 30], [30, 30], out);
    expect(out).toEqual({ near: 1, far: 0 });
    const one = mix(400, 30);
    starsMix([400, 400], [30, 30], out);
    expect(out.far).toBeCloseTo(Math.min(1, one.far * Math.SQRT2), 12);
    starsMix([], [], out);
    expect(out).toEqual({ near: 0, far: 0 });
  });
});

describe('ventMix', () => {
  it('is full at a vent and half a reach away, falling off as the inverse square beyond', () => {
    const peak = 20;
    const reach = Math.max(ventSoundParams.minReach, ventSoundParams.reach * peak);
    expect(ventLevel(0, peak, 1)).toBe(1);
    expect(ventLevel(reach, peak, 1)).toBeCloseTo(0.5, 10);
    expect(ventLevel(10 * reach, peak, 1) / ventLevel(20 * reach, peak, 1)).toBeCloseTo(4, 1);
    expect(ventLevel(reach, peak, 0.5)).toBeCloseTo(0.25, 10);
    // Small plumes are heard from at least minReach.
    expect(ventLevel(ventSoundParams.minReach, 0.1, 1)).toBeCloseTo(0.5, 10);
  });

  it('adds vents up without going past full', () => {
    expect(ventsLevel(0)).toBe(0);
    expect(ventsLevel(0.01)).toBeCloseTo(0.01, 3);
    expect(ventsLevel(50)).toBeLessThanOrEqual(1);
    expect(ventsLevel(2)).toBeGreaterThan(ventsLevel(1));
  });

  it('swells as an eruption starts and dies away as it ends', () => {
    expect(eruptionLoudness(-1, 10)).toBe(0);
    expect(eruptionLoudness(0, 10)).toBe(0);
    expect(eruptionLoudness(1.5, 10)).toBeGreaterThan(0.9);
    expect(eruptionLoudness(9.99, 10)).toBeLessThan(0.01);
    expect(eruptionLoudness(10, 10)).toBe(0);
  });

  it('gives every kind of vent a loop and a pitch', () => {
    for (const kind of ['cryo', 'steam', 'sulphur', 'fumarole'] as const) {
      expect((AMBIENT_CUES as readonly string[]).includes(VENT_CUE[kind])).toBe(true);
      expect(ventPitch[kind]).toBeGreaterThan(0.25);
    }
  });
});

import { hashSeed, Rng } from '../gen/rng';
import type { LoopCue, SoundCue } from './cues';
import type { SoundHandle } from './CuePlayer';
import { sfxParams, whooshCurves, type SfxName, type SfxOptions } from './whoosh';

/** Seconds of noise in the shared buffer (each play starts at a random offset into it). */
const NOISE_SECONDS = 2;
/** Scheduling lead, so the first automation point isn't already in the past. */
const LEAD = 0.02;

/** Cues that play once. */
export type OneShotCue = Exclude<SoundCue, LoopCue>;

/** Anything that can play a sound effect. Game code depends on this, not on the AudioManager. */
export interface SoundEffects {
  /** A synthesised whoosh, or a one-shot cue (a variant of its files, or its fallback whoosh). */
  play(name: SfxName | OneShotCue, opts?: SfxOptions): void;
  /** Starts a looping cue (travel) and returns the handle that fades it out. */
  start(cue: LoopCue, opts?: SfxOptions): SoundHandle;
}

/**
 * Synthesised sound effects (no audio files): every whoosh is built from
 * Web Audio nodes on demand and disconnected when it ends. Works on any
 * `BaseAudioContext`, so it can also render offline for previews.
 */
export class SfxSynth {
  private noise: AudioBuffer | null = null;
  // Only picks where in the noise each play starts; seeded like everything else.
  private readonly rng = new Rng(hashSeed('sfx'));

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly out: AudioNode,
  ) {}

  /** Starts `name` now (or at `when`, context time) and returns its length in seconds. */
  play(name: SfxName, opts: SfxOptions = {}, when = this.ctx.currentTime + LEAD): number {
    const { ctx } = this;
    const spec = sfxParams[name];
    const c = whooshCurves(spec, opts);

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer();
    noise.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = spec.q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const body = ctx.createOscillator();
    body.type = 'triangle';
    const bodyGain = ctx.createGain();
    bodyGain.gain.value = 0;
    const pan = ctx.createStereoPanner();

    noise.connect(band).connect(gain).connect(pan);
    body.connect(bodyGain).connect(pan);
    pan.connect(this.out);

    band.frequency.setValueCurveAtTime(c.frequency, when, c.duration);
    gain.gain.setValueCurveAtTime(c.gain, when, c.duration);
    body.frequency.setValueCurveAtTime(c.bodyFrequency, when, c.duration);
    bodyGain.gain.setValueCurveAtTime(c.bodyGain, when, c.duration);
    pan.pan.setValueCurveAtTime(c.pan, when, c.duration);

    noise.start(when, this.rng.range(0, NOISE_SECONDS));
    body.start(when);
    const end = when + c.duration + LEAD;
    noise.stop(end);
    body.stop(end);
    body.onended = () => {
      for (const node of [noise, band, gain, body, bodyGain, pan]) node.disconnect();
    };
    return c.duration;
  }

  /** Stereo white noise (decorrelated channels, for width), made once. */
  private noiseBuffer(): AudioBuffer {
    if (this.noise) return this.noise;
    const { sampleRate } = this.ctx;
    const buffer = this.ctx.createBuffer(2, NOISE_SECONDS * sampleRate, sampleRate);
    const rng = this.rng.fork('noise');
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) data[i] = rng.range(-1, 1);
    }
    return (this.noise = buffer);
  }
}

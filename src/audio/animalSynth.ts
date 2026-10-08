import { callLength, formant, type AnimalVoice, type Syllable } from '../gen/animalVoice';

/*
 * Animal calls synthesised with Web Audio (gen/animalVoice.ts has the
 * physics): a sawtooth at the voice's pitch (the larynx's pulses; a pulse
 * train for a stridulating six-legged species) with vibrato, plus breath
 * noise, its level shaken at a low rate for a rasp, through three band-pass
 * formant filters that move as the mouth opens and closes, under each
 * syllable's envelope, panned and set to the call's loudness. Every call
 * builds its own short-lived nodes, freed when it ends.
 */

/** Where calls are synthesised into: a running context and the node they go to (the Effects channel). */
export interface SynthOutput {
  readonly ctx: BaseAudioContext;
  readonly out: AudioNode;
}

/** Relative strength and sharpness (Q) of the three formants; a little of the source goes past them for body. */
const FORMANT_GAIN = [1, 0.55, 0.3] as const;
const FORMANT_Q = [4, 6, 8] as const;
const DRY = 0.12;
/** Make-up gain after the filters, so a call's peak sits near `loudness` (measured by rendering every kind of call offline: docs/research/animal-panic-and-calls.md). */
const MAKE_UP = 2.2;
/** Seconds a syllable takes to swell and to fade. */
const ATTACK = 0.025;
const RELEASE = 0.06;
/** Lowest a formant may go as the mouth shuts (Hz): R₁ of a shut tube is 0. */
const MIN_FORMANT = 120;

const noises = new WeakMap<BaseAudioContext, AudioBuffer>();

/** A second of white noise for this context, made once (seeded: the same noise every time). */
function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let b = noises.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = b.getChannelData(0);
    let s = 0x2545f491;
    for (let i = 0; i < d.length; i++) {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      d[i] = ((s >>> 0) / 0x100000000) * 2 - 1;
    }
    noises.set(ctx, b);
  }
  return b;
}

/**
 * Plays a call (`syllables` of `voice`) into `target` at `when` (the
 * context's seconds; now if past), `gain` 0–1 overall and panned `pan`
 * (−1 left to 1 right). Returns when it ends.
 */
export function playCall(target: SynthOutput, voice: AnimalVoice, syllables: readonly Syllable[], gain: number, pan: number, when = 0): number {
  const { ctx } = target;
  const t0 = Math.max(when, ctx.currentTime + 0.01);
  const length = callLength(syllables);
  const end = t0 + length + RELEASE + 0.05;

  // The source: the larynx and the breath.
  const voiced = ctx.createOscillator();
  voiced.type = voice.buzz > 0 ? 'square' : 'sawtooth';
  const vibrato = ctx.createOscillator();
  vibrato.frequency.value = voice.vibrato;
  const vibratoDepth = ctx.createGain();
  vibratoDepth.gain.value = voice.pitch * voice.vibratoDepth;
  vibrato.connect(vibratoDepth).connect(voiced.frequency);
  const voicedLevel = ctx.createGain();
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx);
  noise.loop = true;
  const noiseLevel = ctx.createGain();
  const source = ctx.createGain();
  voiced.connect(voicedLevel).connect(source);
  noise.connect(noiseLevel).connect(source);
  // A rasp (or the stridulation's pulses): the source's level shaken at a low rate.
  const shaker = ctx.createOscillator();
  shaker.type = voice.buzz > 0 ? 'square' : 'sine';
  shaker.frequency.value = voice.buzz > 0 ? voice.buzz : 28 + voice.pitch * 0.05;
  const shake = ctx.createGain();
  shaker.connect(shake).connect(source.gain);

  // The vocal tract.
  const envelope = ctx.createGain();
  envelope.gain.value = 0;
  const filters: BiquadFilterNode[] = [];
  const levels: GainNode[] = [];
  for (let n = 0; n < 3; n++) {
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = FORMANT_Q[n]!;
    const g = ctx.createGain();
    g.gain.value = FORMANT_GAIN[n]! * MAKE_UP;
    source.connect(f).connect(g).connect(envelope);
    filters.push(f);
    levels.push(g);
  }
  const dry = ctx.createGain();
  dry.gain.value = DRY * MAKE_UP;
  source.connect(dry).connect(envelope);
  const panner = ctx.createStereoPanner();
  panner.pan.value = Math.max(-1, Math.min(1, pan));
  const out = ctx.createGain();
  out.gain.value = Math.max(0, gain);
  envelope.connect(panner).connect(out).connect(target.out);

  // Each syllable: pitch along its contour, the mouth opening and closing, the envelope.
  for (const s of syllables) {
    const a = t0 + s.start;
    const b = a + s.duration;
    const mid = a + s.duration * 0.5;
    voiced.frequency.setValueAtTime(s.pitch[0], a);
    voiced.frequency.linearRampToValueAtTime(s.pitch[1], mid);
    voiced.frequency.linearRampToValueAtTime(s.pitch[2], b);
    for (let n = 0; n < 3; n++) {
      const f = filters[n]!.frequency;
      const shut = Math.max(MIN_FORMANT, formant(n + 1, voice.tract, s.closure[0]));
      const open = Math.max(MIN_FORMANT, formant(n + 1, voice.tract, s.closure[1]));
      f.setValueAtTime(shut, a);
      f.linearRampToValueAtTime(open, mid);
      f.linearRampToValueAtTime(shut, b);
    }
    // A square wave carries more power than a sawtooth: a stridulating species's is turned down to match (measured).
    voicedLevel.gain.setValueAtTime((1 - s.breath * 0.7) * (voice.buzz > 0 ? 0.7 : 1), a);
    noiseLevel.gain.setValueAtTime(s.breath * 0.9, a);
    // The level swings between 1 − 2·depth/(1 + depth) and 1: never over the unshaken source.
    const depth = voice.buzz > 0 ? 0.9 : s.rough * 0.8;
    source.gain.setValueAtTime(1 / (1 + depth), a);
    shake.gain.setValueAtTime(depth / (1 + depth), a);
    envelope.gain.setValueAtTime(0, a);
    envelope.gain.linearRampToValueAtTime(s.loudness, a + Math.min(ATTACK, s.duration * 0.3));
    envelope.gain.setValueAtTime(s.loudness * 0.85, Math.max(a + ATTACK, b - RELEASE));
    envelope.gain.linearRampToValueAtTime(0, b);
  }

  const oscillators = [voiced, vibrato, shaker, noise];
  for (const o of oscillators) {
    o.start(t0);
    o.stop(end);
  }
  voiced.onended = () => {
    for (const node of [voiced, vibrato, vibratoDepth, voicedLevel, noise, noiseLevel, source, shaker, shake, envelope, dry, panner, out, ...filters, ...levels]) node.disconnect();
  };
  return end;
}

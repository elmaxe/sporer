import { hashSeed, Rng } from '../gen/rng';
import { cueParams, SOUND_CUES, VariantPicker, type CueSpec, type SoundCue } from './cues';
import { crossfadeLoop } from './loop';

/** A one-shot asked for before its files were decoded still plays if they're ready within this many seconds. */
const LATE_LIMIT = 0.3;
/** Scheduling lead, so a fade's first point isn't already in the past. */
const LEAD = 0.01;

/** A sound that runs until stopped (a travel loop). Stopping twice is harmless. */
export interface SoundHandle {
  stop(): void;
}

/** For when nothing is playing (audio still locked, or a cue with no files). */
export const SILENT: SoundHandle = { stop() {} };

/** Fetches each cue's files (before audio is unlocked, so they're ready sooner). */
export function fetchCueFiles(urls: Readonly<Record<SoundCue, readonly string[]>>): Record<SoundCue, Promise<ArrayBuffer>[]> {
  const out = {} as Record<SoundCue, Promise<ArrayBuffer>[]>;
  for (const cue of SOUND_CUES) {
    out[cue] = urls[cue].map((url) => {
      const data = fetch(url).then((r) => {
        if (!r.ok) throw new Error(`${url}: ${r.status}`);
        return r.arrayBuffer();
      });
      // Reported when decoded (see CuePlayer), not as an unhandled rejection if audio is never unlocked.
      data.catch(() => {});
      return data;
    });
  }
  return out;
}

/**
 * Plays the cues' audio files on an AudioContext: one-shots, and loops that
 * fade out when their handle is stopped. Each play picks a variant (see
 * `VariantPicker`). Files are decoded once the context exists; a cue whose
 * files failed to load or decode just has fewer variants.
 */
export class CuePlayer {
  private readonly buffers = {} as Record<SoundCue, AudioBuffer[] | null>;
  private readonly ready = {} as Record<SoundCue, Promise<AudioBuffer[]>>;
  // Only picks variants; seeded like everything else.
  private readonly variants = new VariantPicker(new Rng(hashSeed('sound cues')));

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly out: AudioNode,
    data: Readonly<Record<SoundCue, readonly Promise<ArrayBuffer>[]>>,
  ) {
    for (const cue of SOUND_CUES) {
      this.buffers[cue] = data[cue].length ? null : [];
      this.ready[cue] = Promise.all(data[cue].map((d) => this.decode(cue, d))).then((list) => {
        const decoded = list.filter((b): b is AudioBuffer => b !== null);
        this.buffers[cue] = decoded;
        return decoded;
      });
    }
  }

  /** How many variants of `cue` are decoded and ready (0 while they're still loading). */
  variantCount(cue: SoundCue): number {
    return this.buffers[cue]?.length ?? 0;
  }

  /**
   * Plays a variant of `cue` once and returns its length in seconds (0 if
   * its files are still decoding: it then plays as soon as they're ready,
   * if that's within `LATE_LIMIT`).
   */
  play(cue: SoundCue): number {
    const buffers = this.buffers[cue];
    if (buffers) return this.playOnce(cue, buffers);
    const asked = this.ctx.currentTime;
    void this.ready[cue].then((list) => {
      if (this.ctx.currentTime - asked <= LATE_LIMIT) this.playOnce(cue, list);
    });
    return 0;
  }

  /** Starts a variant of `cue` looping (once decoded, if it isn't yet) until the handle is stopped. */
  start(cue: SoundCue): SoundHandle {
    const loop = new CueLoop(this.ctx, this.out, cueParams[cue]);
    const begin = (list: AudioBuffer[]) => {
      const i = this.variants.next(cue, list.length);
      if (i >= 0) loop.begin(list[i]!);
    };
    const buffers = this.buffers[cue];
    if (buffers) begin(buffers);
    else void this.ready[cue].then(begin);
    return loop;
  }

  private playOnce(cue: SoundCue, buffers: AudioBuffer[]): number {
    const i = this.variants.next(cue, buffers.length);
    if (i < 0) return 0;
    const buffer = buffers[i]!;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = cueParams[cue].volume;
    source.connect(gain).connect(this.out);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
    source.start(this.ctx.currentTime + LEAD);
    return buffer.duration;
  }

  private async decode(cue: SoundCue, data: Promise<ArrayBuffer>): Promise<AudioBuffer | null> {
    try {
      const decoded = await this.ctx.decodeAudioData(await data);
      const spec = cueParams[cue];
      if (!spec.loop || spec.loopCrossfade <= 0) return decoded;
      // Loops get their tail blended into their head, so they wrap without a seam.
      const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i));
      const looped = crossfadeLoop(channels, spec.loopCrossfade * decoded.sampleRate);
      const buffer = this.ctx.createBuffer(looped.length, looped[0]!.length, decoded.sampleRate);
      looped.forEach((ch, i) => buffer.copyToChannel(ch, i));
      return buffer;
    } catch (err) {
      console.error(`Sound cue '${cue}': a file failed to load`, err);
      return null;
    }
  }
}

/** One looping cue: fades in when it begins, out when stopped. */
class CueLoop implements SoundHandle {
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private stopped = false;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly out: AudioNode,
    private readonly spec: CueSpec,
  ) {}

  begin(buffer: AudioBuffer): void {
    if (this.stopped || this.source) return;
    const { ctx, spec } = this;
    const when = ctx.currentTime + LEAD;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(spec.volume, when + Math.max(spec.fadeIn, LEAD));
    source.connect(gain).connect(this.out);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
    source.start(when);
    this.source = source;
    this.gain = gain;
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    const { source, gain } = this;
    if (!source || !gain) return;
    const now = this.ctx.currentTime;
    const fade = Math.max(this.spec.fadeOut, LEAD);
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + fade);
    source.stop(now + fade + LEAD);
  }
}

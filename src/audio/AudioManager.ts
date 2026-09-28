import musicUrl from '../assets/audio/ambient_music.mp3';
import ambienceUrl from '../assets/audio/ambient_sound.mp3';
import type { Debug } from '../core/Debug';
import { channelGain, type AudioChannel, type AudioSettings } from './settings';
import { crossfadeLoop } from './loop';
import { SfxSynth, type SoundEffects } from './sfx';
import { SFX_NAMES, sfxParams, type SfxName, type SfxOptions } from './whoosh';

/** Seconds of the ambience loop's tail blended into its head. */
const AMBIENCE_CROSSFADE = 3;
/** Fade-in when audio first starts. */
const START_FADE = 4;
/** Time constant for volume changes (smooths slider drags, avoids clicks). */
const GAIN_SMOOTHING = 0.05;

interface Mixer {
  ctx: AudioContext;
  master: GainNode;
  gains: Record<AudioChannel, GainNode>;
  sfx: SfxSynth;
}

/** The most recent sound effect (for the debug panel and the smoke test). */
export interface PlayedSfx {
  name: SfxName;
  seconds: number;
  /** How many effects have played since audio was unlocked. */
  count: number;
}

/**
 * Background music and space ambience, both looping, plus synthesised sound
 * effects (`play`), through a Web Audio mixer (one gain per channel).
 *
 * Browsers only allow audio after a user gesture, so the AudioContext is
 * created on the first pointer or key press (creating it earlier logs a
 * warning); the files are fetched up front. The music streams from a media
 * element (it's long and fades in/out on its own). The ambience is short
 * and loud at both ends, so it's decoded and crossfaded into a seamless
 * buffer loop. Audio pauses while the tab is hidden.
 *
 * Lives outside the game loop: nothing here runs per frame.
 */
export class AudioManager implements SoundEffects {
  private readonly music = new Audio(musicUrl);
  private readonly ambienceData = fetch(ambienceUrl).then((r) => r.arrayBuffer());
  private mixer: Mixer | null = null;
  private ambience: AudioBufferSourceNode | null = null;
  private disposed = false;
  private _lastPlayed: PlayedSfx | null = null;

  constructor(
    private settings: AudioSettings,
    debug: Debug,
  ) {
    this.music.loop = true;
    this.music.preload = 'auto';
    this.ambienceData.catch((err: unknown) => console.error('Ambience failed to load', err));

    window.addEventListener('pointerdown', this.onGesture, true);
    window.addEventListener('keydown', this.onGesture, true);
    document.addEventListener('visibilitychange', this.onVisibility);

    const f = debug.folder('Sound FX');
    const preview = { tripSeconds: 1 };
    f?.add(preview, 'tripSeconds', 0, 10).name('travel: trip s');
    for (const name of SFX_NAMES) {
      const sub = f?.addFolder(name).close();
      const spec = sfxParams[name];
      sub?.add({ play: () => this.play(name, { seconds: preview.tripSeconds }) }, 'play');
      sub?.add(spec, 'duration', 0.2, 5);
      if (name === 'travel') {
        sub?.add(spec, 'minDuration', 0.2, 5);
        sub?.add(spec, 'maxDuration', 0.2, 10);
      }
      for (const key of ['from', 'peak', 'to'] as const) sub?.add(spec, key, 40, 8000);
      sub?.add(spec, 'peakAt', 0, 1);
      sub?.add(spec, 'q', 0.1, 10);
      sub?.add(spec, 'attack', 0.01, 2);
      sub?.add(spec, 'release', 0.2, 5);
      sub?.add(spec, 'level', 0, 5);
      sub?.add(spec, 'bodyFrom', 20, 300);
      sub?.add(spec, 'bodyTo', 20, 300);
      sub?.add(spec, 'bodyLevel', 0, 1);
      sub?.add(spec, 'panFrom', -1, 1);
      sub?.add(spec, 'panTo', -1, 1);
    }
  }

  /** 'locked' until a user gesture has unlocked audio, then the AudioContext's state. */
  get state(): AudioContextState | 'locked' {
    return this.mixer?.ctx.state ?? 'locked';
  }

  /** The last sound effect played, or null before any. */
  get lastPlayed(): Readonly<PlayedSfx> | null {
    return this._lastPlayed;
  }

  /**
   * Plays a sound effect on the Effects channel. Does nothing until audio is
   * unlocked, or while it's suspended (tab hidden): a whoosh is only
   * meaningful right when it happens.
   */
  play(name: SfxName, opts?: SfxOptions): void {
    if (!this.mixer || this.mixer.ctx.state !== 'running') return;
    const seconds = this.mixer.sfx.play(name, opts);
    this._lastPlayed = { name, seconds, count: (this._lastPlayed?.count ?? 0) + 1 };
  }

  /** Set the channel volumes (smoothed). */
  apply(settings: AudioSettings): void {
    this.settings = settings;
    if (!this.mixer) return;
    const now = this.mixer.ctx.currentTime;
    for (const [channel, gain] of Object.entries(this.mixer.gains) as [AudioChannel, GainNode][]) {
      gain.gain.setTargetAtTime(channelGain(settings, channel), now, GAIN_SMOOTHING);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.removeGestureListeners();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.ambience?.stop();
    this.music.pause();
    this.music.removeAttribute('src');
    void this.mixer?.ctx.close();
  }

  private onGesture = (e: Event) => {
    // Script-dispatched events can't unlock audio (play() would be refused).
    if (this.mixer || !e.isTrusted) return;
    this.removeGestureListeners();

    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.connect(ctx.destination);
    master.gain.setValueAtTime(0, ctx.currentTime);
    master.gain.linearRampToValueAtTime(1, ctx.currentTime + START_FADE);

    const gains = {} as Record<AudioChannel, GainNode>;
    for (const channel of ['music', 'ambience', 'sfx'] as const) {
      const g = ctx.createGain();
      g.gain.value = channelGain(this.settings, channel);
      g.connect(master);
      gains[channel] = g;
    }
    this.mixer = { ctx, master, gains, sfx: new SfxSynth(ctx, gains.sfx) };

    ctx.createMediaElementSource(this.music).connect(gains.music);
    this.startAmbience(ctx, gains.ambience).catch((err: unknown) => console.error('Ambience failed to start', err));
    if (document.hidden) void ctx.suspend();
    else this.playMusic();
  };

  private async startAmbience(ctx: AudioContext, out: AudioNode): Promise<void> {
    const decoded = await ctx.decodeAudioData(await this.ambienceData);
    if (this.disposed) return;

    const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i));
    const looped = crossfadeLoop(channels, AMBIENCE_CROSSFADE * decoded.sampleRate);
    const buffer = ctx.createBuffer(looped.length, looped[0].length, decoded.sampleRate);
    looped.forEach((ch, i) => buffer.copyToChannel(ch, i));

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(out);
    source.start();
    this.ambience = source;
  }

  private onVisibility = () => {
    if (!this.mixer) return;
    if (document.hidden) {
      this.music.pause();
      void this.mixer.ctx.suspend();
    } else {
      void this.mixer.ctx.resume();
      this.playMusic();
    }
  };

  private playMusic(): void {
    this.music.play().catch((err: unknown) => {
      // AbortError: the tab was hidden again before playback started.
      if (!(err instanceof DOMException && err.name === 'AbortError')) console.error('Music failed to play', err);
    });
  }

  private removeGestureListeners(): void {
    window.removeEventListener('pointerdown', this.onGesture, true);
    window.removeEventListener('keydown', this.onGesture, true);
  }
}

import musicUrl from '../assets/audio/ambient_music.mp3';
import ambienceUrl from '../assets/audio/ambient_sound.mp3';
import type { Debug } from '../core/Debug';
import { channelGain, type AudioChannel, type AudioSettings } from './settings';
import { cueUrls } from './cueFiles';
import { AMBIENT_CUES, cueParams, SOUND_CUES, type AmbientCue, type LoopCue, type SoundCue } from './cues';
import { CuePlayer, fetchCueFiles, SILENT, type SoundHandle } from './CuePlayer';
import { crossfadeLoop } from './loop';
import { playbackRate, type AmbientSound, type OneShotCue, type PlayOptions, type SoundEffects } from './sfx';

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
  cues: CuePlayer;
}

/** The most recent sound cue the game asked for (for the smoke test). */
export interface PlayedSfx {
  name: SoundCue;
  /** False when the cue's folder has no files, so nothing sounded. */
  heard: boolean;
  /** The variant's length (Infinity for a loop, 0 if unheard or still loading). */
  seconds: number;
  /** How many cues have been asked for since audio was unlocked. */
  count: number;
  /** The playback rate a one-shot was asked for at (1 as recorded; loops always 1). */
  rate: number;
}

/**
 * Background music and space ambience, both looping, the ship's hum and
 * other ambient loops the game sets the level of (`ambient`, e.g. the
 * stars), plus sound effects (`play`, `start`), through a Web Audio mixer (one gain per channel). The
 * effects are sound cues from audio files (each a folder of variants, see
 * `cues.ts`); a cue whose folder is empty is silent.
 *
 * Browsers only allow audio after a user gesture, so the AudioContext is
 * created on the first pointer or key press (a touch counts as it lifts;
 * creating it earlier logs a warning); the files are fetched up front. The music streams from a media
 * element (it's long and fades in/out on its own). The ambience is short
 * and loud at both ends, so it's decoded and crossfaded into a seamless
 * buffer loop. Audio pauses while the tab is hidden.
 *
 * Lives outside the game loop: nothing here runs per frame.
 */
export class AudioManager implements SoundEffects {
  private readonly music = new Audio(musicUrl);
  private readonly ambienceData = fetch(ambienceUrl).then((r) => r.arrayBuffer());
  private readonly cueData = fetchCueFiles(cueUrls);
  private mixer: Mixer | null = null;
  private ambience: AudioBufferSourceNode | null = null;
  private disposed = false;
  private _lastPlayed: PlayedSfx | null = null;
  /** Ambient loops asked for and not stopped; started when audio unlocks if asked for before. */
  private readonly ambients = new Set<DeferredAmbient>();

  constructor(
    private settings: AudioSettings,
    debug: Debug,
  ) {
    this.music.loop = true;
    this.music.preload = 'auto';
    this.ambienceData.catch((err: unknown) => console.error('Ambience failed to load', err));

    window.addEventListener('pointerdown', this.onGesture, true);
    window.addEventListener('pointerup', this.onGesture, true);
    window.addEventListener('keydown', this.onGesture, true);
    document.addEventListener('visibilitychange', this.onVisibility);

    const c = debug.folder('Sound cues');
    for (const cue of SOUND_CUES) {
      const spec = cueParams[cue];
      const files = cueUrls[cue].length;
      const sub = c?.addFolder(`${cue} (${files} file${files === 1 ? '' : 's'})`).close();
      if ((AMBIENT_CUES as readonly string[]).includes(cue)) {
        // Played by the game at the level it sets; a volume change applies at once.
        const refresh = () => this.ambients.forEach((a) => a.refresh());
        sub?.add(spec, 'volume', 0, 3).onChange(refresh);
        sub?.add(spec, 'fadeIn', 0, 3);
        sub?.add(spec, 'fadeOut', 0, 5);
        continue;
      }
      if (spec.loop) {
        let handle: SoundHandle | null = null;
        const toggle = {
          'start / stop': () => {
            if (handle) handle.stop();
            handle = handle ? null : this.start(cue as LoopCue);
          },
        };
        sub?.add(toggle, 'start / stop');
      } else sub?.add({ play: () => this.play(cue as OneShotCue) }, 'play');
      sub?.add(spec, 'volume', 0, 3);
      if (spec.loop) {
        sub?.add(spec, 'fadeIn', 0, 3);
        sub?.add(spec, 'fadeOut', 0, 5);
      }
    }

    // The UFO's hum, always on.
    this.ambient('shipHum').setLevel(1);
  }

  /** 'locked' until a user gesture has unlocked audio, then the AudioContext's state. */
  get state(): AudioContextState | 'locked' {
    return this.mixer?.ctx.state ?? 'locked';
  }

  /** The last sound cue asked for while audio was running, or null before any. */
  get lastPlayed(): Readonly<PlayedSfx> | null {
    return this._lastPlayed;
  }

  /**
   * Plays a variant of a one-shot cue's files on the Effects channel. Does
   * nothing until audio is unlocked, or while it's suspended (tab hidden):
   * an effect is only meaningful right when it happens. `options.rate`
   * pitches it up or down (see `PlayOptions`).
   */
  play(cue: OneShotCue, options?: PlayOptions): void {
    const mixer = this.running();
    if (!mixer) return;
    const heard = cueUrls[cue].length > 0;
    const rate = playbackRate(options?.rate);
    this.played(cue, heard, heard ? mixer.cues.play(cue, rate) : 0, rate);
  }

  /**
   * Starts a looping cue, faded out when the handle is stopped. Silent (and
   * the handle does nothing) while the cue has no files, or while audio is
   * locked or suspended, like `play`.
   */
  start(cue: LoopCue): SoundHandle {
    const mixer = this.running();
    if (!mixer) return SILENT;
    const heard = cueUrls[cue].length > 0;
    this.played(cue, heard, heard ? Infinity : 0);
    return heard ? mixer.cues.start(cue) : SILENT;
  }

  /**
   * A background loop on the Ambience channel at level 0 until set. Unlike
   * `start`, it begins whenever audio is unlocked if asked for before, and
   * runs (paused with the tab) until stopped.
   */
  ambient(cue: AmbientCue): AmbientSound {
    const sound = new DeferredAmbient(cue, () => this.ambients.delete(sound));
    this.ambients.add(sound);
    if (this.mixer) sound.attach(this.mixer.cues);
    return sound;
  }

  /** The ambient loops playing and the levels they're set to (for debugging and the smoke test). */
  get ambientLevels(): { cue: AmbientCue; level: number; heard: boolean }[] {
    return [...this.ambients].map((a) => ({ cue: a.cue, level: a.level, heard: cueUrls[a.cue].length > 0 }));
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
    for (const a of [...this.ambients]) a.stop();
    this.ambience?.stop();
    this.music.pause();
    this.music.removeAttribute('src');
    void this.mixer?.ctx.close();
  }

  private running(): Mixer | null {
    return this.mixer?.ctx.state === 'running' ? this.mixer : null;
  }

  private played(name: SoundCue, heard: boolean, seconds: number, rate = 1): void {
    this._lastPlayed = { name, heard, seconds, count: (this._lastPlayed?.count ?? 0) + 1, rate };
  }

  private onGesture = (e: Event) => {
    // Script-dispatched events can't unlock audio (play() would be refused).
    if (!e.isTrusted) return;
    // Browsers count a mouse press as a user gesture, but a touch only when it lifts.
    if (e instanceof PointerEvent && (e.type === 'pointerdown') !== (e.pointerType === 'mouse')) return;
    if (this.mixer) {
      // Made on a gesture the browser didn't accept (e.g. the end of a touch drag): try again on this one.
      if (this.mixer.ctx.state === 'running') this.removeGestureListeners();
      else if (!document.hidden) {
        void this.mixer.ctx.resume();
        this.playMusic();
      }
      return;
    }

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
    const cues = new CuePlayer(ctx, gains, this.cueData);
    this.mixer = { ctx, master, gains, cues };
    for (const a of this.ambients) a.attach(cues);

    ctx.createMediaElementSource(this.music).connect(gains.music);
    this.startAmbience(ctx, gains.ambience).catch((err: unknown) => console.error('Ambience failed to start', err));
    if (document.hidden) void ctx.suspend();
    else this.playMusic();
    if (ctx.state === 'running') this.removeGestureListeners();
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
    window.removeEventListener('pointerup', this.onGesture, true);
    window.removeEventListener('keydown', this.onGesture, true);
  }
}

/**
 * An ambient loop that may be asked for before audio is unlocked: it keeps
 * the level and rate it's set to, and starts playing at them once attached
 * to the mixer's cue player.
 */
class DeferredAmbient implements AmbientSound {
  level = 0;
  private rate = 1;
  private playing: AmbientSound | null = null;
  private stopped = false;

  constructor(
    readonly cue: AmbientCue,
    private readonly onStop: () => void,
  ) {}

  attach(cues: CuePlayer): void {
    if (!this.stopped && !this.playing) this.playing = cues.ambient(this.cue, this.level, this.rate);
  }

  setLevel(level: number): void {
    this.level = Math.min(1, Math.max(0, level));
    this.playing?.setLevel(this.level);
  }

  setRate(rate: number): void {
    this.rate = rate;
    this.playing?.setRate(rate);
  }

  /** Re-applies the level (after the cue's volume changed). */
  refresh(): void {
    this.playing?.setLevel(this.level);
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.playing?.stop();
    this.onStop();
  }
}

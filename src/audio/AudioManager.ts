import musicUrl from '../assets/audio/ambient_music.mp3';
import ambienceUrl from '../assets/audio/ambient_sound.mp3';
import { channelGain, type AudioChannel, type AudioSettings } from './settings';
import { crossfadeLoop } from './loop';

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
}

/**
 * Background music and space ambience, both looping, through a Web Audio
 * mixer (one gain per channel).
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
export class AudioManager {
  private readonly music = new Audio(musicUrl);
  private readonly ambienceData = fetch(ambienceUrl).then((r) => r.arrayBuffer());
  private mixer: Mixer | null = null;
  private ambience: AudioBufferSourceNode | null = null;
  private disposed = false;

  constructor(private settings: AudioSettings) {
    this.music.loop = true;
    this.music.preload = 'auto';
    this.ambienceData.catch((err: unknown) => console.error('Ambience failed to load', err));

    window.addEventListener('pointerdown', this.onGesture, true);
    window.addEventListener('keydown', this.onGesture, true);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  /** 'locked' until a user gesture has unlocked audio, then the AudioContext's state. */
  get state(): AudioContextState | 'locked' {
    return this.mixer?.ctx.state ?? 'locked';
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
    for (const channel of ['music', 'ambience'] as const) {
      const g = ctx.createGain();
      g.gain.value = channelGain(this.settings, channel);
      g.connect(master);
      gains[channel] = g;
    }
    this.mixer = { ctx, master, gains };

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

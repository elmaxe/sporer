import type { AmbientCue, LoopCue, SoundCue } from './cues';
import type { SoundHandle } from './CuePlayer';

/** Cues that play once. */
export type OneShotCue = Exclude<SoundCue, LoopCue | AmbientCue>;

/** A background loop whose loudness and pitch the game sets as it goes (see `SoundEffects.ambient`). */
export interface AmbientSound extends SoundHandle {
  /** 0–1 of the cue's volume; changes glide (over the cue's `fadeIn` time constant). */
  setLevel(level: number): void;
  /** Playback rate (1 = as recorded; lower is deeper and slower). */
  setRate(rate: number): void;
}

/** How a one-shot plays this time. */
export interface PlayOptions {
  /**
   * Playback rate: 1 as recorded, 2 an octave higher (and twice as quick),
   * 0.5 an octave lower. Kept within `MIN_RATE`–`MAX_RATE`.
   */
  rate?: number;
}

/** The playback rates a one-shot can be played at (two octaves either way). */
export const MIN_RATE = 0.25;
export const MAX_RATE = 4;

/** A requested playback rate, kept to what `play` allows (1 for none or nonsense). */
export function playbackRate(rate: number | undefined): number {
  if (rate === undefined || !Number.isFinite(rate) || rate <= 0) return 1;
  return Math.min(MAX_RATE, Math.max(MIN_RATE, rate));
}

/** Anything that can play a sound effect. Game code depends on this, not on the AudioManager. */
export interface SoundEffects {
  /** Plays a variant of a one-shot cue's files (nothing while its folder is empty), at a pitch if asked (`PlayOptions`). */
  play(cue: OneShotCue, options?: PlayOptions): void;
  /** Starts a looping cue (travel) and returns the handle that fades it out. */
  start(cue: LoopCue): SoundHandle;
  /**
   * A background loop at level 0 until set. Unlike `start`, it sounds
   * whenever audio is running, even if asked for before audio was unlocked.
   * Stop it when its owner goes away.
   */
  ambient(cue: AmbientCue): AmbientSound;
}

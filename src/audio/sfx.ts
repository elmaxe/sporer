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

/** Anything that can play a sound effect. Game code depends on this, not on the AudioManager. */
export interface SoundEffects {
  /** Plays a variant of a one-shot cue's files (nothing while its folder is empty). */
  play(cue: OneShotCue): void;
  /** Starts a looping cue (travel) and returns the handle that fades it out. */
  start(cue: LoopCue): SoundHandle;
  /**
   * A background loop at level 0 until set. Unlike `start`, it sounds
   * whenever audio is running, even if asked for before audio was unlocked.
   * Stop it when its owner goes away.
   */
  ambient(cue: AmbientCue): AmbientSound;
}

import type { LoopCue, SoundCue } from './cues';
import type { SoundHandle } from './CuePlayer';

/** Cues that play once. */
export type OneShotCue = Exclude<SoundCue, LoopCue>;

/** Anything that can play a sound effect. Game code depends on this, not on the AudioManager. */
export interface SoundEffects {
  /** Plays a variant of a one-shot cue's files (nothing while its folder is empty). */
  play(cue: OneShotCue): void;
  /** Starts a looping cue (travel) and returns the handle that fades it out. */
  start(cue: LoopCue): SoundHandle;
}

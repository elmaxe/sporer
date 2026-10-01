import type { Rng } from '../gen/rng';

/**
 * Sound cues played from audio files. Each has its own folder under
 * `src/assets/audio/sfx/<cue>/`, and every audio file in it is one variant:
 * a play picks one at random (never the same one twice in a row). A cue
 * whose folder is empty is silent.
 */
export type SoundCue = 'select' | 'systemSelect' | 'systemTravel' | 'interstellarTravel' | 'reentry' | 'leavePlanet';

export const SOUND_CUES: readonly SoundCue[] = [
  'select',
  'systemSelect',
  'systemTravel',
  'interstellarTravel',
  'reentry',
  'leavePlanet',
];

/** Cues that loop until stopped (`SoundEffects.start`); the rest play once (`SoundEffects.play`). */
export type LoopCue = 'systemTravel' | 'interstellarTravel';

export interface CueSpec {
  /** Linear gain on the Effects channel (1 = the file as it is). */
  volume: number;
  /**
   * Loops until stopped (the travel cues): faded in over `fadeIn` s,
   * faded out over `fadeOut` s when stopped, and its last `loopCrossfade` s
   * blended into its head so any clip loops without a seam. A clip longer
   * than the trip never loops at all.
   */
  loop: boolean;
  fadeIn: number;
  fadeOut: number;
  loopCrossfade: number;
}

const oneShot = (): CueSpec => ({
  volume: 1,
  loop: false,
  fadeIn: 0,
  fadeOut: 0.15,
  loopCrossfade: 0,
});

const travel = (): CueSpec => ({
  volume: 1,
  loop: true,
  fadeIn: 0.2,
  fadeOut: 1.2,
  loopCrossfade: 0.5,
});

/** Tunables per cue (bound to the 'Sound cues' debug folder). */
export const cueParams: Record<SoundCue, CueSpec> = {
  // Clicking a star, rogue planet or nebula on the galaxy map.
  select: oneShot(),
  // Clicking a star, planet, moon, comet or belt in a system (in the view or on the system map).
  systemSelect: oneShot(),
  // The autopilot flying between bodies in a system, from setting off until it arrives.
  systemTravel: travel(),
  // Flying between stars on the galaxy map, from setting off until it docks.
  interstellarTravel: travel(),
  // Descending to a planet or moon with air (or a gas giant); airless bodies are silent.
  reentry: oneShot(),
  // Climbing from low orbit back to the system.
  leavePlanet: oneShot(),
};

/** File types picked up as variants. */
export const CUE_EXTENSIONS = ['mp3', 'ogg', 'wav', 'm4a', 'webm', 'flac'] as const;

/**
 * Groups audio files into cues by the folder they're in: `…/sfx/<cue>/<file>`.
 * `files` maps a path (as `import.meta.glob` keys them) to its URL. Files
 * outside a cue's folder, or not audio, are ignored. Each cue's variants are
 * sorted by path, so the order doesn't depend on the bundler.
 */
export function groupCueFiles(files: Readonly<Record<string, string>>): Record<SoundCue, string[]> {
  const out = Object.fromEntries(SOUND_CUES.map((cue) => [cue, [] as string[]])) as Record<SoundCue, string[]>;
  const exts = new Set<string>(CUE_EXTENSIONS);
  for (const path of Object.keys(files).sort()) {
    const parts = path.split('/');
    const file = parts.at(-1) ?? '';
    const folder = parts.at(-2) ?? '';
    const ext = file.includes('.') ? file.slice(file.lastIndexOf('.') + 1).toLowerCase() : '';
    if (!exts.has(ext) || !(SOUND_CUES as readonly string[]).includes(folder)) continue;
    out[folder as SoundCue].push(files[path]!);
  }
  return out;
}

/**
 * Picks which variant plays: at random, but never the one that played last
 * (unless there's only one), so repeats don't sound mechanical.
 */
export class VariantPicker {
  private readonly last = new Map<SoundCue, number>();

  constructor(private readonly rng: Rng) {}

  /** An index into the cue's `count` variants, or -1 if it has none. */
  next(cue: SoundCue, count: number): number {
    if (count <= 0) return -1;
    const last = this.last.get(cue);
    let i = this.rng.int(0, count - 1);
    // Draw from the others: shift past the last one.
    if (count > 1 && last !== undefined && last < count) {
      i = this.rng.int(0, count - 2);
      if (i >= last) i++;
    }
    this.last.set(cue, i);
    return i;
  }
}

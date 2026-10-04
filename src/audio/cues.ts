import type { Rng } from '../gen/rng';
import type { AudioChannel } from './settings';

/**
 * Sound cues played from audio files. Each has its own folder under
 * `src/assets/audio/sfx/<cue>/`, and every audio file in it is one variant:
 * a play picks one at random (never the same one twice in a row). A cue
 * whose folder is empty is silent.
 */
export type SoundCue =
  | 'select'
  | 'systemTravel'
  | 'interstellarTravel'
  | 'reentry'
  | 'leavePlanet'
  | 'busterFire'
  | 'busterFlight'
  | 'busterImpact'
  | 'planetExplode'
  | 'volcanoFire'
  | 'volcanoRise'
  | 'abductBeam'
  | 'abductStart'
  | 'abductSuccess'
  | 'exportBeam'
  | 'dropImpact'
  | 'radarPing'
  | 'laserBeam'
  | 'laserHit'
  | 'starNear'
  | 'starFar'
  | 'shipHum';

export const SOUND_CUES: readonly SoundCue[] = [
  'select',
  'systemTravel',
  'interstellarTravel',
  'reentry',
  'leavePlanet',
  'busterFire',
  'busterFlight',
  'busterImpact',
  'planetExplode',
  'volcanoFire',
  'volcanoRise',
  'abductBeam',
  'abductStart',
  'abductSuccess',
  'exportBeam',
  'dropImpact',
  'radarPing',
  'laserBeam',
  'laserHit',
  'starNear',
  'starFar',
  'shipHum',
];

/** Cues that loop until stopped (`SoundEffects.start`); the rest play once (`SoundEffects.play`). */
export type LoopCue = 'systemTravel' | 'interstellarTravel' | 'busterFlight' | 'abductBeam' | 'exportBeam' | 'laserBeam';

/**
 * Background loops on the Ambience channel whose loudness the game sets as
 * it goes (`SoundEffects.ambient`): they sound whenever audio is running,
 * even if asked for before it was unlocked.
 */
export type AmbientCue = 'starNear' | 'starFar' | 'shipHum';

export const AMBIENT_CUES: readonly AmbientCue[] = ['starNear', 'starFar', 'shipHum'];

export interface CueSpec {
  /** Linear gain on its channel at full level (1 = the file as it is). */
  volume: number;
  /** The mixer channel (volume slider) it plays on. */
  channel: Extract<AudioChannel, 'sfx' | 'ambience'>;
  /**
   * Loops until stopped (the travel cues): faded in over `fadeIn` s,
   * faded out over `fadeOut` s when stopped, and its last `loopCrossfade` s
   * blended into its head so any clip loops without a seam. A clip longer
   * than the trip never loops at all. Ambient cues loop too (`fadeIn` is
   * then the time constant of their level changes).
   */
  loop: boolean;
  fadeIn: number;
  fadeOut: number;
  loopCrossfade: number;
}

const oneShot = (): CueSpec => ({
  volume: 1,
  channel: 'sfx',
  loop: false,
  fadeIn: 0,
  fadeOut: 0.15,
  loopCrossfade: 0,
});

const travel = (): CueSpec => ({
  volume: 1,
  channel: 'sfx',
  loop: true,
  fadeIn: 0.2,
  fadeOut: 1.2,
  loopCrossfade: 0.5,
});

// The files sit at about the ambience track's loudness (mean −12…−14 dB), and add to it.
const ambient = (volume: number): CueSpec => ({
  volume,
  channel: 'ambience',
  loop: true,
  fadeIn: 0.3,
  fadeOut: 1.5,
  loopCrossfade: 0.5,
});

/** Tunables per cue (bound to the 'Sound cues' debug folder). */
export const cueParams: Record<SoundCue, CueSpec> = {
  // Clicking a star, planet, moon or comet (in the view, on the system map or on the galaxy map).
  select: oneShot(),
  // The autopilot flying between bodies in a system, from setting off until it arrives.
  systemTravel: travel(),
  // Flying between stars on the galaxy map, from setting off until it docks.
  interstellarTravel: travel(),
  // Descending to a planet or moon with air (or a gas giant); airless bodies are silent.
  reentry: oneShot(),
  // Climbing from low orbit back to the system.
  leavePlanet: oneShot(),
  // Firing the planet buster: the projectile leaving the ship.
  busterFire: oneShot(),
  // The planet buster's projectile flying down to the surface, from launch until it hits.
  busterFlight: { ...travel(), fadeIn: 0.1, fadeOut: 0.3 },
  // The projectile hitting the ground (the first flash; the crust starts to crack).
  busterImpact: oneShot(),
  // The planet blowing apart (the blinding flash).
  planetExplode: oneShot(),
  // Firing the volcano bomb: the molten shell leaving the ship.
  volcanoFire: oneShot(),
  // The shell landing and the volcano rising out of the ground (a rumble and the first eruption).
  volcanoRise: oneShot(),
  // The abduction beam on, from the press until it's let go.
  abductBeam: { ...travel(), fadeIn: 0.1, fadeOut: 0.3 },
  // The beam catching something to lift (as it comes under the beam).
  abductStart: oneShot(),
  // Something reaching the ship and going into the inventory.
  abductSuccess: oneShot(),
  // The beam lowering cargo from the ship, from the press until it's let go or lands.
  exportBeam: { ...travel(), fadeIn: 0.1, fadeOut: 0.3 },
  // Cargo landing on the ground: set down by the beam, dropped, or falling from it.
  dropImpact: oneShot(),
  // The radar pinging the way to the nearest animal of the species it tracks (quicker the closer they are).
  radarPing: oneShot(),
  // The laser firing, from the press until it's let go.
  laserBeam: { ...travel(), volume: 0.6, fadeIn: 0.05, fadeOut: 0.15, loopCrossfade: 0.3 },
  // The laser killing an animal or a plant.
  laserHit: oneShot(),
  // A star close up, as the camera nears its surface (see StarSounds).
  starNear: ambient(0.8),
  // A star from across its system, giving way to starNear close up.
  starFar: ambient(0.8),
  // The UFO's own hum, always on.
  shipHum: ambient(0.35),
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

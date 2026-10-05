import type { GeyserKind } from '../gen/geysers';

/** Tunables of the vents' sound (debug folder Vent sound). */
export const ventSoundParams = {
  /** A vent is heard at half strength this many of its plume's heights away (and at least `minReach` units). */
  reach: 2,
  minReach: 10,
  /** A vent bursting into eruption is heard if its loop would be at least this loud alone. */
  burst: 0.3,
  /** Seconds between bursts heard, at least. */
  gap: 1.5,
};

/** Which loop each kind of vent sounds with. */
export const VENT_CUE: Readonly<Record<GeyserKind, 'ventRumble' | 'geyserHiss'>> = {
  cryo: 'geyserHiss',
  steam: 'geyserHiss',
  sulphur: 'ventRumble',
  fumarole: 'ventRumble',
};

/** Playback rate per kind: Io's tall plumes deeper, cryo jets' fine grains higher. */
export const ventPitch: Record<GeyserKind, number> = { cryo: 1.2, steam: 1, sulphur: 0.75, fumarole: 1 };

/**
 * How loud one vent is from `distance` units away, its plume `peak` units
 * tall, while erupting at `strength` (0 to 1): 1/(1 + (d/reach)²) as the
 * stars' (audio/starMix.ts), the reach growing with the plume.
 */
export function ventLevel(distance: number, peak: number, strength: number): number {
  const reach = Math.max(ventSoundParams.minReach, ventSoundParams.reach * peak);
  const q = distance / reach;
  return Math.max(0, strength) / (1 + q * q);
}

/** The loop's level from the vents' summed levels: they add, but never past full (1 − e^−sum, about the sum when faint). */
export function ventsLevel(sum: number): number {
  return 1 - Math.exp(-Math.max(0, sum));
}

/**
 * How strongly an eruption sounds `age` seconds after it started, lasting
 * `duration`: swelling over its first second and a half, dying away over
 * its last two, and weakening along the way as the column does (gen/geysers.ts).
 */
export function eruptionLoudness(age: number, duration: number): number {
  if (age < 0 || age >= duration) return 0;
  const rise = Math.min(1, age / 1.5);
  const fall = Math.min(1, (duration - age) / 2);
  return rise * rise * (3 - 2 * rise) * fall * (1 - (0.3 * age) / duration);
}

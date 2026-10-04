import type { HerdData } from '../gen/animals';
import type { Vec3Like } from '../world/cubeSphereMath';

/*
 * The radar's rules, pure: how often it pings, how high its ping sounds and
 * how wide its waves fan out for how far away the tracked animals are, which herds are worth posing to
 * find the nearest, and the word the Species tab shows for the distance.
 * Distances are along the ground, in planet-level units (an Earth-sized
 * globe's radius is 400; a herd roams a few dozen units from home).
 */

/** Tunables (debug: *Radar*). */
export const radarParams = {
  /** Seconds between pings with the animals right below the ship, and far away. */
  nearInterval: 0.7,
  farInterval: 2.4,
  /** Ground distances (units) the ping rate and pitch ease between: right below and far away. */
  nearDistance: 15,
  farDistance: 1000,
  /** The ping's playback rate right above the animals and far away (1 as recorded; 1.5 is a fifth up, 0.84 three semitones down). */
  nearPitch: 1.5,
  farPitch: 0.84,
  /** The waves' half-angle far away (radians); they close into full rings as the animals come under the ship. */
  farSpread: 0.38,
  /** Ground distances (units) between which the arcs open up into rings. */
  ringDistance: 18,
  openDistance: 110,
  /** Seconds a wave takes to spread out to the disc's edge, waves per ping and the seconds between them. */
  waveSeconds: 1.25,
  waves: 3,
  waveGap: 0.13,
  /** The waves' disc radius as a share of the camera's distance from the ship, at least (units)… */
  discScale: 0.55,
  minDisc: 9,
  /** …and at most this share of the globe's radius (zoomed right out). */
  maxDisc: 0.45,
  /** The waves start this far from the ship's centre (units): just outside its hull (the UFO is ~4 wide). */
  hull: 2.6,
  /** Brightness of the waves. */
  strength: 1,
  /** Seconds between looks for the nearest animal while tracking. */
  lookSeconds: 0.25,
  /** Milliseconds a frame the census may take. */
  censusBudgetMs: 2,
};

/** Where `t` falls between `a` and `b` on a log scale, 0–1. */
function logShare(t: number, a: number, b: number): number {
  if (t <= a) return 0;
  if (t >= b) return 1;
  return Math.log(t / a) / Math.log(b / a);
}

function smoothstep(a: number, b: number, v: number): number {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Seconds to the next ping with the nearest animal `distance` units away along the ground: quicker the closer. */
export function pingInterval(distance: number, p = radarParams): number {
  return p.nearInterval + (p.farInterval - p.nearInterval) * logShare(distance, p.nearDistance, p.farDistance);
}

/**
 * The ping's playback rate with the nearest animal `distance` units away:
 * higher the closer, eased on the same log scale of the distance as the
 * ping rate, and evenly in semitones (geometrically in rate) between them.
 */
export function pingPitch(distance: number, p = radarParams): number {
  const s = logShare(distance, p.nearDistance, p.farDistance);
  return p.nearPitch * (p.farPitch / p.nearPitch) ** s;
}

/** The waves' half-angle (radians) with the nearest animal `distance` units away: narrow arcs far off, whole rings right above it. */
export function waveSpread(distance: number, p = radarParams): number {
  return Math.PI + (p.farSpread - Math.PI) * smoothstep(p.ringDistance, p.openDistance, distance);
}

/** The ground distance (units, along the sea-level sphere of radius `radius`) between two unit directions. */
export function groundDistance(a: Vec3Like, b: Vec3Like, radius: number): number {
  const dot = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z));
  return Math.acos(dot) * radius;
}

/** How the Species tab words a distance to the tracked animals. */
export function proximity(distance: number): string {
  if (distance < 30) return 'right here';
  if (distance < 150) return 'close';
  if (distance < 600) return 'near';
  return 'far';
}

/**
 * The herds of species `species` whose animals could be the nearest to
 * `from` (a unit direction): the one whose home is nearest, and any whose
 * home is within twice the herds' roaming reach `reach` (units) of that, as
 * a herd strays from its home. Nearest home first, at most `max`; writes `out`.
 */
export function candidateHerds(
  herds: readonly HerdData[],
  species: number,
  from: Vec3Like,
  radius: number,
  reach: number,
  max: number,
  out: HerdData[],
): HerdData[] {
  out.length = 0;
  let best = Infinity;
  for (const h of herds) if (h.species === species) best = Math.min(best, groundDistance(from, h.home, radius));
  if (best === Infinity) return out;
  for (const h of herds) if (h.species === species && groundDistance(from, h.home, radius) <= best + 2 * reach) out.push(h);
  out.sort((a, b) => groundDistance(from, a.home, radius) - groundDistance(from, b.home, radius));
  if (out.length > max) out.length = max;
  return out;
}

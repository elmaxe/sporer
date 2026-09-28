import { hslToHex } from './color';
import { generateName } from './names';
import { hashSeed, Rng } from './rng';
import { generateCompanion, generateStar, type StarData } from './stars';

/** Galaxy-scene units. Unrelated to system units; each level has its own scale. */
export const GALAXY_RADIUS = 1000;
export const DEFAULT_STAR_COUNT = 4000;
export const DEFAULT_DUST_COUNT = 1200;
const BINARY_CHANCE = 0.15;

/**
 * A star as seen on the galaxy map. Only this is generated up front; the
 * system's planets are generated on demand from `seed` (see system.ts).
 */
export interface StarRef {
  id: number;
  name: string;
  position: { x: number; y: number; z: number };
  seed: number;
  /** One star, or two for a binary system (larger first). */
  stars: StarData[];
}

export interface GalaxyData {
  seed: number;
  radius: number;
  arms: number;
  /** How far each arm winds (radians from the inner to the outer edge). */
  twist: number;
  /** Angle of the first arm's inner end. */
  armOffset: number;
  stars: StarRef[];
}

/** A soft, glowing dust/gas cloud along a spiral arm (visual only). */
export interface DustCloud {
  position: { x: number; y: number; z: number };
  /** Diameter in galaxy units. */
  size: number;
  color: string;
}

export function generateGalaxy(seed: number, count = DEFAULT_STAR_COUNT): GalaxyData {
  const rng = new Rng(hashSeed(seed, 'galaxy'));
  const arms = rng.int(2, 4);
  const twist = rng.range(3, 5.5);
  const armOffset = rng.range(0, Math.PI * 2);

  const stars: StarRef[] = [];
  for (let id = 0; id < count; id++) {
    const starRng = rng.fork('star', id);
    const position = rng.chance(0.2) ? bulgePosition(rng) : armPosition(rng, arms, twist, armOffset);

    const members = [generateStar(starRng)];
    if (starRng.chance(BINARY_CHANCE)) members.push(generateCompanion(starRng));
    members.sort((a, b) => b.radius - a.radius);

    stars.push({
      id,
      name: generateName(starRng.fork('name')),
      position,
      seed: hashSeed(seed, 'system', id),
      stars: members,
    });
  }

  return { seed, radius: GALAXY_RADIUS, arms, twist, armOffset, stars };
}

/**
 * Dust clouds that trace the spiral arms, using the same arm layout as the
 * stars. Generated from its own stream, so it never changes the stars.
 */
export function generateDust(galaxy: GalaxyData, count = DEFAULT_DUST_COUNT): DustCloud[] {
  const rng = new Rng(hashSeed(galaxy.seed, 'dust'));
  const clouds: DustCloud[] = [];
  for (let i = 0; i < count; i++) {
    const position = armPosition(rng, galaxy.arms, galaxy.twist, galaxy.armOffset);
    // Mostly blue, some violet, the odd pink star-forming region.
    const hue = rng.weighted<number>([
      [rng.range(210, 235), 6],
      [rng.range(255, 280), 3],
      [rng.range(310, 335), 1],
    ]);
    clouds.push({
      position,
      size: rng.range(50, 120),
      color: hslToHex(hue, rng.range(0.5, 0.7), rng.range(0.5, 0.62)),
    });
  }
  return clouds;
}

/** Logarithmic-ish spiral arm with scatter that shrinks towards the rim. */
function armPosition(rng: Rng, arms: number, twist: number, offset: number) {
  const t = Math.pow(rng.next(), 0.8); // slightly favour the outer disc (more area)
  const d = GALAXY_RADIUS * (0.08 + 0.92 * t);
  const arm = rng.int(0, arms - 1);
  const angle = offset + (arm / arms) * Math.PI * 2 + t * twist + rng.gaussian(0, 0.28 * (1 - 0.5 * t));
  return {
    x: Math.cos(angle) * d,
    y: rng.gaussian(0, GALAXY_RADIUS * (0.025 * (1 - t) + 0.006)),
    z: Math.sin(angle) * d,
  };
}

/** Dense, slightly flattened central bulge. */
function bulgePosition(rng: Rng) {
  const s = GALAXY_RADIUS * 0.13;
  return { x: rng.gaussian(0, s), y: rng.gaussian(0, s * 0.45), z: rng.gaussian(0, s) };
}

import { hslToHex } from './color';
import type { BuildingKind } from './colony';
import { Rng } from './rng';
import { coreSurface, newPart, type ShipDesign, type ShipPaint, type ShipPart, type ShipPartKind, type Vec3 } from './ship';

/*
 * A colony's buildings, made of the spaceship editor's parts (gen/ship.ts)
 * by a seeded rule, as Spore built its cities' buildings with the same
 * creator as its vehicles: a body for the core, a glass dome or canopy for
 * the windows, then rings, lights, dishes and masts. Each colony has its
 * own paint and one design per kind of building; the buildings of a kind
 * differ by their size and turn. Pure data: drawn by colony/buildingMesh.ts
 * like a ship (+y up, sizes in planet units: the UFO is 4 across).
 */

/** The colony's paint: pale walls, a bold trim, warm windows (the glass by day), its lights. */
export function colonyPaint(seed: number): ShipPaint {
  const rng = new Rng(seed).fork('paint');
  const hue = rng.range(0, 360);
  return {
    base: hslToHex(hue, rng.range(0.05, 0.22), rng.range(0.72, 0.86)),
    trim: hslToHex((hue + rng.pick([150, 180, 210, 30])) % 360, rng.range(0.5, 0.8), rng.range(0.38, 0.52)),
    detail: hslToHex(hue, 0.08, rng.range(0.25, 0.38)),
    glass: hslToHex(rng.range(185, 215), 0.55, 0.62),
    glow: hslToHex(rng.pick([45, 160, 190, 30]), 0.95, 0.62),
    finish: 'matte',
    pattern: rng.pick(['plain', 'panels', 'stripes'] as const),
    patternScale: rng.range(0.8, 1.4),
  };
}

/** A colony's design for buildings of kind `kind`, from its seed. */
export function buildingDesign(kind: BuildingKind, seed: number): ShipDesign {
  const rng = new Rng(seed).fork('building', kind);
  const paint = colonyPaint(seed);
  const build = BUILDERS[kind];
  return { name: kind, parts: build(rng), paint };
}

type Builder = (rng: Rng) => ShipPart[];

/** A design's parts round a core: `add` sticks a part on the core's surface in a direction. */
function round(core: ShipPart, more: (add: (kind: ShipPartKind, dir: Vec3, opts?: Partial<ShipPart>) => number, parts: ShipPart[]) => void): ShipPart[] {
  const parts = [core];
  const add = (kind: ShipPartKind, dir: Vec3, opts: Partial<ShipPart> = {}): number => {
    const at = coreSurface(core, dir);
    const p = newPart(kind, at.pos, at.normal, 0, opts.mirror ?? false, opts.radial ?? 1);
    Object.assign(p, opts);
    parts.push(p);
    return parts.length - 1;
  };
  more(add, parts);
  return parts;
}

function core(kind: ShipPartKind, size: number, stretch = 1): ShipPart {
  const p = newPart(kind, [0, 0, 0], [0, 1, 0], -1, false);
  p.size = size;
  p.stretch = stretch;
  return p;
}

const BUILDERS: Record<BuildingKind, Builder> = {
  // The hub: a broad squat sphere under a glass dome, a ring round it, a dish and masts, lights round its rim.
  hub: (rng) =>
    round(core('sphere', 2.5, rng.range(0.5, 0.62)), (add) => {
      add('dome', [0, 1, 0], { size: rng.range(1.7, 2.1) });
      add('ring', [0, 0.35, 0], { size: 1.05 });
      add('dish', [0.55, 0.8, -0.3], { size: 1.6, spin: rng.range(0, 6) });
      add('antenna', [-0.5, 0.85, 0.35], { size: 1.8 });
      add('light', [1, 0.05, 0], { radial: 8, size: 1.2 });
      add('canopy', [0, 0.25, 1], { size: 1.3, radial: rng.pick([3, 4]) });
    }),
  // A house: a rounded block with a canopy of windows, or a squashed sphere under a dome.
  house: (rng) =>
    rng.chance(0.5)
      ? round(core('block', 1.4, rng.range(0.9, 1.2)), (add) => {
          add('canopy', [0, 1, 0.1], { size: 1.1 });
          add('light', [0, 0.2, 1], { size: 1 });
          if (rng.chance(0.6)) add('antenna', [0.6, 1, -0.6], { size: 0.9 });
        })
      : round(core('sphere', 1.45, rng.range(0.65, 0.8)), (add) => {
          add('dome', [0, 1, 0], { size: 0.9 });
          add('canopy', [0, 0.1, 1], { size: 0.8, radial: 3 });
          if (rng.chance(0.5)) add('dish', [0.6, 0.8, 0], { size: 0.8 });
        }),
  // A tower: a tall egg with bands, windows round it and a beacon on top.
  tower: (rng) =>
    round(core('sphere', 1.05, rng.range(2.6, 3.2)), (add) => {
      add('ring', [0, 0.25, 0], { size: 0.55 });
      add('ring', [0, -0.3, 0], { size: 0.62 });
      add('canopy', [0, 0.55, 1], { size: 0.55, radial: 4 });
      add('canopy', [0, 0, 1], { size: 0.6, radial: 4, spin: Math.PI / 4 });
      add('antenna', [0, 1, 0], { size: 1.4 });
      add('light', [1, -0.6, 0], { radial: 6, size: 0.9 });
    }),
  // A farm: a low block under a big glass greenhouse.
  farm: (rng) =>
    round(core('block', 1.7, rng.range(1, 1.3)), (add) => {
      add('dome', [0, 1, 0], { size: rng.range(1.5, 1.8) });
      add('light', [1, 0, 0.6], { size: 0.8, mirror: true });
    }),
  // A power plant: a block with a great dish and glowing thrusters for its reactors.
  power: (rng) =>
    round(core('block', 1.2, 1), (add) => {
      add('dish', [0, 1, 0], { size: rng.range(2, 2.4), spin: rng.range(0, 6) });
      add('thruster', [1, 0.3, 0], { size: 0.7, mirror: true });
      add('antenna', [0.4, 1, 0.5], { size: 1.2 });
    }),
};

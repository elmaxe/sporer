import { hslToHex } from './color';
import { Rng } from './rng';

/*
 * A spaceship from the spaceship editor (ship.html): Spore's spaceship
 * creator, built from parts the way its building and vehicle creators are
 * (docs/research/spaceship-editor.md). Pure data, no THREE.
 *
 * A `ShipDesign` is a core body and parts stuck onto the surfaces of the
 * core and of each other. Each part keeps where it touches its parent (a
 * point and the surface's outward normal there, in ship space), which part
 * that is, and its own size, stretch, spin and tilt. Moving a part carries
 * the parts stuck on it along; deleting it deletes them too.
 *
 * Symmetry is per part, as in Spore: a part is mirrored across the ship's
 * middle plane (x = 0), copied round the ship's vertical axis (radial, 2 to
 * 8 copies), or both. A part on the middle line isn't mirrored, and one on
 * the vertical axis isn't copied round it. The copies are only drawn: the
 * design keeps one of each part (`instances` lists the copies).
 *
 * Ship space: +y up, +z the nose, +x the left side. The game's UFO is a
 * saucer 4 units across, so the default core is too.
 */

export type Vec3 = [number, number, number];

export type ShipPartKind =
  | 'saucer'
  | 'sphere'
  | 'pod'
  | 'cone'
  | 'block'
  | 'ring'
  | 'dome'
  | 'canopy'
  | 'wing'
  | 'fin'
  | 'engine'
  | 'thruster'
  | 'cannon'
  | 'light'
  | 'antenna'
  | 'dish'
  | 'grabber';

export type ShipCategory = 'body' | 'cockpit' | 'wings' | 'power' | 'weapons' | 'details';
export const SHIP_CATEGORIES: readonly ShipCategory[] = ['body', 'cockpit', 'wings', 'power', 'weapons', 'details'];

/**
 * How a part sits on the surface it's stuck to:
 *  - 'surface': it grows out of the surface (its y along the normal), its
 *    z towards the nose as far as the normal allows; spin turns it about
 *    the normal, tilt leans it forward or back.
 *  - 'axial': it lies along the ship (its z the nose, whatever the
 *    surface), its y as near the normal as that allows; spin rolls it
 *    about its length, tilt pitches it. Engines push backwards and guns
 *    point forwards wherever they're stuck.
 */
export type PartMount = 'surface' | 'axial';

export interface ShipPartInfo {
  category: ShipCategory;
  mount: PartMount;
  /**
   * How far the part's origin stands out from the point it's stuck at,
   * along the normal, per unit of size (negative sinks it in): bodies
   * overlap what they're on, a pylon-mounted engine stands clear.
   */
  standoff: number;
  /** The part's own axis that `stretch` lengthens. */
  stretchAxis: 0 | 1 | 2;
  /** Size a newly placed part starts at. */
  size: number;
  /** Rough radius at size 1 (how far apart a duplicate is put). */
  radius: number;
  /** Whether other parts can be stuck onto it (bodies, wings, engines; not lights, guns or masts). */
  holds: boolean;
}

export const SHIP_PARTS: Record<ShipPartKind, ShipPartInfo> = {
  saucer: { category: 'body', mount: 'surface', standoff: 0.3, stretchAxis: 1, size: 0.6, radius: 2, holds: true },
  sphere: { category: 'body', mount: 'surface', standoff: 0.7, stretchAxis: 1, size: 0.6, radius: 1.2, holds: true },
  pod: { category: 'body', mount: 'axial', standoff: 0.55, stretchAxis: 2, size: 0.5, radius: 1.9, holds: true },
  cone: { category: 'body', mount: 'axial', standoff: 0.6, stretchAxis: 2, size: 0.5, radius: 1.4, holds: true },
  block: { category: 'body', mount: 'surface', standoff: 0.15, stretchAxis: 2, size: 0.6, radius: 1.2, holds: true },
  ring: { category: 'body', mount: 'surface', standoff: 0.3, stretchAxis: 0, size: 0.6, radius: 1.6, holds: true },
  dome: { category: 'cockpit', mount: 'surface', standoff: -0.08, stretchAxis: 1, size: 0.8, radius: 0.9, holds: true },
  canopy: { category: 'cockpit', mount: 'surface', standoff: -0.06, stretchAxis: 2, size: 0.7, radius: 1.3, holds: true },
  wing: { category: 'wings', mount: 'surface', standoff: -0.1, stretchAxis: 1, size: 0.9, radius: 2.2, holds: true },
  fin: { category: 'wings', mount: 'surface', standoff: -0.08, stretchAxis: 1, size: 0.8, radius: 1.4, holds: true },
  engine: { category: 'power', mount: 'axial', standoff: 0.5, stretchAxis: 2, size: 0.7, radius: 1, holds: true },
  thruster: { category: 'power', mount: 'surface', standoff: -0.05, stretchAxis: 1, size: 0.6, radius: 0.6, holds: false },
  cannon: { category: 'weapons', mount: 'axial', standoff: 0.3, stretchAxis: 2, size: 0.6, radius: 1.2, holds: false },
  light: { category: 'details', mount: 'surface', standoff: -0.02, stretchAxis: 1, size: 0.6, radius: 0.25, holds: false },
  antenna: { category: 'details', mount: 'surface', standoff: -0.02, stretchAxis: 1, size: 0.7, radius: 1.6, holds: false },
  dish: { category: 'details', mount: 'surface', standoff: -0.02, stretchAxis: 1, size: 0.6, radius: 0.9, holds: false },
  grabber: { category: 'details', mount: 'surface', standoff: -0.02, stretchAxis: 1, size: 0.6, radius: 1.1, holds: false },
};

export const SHIP_PART_KINDS = Object.keys(SHIP_PARTS) as ShipPartKind[];

/** The bodies a ship can be built round. */
export const CORE_KINDS: readonly ShipPartKind[] = ['saucer', 'sphere', 'pod', 'cone', 'block', 'ring'];

/** Paint channels: every part's meshes are drawn in one of these. */
export type PaintChannel = 'base' | 'trim' | 'detail' | 'glass' | 'glow';
export const PAINT_CHANNELS: readonly PaintChannel[] = ['base', 'trim', 'detail', 'glass', 'glow'];

export type HullFinish = 'metal' | 'gloss' | 'matte';
export const HULL_FINISHES: readonly HullFinish[] = ['metal', 'gloss', 'matte'];
export type HullPattern = 'plain' | 'panels' | 'stripes' | 'checker' | 'hazard';
export const HULL_PATTERNS: readonly HullPattern[] = ['plain', 'panels', 'stripes', 'checker', 'hazard'];

export interface ShipPaint {
  /** The hull. */
  base: string;
  /** Bands, rims, pylons, fins: the second colour, also the hull pattern's. */
  trim: string;
  /** Machinery: nozzles, barrels, masts. */
  detail: string;
  glass: string;
  /** Lights, engine glow, exhaust. */
  glow: string;
  finish: HullFinish;
  pattern: HullPattern;
  /** Pattern repeats per unit of the part's surface coordinates. */
  patternScale: number;
}

export interface ShipPart {
  kind: ShipPartKind;
  /** Where it's stuck on its parent, ship space (the core's centre, for the core). */
  pos: Vec3;
  /** The parent's outward surface normal there (unit). */
  normal: Vec3;
  /** The part it's stuck to (an index into `parts`), −1 for the core. */
  parent: number;
  size: number;
  /** Lengthens the part along its `stretchAxis`, 1 as made. */
  stretch: number;
  /** Radians: about the normal (surface mounts) or about its length (axial). */
  spin: number;
  /** Radians: leaning forward or back (surface), pitching up or down (axial). */
  tilt: number;
  /** Radians: leaning to its side (surface: a wing's dihedral), turning left or right (axial). */
  lean: number;
  /** Mirrored across the ship's middle plane. */
  mirror: boolean;
  /** Copies round the ship's vertical axis, 1 for none. */
  radial: number;
  /** This part's own paint, over the ship's. */
  paint?: Partial<Pick<ShipPaint, 'base' | 'trim'>>;
}

export interface ShipDesign {
  name: string;
  /** `parts[0]` is the core, centred at the origin (parent −1). */
  parts: ShipPart[];
  paint: ShipPaint;
}

/** Most part copies a ship may have (Spore's complexity meter caps a creation the same way). */
export const MAX_COMPLEXITY = 80;
export const MAX_RADIAL = 8;

/** A drawn copy of a part. */
export interface PartInstance {
  /** Turn about the vertical axis, radians. */
  angle: number;
  /** Mirrored across x = 0 (after the turn). */
  mirrored: boolean;
  /** Which radial copy (0 the part itself). */
  copy: number;
}

/** Below this the part is on the middle line or the vertical axis, so a mirror image or turned copy would sit on itself. */
const ON_AXIS = 0.04;

export function onMiddleLine(p: ShipPart): boolean {
  return Math.abs(p.pos[0]) < ON_AXIS && Math.abs(p.normal[0]) < 0.05 && Math.abs(Math.sin(p.spin)) < 0.05;
}

export function onVerticalAxis(p: ShipPart): boolean {
  return Math.hypot(p.pos[0], p.pos[2]) < ON_AXIS && Math.abs(p.normal[1]) > 0.98;
}

/** The copies a part is drawn as: radial turns, each mirrored when it's a mirrored pair. */
export function instances(p: ShipPart): PartInstance[] {
  const n = p.parent < 0 || onVerticalAxis(p) ? 1 : Math.max(1, Math.min(MAX_RADIAL, Math.round(p.radial)));
  const mirror = p.mirror && p.parent >= 0 && !onMiddleLine(p);
  const out: PartInstance[] = [];
  for (let k = 0; k < n; k++) {
    const angle = (k / n) * Math.PI * 2;
    out.push({ angle, mirrored: false, copy: k });
    // A mirrored copy of a radial copy is only new when it doesn't land on another copy.
    if (mirror) out.push({ angle, mirrored: true, copy: k });
  }
  return out;
}

/** How many part copies the ship draws (the complexity meter). */
export function complexity(d: ShipDesign): number {
  return d.parts.reduce((n, p) => n + instances(p).length, 0);
}

/** A point or direction through an instance's turn and mirror. */
export function applyInstance(v: Vec3, inst: Pick<PartInstance, 'angle' | 'mirrored'>): Vec3 {
  const c = Math.cos(inst.angle);
  const s = Math.sin(inst.angle);
  // Turn about y (right-handed: +z towards +x), then mirror x.
  const x = v[0] * c + v[2] * s;
  const z = -v[0] * s + v[2] * c;
  return [inst.mirrored ? -x : x, v[1], z];
}

/** The inverse of `applyInstance`: a point on a copy back onto the part itself. */
export function unapplyInstance(v: Vec3, inst: Pick<PartInstance, 'angle' | 'mirrored'>): Vec3 {
  const x0 = inst.mirrored ? -v[0] : v[0];
  return applyInstance([x0, v[1], v[2]], { angle: -inst.angle, mirrored: false });
}

/** A part's frame in ship space (before any instance's turn): its origin and three unit axes. */
export interface PartFrame {
  origin: Vec3;
  x: Vec3;
  y: Vec3;
  z: Vec3;
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export function normalize(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
/** `v` turned by `angle` about the unit axis `k` (Rodrigues). */
function rotate(v: Vec3, k: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return add(add(scale(v, c), scale(cross(k, v), s)), scale(k, dot(k, v) * (1 - c)));
}

export function partFrame(p: ShipPart): PartFrame {
  const info = SHIP_PARTS[p.kind];
  const n = normalize(p.normal);
  const origin = p.parent < 0 ? [...p.pos] as Vec3 : add(p.pos, scale(n, info.standoff * p.size));
  let x: Vec3;
  let y: Vec3;
  let z: Vec3;
  if (info.mount === 'axial') {
    z = [0, 0, 1];
    // y: the normal with its forward part taken out (straight up on a nose or tail).
    const ny: Vec3 = [n[0], n[1], 0];
    y = Math.hypot(ny[0], ny[1]) > 0.2 ? normalize(ny) : [0, 1, 0];
    y = rotate(y, z, p.spin);
    x = cross(y, z);
    // Pitch: the nose up for positive tilt; then yaw.
    z = rotate(z, x, -p.tilt);
    y = rotate(y, x, -p.tilt);
    x = rotate(x, y, p.lean);
    z = rotate(z, y, p.lean);
  } else {
    // Wings stand out level from a sloping hull (a saucer's top), unless they're on top of it, where they're fins.
    y = p.kind === 'wing' && Math.abs(n[1]) < 0.97 ? normalize([n[0], n[1] * 0.15, n[2]]) : n;
    // z: the nose, with its part along the normal taken out (up the hull on a part stuck to the nose).
    let f: Vec3 = sub([0, 0, 1], scale(y, y[2]));
    if (Math.hypot(...f) < 0.2) f = [0, 1, 0];
    z = normalize(f);
    z = rotate(z, y, p.spin);
    x = cross(y, z);
    // Lean towards the part's front for positive tilt, then to its side.
    y = rotate(y, x, p.tilt);
    z = rotate(z, x, p.tilt);
    y = rotate(y, z, p.lean);
    x = rotate(x, z, p.lean);
  }
  return { origin, x, y, z };
}

/** Every part that is stuck (directly or not) to part `i`, `i` not included. */
export function descendants(d: ShipDesign, i: number): number[] {
  const out: number[] = [];
  const seen = new Set([i]);
  let grew = true;
  while (grew) {
    grew = false;
    d.parts.forEach((p, j) => {
      if (!seen.has(j) && seen.has(p.parent)) {
        seen.add(j);
        out.push(j);
        grew = true;
      }
    });
  }
  return out;
}

/** Removes part `i` and everything stuck to it, renumbering the rest. The core can't be removed. */
export function removePart(d: ShipDesign, i: number): void {
  if (i <= 0 || i >= d.parts.length) return;
  const gone = new Set([i, ...descendants(d, i)]);
  const map = new Map<number, number>();
  const kept: ShipPart[] = [];
  d.parts.forEach((p, j) => {
    if (gone.has(j)) return;
    map.set(j, kept.length);
    kept.push(p);
  });
  for (const p of kept) if (p.parent >= 0) p.parent = map.get(p.parent) ?? 0;
  d.parts = kept;
}

/** Moves part `i` to a new place (and parent): what is stuck to it moves the same way. */
export function movePart(d: ShipDesign, i: number, pos: Vec3, normal: Vec3, parent: number): void {
  const p = d.parts[i];
  if (!p) return;
  const delta = sub(pos, p.pos);
  p.pos = pos;
  p.normal = normalize(normal);
  if (i > 0) p.parent = parent;
  for (const j of descendants(d, i)) d.parts[j]!.pos = add(d.parts[j]!.pos, delta);
}

/** Resizes part `i` by `factor`; what is stuck to it is carried out (or in) with its surface. */
export function resizePart(d: ShipDesign, i: number, factor: number): void {
  const p = d.parts[i];
  if (!p) return;
  const size = Math.min(4, Math.max(0.15, p.size * factor));
  const f = size / p.size;
  const centre = partFrame(p).origin;
  p.size = size;
  const centre2 = partFrame(p).origin;
  for (const j of descendants(d, i)) {
    const q = d.parts[j]!;
    q.pos = add(centre2, scale(sub(q.pos, centre), f));
  }
}

/** Adds a copy of part `i` (and what's stuck to it) beside it; returns the copy's index. */
export function duplicatePart(d: ShipDesign, i: number): number {
  const p = d.parts[i];
  if (!p || i === 0) return -1;
  const offset: Vec3 = [0, 0, -SHIP_PARTS[p.kind].radius * p.size * 0.6];
  const map = new Map<number, number>();
  for (const j of [i, ...descendants(d, i)]) {
    const q = d.parts[j]!;
    const copy: ShipPart = { ...q, pos: add(q.pos, offset), normal: [...q.normal] as Vec3, paint: q.paint ? { ...q.paint } : undefined };
    if (!copy.paint) delete copy.paint;
    if (j !== i) copy.parent = map.get(q.parent) ?? q.parent;
    map.set(j, d.parts.length);
    d.parts.push(copy);
  }
  return map.get(i)!;
}

export function newPart(kind: ShipPartKind, pos: Vec3, normal: Vec3, parent: number, mirror = true, radial = 1): ShipPart {
  return { kind, pos, normal: normalize(normal), parent, size: SHIP_PARTS[kind].size, stretch: 1, spin: 0, tilt: 0, lean: 0, mirror, radial };
}

export function cloneDesign(d: ShipDesign): ShipDesign {
  return JSON.parse(JSON.stringify(d)) as ShipDesign;
}

export function defaultPaint(): ShipPaint {
  return { base: '#b9c3cf', trim: '#3d6fb6', detail: '#4a4f5a', glass: '#7fd8ff', glow: '#66ffcc', finish: 'metal', pattern: 'panels', patternScale: 1 };
}

/**
 * Where a ray from the core's centre along `dir` leaves a core body, and
 * the surface's normal there: each body is treated as the ellipsoid it
 * roughly is (for the random ships and the starting saucer; the editor
 * places parts on the drawn meshes).
 */
export function coreSurface(core: ShipPart, dir: Vec3): { pos: Vec3; normal: Vec3 } {
  const r = coreRadii(core);
  const d = normalize(dir);
  // The ray t·d on the ellipsoid Σ(t·d/r)² = 1.
  const t = 1 / Math.hypot(d[0] / r[0], d[1] / r[1], d[2] / r[2]);
  const pos: Vec3 = scale(d, t);
  const normal = normalize([pos[0] / (r[0] * r[0]), pos[1] / (r[1] * r[1]), pos[2] / (r[2] * r[2])]);
  return { pos: add(pos, core.pos), normal };
}

/** The ellipsoid radii (ship axes) a core body roughly fills. */
export function coreRadii(core: ShipPart): Vec3 {
  const s = core.size;
  const k = core.stretch;
  switch (core.kind) {
    case 'saucer':
      return [2 * s, 0.56 * s * k, 2 * s];
    case 'sphere':
      return [1.2 * s, 1.2 * s * k, 1.2 * s];
    case 'pod':
      return [0.8 * s, 0.8 * s, 1.9 * s * k];
    case 'cone':
      return [0.8 * s, 0.8 * s, 1.3 * s * k];
    case 'block':
      return [0.8 * s, 0.35 * s, 1.1 * s * k];
    default:
      return [1.6 * s, 0.25 * s, 1.6 * s];
  }
}

/** The starting ship: the game's own UFO, a saucer with a glass dome and a ring of lights. */
export function defaultShip(): ShipDesign {
  const core = newPart('saucer', [0, 0, 0], [0, 1, 0], -1, false);
  core.size = 1;
  const d: ShipDesign = { name: 'Saucer', parts: [core], paint: defaultPaint() };
  const top = coreSurface(core, [0, 1, 0]);
  const dome = newPart('dome', top.pos, top.normal, 0, false);
  dome.size = 1;
  d.parts.push(dome);
  const rim = coreSurface(core, [1, 0, 0]);
  const light = newPart('light', rim.pos, rim.normal, 0, false, 8);
  light.size = 0.8;
  d.parts.push(light);
  return d;
}

/** A random ship round a random core: cockpit, wings or fins, engines, then guns and details. */
export function randomShip(seed: number): ShipDesign {
  const rng = new Rng(seed);
  const coreKind = rng.weighted<ShipPartKind>([['saucer', 3], ['sphere', 1.2], ['pod', 2.5], ['cone', 1], ['block', 0.8]]);
  const core = newPart(coreKind, [0, 0, 0], [0, 1, 0], -1, false);
  core.size = coreKind === 'saucer' ? rng.range(0.8, 1.2) : rng.range(1, 1.5);
  core.stretch = rng.range(0.8, 1.4);
  const hue = rng.range(0, 360);
  const paint: ShipPaint = {
    base: hslToHex(hue, rng.range(0.05, 0.45), rng.range(0.45, 0.8)),
    trim: hslToHex((hue + rng.pick([0, 30, 150, 180, 210])) % 360, rng.range(0.4, 0.85), rng.range(0.3, 0.55)),
    detail: hslToHex(hue, 0.08, rng.range(0.18, 0.35)),
    glass: hslToHex(rng.range(170, 230), 0.7, 0.6),
    glow: hslToHex(rng.pick([160, 190, 50, 20, 300, 120]), 0.95, 0.6),
    finish: rng.pick(HULL_FINISHES),
    pattern: rng.pick(HULL_PATTERNS),
    patternScale: rng.range(0.7, 1.6),
  };
  const d: ShipDesign = { name: rng.pick(['Starhopper', 'Wanderer', 'Comet', 'Nebula', 'Drifter', 'Seeker', 'Vagrant', 'Halo', 'Quasar', 'Pilgrim']), parts: [core], paint };
  const r = coreRadii(core);
  const add = (kind: ShipPartKind, dir: Vec3, opts: Partial<ShipPart> = {}): number => {
    const at = coreSurface(core, dir);
    const p = newPart(kind, at.pos, at.normal, 0, opts.mirror ?? true, opts.radial ?? 1);
    Object.assign(p, opts);
    d.parts.push(p);
    return d.parts.length - 1;
  };
  const round = coreKind === 'saucer' || coreKind === 'sphere';

  // A cockpit on top, or at the front of a long hull.
  if (round || rng.chance(0.5)) add(rng.chance(0.6) ? 'dome' : 'canopy', [0, 1, round ? 0 : 0.35], { mirror: false, size: rng.range(0.6, 1) * Math.min(1.4, r[1] * 1.6) });
  else add('canopy', [0, 0.6, 1], { mirror: false, size: rng.range(0.6, 0.9) });

  // Wings or fins.
  if (!round || rng.chance(0.4)) {
    add('wing', [1, rng.range(-0.3, 0.2), rng.range(-0.4, 0.1)], { size: rng.range(0.6, 1.1) * Math.max(0.8, r[2] * 0.6), tilt: rng.range(-0.3, 0.1), lean: rng.range(-0.25, 0.15) });
  }
  if (rng.chance(0.6)) {
    if (round && rng.chance(0.5)) add('fin', [rng.range(0.4, 1), 0.3, -0.6], { radial: rng.pick([2, 3, 4]), mirror: false, size: rng.range(0.5, 0.8) });
    else add('fin', [0, 1, -0.8], { mirror: false, size: rng.range(0.5, 0.9) });
  }

  // Engines: a pair at the back, or a ring of them round a round hull.
  if (round && rng.chance(0.4)) add('thruster', [rng.range(0.3, 0.8), -1, 0], { radial: rng.int(3, 6), mirror: false, size: rng.range(0.5, 0.8) });
  else add('engine', [rng.range(0.4, 1), rng.range(-0.4, 0.3), -1], { size: rng.range(0.5, 0.9) * Math.max(0.8, r[0] * 0.8) });
  if (!round && rng.chance(0.5)) add('engine', [0, rng.range(-0.2, 0.2), -1], { mirror: false, size: rng.range(0.6, 1) });

  // Guns, lights, masts.
  if (rng.chance(0.6)) add('cannon', [rng.range(0.3, 0.9), rng.range(-0.8, 0.2), 0.6], { size: rng.range(0.4, 0.7) });
  if (round && rng.chance(0.7)) add('light', [1, 0, 0], { mirror: false, radial: rng.int(5, 8), size: rng.range(0.6, 1) });
  else if (rng.chance(0.5)) add('light', [1, 0.2, rng.range(-0.5, 0.5)], { size: rng.range(0.6, 1) });
  if (rng.chance(0.5)) add(rng.pick<ShipPartKind>(['antenna', 'dish']), [rng.range(0.2, 0.6), 1, rng.range(-0.8, -0.2)], { size: rng.range(0.5, 0.9) });
  if (rng.chance(0.3)) add('grabber', [0, -1, rng.range(-0.2, 0.4)], { mirror: false, size: rng.range(0.5, 0.8) });
  if (rng.chance(0.35)) add('ring', [0, 1, 0], { mirror: false, size: rng.range(0.6, 0.9) * Math.max(r[0], r[2]) * 0.6 });
  return d;
}

export function encodeShip(d: ShipDesign): string {
  const json = JSON.stringify(d, (_k, val: unknown) => (typeof val === 'number' ? Math.round(val * 1000) / 1000 : val));
  let bin = '';
  for (const b of new TextEncoder().encode(json)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeShip(text: string): ShipDesign | null {
  try {
    const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    const d = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))) as ShipDesign;
    if (!Array.isArray(d.parts) || d.parts.length === 0 || !d.paint) return null;
    if (d.parts.some((p) => !(p.kind in SHIP_PARTS) || !Array.isArray(p.pos) || !Array.isArray(p.normal))) return null;
    d.name ??= 'Ship';
    d.paint = { ...defaultPaint(), ...d.paint };
    for (const p of d.parts) {
      p.stretch ??= 1;
      p.spin ??= 0;
      p.tilt ??= 0;
      p.lean ??= 0;
      p.radial ??= 1;
      p.mirror ??= false;
    }
    d.parts[0]!.parent = -1;
    return d;
  } catch {
    return null;
  }
}

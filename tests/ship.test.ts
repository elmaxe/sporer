import { describe, expect, it } from 'vitest';
import {
  MAX_COMPLEXITY,
  applyInstance,
  complexity,
  coreRadii,
  coreSurface,
  decodeShip,
  defaultShip,
  descendants,
  duplicatePart,
  encodeShip,
  instances,
  movePart,
  newPart,
  partFrame,
  randomShip,
  removePart,
  resizePart,
  unapplyInstance,
  type ShipDesign,
  type Vec3,
} from '../src/gen/ship';

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const close = (a: Vec3, b: Vec3, digits = 6) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, digits));

/** A saucer with a mirrored wing on its rim and a light on the wing's tip. */
function wingShip(): ShipDesign {
  const d = defaultShip();
  d.parts.length = 1;
  d.parts.push(newPart('wing', [2, 0, 0], [1, 0, 0], 0, true));
  d.parts.push(newPart('light', [3.5, 0, -0.5], [0, 1, 0], 1, true));
  return d;
}

describe('ship symmetry', () => {
  it('mirrors pairs, copies round the ship, and keeps parts on an axis single', () => {
    const side = newPart('fin', [1, 0.5, 0], [1, 0, 0], 0, true, 1);
    expect(instances(side)).toHaveLength(2);
    expect(instances({ ...side, radial: 4 })).toHaveLength(8);
    expect(instances({ ...side, mirror: false, radial: 3 })).toHaveLength(3);
    // On the middle line a mirror image would sit on the part itself; on the vertical axis so would its turned copies.
    expect(instances(newPart('fin', [0, 0.5, -1], [0, 0.3, -1], 0, true))).toHaveLength(1);
    expect(instances(newPart('dome', [0, 0.6, 0], [0, 1, 0], 0, true, 6))).toHaveLength(1);
    // The core is never copied.
    expect(instances({ ...defaultShip().parts[0]!, mirror: true, radial: 5 })).toHaveLength(1);
  });

  it('takes a point on any copy back onto the part itself', () => {
    const p: Vec3 = [1.3, -0.4, 0.7];
    for (const inst of instances({ ...newPart('fin', [1, 0, 0], [1, 0, 0], 0, true), radial: 5 })) {
      close(unapplyInstance(applyInstance(p, inst), inst), p);
    }
    // Mirroring flips x only.
    close(applyInstance(p, { angle: 0, mirrored: true }), [-1.3, -0.4, 0.7]);
  });

  it('counts every copy towards the complexity cap, and random ships fit under it', () => {
    expect(complexity(defaultShip())).toBe(1 + 1 + 8);
    for (let seed = 1; seed <= 60; seed++) {
      const d = randomShip(seed);
      expect(complexity(d)).toBeLessThanOrEqual(MAX_COMPLEXITY);
      d.parts.forEach((p, i) => expect(p.parent).toBeLessThan(i === 0 ? 0 : i));
    }
  });
});

describe('ship part frames', () => {
  it('are orthonormal and right-handed for any placement', () => {
    for (let seed = 1; seed <= 30; seed++) {
      for (const p of randomShip(seed).parts) {
        const f = partFrame({ ...p, spin: seed * 0.3, tilt: seed * 0.05 - 0.6, lean: 0.2 });
        for (const a of [f.x, f.y, f.z]) expect(Math.hypot(...a)).toBeCloseTo(1, 6);
        expect(dot(f.x, f.y)).toBeCloseTo(0, 6);
        expect(dot(f.y, f.z)).toBeCloseTo(0, 6);
        // x × y = z.
        close([f.x[1] * f.y[2] - f.x[2] * f.y[1], f.x[2] * f.y[0] - f.x[0] * f.y[2], f.x[0] * f.y[1] - f.x[1] * f.y[0]], f.z);
      }
    }
  });

  it('grows surface parts out of the surface and lays axial parts along the ship', () => {
    const fin = partFrame(newPart('fin', [0, 1, 0], [0, 1, 0], 0));
    close(fin.y, [0, 1, 0]);
    close(fin.z, [0, 0, 1]);
    // An engine on the hull's side still points backwards (its z is the nose), standing out from the side.
    const engine = partFrame(newPart('engine', [1, 0, 0], [1, 0, 0], 0));
    close(engine.z, [0, 0, 1]);
    expect(engine.origin[0]).toBeGreaterThan(1);
    // Even on the tail.
    close(partFrame(newPart('engine', [0, 0, -2], [0, 0, -1], 0)).z, [0, 0, 1]);
  });

  it('finds the core surface along a direction, with the ellipsoid normal', () => {
    const core = defaultShip().parts[0]!;
    const r = coreRadii(core);
    close(coreSurface(core, [1, 0, 0]).pos, [r[0], 0, 0]);
    close(coreSurface(core, [0, 1, 0]).normal, [0, 1, 0]);
    const s = coreSurface(core, [1, 1, 0]);
    expect((s.pos[0] / r[0]) ** 2 + (s.pos[1] / r[1]) ** 2).toBeCloseTo(1, 6);
  });
});

describe('ship editing', () => {
  it('moves and resizes what is stuck to a part with it', () => {
    const d = wingShip();
    expect(descendants(d, 1)).toEqual([2]);
    movePart(d, 1, [1.8, 0.2, -0.5], [1, 0.1, 0], 0);
    close(d.parts[2]!.pos, [3.3, 0.2, -1]);
    const before = d.parts[2]!.pos;
    resizePart(d, 0, 2);
    // The core grew: everything on it (the wing, and the light on the wing) moves out with its surface.
    expect(d.parts[0]!.size).toBeCloseTo(2);
    expect(d.parts[1]!.pos[0]).toBeCloseTo(3.6);
    expect(d.parts[2]!.pos[0]).toBeCloseTo(before[0] * 2);
  });

  it('removes a part with everything on it and renumbers the rest', () => {
    const d = wingShip();
    d.parts.push(newPart('engine', [0, 0, -2], [0, 0, -1], 0, false));
    d.parts.push(newPart('fin', [0, 0.5, -2], [0, 1, 0], 3, false));
    removePart(d, 1);
    expect(d.parts.map((p) => p.kind)).toEqual(['saucer', 'engine', 'fin']);
    expect(d.parts[2]!.parent).toBe(1);
    removePart(d, 0);
    expect(d.parts).toHaveLength(3);
  });

  it('duplicates a part with what is on it', () => {
    const d = wingShip();
    const at = duplicatePart(d, 1);
    expect(at).toBe(3);
    expect(d.parts).toHaveLength(5);
    expect(d.parts[4]!.parent).toBe(3);
  });

  it('round-trips a design through its link', () => {
    const d = randomShip(9);
    d.parts[2]!.paint = { base: '#ff0000' };
    const back = decodeShip(encodeShip(d))!;
    expect(back.parts.map((p) => p.kind)).toEqual(d.parts.map((p) => p.kind));
    expect(back.parts[2]!.paint).toEqual({ base: '#ff0000' });
    expect({ ...back.paint, patternScale: 0 }).toEqual({ ...d.paint, patternScale: 0 });
    expect(back.paint.patternScale).toBeCloseTo(d.paint.patternScale, 3);
    expect(decodeShip('nonsense')).toBeNull();
  });
});

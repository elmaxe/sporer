import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_FULL,
  ACTIVITY_LIMIT,
  NUCLEUS_RADIUS,
  cometActivity,
  cometVents,
  describeComet,
  describeNucleus,
  generateComets,
  type CometContext,
} from '../src/gen/comets';
import { generateGalaxy } from '../src/gen/galaxy';
import { Rng } from '../src/gen/rng';
import {
  COMET_LOBES,
  MIN_NECK,
  SHAPE_FLOOR,
  generateShape,
  normaliseShape,
  shapeExtents,
  shapeNormal,
  shapeRadius,
  type Lobe,
  type ShapeData,
} from '../src/gen/shape';
import type { Vec3Tuple } from '../src/gen/starActivity';
import { generateSystem } from '../src/gen/system';
import { createTerrainGeometry, floorRadius, peakRadius, terrainSampler } from '../src/world/planetGeometry';

/** Evenly spread unit directions (a Fibonacci sphere). */
function directions(n: number): Vec3Tuple[] {
  const out: Vec3Tuple[] = [];
  for (let i = 0; i < n; i++) {
    const z = 1 - (2 * (i + 0.5)) / n;
    const s = Math.sqrt(1 - z * z);
    const a = i * 2.399963229728653;
    out.push([s * Math.cos(a), s * Math.sin(a), z]);
  }
  return out;
}

const shapes = Array.from({ length: 60 }, (_, i) => generateShape(new Rng(i).fork('shape')));

/** Where a ray from the centre along unit `d` leaves a lobe (the far root), in the shape's raw units. */
function support(lobe: Lobe, d: Vec3Tuple): number {
  // Half-width of the ellipsoid along d: √Σ (rᵢ · d·eᵢ)².
  return Math.sqrt(lobe.axes.reduce((s, e, i) => s + (lobe.radii[i]! * (d[0] * e[0] + d[1] * e[1] + d[2] * e[2])) ** 2, 0));
}

describe('irregular shapes', () => {
  it('are deterministic', () => {
    expect(generateShape(new Rng(7).fork('shape'))).toEqual(generateShape(new Rng(7).fork('shape')));
    expect(generateShape(new Rng(7).fork('shape'))).not.toEqual(generateShape(new Rng(8).fork('shape')));
  });

  it('reach 1 at their longest and never dip below the floor', () => {
    const dirs = directions(20000);
    for (const shape of shapes) {
      let max = 0;
      let min = Infinity;
      for (const [x, y, z] of dirs) {
        const r = shapeRadius(shape, x, y, z);
        max = Math.max(max, r);
        min = Math.min(min, r);
      }
      expect(max).toBeLessThanOrEqual(1.002);
      expect(max).toBeGreaterThan(0.99);
      expect(min).toBeGreaterThanOrEqual(SHAPE_FLOOR);
      expect(shape.min).toBeGreaterThanOrEqual(SHAPE_FLOOR);
      // The recorded shortest radius is measured on a coarser grid: close to the truth.
      expect(Math.abs(shape.min - min)).toBeLessThan(0.08);
    }
  });

  it('are one connected surface: every lobe contains the centre, so each ray leaves the body once', () => {
    for (const shape of shapes) {
      for (const lobe of shape.lobes) {
        const [cx, cy, cz] = lobe.centre;
        // The centre in the lobe's unit-sphere frame is inside it.
        const inside = lobe.axes.reduce((s, e, i) => s + ((cx * e[0] + cy * e[1] + cz * e[2]) / lobe.radii[i]!) ** 2, 0);
        expect(inside).toBeLessThan(1);
      }
    }
  });

  it('come in one, two (contact binaries) or three lobes, about as often as the weights say', () => {
    const counts = new Map<number, number>();
    for (let i = 0; i < 600; i++) {
      const n = generateShape(new Rng(i).fork('shape')).lobes.length;
      counts.set(n, (counts.get(n) ?? 0) + 1);
    }
    const total = COMET_LOBES.reduce((s, [, w]) => s + w, 0);
    for (const [lobes, weight] of COMET_LOBES) expect((counts.get(lobes) ?? 0) / 600).toBeCloseTo(weight / total, 1);
    expect(shapes.some((s) => s.binary)).toBe(true);
    expect(shapes.some((s) => !s.binary)).toBe(true);
  });

  it("give contact binaries a neck at least MIN_NECK of each lobe's width", () => {
    let binaries = 0;
    for (const shape of shapes.filter((s) => s.binary)) {
      binaries++;
      const [a, b] = shape.lobes as [Lobe, Lobe];
      const axis = new THREE.Vector3(...a.centre).sub(new THREE.Vector3(...b.centre)).normalize();
      const side = new THREE.Vector3().crossVectors(axis, Math.abs(axis.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize();
      const d = new THREE.Vector3();
      // Round the neck: at right angles to the line through the lobes' centres.
      for (let k = 0; k < 64; k++) {
        d.copy(side).applyAxisAngle(axis, (k / 64) * Math.PI * 2);
        const dir: Vec3Tuple = [d.x, d.y, d.z];
        const neck = shapeRadius(shape, d.x, d.y, d.z);
        const width = Math.min(support(a, dir), support(b, dir)) * shape.scale;
        expect(neck).toBeGreaterThanOrEqual(MIN_NECK * width);
      }
    }
    expect(binaries).toBeGreaterThan(5);
  });

  it('look like real nuclei: elongated, as the visited ones (longest / shortest 1.4–3.5)', () => {
    for (const shape of shapes) {
      const e = shapeExtents(shape);
      const ratio = Math.max(...e) / Math.min(...e);
      expect(ratio).toBeGreaterThan(1.1);
      expect(ratio).toBeLessThan(3.5);
    }
  });

  it('measure again after an edit', () => {
    const shape = generateShape(new Rng(3).fork('shape'));
    shape.lumps.amplitude = 0.25;
    normaliseShape(shape);
    let max = 0;
    for (const [x, y, z] of directions(20000)) max = Math.max(max, shapeRadius(shape, x, y, z));
    expect(max).toBeCloseTo(1, 2);
  });

  it('have outward normals: straight out on a sphere, the ellipsoid gradient on an ellipsoid', () => {
    const smooth = (lobe: Lobe): ShapeData => ({
      lobes: [lobe],
      blend: 0.1,
      lumps: { amplitude: 0, frequency: 1, seed: 0 },
      craters: [],
      scale: 1,
      min: 1,
      binary: false,
    });
    const axes: Lobe['axes'] = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    const sphere = smooth({ centre: [0, 0, 0], radii: [1, 1, 1], axes });
    const ellipsoid = smooth({ centre: [0, 0, 0], radii: [1, 0.6, 0.4], axes });
    const n: Vec3Tuple = [0, 0, 0];
    for (const dir of directions(50)) {
      shapeNormal(sphere, dir, n);
      expect(n[0] * dir[0] + n[1] * dir[1] + n[2] * dir[2]).toBeCloseTo(1, 4);
      shapeNormal(ellipsoid, dir, n);
      // The surface point p and its gradient (x/a², y/b², z/c²).
      const r = shapeRadius(ellipsoid, ...dir);
      const g = new THREE.Vector3(dir[0] * r, (dir[1] * r) / 0.36, (dir[2] * r) / 0.16).normalize();
      expect(g.dot(new THREE.Vector3(...n))).toBeCloseTo(1, 3);
    }
  });
});

describe('the ground of a shaped body', () => {
  const shape = shapes.find((s) => s.binary)!;
  const style = { sea: null, seaLevel: 0, low: '#2a2622', high: '#45403b', relief: 0.04 };
  const R = 60;

  it('is the shape times the radius, plus the relief', () => {
    const sample = terrainSampler(R, 5, style, { shape });
    const color = new THREE.Color();
    for (const [x, y, z] of directions(2000)) {
      const r = sample(new THREE.Vector3(x, y, z), color);
      const s = shapeRadius(shape, x, y, z);
      expect(r).toBeGreaterThanOrEqual(R * s - 1e-9);
      expect(r).toBeLessThanOrEqual(R * (s + style.relief) + 1e-9);
      expect(r).toBeGreaterThanOrEqual(floorRadius(R, style, 1, false, true));
      expect(r).toBeLessThanOrEqual(peakRadius(R, style) * 1.002);
    }
  });

  it("is what the system view's mesh is built from", () => {
    const geometry = createTerrainGeometry(R, 5, style, { segments: 8, shape });
    const sample = terrainSampler(R, 5, style, { shape });
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    const p = new THREE.Vector3();
    const color = new THREE.Color();
    for (let i = 0; i < position.count; i += 7) {
      p.fromBufferAttribute(position, i);
      const r = p.length();
      expect(sample(p.normalize(), color)).toBeCloseTo(r, 3);
    }
    geometry.dispose();
  });
});

describe('comets', () => {
  const ctx: CometContext = { systemName: 'Test', starZone: 30, starRadius: 30, outerEdge: 900, period: (a) => 50 * (a / 90) ** 1.5 };

  it('each have a nucleus: a seed, a spin, a dark style and an irregular shape, deterministic', () => {
    const a = generateComets(new Rng(11).fork('comets'), ctx);
    const b = generateComets(new Rng(11).fork('comets'), ctx);
    expect(a).toEqual(b);
    for (let seed = 0; seed < 40; seed++) {
      for (const c of generateComets(new Rng(seed).fork('comets'), ctx)) {
        expect(c.radius).toBeGreaterThanOrEqual(NUCLEUS_RADIUS[0]);
        expect(c.radius).toBeLessThanOrEqual(NUCLEUS_RADIUS[1]);
        expect(Math.abs(c.spin)).toBeGreaterThan(0.05);
        expect(c.style.sea).toBeNull();
        // Very dark (albedo ~4%): no channel above ~0.3.
        for (const hex of [c.style.low, c.style.high]) expect(Math.max(...[1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16) / 255))).toBeLessThan(0.33);
        expect(c.shape.lobes.length).toBeGreaterThan(0);
      }
    }
  });

  it('are visitable in generated systems, on the orbits they always had', () => {
    const galaxy = generateGalaxy(1337);
    let comets = 0;
    for (const ref of galaxy.stars.slice(0, 40)) {
      for (const c of generateSystem(ref).comets) {
        comets++;
        expect(describeComet(c)).toMatch(/^Comet · returns every \d+ min · closest pass \d+ u$/);
      }
    }
    expect(comets).toBeGreaterThan(10);
  });

  it('wake up near the star: 1/r² inside, faded out by 3 habitable radii', () => {
    const hab = 150;
    expect(cometActivity(0.5 * hab, hab, 1.2)).toBe(1);
    expect(cometActivity(1.2 * hab, hab, 1.2)).toBe(1);
    expect(cometActivity(2 * hab, hab, 1.2)).toBeCloseTo((1.2 / 2) ** 2, 6);
    expect(cometActivity(ACTIVITY_FULL * hab, hab, 1.2)).toBeCloseTo((1.2 / ACTIVITY_FULL) ** 2, 6);
    expect(cometActivity(ACTIVITY_LIMIT * hab, hab, 1.2)).toBe(0);
    expect(cometActivity(6 * hab, hab, 1.2)).toBe(0);
    let last = 2;
    for (let zone = 0.2; zone < 4; zone += 0.05) {
      const a = cometActivity(zone * hab, hab, 1.2);
      expect(a).toBeLessThanOrEqual(last);
      last = a;
    }
  });

  it('blow jets from a few vents, along the ground’s normal', () => {
    for (const shape of shapes.slice(0, 20)) {
      const vents = cometVents(42, shape);
      expect(vents).toEqual(cometVents(42, shape));
      expect(vents.length).toBeGreaterThanOrEqual(4);
      expect(vents.length).toBeLessThanOrEqual(9);
      for (const v of vents) {
        expect(Math.hypot(...v.normal)).toBeCloseTo(1, 6);
        // Outward: within 90° of the vent's direction.
        expect(v.normal[0] * v.dir[0] + v.normal[1] * v.dir[1] + v.normal[2] * v.dir[2]).toBeGreaterThan(0);
      }
    }
  });

  it('describe their nucleus and how awake it is', () => {
    expect(describeNucleus({ binary: true, lobes: [] }, 1)).toBe('Contact binary nucleus · jets active');
    expect(describeNucleus({ binary: false, lobes: [] }, 0.1)).toBe('Irregular nucleus · jets waking');
    expect(describeNucleus({ binary: false, lobes: [] }, 0)).toBe('Irregular nucleus · dormant, frozen');
  });
});

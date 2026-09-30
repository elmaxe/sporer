import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { pickNebula } from '../src/galaxy/pickPoint';
import { GALAXY_RADIUS, generateGalaxy } from '../src/gen/galaxy';
import {
  H_II_PINK,
  O_III_TEAL,
  bipolarReach,
  generateNebulas,
  nebulaAt,
  nebulaColumn,
  nebulaDensity,
  starTransmittance,
  toNebulaLocal,
  type NebulaData,
  type NebulaKind,
} from '../src/gen/nebulas';
import { rotate } from '../src/gen/quat';
import { generateSystem } from '../src/gen/system';
import { MAX_DIM_BLOBS, starDimmingUniforms } from '../src/world/nebulaLook';

type V = { x: number; y: number; z: number };
const galaxy = generateGalaxy(1337);
const { nebulas } = galaxy;
const KINDS: NebulaKind[] = ['emission', 'reflection', 'dark', 'planetary', 'remnant'];
const byKind = (kind: NebulaKind) => nebulas.filter((n) => n.kind === kind);
const dist = (a: V, b: V) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const len = (v: V) => Math.hypot(v.x, v.y, v.z);
const unit = (v: V) => ({ x: v.x / len(v), y: v.y / len(v), z: v.z / len(v) });
/** A galaxy-space point from one in the nebula's frame. */
const toGalaxy = (n: NebulaData, p: V) => {
  const g = rotate(n.orientation, p, { x: 0, y: 0, z: 0 });
  return { x: n.position.x + g.x * n.radius, y: n.position.y + g.y * n.radius, z: n.position.z + g.z * n.radius };
};
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

/** The smooth density integrated numerically along a ray, in local units (what nebulaColumn computes). */
function marchColumn(n: NebulaData, origin: V, dir: V, length: number): number {
  const steps = 4000;
  const end = Math.min(length, dist(origin, n.position) + 2 * n.radius);
  const dt = end / steps;
  const local = { x: 0, y: 0, z: 0 };
  let sum = 0;
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) * dt;
    toNebulaLocal(n, { x: origin.x + dir.x * t, y: origin.y + dir.y * t, z: origin.z + dir.z * t }, local);
    sum += nebulaDensity(n, local) * (dt / n.radius);
  }
  return sum;
}

describe('generateNebulas', () => {
  it('is deterministic and follows the seed', () => {
    expect(generateNebulas(1337, galaxy.stars, GALAXY_RADIUS)).toEqual(nebulas);
    expect(generateGalaxy(2).nebulas.map((n) => n.name)).not.toEqual(nebulas.map((n) => n.name));
  });

  it('only adds a nebula field to a system', () => {
    // Its own stream: a system's generation draws nothing for it.
    const ref = galaxy.stars.find((s) => s.nebula)!;
    expect(generateSystem({ ...ref, nebula: null })).toEqual({ ...generateSystem(ref), nebula: null });
  });

  it('makes every kind, with names, in the default galaxy and others', () => {
    for (const seed of [1337, 1, 2, 42]) {
      const g = seed === 1337 ? galaxy : generateGalaxy(seed);
      for (const kind of KINDS) expect(g.nebulas.some((n) => n.kind === kind), `${kind} at seed ${seed}`).toBe(true);
      // Some systems sit in each kind.
      for (const kind of KINDS) expect(g.stars.some((s) => s.nebula?.kind === kind), `inside ${kind} at seed ${seed}`).toBe(true);
    }
    for (const n of nebulas) expect(n.name).toMatch(/^[A-Z][a-z]+ Nebula$/);
    expect(new Set(nebulas.map((n) => n.id)).size).toBe(nebulas.length);
  });

  it('scales the count with the galaxy and copes with tiny ones', () => {
    expect(generateGalaxy(1337, 1000).nebulas.length).toBeLessThan(nebulas.length / 2);
    expect(() => generateGalaxy(1337, 10)).not.toThrow();
  });

  it('builds each kind round a fitting star', () => {
    for (const n of nebulas) {
      const host = galaxy.stars[n.star]!;
      const primary = host.stars[0]!;
      if (n.kind === 'emission') expect(primary.kind === 'blueGiant' || ['O', 'B'].includes(primary.spectralClass)).toBe(true);
      if (n.kind === 'reflection') expect(['B', 'A']).toContain(primary.spectralClass);
      if (n.kind === 'planetary') {
        expect(host.stars.some((s) => s.kind === 'whiteDwarf')).toBe(true);
        // The white dwarf is at the shell's centre.
        expect(dist(host.position, n.position)).toBeLessThan(1e-9);
      }
      // The host star is where the nebula says, and inside it.
      expect(dist(toGalaxy(n, n.starLocal), host.position)).toBeLessThan(1e-6);
      expect(nebulaAt(nebulas, host.position)?.nebula).toBe(n);
      expect(host.nebula).toBe(n);
    }
  });

  it('never overlaps two nebulas, and keeps each inside its bounding sphere', () => {
    for (const a of nebulas) {
      for (const b of nebulas) if (a !== b) expect(dist(a.position, b.position)).toBeGreaterThanOrEqual(a.radius + b.radius);
      for (const blob of a.blobs) {
        const reach = len(blob.center) + Math.max(blob.radii.x, blob.radii.y, blob.radii.z);
        expect(reach).toBeLessThanOrEqual(1 + 1e-9);
      }
      if (a.shell) {
        const { axes, width } = a.shell;
        expect(Math.max(axes.x, axes.y, axes.z) * (1 + 3 * width)).toBeLessThanOrEqual(1 + 1e-9);
      }
      expect(a.shape === 'clouds').toBe(a.blobs.length > 0);
    }
  });

  it('keeps the kinds in their real order of size (docs/research/nebulas.md)', () => {
    const size = (k: NebulaKind) => median(byKind(k).map((n) => n.radius));
    expect(size('emission')).toBeGreaterThan(size('remnant'));
    expect(size('remnant')).toBeGreaterThan(size('reflection'));
    expect(size('dark')).toBeGreaterThan(size('reflection'));
    expect(size('reflection')).toBeGreaterThan(size('planetary'));
    for (const n of nebulas) {
      expect(n.radius).toBeGreaterThanOrEqual(8);
      expect(n.radius).toBeLessThan(95);
    }
  });

  it('colours them from their emission lines', () => {
    for (const n of byKind('emission')) expect(n.colors[1]).toBe(O_III_TEAL);
    for (const n of byKind('reflection')) {
      const c = new THREE.Color(n.colors[0]);
      expect(c.b).toBeGreaterThan(c.r);
    }
    for (const n of byKind('dark')) expect(n.dust).toBeGreaterThan(3);
    expect(H_II_PINK).toBe('#ff64ba');
  });
});

describe('nebulaAt', () => {
  it('finds nothing in empty space', () => {
    expect(nebulaAt(nebulas, { x: 0, y: 500, z: 0 })).toBeNull();
    const n = nebulas[0]!;
    expect(nebulaAt([n], { x: n.position.x + n.radius * 1.01, y: n.position.y, z: n.position.z })).toBeNull();
  });

  it('gives the density and colour there', () => {
    const n = byKind('emission')[0]!;
    const atStar = nebulaAt(nebulas, galaxy.stars[n.star]!.position)!;
    expect(atStar.density).toBeGreaterThan(0.9);
    // The hot core round the star is tinged with O III teal; its outskirts are the H II pink.
    const core = new THREE.Color(atStar.color);
    expect(core.g).toBeGreaterThan(new THREE.Color(n.colors[0]).g);
  });

  it('counts the inside of a shell as in it, though its middle is empty', () => {
    for (const n of [...byKind('planetary'), ...byKind('remnant')]) {
      const sample = nebulaAt([n], n.position)!;
      expect(sample.nebula).toBe(n);
      expect(sample.density).toBeLessThan(0.05);
    }
  });

  it('pinches a bipolar shell at the waist', () => {
    expect(bipolarReach(1)).toBeCloseTo(1, 9);
    expect(bipolarReach(0)).toBeLessThan(0.5);
  });
});

describe('nebulaColumn and starTransmittance', () => {
  const dark = byKind('dark')[0]!;
  const from = { x: dark.position.x + 3 * dark.radius, y: dark.position.y + 0.1 * dark.radius, z: dark.position.z - dark.radius };

  it('matches a numerical march along the ray, outside, inside and part way', () => {
    for (const n of [dark, byKind('emission')[1]!, byKind('planetary')[0]!, byKind('remnant')[0]!]) {
      const origins = [
        { x: n.position.x + 3 * n.radius, y: n.position.y + 0.1 * n.radius, z: n.position.z - n.radius },
        toGalaxy(n, { x: 0.2, y: -0.1, z: 0.1 }),
      ];
      for (const origin of origins) {
        const dir = unit({ x: n.position.x - origin.x + 0.2 * n.radius, y: n.position.y - origin.y, z: n.position.z - origin.z });
        for (const length of [Infinity, 2.5 * n.radius]) {
          const exact = nebulaColumn(n, origin, dir, length);
          expect(exact).toBeCloseTo(marchColumn(n, origin, dir, length), 2);
        }
      }
    }
  });

  it('hides the stars behind a dark nebula and nothing else', () => {
    const through = unit({ x: dark.position.x - from.x, y: dark.position.y - from.y, z: dark.position.z - from.z });
    const blob = toGalaxy(dark, dark.blobs[0]!.center);
    const intoBlob = unit({ x: blob.x - from.x, y: blob.y - from.y, z: blob.z - from.z });
    expect(starTransmittance([dark], from, intoBlob)).toBeLessThan(0.5);
    expect(starTransmittance([dark], from, { x: -through.x, y: -through.y, z: -through.z })).toBeCloseTo(1, 6);
    // Stars in front of it aren't dimmed: the column stops at the star.
    expect(starTransmittance([dark], from, intoBlob, 0.5 * dark.radius)).toBeGreaterThan(0.99);
    // Glowing kinds don't hide stars.
    const e = byKind('emission')[0]!;
    expect(starTransmittance([e], from, unit({ x: e.position.x - from.x, y: e.position.y - from.y, z: e.position.z - from.z }))).toBe(1);
  });

  it('agrees with the uniforms the galaxy map dims its stars with', () => {
    const u = starDimmingUniforms(nebulas);
    expect(u.uDimCount.value).toBeGreaterThan(0);
    expect(u.uDimCount.value).toBeLessThanOrEqual(MAX_DIM_BLOBS);
    // The shader's sum over blobs, evaluated here, for a star behind the dark nebula.
    const blob = toGalaxy(dark, dark.blobs[0]!.center);
    const ray = new THREE.Vector3(blob.x - from.x, blob.y - from.y, blob.z - from.z);
    const star = new THREE.Vector3(from.x, from.y, from.z).addScaledVector(ray, 3);
    const dir = ray.clone().normalize();
    const length = star.distanceTo(new THREE.Vector3(from.x, from.y, from.z));
    let depth = 0;
    for (let i = 0; i < u.uDimCount.value; i++) {
      const c = u.uDimBlobs.value[i]!;
      const m = u.uDimMatrices.value[i]!;
      const o = new THREE.Vector3(from.x - c.x, from.y - c.y, from.z - c.z).applyMatrix3(m);
      const d = dir.clone().applyMatrix3(m);
      const a = d.dot(d);
      const mm = o.dot(d) / a;
      const perp2 = Math.max(o.dot(o) - mm * mm * a, 0);
      const ka = 4.5 * a;
      const scale = (Math.exp(-4.5 * perp2) * 0.886226925) / Math.sqrt(ka);
      const erfc = (x: number) => 1 - erf(x);
      depth += c.w * scale * (erfc(Math.sqrt(ka) * mm) - erfc(Math.sqrt(ka) * (mm + length)));
    }
    const dark10 = nebulas.filter((n) => n.kind === 'dark');
    expect(Math.exp(-depth)).toBeCloseTo(starTransmittance(dark10, from, dir, length), 4);
  });
});

describe('pickNebula', () => {
  const n = nebulas[0]!;
  const origin = { x: n.position.x, y: n.position.y + 5 * n.radius, z: n.position.z };
  const down = { x: 0, y: -1, z: 0 };

  it('picks a nebula through its middle, not its faint edge or behind the camera', () => {
    expect(nebulas[pickNebula(origin, down, nebulas)]).toBe(n);
    const aside = { x: origin.x + 0.8 * n.radius, y: origin.y, z: origin.z };
    expect(pickNebula(aside, down, [n])).toBe(-1);
    expect(pickNebula(origin, { x: 0, y: 1, z: 0 }, [n])).toBe(-1);
  });

  it('skips the nebula the camera is inside', () => {
    expect(pickNebula(n.position, down, [n])).toBe(-1);
  });
});

/** erf to ~1e-12 (series / continued fraction), independent of the A&S approximation under test. */
function erf(x: number): number {
  if (x < 0) return -erf(-x);
  if (x < 3) {
    let sum = x;
    let term = x;
    for (let k = 1; k < 200; k++) {
      term *= (-x * x) / k;
      sum += term / (2 * k + 1);
    }
    return (2 / Math.sqrt(Math.PI)) * sum;
  }
  // Continued fraction for erfc.
  let f = 0;
  for (let k = 60; k >= 1; k--) f = k / 2 / (x + f);
  return 1 - Math.exp(-x * x) / Math.sqrt(Math.PI) / (x + f);
}

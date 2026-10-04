import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { VolcanoShape, volcanoParams, type VolcanoSite } from '../src/combat/volcano';
import { lodParams } from '../src/planet/LodSurface';
import { CHUNK_CELLS, nodeArc } from '../src/planet/quadtree';
import { VolcanoSurface } from '../src/planet/VolcanoSurface';
import {
  VOLCANO_CELLS,
  VOLCANO_MAX_DEPTH,
  concentricDisc,
  volcanoDiagonal,
  volcanoGridPoint,
  volcanoMaxDepth,
  type DiscPoint,
} from '../src/planet/volcanoGrid';
import type { VolcanoGroundView } from '../src/world/volcanoMesh';

const disc = (): DiscPoint => ({ s: 0, azimuth: 0 });

describe('the volcano grid', () => {
  it('lays the square over the disc: centre on the summit, edge on the rim, turning anticlockwise', () => {
    expect(concentricDisc(0, 0, disc())).toEqual({ s: 0, azimuth: 0 });
    const p = disc();
    for (let k = 0; k <= 64; k++) {
      const u = -1 + k / 32;
      for (const [a, b] of [[1, u], [u, 1], [-1, u], [u, -1]] as const) expect(concentricDisc(a, b, p).s).toBeCloseTo(1, 12);
    }
    // Round the square's edge anticlockwise from (1, −1), the azimuth turns anticlockwise once.
    const edge = (k: number): [number, number] => {
      const side = Math.floor(k / 16);
      const t = ((k % 16) / 16) * 2 - 1;
      return side === 0 ? [1, t] : side === 1 ? [-t, 1] : side === 2 ? [-1, -t] : [t, -1];
    };
    let turned = 0;
    let last = concentricDisc(...edge(0), disc()).azimuth;
    for (let k = 1; k <= 64; k++) {
      const az = concentricDisc(...edge(k % 64), p).azimuth;
      let d = az - last;
      d -= Math.round(d / (Math.PI * 2)) * Math.PI * 2;
      expect(d).toBeGreaterThan(0);
      turned += d;
      last = az;
    }
    expect(turned).toBeCloseTo(Math.PI * 2, 9);
  });

  it('keeps areas: a quarter of the square lands inside half the radius', () => {
    let inside = 0;
    const n = 400;
    const p = disc();
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const s = concentricDisc(((i + 0.5) / n) * 2 - 1, ((j + 0.5) / n) * 2 - 1, p).s;
        expect(s).toBeLessThanOrEqual(1);
        if (s < 0.5) inside++;
      }
    }
    expect(inside / (n * n)).toBeCloseTo(0.25, 2);
  });

  it('gives the same bits for a point whatever depth it is built from', () => {
    const at = (d: number, x: number, y: number, i: number, j: number) => volcanoGridPoint(d, x, y, i, j, [0, 0]);
    expect(at(0, 0, 0, 0, 0)).toEqual([-1, -1]);
    expect(at(0, 0, 0, VOLCANO_CELLS, VOLCANO_CELLS)).toEqual([1, 1]);
    expect(at(0, 0, 0, 8, 8)).toEqual([0, 0]);
    expect(at(3, 5, 2, 7, 11)).toEqual(at(4, 10, 4, 14, 22));
    expect(at(1, 1, 0, 0, 16)).toEqual(at(1, 0, 1, 16, 0));
  });

  it('splits its cells along diagonals that mirror between the quadrants', () => {
    expect(volcanoDiagonal(0.5, 0.5)).toBe(true);
    expect(volcanoDiagonal(-0.5, -0.5)).toBe(true);
    expect(volcanoDiagonal(-0.5, 0.5)).toBe(false);
    expect(volcanoDiagonal(0.5, -0.5)).toBe(false);
  });

  it('splits as deep as it takes to be as fine as the terrain, and no deeper', () => {
    expect(volcanoMaxDepth(1, 2)).toBe(0);
    expect(volcanoMaxDepth(2, 2)).toBe(0);
    expect(volcanoMaxDepth(4, 2)).toBe(1);
    expect(volcanoMaxDepth(5, 2)).toBe(2);
    expect(volcanoMaxDepth(1e6, 1)).toBe(VOLCANO_MAX_DEPTH);
    expect(volcanoMaxDepth(3, 0)).toBe(0);
  });
});

describe('a volcano in low orbit', () => {
  const R = 400;
  const SINK = 1;
  const site: VolcanoSite = { x: 0.2, y: 0.9, z: 0.3, seed: 77 };
  const make = (growth = 1) => {
    const shape = new VolcanoShape(site, R, R, null);
    shape.growth = growth;
    const view: VolcanoGroundView = {
      ground: (_dir, color) => (color.setRGB(0.4, 0.4, 0.4), R),
      rise: (_dir, s, azimuth) => shape.height * shape.profile(s, azimuth),
      footSink: SINK,
    };
    return { shape, surface: new VolcanoSurface(shape, view, R) };
  };
  /** One chunk per update, whatever the machine's speed: the same tree every run. */
  const step = (surface: VolcanoSurface, camera: THREE.Vector3, dt = 0.05) => surface.update(camera, dt, 0);
  const settle = (surface: VolcanoSurface, camera: THREE.Vector3) => {
    for (let i = 0; i < 5000 && !(i > 0 && surface.settled); i++) step(surface, camera);
    return surface.settled;
  };
  const drawn = (surface: VolcanoSurface) =>
    surface.object.children.filter((m): m is THREE.Mesh => m instanceof THREE.Mesh && m.visible);
  /** A point `height` over the cone at `s`, `azimuth` (full-grown). */
  const over = (shape: VolcanoShape, s: number, azimuth: number, height: number) =>
    shape.direction(s, azimuth, new THREE.Vector3()).multiplyScalar(R + shape.height * shape.profile(s, azimuth) + height);

  /** Border segments of every drawn chunk not shared by exactly two chunks with the same endpoint bits (the footprint's rim aside). */
  const seams = (surface: VolcanoSurface) => {
    const side = VOLCANO_CELLS + 1;
    const key = (v: THREE.Vector3) => `${v.x},${v.y},${v.z}`;
    // On the rim (blending in, its chords sag a little under it); the nearest points inside are well above.
    const rim = (v: THREE.Vector3) => v.length() < R - SINK + 5e-4;
    const segments = new Map<string, number>();
    let collapsed = 0;
    let checked = 0;
    for (const mesh of drawn(surface)) {
      const p = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (const [start, stride] of [[0, 1], [0, side], [VOLCANO_CELLS, side], [VOLCANO_CELLS * side, 1]] as const) {
        for (let e = 0; e < VOLCANO_CELLS; e++) {
          const a = new THREE.Vector3().fromBufferAttribute(p, start + e * stride);
          const b = new THREE.Vector3().fromBufferAttribute(p, start + (e + 1) * stride);
          if (a.equals(b)) {
            collapsed++;
            continue;
          }
          if (rim(a) && rim(b)) continue;
          const k = [key(a), key(b)].sort().join('|');
          segments.set(k, (segments.get(k) ?? 0) + 1);
          checked++;
        }
      }
    }
    return { checked, collapsed, unmatched: [...segments.values()].filter((n) => n !== 2).length };
  };

  it('is one chunk from afar, and splits down to the terrain’s finest cells next to its flank', () => {
    const { shape, surface } = make();
    expect(settle(surface, shape.centre.clone().multiplyScalar(R * 3))).toBe(true);
    expect(surface.stats()).toMatchObject({ chunks: 1, minDepth: 0, maxDepth: 0, triangles: VOLCANO_CELLS * VOLCANO_CELLS * 2 });
    const near = over(shape, 0.6, 1, 3);
    expect(settle(surface, near)).toBe(true);
    const close = surface.stats();
    expect(close.maxDepth).toBe(surface.maxDepth);
    // Coarser away from the camera.
    expect(close.minDepth).toBeLessThan(close.maxDepth);
    // As fine as the terrain's finest cells, give or take the grid's stretch.
    const finest = (R * nodeArc(lodParams.maxDepth)) / CHUNK_CELLS;
    expect(surface.maxDepth).toBeGreaterThan(0);
    const rootCell = (shape.baseRadius * Math.sqrt(Math.PI)) / VOLCANO_CELLS;
    expect(rootCell / 2 ** surface.maxDepth).toBeLessThan(finest * 1.5);
    expect(rootCell / 2 ** surface.maxDepth).toBeGreaterThan(finest / 3);
    // Far fewer triangles than the whole cone at that size would take.
    expect(close.triangles).toBeLessThan((VOLCANO_CELLS * 2 ** close.maxDepth) ** 2 * 2 * 0.5);
    // Back out: it blends back and merges into one chunk again.
    expect(settle(surface, shape.centre.clone().multiplyScalar(R * 3))).toBe(true);
    expect(surface.stats().chunks).toBe(1);
    surface.dispose();
    expect(surface.object.children.length).toBe(0);
  });

  it('has no cracks where chunks of different levels meet, settled or blending', () => {
    const { shape, surface } = make();
    expect(settle(surface, over(shape, 0.5, 2, 2))).toBe(true);
    const settled = seams(surface);
    expect(settled.checked).toBeGreaterThan(200);
    expect(settled.unmatched).toBe(0);
    expect(settled.collapsed).toBeGreaterThan(10);
    // Fly across it and away: chunks split ahead, merge behind, blending all the while.
    let blending = 0;
    for (let i = 0; i < 160; i++) {
      const camera = i < 100 ? over(shape, Math.abs(0.9 - i * 0.018), 2, 2 + i * 0.05) : over(shape, 0, 0, 7 + (i - 100) * 4);
      step(surface, camera, 0.03);
      if (!surface.settled) blending++;
      expect(seams(surface).unmatched).toBe(0);
    }
    expect(blending).toBeGreaterThan(80);
    surface.dispose();
  });

  it('rises from the ground with its growth, its foot sunk under it', () => {
    const { shape, surface } = make(0);
    const camera = over(shape, 0.3, 0, 5);
    expect(settle(surface, camera)).toBe(true);
    const radii = () =>
      drawn(surface).flatMap((m) => {
        const p = m.geometry.getAttribute('position') as THREE.BufferAttribute;
        return Array.from({ length: p.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(p, i).length());
      });
    // Flat on the ground, never above it, sunk at the foot.
    expect(Math.max(...radii())).toBeLessThanOrEqual(R + 1e-3);
    expect(Math.min(...radii())).toBeCloseTo(R - SINK, 3);
    surface.setGrowth(1);
    step(surface, camera, 0);
    const top = Math.max(...radii());
    expect(top).toBeGreaterThan(R + shape.height * 0.95);
    expect(top).toBeLessThanOrEqual(R + shape.height + 1e-3);
    // The crater dips under its rim at the summit.
    expect(shape.profile(0, 0)).toBeCloseTo(1 - volcanoParams.craterDepth, 5);
    surface.dispose();
  });

  it('blends a new chunk in instead of popping, and holds still while time does', () => {
    const { shape, surface } = make();
    expect(settle(surface, shape.centre.clone().multiplyScalar(R * 3))).toBe(true);
    const camera = over(shape, 0.5, 1, 2);
    for (let i = 0; i < 6; i++) step(surface, camera, 0);
    expect(surface.stats().chunks).toBeGreaterThan(1);
    expect(surface.settled).toBe(false);
    let frames = 0;
    while (!surface.settled && frames < 2000) {
      step(surface, camera, 0.05);
      frames++;
    }
    expect(surface.settled).toBe(true);
    expect(frames * 0.05).toBeGreaterThan(lodParams.morphSeconds);
    surface.dispose();
  });
});

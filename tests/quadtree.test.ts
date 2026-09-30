import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { faceGridPoint, type FacePoint, type Vec3Like } from '../src/world/cubeSphereMath';
import {
  CHUNK_CELLS,
  MERGE_HYSTERESIS,
  beyondHorizon,
  cellAngle,
  childAt,
  edgeNeighbour,
  cellDiagonal,
  parentTarget,
  snapStep,
  snapTo,
  wantsSplit,
  type Edge,
} from '../src/planet/quadtree';
import { LodSurface, lodParams } from '../src/planet/LodSurface';

const point = (): Vec3Like => ({ x: 0, y: 0, z: 0 });
const key = (p: Vec3Like) => `${p.x},${p.y},${p.z}`;

describe('cube sphere quadtree', () => {
  it('gives the same bits for a point whatever the grid it is built from', () => {
    for (let face = 0; face < 6; face++) {
      for (const [i, j] of [[0, 0], [3, 7], [16, 5], [11, 16]]) {
        const coarse = faceGridPoint(face, i!, j!, 16, point());
        expect(faceGridPoint(face, 2 * i!, 2 * j!, 32, point())).toEqual(coarse);
        expect(faceGridPoint(face, 8 * i!, 8 * j!, 128, point())).toEqual(coarse);
      }
    }
  });

  it('finds the neighbour across every edge, and both sides share the edge’s points exactly', () => {
    const p: FacePoint = { face: 0, s: 0, t: 0 };
    for (let face = 0; face < 6; face++) {
      for (let edge = 0 as Edge; edge < 4; edge++) {
        edgeNeighbour(face, 0, 0, 0, edge, p);
        expect(p.face).not.toBe(face);
        // Every grid point on the neighbour face's border, then this edge's points must all be among them.
        const border = new Set<string>();
        for (let e = 0; e <= CHUNK_CELLS; e++) {
          for (const [i, j] of [[e, 0], [e, CHUNK_CELLS], [0, e], [CHUNK_CELLS, e]]) {
            border.add(key(faceGridPoint(p.face, i!, j!, CHUNK_CELLS, point())));
          }
        }
        for (let e = 0; e <= CHUNK_CELLS; e++) {
          const [i, j] = edge === 0 ? [0, e] : edge === 1 ? [CHUNK_CELLS, e] : edge === 2 ? [e, 0] : [e, CHUNK_CELLS];
          expect(border.has(key(faceGridPoint(face, i, j, CHUNK_CELLS, point())))).toBe(true);
        }
      }
    }
  });

  it('finds the neighbour inside the same face next door', () => {
    const p: FacePoint = { face: 0, s: 0, t: 0 };
    edgeNeighbour(2, 3, 4, 5, 1, p);
    expect(p.face).toBe(2);
    expect(Math.floor(p.s * 8)).toBe(5);
    expect(Math.floor(p.t * 8)).toBe(5);
    edgeNeighbour(2, 3, 4, 5, 2, p);
    expect(Math.floor(p.s * 8)).toBe(4);
    expect(Math.floor(p.t * 8)).toBe(4);
  });

  it('picks the child quadrant holding a point', () => {
    expect(childAt(0, 0, 0, 0.2, 0.3)).toBe(0);
    expect(childAt(0, 0, 0, 0.7, 0.3)).toBe(1);
    expect(childAt(0, 0, 0, 0.2, 0.9)).toBe(2);
    expect(childAt(0, 0, 0, 1, 1)).toBe(3);
    expect(childAt(2, 1, 2, 0.3, 0.7)).toBe(2);
  });

  it('hides what is behind the horizon, but not peaks that rise above it', () => {
    // Camera at 2 R: the horizon is 60° from straight below.
    expect(beyondHorizon(0, 0.1, 200, 100, 100)).toBe(false);
    expect(beyondHorizon(Math.PI, 0.1, 200, 100, 100)).toBe(true);
    expect(beyondHorizon(THREE.MathUtils.degToRad(65), 0.1, 200, 100, 100)).toBe(false);
    expect(beyondHorizon(THREE.MathUtils.degToRad(75), 0.1, 200, 100, 100)).toBe(true);
    // A 5% mountain shows ~18° further round.
    expect(beyondHorizon(THREE.MathUtils.degToRad(75), 0.1, 200, 100, 105)).toBe(false);
    // Inside the planet: nothing is hidden.
    expect(beyondHorizon(Math.PI, 0.1, 50, 100, 105)).toBe(false);
  });

  it('splits what looks big, with a margin before merging back', () => {
    const near = cellAngle(100, 2, 50, 10);
    const far = cellAngle(100, 2, 500, 10);
    expect(near).toBeGreaterThan(far);
    expect(cellAngle(100, 3, 50, 10)).toBeCloseTo(near / 2, 10);
    expect(cellAngle(100, 2, 5, 10)).toBeGreaterThan(0);
    expect(wantsSplit(0.06, 0.05, false)).toBe(true);
    expect(wantsSplit(0.045, 0.05, false)).toBe(false);
    expect(wantsSplit(0.045, 0.05, true)).toBe(true);
    expect(wantsSplit(0.05 * MERGE_HYSTERESIS * 0.99, 0.05, true)).toBe(false);
  });

  it('snaps to the coarser neighbour’s vertices', () => {
    expect([0, 1, 2, 3, 4].map((e) => snapTo(e, 1))).toEqual([0, 1, 2, 3, 4]);
    expect([0, 1, 2, 3, 4].map((e) => snapTo(e, 2))).toEqual([0, 0, 2, 2, 4]);
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map((e) => snapTo(e, 4))).toEqual([0, 0, 0, 4, 4, 4, 4, 8, 8]);
    expect(snapTo(CHUNK_CELLS - 1, CHUNK_CELLS)).toBe(CHUNK_CELLS);
    expect(snapStep(0)).toBe(1);
    expect(snapStep(1)).toBe(2);
    expect(snapStep(3)).toBe(8);
    expect(snapStep(9)).toBe(CHUNK_CELLS);
  });
});

describe('LOD surface', () => {
  const R = 100;
  // Bumpy on purpose: any crack between levels would gape.
  const bumpy = (dir: Vec3Like, color: THREE.Color) => {
    color.setRGB(1, 1, 1);
    return R * (1 + 0.04 * Math.sin(dir.x * 300) * Math.sin(dir.y * 280 + dir.z * 230));
  };
  const make = () => new LodSurface(R, R * 0.92, R * 1.08, bumpy, new THREE.MeshBasicMaterial());
  const settle = (surface: LodSurface, camera: THREE.Vector3) => {
    // One chunk per update, whatever the machine's speed: the same tree every run.
    const budget = lodParams.budgetMs;
    lodParams.budgetMs = 0;
    for (let i = 0; i < 5000 && !(i > 0 && surface.settled); i++) surface.update(camera, 0.05);
    lodParams.budgetMs = budget;
    return surface.settled;
  };
  const drawn = (surface: LodSurface) =>
    surface.object.children.filter((m): m is THREE.Mesh => m instanceof THREE.Mesh && m.visible);
  const triangles = (surface: LodSurface) =>
    drawn(surface).reduce((n, m) => n + m.geometry.getIndex()!.count / 3, 0);

  it('refines near the camera, coarse and culled far away, and settles', () => {
    const surface = make();
    expect(settle(surface, new THREE.Vector3(0, 0, R * 20))).toBe(true);
    const far = triangles(surface);
    expect(settle(surface, new THREE.Vector3(0, 0, R * 1.15))).toBe(true);
    const near = triangles(surface);
    expect(near).toBeGreaterThan(far);
    // Low over the ground most of the planet is behind the horizon: far fewer triangles than a uniform mesh at the finest level.
    const uniform = 6 * (CHUNK_CELLS * 2 ** lodParams.maxDepth) ** 2 * 2;
    expect(near).toBeLessThan(uniform / 8);
    // Back out again: merges back to about where it was.
    expect(settle(surface, new THREE.Vector3(0, 0, R * 20))).toBe(true);
    expect(triangles(surface)).toBe(far);
    surface.dispose();
  });

  /** Border segments of every drawn chunk near `up` that aren't shared by exactly two chunks with the same endpoint bits. */
  const seams = (surface: LodSurface, up: THREE.Vector3) => {
    const side = CHUNK_CELLS + 1;
    const key = (v: THREE.Vector3) => `${v.x},${v.y},${v.z}`;
    const segments = new Map<string, number>();
    let collapsed = 0;
    let checked = 0;
    for (const mesh of drawn(surface)) {
      const p = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (const [start, step] of [[0, 1], [0, side], [CHUNK_CELLS, side], [CHUNK_CELLS * side, 1]] as const) {
        for (let e = 0; e < CHUNK_CELLS; e++) {
          const a = new THREE.Vector3().fromBufferAttribute(p, start + e * step);
          const b = new THREE.Vector3().fromBufferAttribute(p, start + (e + 1) * step);
          if (a.equals(b)) {
            collapsed++;
            continue;
          }
          // Only where every neighbour is drawn (inside the horizon, which hides chunks from ~1 rad out).
          if (a.clone().normalize().dot(up) < Math.cos(0.6) || b.clone().normalize().dot(up) < Math.cos(0.6)) continue;
          const k = [key(a), key(b)].sort().join('|');
          segments.set(k, (segments.get(k) ?? 0) + 1);
          checked++;
        }
      }
    }
    return { checked, collapsed, unmatched: [...segments.values()].filter((n) => n !== 2).length };
  };

  it('has no cracks where chunks of different levels meet: every seam is the same segments on both sides', () => {
    const surface = make();
    const camera = new THREE.Vector3(0.3, 0.4, 1).setLength(R * 1.12);
    expect(settle(surface, camera)).toBe(true);
    const settled = seams(surface, camera.clone().normalize());
    expect(settled.checked).toBeGreaterThan(1000);
    expect(settled.unmatched).toBe(0);
    // And there were seams between levels to close.
    expect(settled.collapsed).toBeGreaterThan(20);
    surface.dispose();
  });

  it('stays closed while chunks blend in and out', () => {
    const surface = make();
    const camera = new THREE.Vector3(0.3, 0.4, 1).setLength(R * 3);
    expect(settle(surface, camera)).toBe(true);
    // Dive (chunks split below while the ones around, already finer or not, are still blending),
    // fly along (split ahead, merge behind), climb out (everything blends back and merges).
    const budget = lodParams.budgetMs;
    lodParams.budgetMs = 0;
    let blending = 0;
    for (let i = 0; i < 200; i++) {
      if (i < 80) camera.setLength(R * Math.max(1.09, 3 - i * 0.025));
      else if (i < 140) camera.applyAxisAngle(new THREE.Vector3(1, 0, 0), 0.004);
      else camera.setLength(R * (1.09 + (i - 140) * 0.03));
      surface.update(camera, 0.03);
      if (!surface.settled) blending++;
      expect(seams(surface, camera.clone().normalize()).unmatched).toBe(0);
    }
    lodParams.budgetMs = budget;
    expect(blending).toBeGreaterThan(100);
    surface.dispose();
  });

  it('blends a new chunk in over morphSeconds instead of popping', () => {
    const surface = make();
    expect(settle(surface, new THREE.Vector3(0, 0, R * 20))).toBe(true);
    const before = surface.stats().chunks;
    const budget = lodParams.budgetMs;
    lodParams.budgetMs = 1000;
    // Close in: builds, then shows the children, still blending.
    const camera = new THREE.Vector3(0, 0, R * 1.3);
    surface.update(camera, 0);
    surface.update(camera, 0);
    expect(surface.stats().chunks).toBeGreaterThan(before);
    expect(surface.settled).toBe(false);
    // Frozen time: stays mid-blend. Time passing: done within morphSeconds (plus the next level's).
    for (let i = 0; i < 5; i++) surface.update(camera, 0);
    expect(surface.settled).toBe(false);
    let frames = 0;
    while (!surface.settled && frames < 1000) {
      surface.update(camera, 0.05);
      frames++;
    }
    lodParams.budgetMs = budget;
    expect(surface.settled).toBe(true);
    // Each level blends in for morphSeconds before the next can split.
    expect(frames * 0.05).toBeGreaterThan(lodParams.morphSeconds);
    surface.dispose();
  });
});

describe('geomorphing targets', () => {
  it('puts a child, blended all the way back, exactly on its parent’s triangles', () => {
    const C = CHUNK_CELLS;
    const side = C + 1;
    const rnd = (k: number) => Math.sin(k * 12.9898) * 0.5;
    // A bumpy parent grid, its diagonals (shorter or not, at random), and the child covering its lower-left quarter.
    const parent = new Float32Array(side * side * 3);
    for (let j = 0; j < side; j++) for (let i = 0; i < side; i++) parent.set([i, j, rnd(j * side + i)], (j * side + i) * 3);
    const parentAC = Array.from({ length: C * C }, (_, k) => Math.sin(k * 7.1) > 0);
    const child = new Float32Array(side * side * 3);
    for (let j = 0; j < side; j++) {
      for (let i = 0; i < side; i++) {
        // Even points are the parent's; odd ones have their own height.
        const own = i % 2 === 0 && j % 2 === 0 ? parent[((j / 2) * side + i / 2) * 3 + 2]! : rnd(1000 + j * side + i);
        child.set([i / 2, j / 2, own], (j * side + i) * 3);
      }
    }
    const acOf = (i: number, j: number) => parentAC[(j >> 1) * C + (i >> 1)]!;
    const target = new Float32Array(child.length);
    parentTarget(child, target, side, acOf);
    const point = (i: number, j: number) => new THREE.Vector3().fromArray(target, (j * side + i) * 3);
    const parentPoint = (i: number, j: number) => new THREE.Vector3().fromArray(parent, (j * side + i) * 3);
    for (let j = 0; j < C; j++) {
      for (let i = 0; i < C; i++) {
        // The child's cell, split per cellDiagonal (with a random own preference), and the parent cell it lies in.
        const ac = cellDiagonal(i, j, Math.sin(i * 3 + j * 5) > 0, acOf(i, j));
        const [a, b, c, d] = [point(i, j), point(i + 1, j), point(i + 1, j + 1), point(i, j + 1)];
        const tris = ac ? [[a, b, c], [a, c, d]] : [[a, b, d], [b, c, d]];
        const pi = i >> 1;
        const pj = j >> 1;
        const [pa, pb, pc, pd] = [parentPoint(pi, pj), parentPoint(pi + 1, pj), parentPoint(pi + 1, pj + 1), parentPoint(pi, pj + 1)];
        const parentTris = acOf(i, j) ? [[pa, pb, pc], [pa, pc, pd]] : [[pa, pb, pd], [pb, pc, pd]];
        for (const tri of tris) {
          const inOne = parentTris.some(([p, q, r]) => {
            const plane = new THREE.Plane().setFromCoplanarPoints(p!, q!, r!);
            return tri.every((v) => Math.abs(plane.distanceToPoint(v!)) < 1e-5);
          });
          expect(inOne).toBe(true);
        }
      }
    }
  });
});

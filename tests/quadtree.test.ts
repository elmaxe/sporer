import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { faceGridPoint, type FacePoint, type Vec3Like } from '../src/world/cubeSphereMath';
import {
  CHUNK_CELLS,
  MERGE_HYSTERESIS,
  beyondHorizon,
  cellAngle,
  childAt,
  chordError,
  chunkBounds,
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

  it('folds a point just off a face over its edge onto the next face’s grid point, to the bit', () => {
    const n = CHUNK_CELLS;
    const p: FacePoint = { face: 0, s: 0, t: 0 };
    for (let face = 0; face < 6; face++) {
      for (let edge = 0 as Edge; edge < 4; edge++) {
        edgeNeighbour(face, 0, 0, 0, edge, p);
        // The neighbour face's points one cell in from its border.
        const inside = new Set<string>();
        for (let e = 0; e <= n; e++) {
          for (const [i, j] of [[e, 1], [e, n - 1], [1, e], [n - 1, e]]) inside.add(key(faceGridPoint(p.face, i!, j!, n, point())));
        }
        for (let e = 0; e <= n; e++) {
          const [i, j] = edge === 0 ? [-1, e] : edge === 1 ? [n + 1, e] : edge === 2 ? [e, -1] : [e, n + 1];
          expect(inside.has(key(faceGridPoint(face, i, j, n, point())))).toBe(true);
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

  it('measures how far flat cells sag inside a sphere, as seen from the camera', () => {
    // One cell of a depth-d node spans nodeArc(d) / CHUNK_CELLS radians of arc.
    const r = 100;
    for (const depth of [0, 2, 5]) {
      const theta = Math.PI / 2 / 2 ** depth / CHUNK_CELLS;
      const sag = r * (1 - Math.cos(theta / 2));
      // A cell seen from where it looks 0.1 rad wide.
      const distance = (r * theta) / 0.1;
      expect(chordError(0.1, depth)).toBeCloseTo(sag / distance, 6);
    }
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
  // Finer detail where it's sampled finer (as craters are, gen/craters.ts): chunks of different
  // levels sample the same point differently, so seams and blends can't rely on equal samples.
  const detailed = (dir: Vec3Like, color: THREE.Color, spacing = 0) => {
    const fine = spacing > 0 ? THREE.MathUtils.clamp(0.02 / spacing - 1, 0, 1) : 1;
    return bumpy(dir, color) + R * 0.02 * fine * Math.sin(dir.x * 900 + dir.y * 700) * Math.sin(dir.z * 800);
  };
  const make = (sample = bumpy) => new LodSurface(R * 0.92, R * 1.08, sample, new THREE.MeshBasicMaterial());
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

  it('bounds a chunk by its farthest point from the centre too, over both shapes', () => {
    const own = new Float32Array([3, 0, 0, 0, 4, 0]);
    const parent = new Float32Array([0, 0, 5, 1, 1, 1]);
    const b = chunkBounds([own, parent], { x: 0, y: 0, z: 0, radius: 0, reach: 0, top: 0 });
    expect(b.top).toBe(5);
    expect(b.reach).toBe(3.5);
  });

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

  it('refines a lumpy small body no more than a sphere its size, close up', () => {
    // A small body's ground spans SHAPE_FLOOR to its longest reach; this one
    // is 0.8 R under the camera, from 0.6 R to R round the sides.
    const lumpy = (dir: Vec3Like, color: THREE.Color) => {
      color.setRGB(1, 1, 1);
      return R * (0.8 + 0.2 * dir.x);
    };
    const sphere = (_dir: Vec3Like, color: THREE.Color) => {
      color.setRGB(1, 1, 1);
      return R * 0.8;
    };
    const camera = new THREE.Vector3(0, 0, R * 0.8 * 1.1);
    const shaped = new LodSurface(R * 0.25, R, lumpy, new THREE.MeshBasicMaterial());
    const round = new LodSurface(R * 0.8, R * 0.8, sphere, new THREE.MeshBasicMaterial());
    expect(settle(shaped, camera)).toBe(true);
    expect(settle(round, camera)).toBe(true);
    // Not the same (the lumpy one's horizon is farther and its sides steeper), but no blow-up.
    expect(triangles(shaped)).toBeLessThan(triangles(round) * 3);
    shaped.dispose();
    round.dispose();
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

  it.each([
    ['the same everywhere', bumpy],
    ['finer where sampled finer', detailed],
  ])('has no cracks where chunks of different levels meet: every seam is the same segments on both sides (%s)', (_, sample) => {
    const surface = make(sample);
    const camera = new THREE.Vector3(0.3, 0.4, 1).setLength(R * 1.12);
    expect(settle(surface, camera)).toBe(true);
    const settled = seams(surface, camera.clone().normalize());
    expect(settled.checked).toBeGreaterThan(1000);
    expect(settled.unmatched).toBe(0);
    // And there were seams between levels to close.
    expect(settled.collapsed).toBeGreaterThan(20);
    surface.dispose();
  });

  it.each([
    ['the same everywhere', bumpy],
    ['finer where sampled finer', detailed],
  ])('stays closed while chunks blend in and out (%s)', (_, sample) => {
    const surface = make(sample);
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

  /**
   * Points on chunks' edges drawn by more than one chunk near `up` (inside
   * the horizon) whose normals differ, and how many shared points there were.
   */
  const normalSeams = (surface: LodSurface, up: THREE.Vector3) => {
    const side = CHUNK_CELLS + 1;
    const at = new Map<string, Set<string>>();
    const v = new THREE.Vector3();
    for (const mesh of drawn(surface)) {
      const p = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      const n = mesh.geometry.getAttribute('normal') as THREE.BufferAttribute;
      for (let e = 0; e <= CHUNK_CELLS; e++) {
        for (const i of [e, e * side, e * side + CHUNK_CELLS, CHUNK_CELLS * side + e]) {
          v.fromBufferAttribute(p, i);
          if (v.clone().normalize().dot(up) < Math.cos(0.6)) continue;
          const k = `${v.x},${v.y},${v.z}`;
          const normals = at.get(k) ?? new Set<string>();
          normals.add(`${n.getX(i)},${n.getY(i)},${n.getZ(i)}`);
          at.set(k, normals);
        }
      }
    }
    return { points: at.size, unmatched: [...at.values()].filter((n) => n.size > 1).length };
  };

  it.each([
    ['the same everywhere', bumpy],
    ['finer where sampled finer', detailed],
  ])('shades smoothly: normals follow the slopes, and chunks agree on them where they meet (%s)', (_, sample) => {
    const surface = make(sample);
    const camera = new THREE.Vector3(0.3, 0.4, 1).setLength(R * 1.12);
    expect(settle(surface, camera)).toBe(true);
    const settled = normalSeams(surface, camera.clone().normalize());
    expect(settled.points).toBeGreaterThan(1000);
    expect(settled.unmatched).toBe(0);
    // Tilted off the vertical by the bumps (not a sphere's normals).
    let tilt = 0;
    let count = 0;
    const p = new THREE.Vector3();
    const n = new THREE.Vector3();
    for (const mesh of drawn(surface)) {
      const position = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      const normal = mesh.geometry.getAttribute('normal') as THREE.BufferAttribute;
      for (let i = 0; i < position.count; i++) {
        tilt += n.fromBufferAttribute(normal, i).angleTo(p.fromBufferAttribute(position, i));
        count++;
      }
    }
    expect(tilt / count).toBeGreaterThan(0.1);
    // And while chunks blend in and out.
    const budget = lodParams.budgetMs;
    lodParams.budgetMs = 0;
    for (let i = 0; i < 120; i++) {
      if (i < 60) camera.applyAxisAngle(new THREE.Vector3(1, 0, 0), 0.004);
      else camera.setLength(R * (1.12 + (i - 60) * 0.03));
      surface.update(camera, 0.03);
      expect(normalSeams(surface, camera.clone().normalize()).unmatched).toBe(0);
    }
    lodParams.budgetMs = budget;
    surface.dispose();
  });

  it('shows a new chunk first exactly where its parent was, even where it samples finer detail', () => {
    const surface = make(detailed);
    expect(settle(surface, new THREE.Vector3(0, 0, R * 20))).toBe(true);
    // Where every drawn vertex is now, by its direction (geometry.userData.directions).
    const where = (meshes: THREE.Mesh[]) => {
      const out = new Map<string, string>();
      for (const m of meshes) {
        const d = m.geometry.userData.directions as Float32Array;
        const p = m.geometry.getAttribute('position');
        for (let i = 0; i < p.count; i++) out.set(`${d[i * 3]},${d[i * 3 + 1]},${d[i * 3 + 2]}`, `${p.getX(i)},${p.getY(i)},${p.getZ(i)}`);
      }
      return out;
    };
    const before = where(drawn(surface));
    const budget = lodParams.budgetMs;
    lodParams.budgetMs = 1000;
    const camera = new THREE.Vector3(0, 0, R * 1.3);
    // Time frozen: the children show, not yet blended at all.
    for (let i = 0; i < 3; i++) surface.update(camera, 0);
    lodParams.budgetMs = budget;
    expect(surface.settled).toBe(false);
    const after = where(drawn(surface));
    let shared = 0;
    for (const [dir, position] of after) {
      if (!before.has(dir)) continue;
      shared++;
      expect(position).toBe(before.get(dir));
    }
    expect(shared).toBeGreaterThan(100);
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

  it('refines a smooth surface only as far as its outline (or coasts) need, far coarser than the terrain up close', () => {
    const sphere = () => R;
    const fine = new LodSurface(R, R, sphere, new THREE.MeshBasicMaterial());
    const outline = new LodSurface(R, R, sphere, new THREE.MeshBasicMaterial(), { smooth: 'outline' });
    const coast = new LodSurface(R, R, sphere, new THREE.MeshBasicMaterial(), { smooth: 'coast', renderOrder: -1 });
    const camera = new THREE.Vector3(0, 0, R * 1.05);
    for (const s of [fine, outline, coast]) expect(settle(s, camera)).toBe(true);
    expect(triangles(outline)).toBeLessThan(triangles(fine) / 4);
    // The coasts need a closer fit, still far coarser than the terrain's facets.
    expect(triangles(coast)).toBeGreaterThan(triangles(outline));
    expect(triangles(coast)).toBeLessThan(triangles(fine) / 3);
    // Fewer than the fixed 46-segment sea sphere it replaces drew from anywhere (12·46²), before the frustum culls any.
    expect(triangles(coast)).toBeLessThan(12 * 46 * 46);
    expect(drawn(coast).every((m) => m.renderOrder === -1)).toBe(true);
    for (const s of [fine, outline, coast]) s.dispose();
  });

  it("splits a sea's shallows as finely as the terrain, and its deep water by its sag", () => {
    // Shallow (depth 0.5 in the colour's red) north of the equator, deep south of it.
    const sea = (dir: Vec3Like, color: THREE.Color) => {
      color.setRGB(dir.y > 0 ? 0.5 : 10, 0, 0);
      return R;
    };
    const plain = new LodSurface(R, R, sea, new THREE.MeshBasicMaterial(), { smooth: 'coast' });
    const shallow = new LodSurface(R, R, sea, new THREE.MeshBasicMaterial(), { smooth: 'coast', shallow: 2 });
    const fine = new LodSurface(R, R, sea, new THREE.MeshBasicMaterial());
    const camera = new THREE.Vector3(0.3, 0.05, 1).setLength(R * 1.05);
    for (const s of [plain, shallow, fine]) expect(settle(s, camera)).toBe(true);
    expect(triangles(shallow)).toBeGreaterThan(triangles(plain) * 1.5);
    expect(triangles(shallow)).toBeLessThan(triangles(fine));
    for (const s of [plain, shallow, fine]) s.dispose();
  });

  it('leaves out chunks lying wholly under hiddenBelow (the sea floor), and keeps the rest closed', () => {
    const sea = R;
    // A sea floor: everything below the sea except a band of land round the equator.
    const floor = (dir: Vec3Like, color: THREE.Color) => {
      color.setRGB(1, 1, 1);
      return R * (Math.abs(dir.y) < 0.2 ? 1.02 : 0.95);
    };
    const all = new LodSurface(R * 0.95, R * 1.02, floor, new THREE.MeshBasicMaterial());
    const hiding = new LodSurface(R * 0.95, R * 1.02, floor, new THREE.MeshBasicMaterial(), { hiddenBelow: sea });
    for (const camera of [new THREE.Vector3(0, 0, R * 20), new THREE.Vector3(0.3, 0.6, 1).setLength(R * 1.1)]) {
      expect(settle(all, camera)).toBe(true);
      expect(settle(hiding, camera)).toBe(true);
      // The same tree either way: hiding only changes what's drawn.
      expect(hiding.object.children.length).toBe(all.object.children.length);
      const shown = drawn(hiding);
      expect(shown.length).toBeGreaterThan(0);
      expect(shown.length).toBeLessThan(drawn(all).length);
      // Every chunk drawn reaches above the sea, and those left out don't.
      const top = (m: THREE.Mesh) => {
        const p = m.geometry.getAttribute('position');
        let t = 0;
        for (let i = 0; i < p.count; i++) t = Math.max(t, Math.hypot(p.getX(i), p.getY(i), p.getZ(i)));
        return t;
      };
      for (const m of shown) expect(top(m)).toBeGreaterThanOrEqual(sea);
      expect(shown.length).toBe(drawn(all).filter((m) => top(m) >= sea).length);
    }
    all.dispose();
    hiding.dispose();
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

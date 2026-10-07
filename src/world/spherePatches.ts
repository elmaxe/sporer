import * as THREE from 'three';
import { beyondHorizon } from '../planet/quadtree';
import { CUBE_FACES, spherify } from './cubeSphereMath';

/** One patch of a SpherePatches: its mesh, and the unit direction of its middle with how far (radians) its vertices reach from it. */
export interface SpherePatch {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
  readonly centre: THREE.Vector3;
  readonly angle: number;
}

/**
 * A cube sphere (see cubeSphere.ts) cut into `perFace` × `perFace` patches on
 * each of the cube's six faces, each its own mesh sharing one material: the
 * same vertices and triangles as `createCubeSphere(radius, segments)`, so a
 * shader that works per vertex looks exactly the same, but three.js skips the
 * patches outside the camera's view, and `cullBehind` the ones facing away
 * from a camera outside the sphere. For shells drawn whole from anywhere (the
 * low-orbit atmosphere and cloud sheet), whose per-vertex work can't change
 * detail the way a LodSurface does.
 */
export class SpherePatches {
  readonly object = new THREE.Group();
  readonly patches: SpherePatch[] = [];
  /** The radius of the plane of the triangle farthest inside the sphere: a camera beyond it sees the triangle's front face. */
  private readonly inner: number;

  constructor(
    readonly radius: number,
    segments: number,
    perFace: number,
    material: THREE.Material,
    name: string,
  ) {
    const n = Math.max(1, Math.round(segments));
    const k = Math.max(1, Math.min(n, Math.round(perFace)));
    // A triangle's corners are at most about a cell's quarter turn over n apart from its middle.
    this.inner = radius * Math.cos(Math.PI / 2 / n);
    this.object.name = name;
    for (let face = 0; face < 6; face++) {
      for (let py = 0; py < k; py++) {
        for (let px = 0; px < k; px++) {
          const patch = createPatch(radius, n, face, Math.floor((px * n) / k), Math.floor(((px + 1) * n) / k), Math.floor((py * n) / k), Math.floor(((py + 1) * n) / k));
          const mesh = new THREE.Mesh(patch.geometry, material);
          mesh.name = name;
          this.patches.push({ mesh, centre: patch.centre, angle: patch.angle });
          this.object.add(mesh);
        }
      }
    }
  }

  /**
   * Hides the patches wholly on the far side of the sphere from a camera at
   * `camera` (the sphere's local space), whose every triangle faces away
   * from it: those a shader drawing only front faces from outside never
   * shows. `keep(patch)` can hide more (it's asked only about the patches
   * left). From inside the sphere (its vertices' radius) every patch is kept.
   */
  cullBehind(camera: THREE.Vector3, keep?: (patch: SpherePatch) => boolean): void {
    const d = camera.length();
    // Between the triangles' planes and the vertices' sphere the shells still count as inside (their back faces drawn).
    const outside = d > this.radius;
    for (const p of this.patches) {
      const behind = outside && beyondHorizon(p.centre.angleTo(camera), p.angle, d, this.inner, this.inner);
      p.mesh.visible = !behind && (keep?.(p) ?? true);
    }
  }

  /** Shows every patch (`keep` decides, if given). */
  showAll(keep?: (patch: SpherePatch) => boolean): void {
    for (const p of this.patches) p.mesh.visible = keep?.(p) ?? true;
  }

  /** How many triangles there are in all. */
  get allTriangles(): number {
    let n = 0;
    for (const p of this.patches) n += p.mesh.geometry.index!.count / 3;
    return n;
  }

  /** How many triangles are in the patches shown now (before three.js's frustum culling). */
  get triangles(): number {
    let n = 0;
    for (const p of this.patches) if (p.mesh.visible) n += p.mesh.geometry.index!.count / 3;
    return n;
  }

  dispose(): void {
    for (const p of this.patches) p.mesh.geometry.dispose();
  }
}

/**
 * The cells [i0, i1) × [j0, j1) of face `face` of an `n`-segment cube sphere,
 * with exactly createCubeSphere's vertices (from the same lattice) and its
 * diagonals; the patch's middle and reach.
 */
function createPatch(
  radius: number,
  n: number,
  face: number,
  i0: number,
  i1: number,
  j0: number,
  j1: number,
): { geometry: THREE.BufferGeometry; centre: THREE.Vector3; angle: number } {
  const [out, u, v] = CUBE_FACES[face]!;
  const w = i1 - i0 + 1;
  const h = j1 - j0 + 1;
  const positions = new Float32Array(w * h * 3);
  const normals = new Float32Array(w * h * 3);
  const lattice = [0, 0, 0];
  const dir = { x: 0, y: 0, z: 0 };
  const centre = new THREE.Vector3();
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      lattice[out[0]] = out[1] > 0 ? n : 0;
      lattice[u[0]] = u[1] > 0 ? i : n - i;
      lattice[v[0]] = v[1] > 0 ? j : n - j;
      spherify((2 * lattice[0]! - n) / n, (2 * lattice[1]! - n) / n, (2 * lattice[2]! - n) / n, dir);
      const e = ((j - j0) * w + (i - i0)) * 3;
      normals[e] = dir.x;
      normals[e + 1] = dir.y;
      normals[e + 2] = dir.z;
      positions[e] = dir.x * radius;
      positions[e + 1] = dir.y * radius;
      positions[e + 2] = dir.z * radius;
      centre.x += dir.x;
      centre.y += dir.y;
      centre.z += dir.z;
    }
  }
  centre.normalize();
  let minDot = 1;
  for (let e = 0; e < normals.length; e += 3) minDot = Math.min(minDot, normals[e]! * centre.x + normals[e + 1]! * centre.y + normals[e + 2]! * centre.z);
  const indices = new Uint16Array((w - 1) * (h - 1) * 6);
  let t = 0;
  for (let j = 0; j < h - 1; j++) {
    for (let i = 0; i < w - 1; i++) {
      const a = j * w + i;
      const b = a + 1;
      const c = a + w + 1;
      const d = a + w;
      // createCubeSphere's diagonal: the shorter one.
      if (distanceSq(normals, a, c) <= distanceSq(normals, b, d)) indices.set([a, b, c, a, c, d], t);
      else indices.set([a, b, d, b, c, d], t);
      t += 6;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.computeBoundingSphere();
  return { geometry, centre, angle: Math.acos(Math.min(1, minDot)) };
}

function distanceSq(p: Float32Array, a: number, b: number): number {
  const dx = p[a * 3]! - p[b * 3]!;
  const dy = p[a * 3 + 1]! - p[b * 3 + 1]!;
  const dz = p[a * 3 + 2]! - p[b * 3 + 2]!;
  return dx * dx + dy * dy + dz * dz;
}

import * as THREE from 'three';
import { CUBE_FACES, spherify } from './cubeSphereMath';

/*
 * Cube sphere: a cube whose six faces are `segments` × `segments` grids,
 * pushed out onto the unit sphere with the mapping from Catlike Coding's
 * "Cube Sphere" tutorial
 * (https://catlikecoding.com/unity/tutorials/procedural-meshes/cube-sphere/):
 *
 *   x' = x·√(1 − y²/2 − z²/2 + y²z²/3)   (and the same for y', z')
 *
 * which spreads the vertices far more evenly than a plain normalised cube,
 * and, unlike a UV sphere, has no poles where triangles bunch up. The mesh is
 * indexed and welded: every vertex, including those on the cube's edges and
 * corners, is stored once (6·segments² + 2 of them for 12·segments²
 * triangles), so per-vertex work like terrain noise runs once per point.
 */

/** Triangles in a cube sphere of `segments`: 12·segments². */
export function cubeSphereTriangles(segments: number): number {
  return 12 * segments * segments;
}

/**
 * A unit-direction cube sphere of `radius` with `segments` grid cells along
 * each cube edge: indexed positions and normals (the outward direction), no UVs.
 */
export function createCubeSphere(radius: number, segments: number): THREE.BufferGeometry {
  const n = Math.max(1, Math.round(segments));
  const side = n + 1;
  const positions = new Float32Array((6 * n * n + 2) * 3);
  const normals = new Float32Array(positions.length);
  const indexCount = cubeSphereTriangles(n) * 3;
  const indices = positions.length / 3 > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
  // Lattice point (integer cube coordinates 0..n on each axis) → vertex index.
  const welded = new Map<number, number>();
  const lattice = [0, 0, 0];
  const faceGrid = new Int32Array(side * side);
  let vertices = 0;
  let triangles = 0;

  const dir = { x: 0, y: 0, z: 0 };

  for (const [out, u, v] of CUBE_FACES) {
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        lattice[out[0]] = out[1] > 0 ? n : 0;
        lattice[u[0]] = u[1] > 0 ? i : n - i;
        lattice[v[0]] = v[1] > 0 ? j : n - j;
        const key = (lattice[0]! * side + lattice[1]!) * side + lattice[2]!;
        let index = welded.get(key);
        if (index === undefined) {
          index = vertices++;
          welded.set(key, index);
          // Cube coordinates in [-1, 1], computed from the lattice so shared points match exactly.
          spherify((2 * lattice[0]! - n) / n, (2 * lattice[1]! - n) / n, (2 * lattice[2]! - n) / n, dir);
          normals[index * 3] = dir.x;
          normals[index * 3 + 1] = dir.y;
          normals[index * 3 + 2] = dir.z;
          positions[index * 3] = dir.x * radius;
          positions[index * 3 + 1] = dir.y * radius;
          positions[index * 3 + 2] = dir.z * radius;
        }
        faceGrid[j * side + i] = index;
      }
    }

    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = faceGrid[j * side + i]!;
        const b = faceGrid[j * side + i + 1]!;
        const c = faceGrid[(j + 1) * side + i + 1]!;
        const d = faceGrid[(j + 1) * side + i]!;
        // Split each cell along its shorter diagonal: the cells are skewed
        // towards the cube's corners, and this keeps the triangles closest
        // to equilateral there.
        if (distanceSq(normals, a, c) <= distanceSq(normals, b, d)) {
          indices.set([a, b, c, a, c, d], triangles * 3);
        } else {
          indices.set([a, b, d, b, c, d], triangles * 3);
        }
        triangles += 2;
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

function distanceSq(p: Float32Array, a: number, b: number): number {
  const dx = p[a * 3]! - p[b * 3]!;
  const dy = p[a * 3 + 1]! - p[b * 3 + 1]!;
  const dz = p[a * 3 + 2]! - p[b * 3 + 2]!;
  return dx * dx + dy * dy + dz * dz;
}

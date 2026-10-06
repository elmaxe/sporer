import * as THREE from 'three';
import { ROCK_SHAPES } from '../gen/rocks';
import { Rng } from '../gen/rng';

/**
 * How far below the ground a rock's base sits, as a share of its height:
 * buried a little so it never floats where the drawn ground is a coarser
 * chunk than the sampled one, and so it reads as embedded rather than set down.
 */
export const ROCK_SINK = 0.3;

/**
 * The rock shapes the instances pick from (gen/rocks.ts `shape`): lumpy,
 * faceted icosahedra, one blocky and the rest rounder, each 1 unit across
 * along x and z and 1 tall, its base ROCK_SINK of the way up from the bottom
 * (so the origin is on the ground). Flat-shaded, as the game's style is; the
 * instance scales them to each rock's sides.
 */
export function createRockGeometries(): THREE.BufferGeometry[] {
  return Array.from({ length: ROCK_SHAPES }, (_, k) => createRockGeometry(k));
}

function createRockGeometry(k: number): THREE.BufferGeometry {
  const rng = new Rng(0x7a3c + k * 101);
  // The first is the blocky one: fewer, bigger facets.
  const base = new THREE.IcosahedronGeometry(1, k === 0 ? 0 : 1);
  const pos = base.getAttribute('position') as THREE.BufferAttribute;
  // A few dents and bulges: the same push for every copy of a corner, so the facets stay closed.
  const lumps = Array.from({ length: 5 }, () => {
    const d = new THREE.Vector3(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).normalize();
    return { d, a: rng.range(-0.25, 0.22) };
  });
  // Cut flat underneath and on one side now and then, as broken rock is.
  const cut = rng.range(0.55, 0.85);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    let r = 1;
    for (const l of lumps) r += l.a * Math.max(0, v.dot(l.d)) ** 3;
    v.multiplyScalar(r);
    if (v.x > cut) v.x = cut + (v.x - cut) * 0.25;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  const geometry = base.index ? base.toNonIndexed() : base;
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const size = new THREE.Vector3();
  box.getSize(size);
  const centre = new THREE.Vector3();
  box.getCenter(centre);
  // 1 across and 1 tall, with the ground ROCK_SINK of the way up.
  geometry.translate(-centre.x, -box.min.y, -centre.z);
  geometry.scale(1 / size.x, 1 / size.y, 1 / size.z);
  geometry.translate(0, -ROCK_SINK, 0);
  geometry.deleteAttribute('uv');
  geometry.deleteAttribute('normal');
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

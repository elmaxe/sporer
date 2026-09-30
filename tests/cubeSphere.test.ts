import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createCubeSphere, cubeSphereTriangles } from '../src/world/cubeSphere';

function triangles(geometry: THREE.BufferGeometry): [THREE.Vector3, THREE.Vector3, THREE.Vector3][] {
  const index = geometry.getIndex()!;
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const out: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [];
  for (let t = 0; t < index.count; t += 3) {
    out.push([0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(position, index.getX(t + k))) as [THREE.Vector3, THREE.Vector3, THREE.Vector3]);
  }
  return out;
}

describe('cube sphere', () => {
  it('stores each point once: 6n² + 2 vertices for 12n² triangles', () => {
    for (const n of [1, 2, 7, 40]) {
      const g = createCubeSphere(1, n);
      expect(g.getAttribute('position').count).toBe(6 * n * n + 2);
      expect(g.getIndex()!.count / 3).toBe(cubeSphereTriangles(n));
    }
  });

  it('puts every vertex on the sphere, with the outward normal', () => {
    const g = createCubeSphere(5, 12);
    const position = g.getAttribute('position') as THREE.BufferAttribute;
    const normal = g.getAttribute('normal') as THREE.BufferAttribute;
    const p = new THREE.Vector3();
    const nrm = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      p.fromBufferAttribute(position, i);
      nrm.fromBufferAttribute(normal, i);
      expect(p.length()).toBeCloseTo(5, 5);
      expect(nrm.dot(p.normalize())).toBeCloseTo(1, 5);
    }
  });

  it('is closed: every edge is shared by exactly two triangles, in opposite directions', () => {
    const index = createCubeSphere(1, 9).getIndex()!;
    const edges = new Map<string, number>();
    for (let t = 0; t < index.count; t += 3) {
      for (let k = 0; k < 3; k++) {
        const key = `${index.getX(t + k)}-${index.getX(t + ((k + 1) % 3))}`;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
    for (const [key, count] of edges) {
      expect(count).toBe(1);
      const [a, b] = key.split('-');
      expect(edges.get(`${b}-${a}`)).toBe(1);
    }
  });

  it('winds every triangle counter-clockwise seen from outside', () => {
    const e1 = new THREE.Vector3();
    const e2 = new THREE.Vector3();
    for (const [a, b, c] of triangles(createCubeSphere(1, 8))) {
      const centre = a.clone().add(b).add(c);
      expect(e1.subVectors(b, a).cross(e2.subVectors(c, a)).dot(centre)).toBeGreaterThan(0);
    }
  });

  it('spreads the triangles evenly: no bunching at poles or corners', () => {
    const areas = triangles(createCubeSphere(1, 32)).map(([a, b, c]) => new THREE.Triangle(a, b, c).getArea());
    // A 64×32 UV sphere's triangles differ in area by ~40×; here they stay within 2×.
    expect(Math.max(...areas) / Math.min(...areas)).toBeLessThan(2);
  });

  it('stays close to the sphere between vertices (the atmosphere shell relies on it)', () => {
    for (const [a, b, c] of triangles(createCubeSphere(1, 18))) {
      expect(a.clone().add(b).add(c).divideScalar(3).length()).toBeGreaterThan(0.99);
    }
  });
});

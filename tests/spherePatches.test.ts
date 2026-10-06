import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createCubeSphere } from '../src/world/cubeSphere';
import { SpherePatches } from '../src/world/spherePatches';

/** Each triangle of a geometry as its three corners' coordinates, starting from the smallest corner (keeps the winding). */
function triangles(geometry: THREE.BufferGeometry): string[] {
  const p = geometry.getAttribute('position');
  const index = geometry.index!;
  const out: string[] = [];
  for (let t = 0; t < index.count; t += 3) {
    const corners = [0, 1, 2].map((k) => {
      const v = index.getX(t + k);
      return `${p.getX(v)},${p.getY(v)},${p.getZ(v)}`;
    });
    const first = corners.indexOf([...corners].sort()[0]!);
    out.push([0, 1, 2].map((k) => corners[(first + k) % 3]).join(' '));
  }
  return out;
}

describe('sphere patches', () => {
  it.each([
    [37, 4],
    [48, 4],
    [20, 3],
  ])('are exactly the cube sphere of %i segments, cut %i × %i per face', (segments, perFace) => {
    const material = new THREE.MeshBasicMaterial();
    const patches = new SpherePatches(2.5, segments, perFace, material, 'Test');
    expect(patches.patches).toHaveLength(6 * perFace * perFace);
    const whole = triangles(createCubeSphere(2.5, segments)).sort();
    const cut = patches.patches.flatMap((p) => triangles(p.mesh.geometry)).sort();
    expect(cut).toEqual(whole);
    expect(patches.triangles).toBe(whole.length);
  });

  it('hides only patches whose every triangle faces away from a camera outside', () => {
    const R = 10;
    const patches = new SpherePatches(R, 37, 4, new THREE.MeshBasicMaterial(), 'Test');
    const camera = new THREE.Vector3();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const ab = new THREE.Vector3();
    const ac = new THREE.Vector3();
    let hidden = 0;
    let shownWrongly = 0;
    for (const d of [10.05, 10.5, 13, 30, 300]) {
      for (let k = 0; k < 20; k++) {
        camera.set(Math.sin(k * 1.7) * Math.cos(k), Math.cos(k * 2.3), Math.sin(k * 0.9)).setLength(d);
        patches.cullBehind(camera);
        for (const p of patches.patches) {
          if (p.mesh.visible) continue;
          hidden++;
          const pos = p.mesh.geometry.getAttribute('position');
          const index = p.mesh.geometry.index!;
          for (let t = 0; t < index.count; t += 3) {
            a.fromBufferAttribute(pos, index.getX(t));
            b.fromBufferAttribute(pos, index.getX(t + 1));
            c.fromBufferAttribute(pos, index.getX(t + 2));
            normal.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
            // Back-facing: the camera is behind the triangle's plane.
            if (normal.dot(ab.subVectors(camera, a)) > 0) shownWrongly++;
          }
        }
      }
    }
    expect(shownWrongly).toBe(0);
    // Far away about half the sphere goes.
    expect(hidden).toBeGreaterThan(5 * 20 * 10);
  });

  it('keeps every patch from inside', () => {
    const patches = new SpherePatches(10, 37, 4, new THREE.MeshBasicMaterial(), 'Test');
    patches.cullBehind(new THREE.Vector3(0, 9.9, 0));
    expect(patches.patches.every((p) => p.mesh.visible)).toBe(true);
    patches.cullBehind(new THREE.Vector3(0, 9.9, 0), (p) => p.centre.y > 0);
    expect(patches.patches.filter((p) => p.mesh.visible).length).toBeLessThan(patches.patches.length);
  });
});

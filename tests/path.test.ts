import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { pathControl, pathParams, pathPoint } from '../src/combat/path';

const R = 150;
const sphere = () => R;
const at = (u: number, from: THREE.Vector3, c: THREE.Vector3, to: THREE.Vector3) => pathPoint(from, c, to, u, new THREE.Vector3());

describe("a projectile's path", () => {
  it('starts at the ship and ends on the point', () => {
    const from = new THREE.Vector3(0, 330, 0);
    const to = new THREE.Vector3(R, 0, 0);
    const c = pathControl(from, to, sphere, new THREE.Vector3());
    expect(at(0, from, c, to).distanceTo(from)).toBeLessThan(1e-9);
    expect(at(1, from, c, to).distanceTo(to)).toBeLessThan(1e-9);
  });

  it('goes the shortest way, straight, when nothing is in the way', () => {
    // High over a small moon, at a point on the near side (the dump of a shell that went round the globe instead).
    const from = new THREE.Vector3(0, 330, 0);
    const to = new THREE.Vector3(0, 1, 0.9).normalize().multiplyScalar(R);
    const c = pathControl(from, to, sphere, new THREE.Vector3());
    expect(c.distanceTo(new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5))).toBeLessThan(1e-9);
    // Every point lies on the line from the ship to the point.
    const line = new THREE.Line3(from, to);
    for (let u = 0; u <= 1; u += 0.1) {
      const p = at(u, from, c, to);
      expect(line.closestPointToPoint(p, true, new THREE.Vector3()).distanceTo(p)).toBeLessThan(1e-6);
    }
  });

  it('drops straight down onto the point beneath the ship', () => {
    const from = new THREE.Vector3(0, R + 50, 0);
    const to = new THREE.Vector3(0, R, 0);
    const c = pathControl(from, to, sphere, new THREE.Vector3());
    for (let u = 0; u <= 1; u += 0.1) {
      const p = at(u, from, c, to);
      expect(Math.abs(p.x) + Math.abs(p.z)).toBeLessThan(1e-6);
    }
  });

  it('bows out over the ground in the way, staying above it', () => {
    // Low over the globe, at a point a quarter of the way round: the line would cut through it.
    const from = new THREE.Vector3(0, R + 20, 0);
    const to = new THREE.Vector3(R, 0, 0);
    const c = pathControl(from, to, sphere, new THREE.Vector3());
    for (let u = 0.05; u < 0.8; u += 0.05) expect(at(u, from, c, to).length()).toBeGreaterThan(R + pathParams.clearance - 1e-6);
    // No higher than it needs: well inside twice the ship's height.
    expect(c.length()).toBeLessThan(2 * (R + 20));
  });

  it('goes round the globe to the far side, even straight opposite the ship', () => {
    const from = new THREE.Vector3(0, R + 5, 0);
    for (const angle of [2.5, Math.PI]) {
      const to = new THREE.Vector3(Math.sin(angle), Math.cos(angle), 0).multiplyScalar(R);
      const c = pathControl(from, to, sphere, new THREE.Vector3());
      for (let u = 0.02; u < 0.98; u += 0.02) expect(at(u, from, c, to).length()).toBeGreaterThan(R);
    }
  });
});

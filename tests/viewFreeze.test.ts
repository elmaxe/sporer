import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { beginFrozenCulling, endFrozenCulling, frozenOutline, frozenStats, setViewFrozen } from '../src/world/viewFreeze';

/** A camera at the origin looking down -Z, a box in front of it and one behind, the one behind holding a child in front. */
function setup() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshBasicMaterial();
  const front = new THREE.Mesh(geometry, material);
  front.position.set(0, 0, -10);
  const back = new THREE.Mesh(geometry, material);
  back.position.set(0, 0, 10);
  const child = new THREE.Mesh(geometry, material);
  child.position.set(0, 0, -20);
  back.add(child);
  front.layers.enable(1);
  scene.add(front, back);
  return { scene, camera, front, back, child };
}

describe('view freeze', () => {
  afterEach(() => setViewFrozen(false));

  it('does nothing while not frozen', () => {
    const { scene, camera, back } = setup();
    beginFrozenCulling(scene, camera);
    expect(back.layers.mask).toBe(1);
    expect(back.frustumCulled).toBe(true);
    endFrozenCulling();
    expect(frozenOutline(scene, camera)).toBeNull();
  });

  it('culls by the frustum the camera had when frozen, wherever it has gone since', () => {
    const { scene, camera, front, back, child } = setup();
    setViewFrozen(true);
    beginFrozenCulling(scene, camera);
    endFrozenCulling();
    // The live camera turns round to look at the box behind.
    camera.rotation.y = Math.PI;
    camera.updateMatrixWorld();
    beginFrozenCulling(scene, camera);
    // Behind the frozen camera: off every layer (only the object, not its child, as three's own culling).
    expect(back.layers.mask).toBe(0);
    expect(child.layers.mask).toBe(1);
    // In front of it: not culled again by the live camera.
    expect(front.frustumCulled).toBe(false);
    expect(child.frustumCulled).toBe(false);
    expect(frozenStats.culled).toBe(2);
    endFrozenCulling();
    expect(back.layers.mask).toBe(1);
    expect(front.layers.mask).toBe(0b11);
    expect(front.frustumCulled).toBe(true);
    expect(child.frustumCulled).toBe(true);
  });

  it('outlines the frozen frustum, and starts afresh at the next freeze', () => {
    const { scene, camera } = setup();
    setViewFrozen(true);
    const outline = frozenOutline(scene, camera);
    expect(outline).not.toBeNull();
    camera.position.set(5, 0, 0);
    camera.updateMatrixWorld();
    expect(frozenOutline(scene, camera)).toBe(outline);
    // From the eye at the frozen camera's place.
    const eye = new THREE.Vector3().fromBufferAttribute(outline!.geometry.getAttribute('position') as THREE.BufferAttribute, 0).applyMatrix4(outline!.matrix);
    expect(eye.length()).toBeCloseTo(0);
    setViewFrozen(true);
    expect(frozenOutline(scene, camera)).not.toBe(outline);
  });
});

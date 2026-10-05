import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { pointerCamera, setThirdPerson, thirdPersonMarker } from '../src/world/thirdPerson';
import { beginFrozenCulling, endFrozenCulling, frozenOutline, frozenStats, resetFrozenStats, setViewFrozen } from '../src/world/viewFreeze';

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

describe('third-person view', () => {
  afterEach(() => {
    setThirdPerson(null);
    setViewFrozen(false);
  });

  /** An overview camera behind the scene's boxes, looking at all of them from +X. */
  function overview() {
    const view = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    view.position.set(100, 0, 0);
    view.lookAt(0, 0, 0);
    view.updateMatrixWorld();
    return view;
  }

  it('culls what the overview draws by the game camera\'s frustum, as it is now', () => {
    const { scene, camera, front, back } = setup();
    camera.updateMatrixWorld();
    const view = overview();
    setThirdPerson(view, camera);
    resetFrozenStats();
    beginFrozenCulling(scene, view);
    expect(back.layers.mask).toBe(0);
    expect(front.frustumCulled).toBe(false);
    endFrozenCulling();
    // The game camera turns round: now the box behind is in its view.
    camera.rotation.y = Math.PI;
    camera.updateMatrixWorld();
    beginFrozenCulling(scene, view);
    expect(back.layers.mask).toBe(1);
    expect(front.layers.mask).toBe(0);
    endFrozenCulling();
    expect(front.layers.mask).toBe(0b11);
    // Drawn with the game camera itself, nothing changes.
    beginFrozenCulling(scene, camera);
    expect(front.layers.mask).toBe(0b11);
    expect(front.frustumCulled).toBe(true);
    endFrozenCulling();
  });

  it('marks the game camera only in what the overview draws', () => {
    const { camera } = setup();
    camera.position.set(3, 4, 5);
    camera.updateMatrixWorld();
    const view = overview();
    expect(thirdPersonMarker(view)).toBeNull();
    setThirdPerson(view, camera);
    expect(thirdPersonMarker(camera)).toBeNull();
    const marker = thirdPersonMarker(view)!;
    marker.updateMatrixWorld();
    expect(new THREE.Vector3().setFromMatrixPosition(marker.matrixWorld).toArray()).toEqual([3, 4, 5]);
  });

  it('casts the pointer\'s rays from the overview while it draws the picture', () => {
    const { camera } = setup();
    const view = overview();
    expect(pointerCamera(camera)).toBe(camera);
    setThirdPerson(view, camera);
    expect(pointerCamera(camera)).toBe(view);
    // Another camera (the planet level's sky camera) is left alone.
    const other = new THREE.PerspectiveCamera();
    expect(pointerCamera(other)).toBe(other);
    setThirdPerson(null);
    expect(pointerCamera(camera)).toBe(camera);
  });

  it('culls by the frozen frustum when the view is frozen too', () => {
    const { scene, camera, front, back } = setup();
    camera.updateMatrixWorld();
    const view = overview();
    setThirdPerson(view, camera);
    setViewFrozen(true);
    beginFrozenCulling(scene, view);
    endFrozenCulling();
    camera.rotation.y = Math.PI;
    camera.updateMatrixWorld();
    beginFrozenCulling(scene, view);
    expect(back.layers.mask).toBe(0);
    expect(front.frustumCulled).toBe(false);
    endFrozenCulling();
    expect(frozenOutline(scene, view)).toBe(frozenOutline(scene, camera));
  });
});

import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GroveCamera, globeWeight } from '../src/plantlab/GroveCamera';

const R = 400;
const centre = new THREE.Vector3(0, -R, 0);

/** Input with a drag, wheel and keys set by the test, each drained like the real one. */
function fakeInput() {
  const state = { dx: 0, dy: 0, wheel: 0, keys: new Set<string>() };
  return {
    state,
    consumeDrag() {
      const d = { x: state.dx, y: state.dy };
      state.dx = state.dy = 0;
      return d;
    },
    consumeWheel() {
      const w = state.wheel;
      state.wheel = 0;
      return w;
    },
    axis(negative: string, positive: string) {
      return (state.keys.has(positive) ? 1 : 0) - (state.keys.has(negative) ? 1 : 0);
    },
    isDown(code: string) {
      return state.keys.has(code);
    },
  };
}

function rig() {
  const camera = new THREE.PerspectiveCamera(65, 16 / 9, 0.1, 10000);
  const input = fakeInput();
  const cam = new GroveCamera(camera, input, { centre, radius: R, eye: 2.5, minDistance: 2, maxDistance: R * 2.2, distance: 28, pitch: 0.5 });
  return { camera, input, cam };
}

/** Runs `seconds` of frames. */
function run(cam: GroveCamera, seconds: number) {
  for (let t = 0; t < seconds; t += 1 / 60) cam.update(1 / 60);
}

const up = (cam: GroveCamera) => cam.spotUp(new THREE.Vector3());

describe('GroveCamera', () => {
  beforeEach(() => vi.stubGlobal('innerHeight', 720));
  afterEach(() => vi.unstubAllGlobals());

  it('turns from orbiting to turning the globe over the outer part of the zoom', () => {
    expect(globeWeight(0.3)).toBe(0);
    expect(globeWeight(0.7)).toBeGreaterThan(0);
    expect(globeWeight(0.7)).toBeLessThan(1);
    expect(globeWeight(0.95)).toBe(1);
  });

  it('starts over the spot at the origin, looking at it from the UFO height', () => {
    const { camera, cam } = rig();
    expect(up(cam).y).toBeCloseTo(1);
    const toPivot = new THREE.Vector3(0, 2.5, 0).sub(camera.position).normalize();
    expect(camera.getWorldDirection(new THREE.Vector3()).dot(toPivot)).toBeCloseTo(1);
    expect(camera.position.distanceTo(new THREE.Vector3(0, 2.5, 0))).toBeCloseTo(28);
  });

  it('close up, dragging orbits the spot and leaves it where it is', () => {
    const { camera, input, cam } = rig();
    const before = camera.position.clone();
    input.state.dx = 200;
    run(cam, 1);
    expect(up(cam).y).toBeCloseTo(1);
    expect(camera.position.distanceTo(before)).toBeGreaterThan(10);
  });

  it('zoomed out, it looks straight down at the globe and dragging turns the planet under it', () => {
    const { camera, input, cam } = rig();
    cam.look(0, 0.3, R * 2.2);
    // Held straight down whatever pitch was asked for.
    run(cam, 1);
    const down = new THREE.Vector3().subVectors(centre, camera.position).normalize();
    expect(camera.getWorldDirection(new THREE.Vector3()).dot(down)).toBeCloseTo(1, 3);
    // Drag right: the ground follows the pointer, so the spot under the camera is one further left (-X).
    input.state.dx = 100;
    run(cam, 1);
    const u = up(cam);
    expect(u.x).toBeLessThan(-0.2);
    expect(Math.abs(u.z)).toBeLessThan(1e-6);
    expect(camera.position.distanceTo(centre)).toBeGreaterThan(R * 2.2);
  });

  it('walks the spot forward with W, never faster than half a radius a second', () => {
    const { input, cam } = rig();
    cam.look(0, Math.PI / 2, R * 2.2);
    input.state.keys.add('KeyW');
    run(cam, 1);
    input.state.keys.clear();
    run(cam, 1);
    const u = up(cam);
    // Forward with heading 0 is -Z.
    expect(u.z).toBeLessThan(0);
    expect(u.angleTo(new THREE.Vector3(0, 1, 0))).toBeLessThanOrEqual(0.5 + 1e-6);
  });

  it('keeps the camera above the ground, looking up from under the spot', () => {
    const { camera, cam } = rig();
    cam.look(0, -Math.PI / 3, 28);
    expect(camera.position.distanceTo(centre)).toBeGreaterThanOrEqual(R + 1 - 1e-6);
  });

  it('comes back to the same spot and view from its state', () => {
    const a = rig();
    a.cam.look(0, Math.PI / 2, R * 2.2);
    a.input.state.dx = 150;
    a.input.state.dy = -80;
    // Settled: the state is where the view is going.
    run(a.cam, 3);
    const b = rig();
    b.cam.restore(a.cam.state());
    expect(b.camera.position.distanceTo(a.camera.position)).toBeLessThan(1e-3);
    expect(up(b.cam).angleTo(up(a.cam))).toBeLessThan(1e-6);
  });
});

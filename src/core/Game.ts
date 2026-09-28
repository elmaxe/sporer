import * as THREE from 'three';
import type { Entity } from './Entity';
import { FixedStep } from './FixedStep';
import { Input } from './Input';
import type { Debug } from './Debug';
import type { Physics } from '../physics/Physics';

export const FIXED_DT = 1 / 60;
/** Longest frame we accept; longer gaps (tab switch, breakpoint) are clamped. */
const MAX_FRAME_DT = 0.25;

/**
 * Owns the renderer, scene, camera and main loop, and drives every Entity
 * (see Entity.ts for the hook order).
 */
export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly input: Input;

  private readonly entities: Entity[] = [];
  private readonly fixedStep = new FixedStep(FIXED_DT);
  private lastTime = -1;

  constructor(
    container: HTMLElement,
    readonly physics: Physics,
    readonly debug: Debug,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(65, 1, 0.1, 20000);
    this.input = new Input(this.renderer.domElement);

    this.resize();
    window.addEventListener('resize', this.resize);
  }

  add<T extends Entity>(entity: T): T {
    this.entities.push(entity);
    return entity;
  }

  remove(entity: Entity): void {
    const i = this.entities.indexOf(entity);
    if (i === -1) return;
    this.entities.splice(i, 1);
    entity.dispose();
  }

  start(): void {
    this.lastTime = -1;
    this.renderer.setAnimationLoop(this.frame);
  }

  stop(): void {
    this.renderer.setAnimationLoop(null);
  }

  dispose(): void {
    this.stop();
    window.removeEventListener('resize', this.resize);
    for (const e of this.entities) e.dispose();
    this.entities.length = 0;
    this.input.dispose();
    this.physics.dispose();
    this.debug.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private frame = (time: number) => {
    this.debug.beginFrame();

    const now = time / 1000;
    const frameDt = this.lastTime < 0 ? 0 : Math.min(now - this.lastTime, MAX_FRAME_DT);
    this.lastTime = now;

    const steps = this.fixedStep.advance(frameDt);
    for (let s = 0; s < steps; s++) {
      for (const e of this.entities) e.fixedUpdate?.(FIXED_DT);
      this.physics.step();
      for (const e of this.entities) e.afterPhysics?.();
    }

    const alpha = this.fixedStep.alpha;
    for (const e of this.entities) e.update?.(frameDt, alpha);

    this.renderer.render(this.scene, this.camera);
    this.debug.endFrame();
  };

  private resize = () => {
    const { clientWidth: w, clientHeight: h } = this.renderer.domElement.parentElement!;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };
}

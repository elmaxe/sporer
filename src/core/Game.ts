import * as THREE from 'three';
import type { Entity } from './Entity';
import { FixedStep } from './FixedStep';
import { Input } from './Input';
import type { Debug } from './Debug';
import type { Level } from '../levels/Level';

export const FIXED_DT = 1 / 60;
/** Longest frame we accept; longer gaps (tab switch, breakpoint) are clamped. */
const MAX_FRAME_DT = 0.25;

/**
 * Owns the renderer, camera, input and main loop. The active Level holds the
 * scene, entities and physics; `Game` steps and renders only that level, plus
 * a few global entities (e.g. the scene manager) that run before it.
 * See Entity.ts for the hook order.
 */
export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly input: Input;

  private _level: Level | null = null;
  private readonly entities: Entity[] = [];
  private readonly fixedStep = new FixedStep(FIXED_DT);
  private lastTime = -1;

  constructor(
    container: HTMLElement,
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

  get level(): Level | null {
    return this._level;
  }

  /** Makes `level` the active one. The previous level is exited, not disposed. */
  setLevel(level: Level): void {
    if (level === this._level) return;
    this._level?.exit();
    this._level = level;
    level.enter();
  }

  /** Adds a global entity that runs every frame regardless of the level, before it. */
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

  /** Disposes the global entities (which own the levels), then the renderer. */
  dispose(): void {
    this.stop();
    window.removeEventListener('resize', this.resize);
    for (const e of this.entities) e.dispose();
    this.entities.length = 0;
    this._level = null;
    this.input.dispose();
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
      for (const e of this.entities) e.afterPhysics?.();
      this._level?.fixedStep(FIXED_DT);
    }

    const alpha = this.fixedStep.alpha;
    for (const e of this.entities) e.update?.(frameDt, alpha);
    // The level may have changed during the global update (a transition swap).
    const level = this._level;
    if (level) {
      level.update(frameDt, alpha);
      level.render(this.renderer, this.camera);
    }
    this.debug.endFrame();
  };

  private resize = () => {
    const { clientWidth: w, clientHeight: h } = this.renderer.domElement.parentElement!;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };
}

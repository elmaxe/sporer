import * as THREE from 'three';
import { Crossfade } from './Crossfade';
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
 * a few global entities (e.g. the scene manager) that run before it. During a
 * crossfade (`setCrossfade`) the outgoing level keeps running and is drawn
 * under the active one. See Entity.ts for the hook order.
 */
export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly input: Input;
  /** Called after each frame is drawn, before it's shown (for automation, e.g. reading pixels). */
  afterFrame: (() => void) | null = null;

  private _level: Level | null = null;
  /** The outgoing level while crossfading to the active one, and the active one's weight. */
  private fadingFrom: Level | null = null;
  private fadeWeight = 1;
  private readonly crossfade = new Crossfade();
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

  /**
   * Crossfades from `from` to the active level: both are stepped, updated and
   * drawn, the active one at `weight` (0 = only `from` shows, 1 = only the
   * active one). `null` ends it.
   */
  setCrossfade(from: Level | null, weight = 1): void {
    this.fadingFrom = from === this._level ? null : from;
    this.fadeWeight = weight;
  }

  /** The active level's weight in the running crossfade, or null if none runs. */
  get crossfadeWeight(): number | null {
    return this.fadingFrom ? this.fadeWeight : null;
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
    this.fadingFrom = null;
    this.crossfade.dispose();
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
      this.fadingFrom?.fixedStep(FIXED_DT);
      this._level?.fixedStep(FIXED_DT);
    }

    const alpha = this.fixedStep.alpha;
    for (const e of this.entities) e.update?.(frameDt, alpha);
    // The level may have changed during the global update (a transition swap).
    const level = this._level;
    const from = this.fadingFrom;
    if (from) {
      // Each level moves the shared camera in its update, so update each right before drawing it.
      from.update(frameDt, alpha);
      from.render(this.renderer, this.camera);
      this.crossfade.capture(this.renderer);
    }
    if (level) {
      level.update(frameDt, alpha);
      level.render(this.renderer, this.camera);
    }
    if (from) this.crossfade.draw(this.renderer, 1 - this.fadeWeight);
    this.afterFrame?.();
    this.debug.endFrame();
  };

  private resize = () => {
    const { clientWidth: w, clientHeight: h } = this.renderer.domElement.parentElement!;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };
}

import * as THREE from 'three';
import type { SoundEffects } from '../audio/sfx';
import type { Entity } from '../core/Entity';
import type { Input } from '../core/Input';
import type { RenderClock } from '../planet/PlanetFrame';
import { MarkerRing } from '../player/MarkerRing';
import { createGlowTexture } from '../world/glowTexture';
import { CLOUD_RENDER_ORDER } from '../world/weatherLook';
import type { BusterTarget } from './PlanetBuster';
import type { ItemStatus } from './items';
import { shellControl, shellPoint, shellProgress, volcanoParams } from './volcano';

/** The aiming ring's size on the ground, planet units. */
const RETICLE_SIZE = 6;
/** Trail dots behind the shell, and how far back along its path they go (path fraction). */
const TRAIL_POINTS = 32;
const TRAIL_LENGTH = 0.25;
/** The shell is drawn at least this share of its distance from the camera (so it shows zoomed out). */
const MIN_ANGULAR_SIZE = 0.025;

/** Why the volcano bomb can't be fired here, if it can't (the level decides: no ground, busted, full, busy). */
export type VolcanoBombBlock = string | null;

/**
 * The volcano bomb in low orbit. Selected on the item bar (`arm`), an orange
 * ring follows the pointer over the ground; a click there fires it: a molten
 * shell leaves the ship and flies down to the point, the shortest way unless
 * the ground is in the way (shellControl), and on impact `onImpact` raises a
 * volcano there (planet/Volcanoes.ts). It stays armed, so the next click
 * fires again once the shell has landed, as long as the level allows
 * (`blocked`).
 */
export class VolcanoBomb implements Entity {
  private _armed = false;
  private fireTime = 0;
  private flying = false;
  private readonly reticle: MarkerRing;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly point = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();
  private readonly from = new THREE.Vector3();
  private readonly to = new THREE.Vector3();
  /** The path's control point: see shellControl. */
  private readonly control = new THREE.Vector3();
  private readonly at = new THREE.Vector3();
  private readonly glow = createGlowTexture();
  private readonly core: THREE.Sprite;
  private readonly halo: THREE.Sprite;
  private readonly trail: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private readonly group = new THREE.Group();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly clock: RenderClock,
    private readonly camera: THREE.Camera,
    private readonly input: Input,
    private readonly target: BusterTarget,
    /** Where the shell leaves from. */
    private readonly ship: THREE.Object3D,
    private readonly sfx: SoundEffects,
    /** Why it can't be fired now, or null if it can. */
    private readonly blocked: () => VolcanoBombBlock,
    /** The shell has landed at `point` (body frame) at the level's clock time `time`: raise the volcano. */
    private readonly onImpact: (point: THREE.Vector3, time: number) => void,
  ) {
    this.reticle = new MarkerRing(scene, '#ff9a33', 0.12, 0.2);
    const sprite = (color: string, blending: THREE.Blending) =>
      new THREE.Sprite(
        new THREE.SpriteMaterial({ map: this.glow, color, blending, depthWrite: false, transparent: true, toneMapped: false }),
      );
    this.core = sprite('#ffe2a0', THREE.AdditiveBlending);
    // Not added, so it shows orange over white clouds and ice too.
    this.halo = sprite('#ff5a10', THREE.NormalBlending);
    const trail = new THREE.BufferGeometry();
    trail.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_POINTS * 3), 3));
    const colors = new Float32Array(TRAIL_POINTS * 4);
    for (let i = 0; i < TRAIL_POINTS; i++) {
      // Glowing near the shell, smoky further back.
      const f = i / TRAIL_POINTS;
      colors.set([1 - 0.7 * f, 0.45 - 0.3 * f, 0.1, 0.85 * (1 - f) ** 1.3], i * 4);
    }
    trail.setAttribute('color', new THREE.BufferAttribute(colors, 4));
    this.trail = new THREE.Points(
      trail,
      new THREE.PointsMaterial({ map: this.glow, vertexColors: true, depthWrite: false, transparent: true, toneMapped: false }),
    );
    this.trail.frustumCulled = false;
    this.group.add(this.trail, this.halo, this.core);
    this.group.name = 'Volcano bomb';
    // Drawn after the air and clouds, which would veil it.
    for (const o of [this.trail, this.halo, this.core]) o.renderOrder = CLOUD_RENDER_ORDER + 2;
    this.core.renderOrder = CLOUD_RENDER_ORDER + 3;
    this.group.visible = false;
    scene.add(this.group);
  }

  /** Selected on the item bar: the next click on the ground fires it. */
  get armed(): boolean {
    return this._armed;
  }

  /** True while a shell is on its way down. */
  get inFlight(): boolean {
    return this.flying;
  }

  arm(on: boolean): void {
    this._armed = on && this.blocked() === null;
    this.setCursor(this._armed);
  }

  status(): ItemStatus {
    const reason = this.blocked();
    if (reason !== null) return { available: false, hint: '', reason };
    if (this.flying) return { available: true, hint: 'Volcano bomb away…' };
    const tap = this.input.touchMode ? 'Tap' : 'Click';
    return { available: true, hint: this._armed ? `${tap} the ground to raise a volcano` : '' };
  }

  /** A click on the ground at `point` (body frame): fires if armed. True if the click was used (or must be ignored). */
  click(point: THREE.Vector3): boolean {
    if (!this._armed) return false;
    // One shell at a time: a click meanwhile does nothing (rather than flying the ship off).
    if (!this.flying) this.fire(point);
    return true;
  }

  /** Fires at the ground point `point` (body frame), from the ship. */
  fire(point: THREE.Vector3): void {
    if (this.flying || this.blocked() !== null) return;
    this.flying = true;
    this.fireTime = this.clock.renderTime;
    this.from.copy(this.ship.position);
    this.to.copy(point);
    shellControl(this.from, this.to, this.target.groundHeight, this.control);
    this.group.visible = true;
    this.sfx.play('volcanoFire');
  }

  update(frameDt: number): void {
    // Put away once it can't be used here any more (e.g. the body is full of volcanoes, or busted).
    if (this._armed && this.blocked() !== null) this.arm(false);
    this.aim(frameDt);
    if (!this.flying) return;
    const t = this.clock.renderTime - this.fireTime;
    if (t >= volcanoParams.flightTime) {
      this.flying = false;
      this.group.visible = false;
      this.sfx.play('volcanoRise');
      this.onImpact(this.to, this.fireTime + volcanoParams.flightTime);
      return;
    }
    shellPoint(this.from, this.control, this.to, shellProgress(t), this.at);
    const size = Math.max(1.8, this.camera.position.distanceTo(this.at) * MIN_ANGULAR_SIZE);
    this.core.position.copy(this.at);
    this.halo.position.copy(this.at);
    this.core.scale.setScalar(size);
    this.halo.scale.setScalar(size * 2.2);
    this.halo.material.opacity = 0.85;
    const positions = this.trail.geometry.attributes.position as THREE.BufferAttribute;
    const span = TRAIL_LENGTH * volcanoParams.flightTime;
    for (let i = 0; i < TRAIL_POINTS; i++) {
      const u = Math.max(0, t - (span * i) / TRAIL_POINTS);
      shellPoint(this.from, this.control, this.to, shellProgress(u), this.point);
      positions.setXYZ(i, this.point.x, this.point.y, this.point.z);
    }
    positions.needsUpdate = true;
    this.trail.material.size = size * 1.2;
  }

  dispose(): void {
    this.scene.remove(this.group);
    this.trail.geometry.dispose();
    this.trail.material.dispose();
    this.core.material.dispose();
    this.halo.material.dispose();
    this.glow.dispose();
    this.reticle.dispose();
    this.setCursor(false);
  }

  /** The orange ring on the ground under the pointer while armed. */
  private aim(frameDt: number): void {
    const pointer = this.input.pointer;
    if (!this._armed || !pointer.inside || this.input.blocked) {
      this.reticle.hide();
      return;
    }
    this.raycaster.setFromCamera(this.ndc.set(pointer.ndcX, pointer.ndcY), this.camera);
    if (this.target.groundHit(this.raycaster.ray, this.point) === null) {
      this.reticle.hide();
      return;
    }
    this.normal.copy(this.point).normalize();
    this.point.copy(this.normal).multiplyScalar(this.target.groundHeight(this.normal) + 0.4);
    const size = Math.max(RETICLE_SIZE, this.camera.position.distanceTo(this.point) * 0.03);
    this.reticle.place(this.point, size, this.flying ? 0.4 : 0.95, this.normal, frameDt);
  }

  private setCursor(aiming: boolean): void {
    document.body.classList.toggle('aiming', aiming);
  }
}

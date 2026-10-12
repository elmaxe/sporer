import * as THREE from 'three';
import type { SoundEffects } from '../audio/sfx';
import type { Entity } from '../core/Entity';
import type { Input } from '../core/Input';
import type { BusterTarget } from '../combat/PlanetBuster';
import type { ItemStatus } from '../combat/items';
import { pathControl, pathPoint } from '../combat/path';
import { coreSurface, defaultPaint, newPart, type ShipDesign } from '../gen/ship';
import type { RenderClock } from '../planet/PlanetFrame';
import { MarkerRing } from '../player/MarkerRing';
import { ShipMaterials, buildShipModel } from '../player/shipMesh';
import { createGlowTexture } from '../world/glowTexture';
import { pointerCamera } from '../world/thirdPerson';
import { CLOUD_RENDER_ORDER } from '../world/weatherLook';

export const colonyPodParams = {
  /** Seconds from launch to landing. */
  flightTime: 2.4,
  /** The pod's length (planet units). */
  size: 2.2,
};

/** The aiming ring's size on the ground, planet units. */
const RETICLE_SIZE = 7;
const TRAIL_POINTS = 24;
const TRAIL_LENGTH = 0.3;
/** The pod is drawn at least this share of its distance from the camera (so it shows zoomed out). */
const MIN_ANGULAR_SIZE = 0.02;

/** How far along its path the pod is (0 → 1) `t` seconds after launch: it drops fast, then its retro-jets slow it to land softly. */
export function podProgress(t: number, flightTime = colonyPodParams.flightTime): number {
  const s = Math.min(1, Math.max(0, t / flightTime));
  return 1 - (1 - s) ** 2;
}

/** The pod: a capsule from the ship editor's parts, nose down, with a thruster at its base and lights round it. */
export function podDesign(): ShipDesign {
  const core = newPart('pod', [0, 0, 0], [0, 1, 0], -1, false);
  core.size = 0.55;
  const d: ShipDesign = { name: 'Colony Pod', parts: [core], paint: { ...defaultPaint(), base: '#eef1f4', trim: '#3fbf73', glow: '#9dffb8', pattern: 'stripes' } };
  const back = coreSurface(core, [0, 0, -1]);
  d.parts.push(newPart('engine', back.pos, back.normal, 0, false));
  d.parts[1]!.size = 0.45;
  const rim = coreSurface(core, [1, 0, 0.2]);
  d.parts.push(newPart('light', rim.pos, rim.normal, 0, false, 4));
  const fin = coreSurface(core, [1, 0, -0.6]);
  const f = newPart('fin', fin.pos, fin.normal, 0, false, 3);
  f.size = 0.5;
  d.parts.push(f);
  return d;
}

/**
 * The Colony Pod in low orbit (issue #172). Selected on the item bar's
 * Inventory tab (`arm`), a ring follows the pointer over the ground: green
 * where a colony can live, red where it can't, the reason in the hint line
 * (`siteBlock`). A click on a green spot drops the pod: it flies down from
 * the ship along the volcano bomb's path (combat/path.ts), slowing on its
 * retro-jets, and on landing `onLand` founds the colony there.
 */
export class ColonyPod implements Entity {
  private _armed = false;
  private fireTime = 0;
  private flying = false;
  private readonly good: MarkerRing;
  private readonly bad: MarkerRing;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly point = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();
  private readonly from = new THREE.Vector3();
  private readonly to = new THREE.Vector3();
  private readonly control = new THREE.Vector3();
  private readonly at = new THREE.Vector3();
  private readonly ahead = new THREE.Vector3();
  private readonly glow = createGlowTexture();
  private readonly materials = new ShipMaterials(false);
  private readonly pod: THREE.Group;
  private readonly jet: THREE.Sprite;
  private readonly trail: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private readonly group = new THREE.Group();
  /** Why the spot under the pointer won't do, or null if it will (or there's no spot). */
  private aimReason: string | null = null;
  private aimed = false;
  /** Why the last click was refused, shown for a moment. */
  private refused: string | null = null;
  private refusedAt = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly clock: RenderClock,
    private readonly camera: THREE.Camera,
    private readonly input: Input,
    private readonly target: BusterTarget,
    /** Where the pod leaves from. */
    private readonly ship: THREE.Object3D,
    private readonly sfx: SoundEffects,
    /** Why it can't be used here now (no ground, busted, a pod already down…), or null if it can. */
    private readonly blocked: () => string | null,
    /** Why no colony can be founded at unit direction `dir` (body frame), or null if one can. */
    private readonly siteBlock: (dir: THREE.Vector3) => string | null,
    /** The pod has landed at `point` (body frame): found the colony. */
    private readonly onLand: (point: THREE.Vector3) => void,
  ) {
    // Plain colours: green and red that read as such over bright ground and sea.
    this.good = new MarkerRing(scene, '#3dff7a', 0.1, 0.18, false);
    this.bad = new MarkerRing(scene, '#ff3b3b', 0, 0.18, false);
    const model = buildShipModel(podDesign(), this.materials, true);
    // Its nose (+z) down the way it flies: turned in `update`; scaled to its size (the design is ~3.9 long).
    this.pod = new THREE.Group();
    model.group.scale.setScalar(colonyPodParams.size / 3.9);
    this.pod.add(model.group);
    this.jet = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.glow, color: '#bff7ff', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }),
    );
    const trail = new THREE.BufferGeometry();
    trail.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_POINTS * 3), 3));
    const colors = new Float32Array(TRAIL_POINTS * 4);
    for (let i = 0; i < TRAIL_POINTS; i++) {
      const f = i / TRAIL_POINTS;
      colors.set([0.75 - 0.3 * f, 0.95 - 0.3 * f, 1, 0.6 * (1 - f) ** 1.4], i * 4);
    }
    trail.setAttribute('color', new THREE.BufferAttribute(colors, 4));
    this.trail = new THREE.Points(trail, new THREE.PointsMaterial({ map: this.glow, vertexColors: true, depthWrite: false, transparent: true, toneMapped: false }));
    this.trail.frustumCulled = false;
    this.group.add(this.trail, this.pod, this.jet);
    this.group.name = 'Colony pod';
    for (const o of [this.trail, this.jet]) o.renderOrder = CLOUD_RENDER_ORDER + 2;
    this.group.visible = false;
    scene.add(this.group);
  }

  get armed(): boolean {
    return this._armed;
  }

  /** True while a pod is on its way down. */
  get inFlight(): boolean {
    return this.flying;
  }

  arm(on: boolean): void {
    this._armed = on && this.blocked() === null;
    this.setCursor(this._armed);
    if (!this._armed) {
      this.good.hide();
      this.bad.hide();
    }
  }

  status(): ItemStatus {
    const reason = this.blocked();
    if (reason !== null) return { available: false, hint: '', reason };
    if (this.flying) return { available: true, hint: 'Colony pod away…' };
    if (this.refused && this.clock.renderTime - this.refusedAt < 4) return { available: true, hint: this.refused };
    if (!this._armed) return { available: true, hint: '' };
    if (this.aimed && this.aimReason) return { available: true, hint: this.aimReason };
    const tap = this.input.touchMode ? 'Tap' : 'Click';
    return { available: true, hint: `${tap} the ground to drop a colony pod: it grows where the ring is green` };
  }

  /** Shows `text` in the hint line for a moment (the colony founded). */
  note(text: string): void {
    this.refused = text;
    this.refusedAt = this.clock.renderTime;
  }

  /** A click on the ground at `point` (body frame): drops the pod there if armed and the spot will do. True if the click was used. */
  click(point: THREE.Vector3): boolean {
    if (!this._armed) return false;
    if (this.flying) return true;
    const reason = this.siteBlock(this.normal.copy(point).normalize());
    if (reason !== null) {
      this.refused = reason;
      this.refusedAt = this.clock.renderTime;
      return true;
    }
    this.fire(point);
    return true;
  }

  /** Drops a pod at the ground point `point` (body frame), from the ship. */
  fire(point: THREE.Vector3): void {
    if (this.flying || this.blocked() !== null) return;
    this.flying = true;
    this.refused = null;
    this.fireTime = this.clock.renderTime;
    this.from.copy(this.ship.position);
    this.to.copy(point);
    pathControl(this.from, this.to, this.target.groundHeight, this.control);
    this.group.visible = true;
    this.sfx.play('colonyDrop');
  }

  update(frameDt: number): void {
    if (this._armed && this.blocked() !== null) this.arm(false);
    this.aim(frameDt);
    if (!this.flying) return;
    const t = this.clock.renderTime - this.fireTime;
    const T = colonyPodParams.flightTime;
    if (t >= T) {
      this.flying = false;
      this.group.visible = false;
      this.sfx.play('colonyLand');
      this.onLand(this.to);
      return;
    }
    const u = podProgress(t);
    pathPoint(this.from, this.control, this.to, u, this.at);
    pathPoint(this.from, this.control, this.to, Math.min(1, u + 0.02), this.ahead);
    // Engine first down the path (its nose back up it), the size it needs to show from afar.
    const size = Math.max(1, (this.camera.position.distanceTo(this.at) * MIN_ANGULAR_SIZE) / colonyPodParams.size);
    this.pod.position.copy(this.at);
    if (this.ahead.distanceToSquared(this.at) > 1e-8) this.pod.lookAt(this.point.copy(this.at).multiplyScalar(2).sub(this.ahead));
    this.pod.scale.setScalar(size);
    // The retro-jets fire over the last stretch.
    const burn = THREE.MathUtils.smoothstep(t / T, 0.45, 0.7);
    this.jet.position.copy(this.at).addScaledVector(this.ahead.sub(this.at).normalize(), colonyPodParams.size * size * 0.9);
    this.jet.scale.setScalar(colonyPodParams.size * size * (1.2 + 1.8 * burn));
    this.jet.material.opacity = 0.35 + 0.65 * burn;
    const positions = this.trail.geometry.attributes.position as THREE.BufferAttribute;
    const span = TRAIL_LENGTH * T;
    for (let i = 0; i < TRAIL_POINTS; i++) {
      pathPoint(this.from, this.control, this.to, podProgress(Math.max(0, t - (span * i) / TRAIL_POINTS)), this.point);
      positions.setXYZ(i, this.point.x, this.point.y, this.point.z);
    }
    positions.needsUpdate = true;
    this.trail.material.size = colonyPodParams.size * size * 0.8;
  }

  dispose(): void {
    this.scene.remove(this.group);
    this.pod.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.materials.dispose();
    this.materials.blink.dispose();
    this.materials.exhaust.dispose();
    this.trail.geometry.dispose();
    this.trail.material.dispose();
    this.jet.material.dispose();
    this.glow.dispose();
    this.good.dispose();
    this.bad.dispose();
    this.setCursor(false);
  }

  /** The ring on the ground under the pointer while armed: green where a colony can live, red where it can't. */
  private aim(frameDt: number): void {
    const pointer = this.input.pointer;
    this.aimed = false;
    if (!this._armed || !pointer.inside || this.input.blocked) {
      this.good.hide();
      this.bad.hide();
      return;
    }
    this.raycaster.setFromCamera(this.ndc.set(pointer.ndcX, pointer.ndcY), pointerCamera(this.camera));
    if (this.target.groundHit(this.raycaster.ray, this.point) === null) {
      this.good.hide();
      this.bad.hide();
      return;
    }
    this.normal.copy(this.point).normalize();
    this.aimed = true;
    this.aimReason = this.siteBlock(this.normal);
    this.point.copy(this.normal).multiplyScalar(this.target.groundHeight(this.normal) + 0.4);
    const size = Math.max(RETICLE_SIZE, this.camera.position.distanceTo(this.point) * 0.03);
    const [show, hide] = this.aimReason === null ? [this.good, this.bad] : [this.bad, this.good];
    hide.hide();
    show.place(this.point, size, this.flying ? 0.4 : 0.95, this.normal, frameDt);
  }

  private setCursor(aiming: boolean): void {
    document.body.classList.toggle('aiming', aiming);
  }
}

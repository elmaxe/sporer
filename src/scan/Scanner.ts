import * as THREE from 'three';
import type { SoundHandle } from '../audio/CuePlayer';
import type { SoundEffects } from '../audio/sfx';
import { animalKey, cargoSize, speciesKey } from '../cargo/inventory';
import type { ItemStatus } from '../combat/items';
import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';
import type { Input } from '../core/Input';
import { MarkerRing } from '../player/MarkerRing';
import type { Plantings } from '../surface/Plantings';
import type { SurfaceAnimals } from '../surface/SurfaceAnimals';
import type { SurfaceEntities } from '../surface/SurfaceEntities';
import { createGlowTexture } from '../world/glowTexture';
import { pointerCamera } from '../world/thirdPerson';
import { CLOUD_RENDER_ORDER } from '../world/weatherLook';
import type { Discovery, RepositoryEntry, SpeciesRepository } from './repository';
import { scanParams, scanPercent, stepScan, type ScanState } from './scanRules';

/** What the scanner needs from the globe (see PlanetGlobe). */
export interface ScanGround {
  groundHit(ray: THREE.Ray, out: THREE.Vector3): number | null;
}

/** What the scanner needs from the ship: where it is and which way is up. */
export interface ScanShip {
  readonly object: THREE.Object3D;
  readonly up: THREE.Vector3;
}

/** What lives on the body to scan (the level's, gone once it's busted). */
export interface ScanTargets {
  readonly plants: SurfaceEntities | null;
  readonly plantings: Plantings | null;
  readonly animals: SurfaceAnimals | null;
}

/** The body scanned: its key and name (a species' key and home, as the cargo hold has them) and its system's name. */
export interface ScanBody {
  readonly key: string;
  readonly name: string;
  readonly system: string | null;
}

/** The beam leaves from this far below the ship's centre: its underside. */
const MUZZLE_DROP = 0.75;
/** How far past the ground's hit an animal or a plant can still be hit: it's wider than a point. */
const GROUND_SLACK = 1;
/** Seconds a note (what it found) stays on the hint line. */
const NOTE_SECONDS = 3;
const COLOR = new THREE.Color('#66ffcc');
const CORE_COLOR = new THREE.Color('#d8fff2');
const RENDER_ORDER = CLOUD_RENDER_ORDER + 1;
const Y = new THREE.Vector3(0, 1, 0);
/** The rings' geometry faces +z. */
const FACING = new THREE.Vector3(0, 0, 1);

/** An animal or a plant the scanner points at. */
interface ScanTarget {
  /** Which species (its key in the hold and the repository) and what it is. */
  key: string;
  found: Discovery;
  /** Its home body and system, and the body it was seen on if it was brought here. */
  home: string;
  system: string | null;
  seenOn: string | null;
  /** Where it stands (body frame, on the ground), how tall it is and its reach across (units). */
  readonly base: THREE.Vector3;
  height: number;
  radius: number;
}

function emptyTarget(): ScanTarget {
  return { key: '', found: null!, home: '', system: null, seenOn: null, base: new THREE.Vector3(), height: 1, radius: 1 };
}

function copyTarget(from: ScanTarget, to: ScanTarget): void {
  to.key = from.key;
  to.found = from.found;
  to.home = from.home;
  to.system = from.system;
  to.seenOn = from.seenOn;
  to.base.copy(from.base);
  to.height = from.height;
  to.radius = from.radius;
}

/**
 * The scanner in low orbit (a planet-level entity), on the item bar's
 * Inventory tab. Selected (`arm`), a ring follows the pointer, closing round
 * the animal or plant under it; a press fires it, a cone of light from the
 * ship's underside to whatever the pointer is held on, following it until
 * it's let go. Held on an animal or a plant for `scanParams.time` seconds
 * (a ring round it fills, a band sweeps up and down it), it reads its
 * species: a new one goes into the species repository (scan/repository.ts,
 * the menu that shows it is ui/RepositoryDialog.ts) and `onScanned` says so;
 * one already in is named as such. The scan holds a moment if the pointer
 * slips off (an animal walks on), then drains. Sounds: the `scanBeam` loop
 * while it's on, `scanSuccess` when a new species goes in.
 */
export class Scanner implements Entity {
  private _armed = false;
  private scanning = false;
  /** The species being read, and how far along. */
  private readonly current = emptyTarget();
  private hasCurrent = false;
  private readonly state: ScanState = { progress: 0, lost: 0 };
  /** The species last read on this press: not read again until the press ends or the beam moves to another. */
  private doneKey: string | null = null;
  /** True while the beam is on what it reads. */
  private onTarget = false;
  private readonly target = emptyTarget();
  private sound: SoundHandle | null = null;
  private note = '';
  private noteTime = 0;
  /** What the pointer is over while armed, for the hint line. */
  private hover = '';
  private scans = 0;
  private readonly look: ScanLook;
  private readonly reticle: MarkerRing;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly ground = new THREE.Vector3();
  private readonly foot = new THREE.Vector3();
  private readonly muzzle = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly v = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly input: Input,
    private readonly globe: ScanGround,
    private readonly ship: ScanShip,
    private readonly targets: ScanTargets,
    private readonly body: ScanBody,
    private readonly repository: SpeciesRepository,
    private readonly sfx: SoundEffects,
    /** Why it can't be used now (the planet buster going off), or null. */
    private readonly blocked: () => string | null,
    /** Called when a scan completes: the species' entry, and whether it's new. */
    private readonly onScanned: (entry: RepositoryEntry, added: boolean) => void,
    debug: Debug,
  ) {
    this.look = new ScanLook(scene);
    this.reticle = new MarkerRing(scene, COLOR, 0.06, 0.12);
    const f = debug.folder('Scanner');
    f?.add(scanParams, 'time', 0.2, 8);
    f?.add(scanParams, 'grace', 0, 2);
    f?.add(scanParams, 'drain', 0, 4);
    f?.add(scanParams, 'footWidth', 0.5, 3);
  }

  /** Selected on the item bar: a press fires it. */
  get armed(): boolean {
    return this._armed;
  }

  /** True while it's on (held). */
  get on(): boolean {
    return this.scanning;
  }

  /** How far the scan under way is (0–1), and what it reads (for tests and the debug dump). */
  get progress(): number {
    return this.hasCurrent ? this.state.progress : 0;
  }

  get reading(): string | null {
    return this.hasCurrent ? this.current.found.species.name : null;
  }

  /** Scans completed on this visit (new species or not). */
  get completed(): number {
    return this.scans;
  }

  arm(on: boolean): void {
    this._armed = on && this.blocked() === null;
    if (!this._armed) {
      this.stop();
      this.reticle.hide();
      this.hover = '';
    }
    document.body.classList.toggle('scanning', this._armed);
  }

  status(): ItemStatus {
    const reason = this.blocked();
    if (reason !== null) return { available: false, hint: '', reason };
    if (!this._armed) return { available: true, hint: '' };
    if (this.noteTime > 0) return { available: true, hint: this.note };
    if (this.scanning) {
      if (!this.hasCurrent) return { available: true, hint: 'Hold the scanner on an animal or a plant' };
      const name = this.current.found.species.name;
      if (this.doneKey === this.current.key) {
        const entry = this.repository.entry(this.current.key);
        return { available: true, hint: entry ? `${name} is No. ${entry.number} in your repository (R)` : `${name} scanned` };
      }
      return { available: true, hint: `Scanning ${name}… ${scanPercent(this.state.progress)}%` };
    }
    if (this.hover) return { available: true, hint: this.hover };
    return {
      available: true,
      hint: this.input.touchMode ? 'Touch and hold an animal or a plant to scan it' : 'Click and hold on an animal or a plant to scan it',
    };
  }

  update(frameDt: number): void {
    const dt = Math.min(frameDt, 0.1);
    if (this.noteTime > 0) this.noteTime -= frameDt;
    if (this._armed && this.blocked() !== null) this.arm(false);
    this.muzzle.copy(this.ship.object.position).addScaledVector(this.ship.up, -MUZZLE_DROP);
    if (this._armed && !this.scanning) {
      const press = this.input.consumePress();
      // The press is the scanner's, wherever it lands: no flying off while it's selected.
      if (press) {
        this.input.capturePress();
        this.start();
        this.track(press.ndcX, press.ndcY, 0);
      }
    }
    if (this.scanning && (!this.input.primaryDown || !this._armed)) this.stop();
    else if (this.scanning) {
      const { pointer } = this.input;
      if (pointer.inside) this.track(pointer.ndcX, pointer.ndcY, dt);
      else this.track(NaN, NaN, dt);
    }
    this.aim(frameDt);
    if (this.scanning) {
      const reading = this.hasCurrent && this.onTarget;
      const done = this.hasCurrent && this.doneKey === this.current.key;
      this.look.show(
        this.muzzle,
        this.foot,
        reading ? this.current : null,
        reading || (this.hasCurrent && this.state.progress > 0) ? this.state.progress : 0,
        done,
        this.camera,
        frameDt,
      );
    } else this.look.hide();
  }

  dispose(): void {
    this.arm(false);
    this.look.dispose();
    this.reticle.dispose();
  }

  private start(): void {
    this.scanning = true;
    this.hasCurrent = false;
    this.state.progress = this.state.lost = 0;
    this.doneKey = null;
    this.sound = this.sfx.start('scanBeam');
  }

  private stop(): void {
    this.scanning = false;
    this.hasCurrent = false;
    this.onTarget = false;
    this.state.progress = this.state.lost = 0;
    this.doneKey = null;
    this.sound?.stop();
    this.sound = null;
  }

  /**
   * One step of the scan with the pointer at `ndc` (NaN: off the screen):
   * the beam's foot follows what's under it; a new species there starts a
   * new scan, the one being read goes on filling, nothing drains it.
   */
  private track(ndcX: number, ndcY: number, dt: number): void {
    const target = Number.isNaN(ndcX) ? null : this.pick(ndcX, ndcY);
    // Another species under the pointer takes over once the scan under way has slipped for good (or there's none):
    // one passing in front for a frame or two doesn't throw it away.
    const free = !this.hasCurrent || this.state.progress <= 0 || this.state.lost > scanParams.grace || this.doneKey === this.current.key;
    if (target && free && (!this.hasCurrent || target.key !== this.current.key)) {
      copyTarget(target, this.current);
      this.hasCurrent = true;
      this.state.progress = this.state.lost = 0;
    }
    this.onTarget = target !== null && this.hasCurrent && target.key === this.current.key;
    if (this.onTarget) {
      // Its place moves with it (an animal walking).
      this.current.base.copy(target!.base);
      this.up.copy(this.current.base).normalize();
      this.foot.copy(this.current.base).addScaledVector(this.up, this.current.height * 0.5);
    } else if (!Number.isNaN(ndcX) && this.groundAt(ndcX, ndcY)) this.foot.copy(this.ground);
    if (!this.hasCurrent || this.doneKey === this.current.key) return;
    if (stepScan(this.state, dt, this.onTarget)) this.complete();
  }

  /** The scan of the species being read is done: into the repository if it's new. */
  private complete(): void {
    const t = this.current;
    const { entry, added } = this.repository.add(t.key, t.found, { home: t.home, system: t.system, seenOn: t.seenOn }, Date.now());
    this.doneKey = t.key;
    this.scans++;
    if (added) {
      this.sfx.play('scanSuccess');
      this.say(`New species: ${entry.species.name} is No. ${entry.number} in your repository`);
    } else this.say(this.knownLine(t.key, t.found.species.name));
    this.onScanned(entry, added);
  }

  private knownLine(key: string, name: string): string {
    const entry = this.repository.entry(key);
    return entry ? `${name}: already in your repository (No. ${entry.number})` : `${name} scanned`;
  }

  /** The ring under the pointer while selected (and not scanning): round the animal or plant there, or on the ground. */
  private aim(frameDt: number): void {
    const { pointer } = this.input;
    this.hover = '';
    if (!this._armed || this.scanning || !pointer.inside || this.input.blocked || this.input.isDragging) {
      this.reticle.hide();
      return;
    }
    const target = this.pick(pointer.ndcX, pointer.ndcY);
    if (target) {
      this.up.copy(target.base).normalize();
      this.v.copy(target.base).addScaledVector(this.up, 0.2);
      this.reticle.place(this.v, target.radius * scanParams.footWidth * 0.6, 0.95, this.up, frameDt);
      const name = target.found.species.name;
      this.hover = this.repository.has(target.key) ? this.knownLine(target.key, name) : `${name}: not in your repository yet. Hold to scan it`;
      return;
    }
    if (!this.groundAt(pointer.ndcX, pointer.ndcY)) {
      this.reticle.hide();
      return;
    }
    this.up.copy(this.ground).normalize();
    this.v.copy(this.ground).addScaledVector(this.up, 0.2);
    this.reticle.place(this.v, Math.max(0.6, this.camera.position.distanceTo(this.v) * 0.012), 0.6, this.up, frameDt);
  }

  /** Where the ray through `ndc` meets the ground, into `ground`. */
  private groundAt(ndcX: number, ndcY: number): boolean {
    this.raycaster.setFromCamera(this.ndc.set(ndcX, ndcY), pointerCamera(this.camera));
    return this.globe.groundHit(this.raycaster.ray, this.ground) !== null;
  }

  /** The animal or plant the ray through `ndc` meets first (in front of the ground), or null. The returned target is reused. */
  private pick(ndcX: number, ndcY: number): ScanTarget | null {
    this.raycaster.setFromCamera(this.ndc.set(ndcX, ndcY), pointerCamera(this.camera));
    const { ray } = this.raycaster;
    const groundAt = this.globe.groundHit(ray, this.ground);
    const limit = groundAt === null ? Infinity : groundAt + GROUND_SLACK;
    const { animals, plants, plantings } = this.targets;
    const { body } = this;
    const t = this.target;
    const animal = animals?.pick(ray, limit) ?? null;
    if (animal) {
      // One set down here from elsewhere is its own home's species.
      t.key = animal.speciesKey ?? animalKey(body.key, animal.species.index);
      t.found = { kind: 'animal', species: animal.species };
      this.place(t, animal.origin);
      t.base.copy(animal.position);
      const size = cargoSize(t.found);
      t.height = size.height * animal.scale;
      t.radius = size.radius * animal.scale;
      return t;
    }
    const grown = plants?.pick(ray, limit) ?? null;
    const planted = plantings?.pick(ray, grown ? grown.distance : limit) ?? null;
    if (planted) {
      const p = planted.plant;
      t.key = p.speciesKey;
      t.found = { kind: 'plant', species: p.species };
      this.place(t, p.origin);
      t.base.set(p.x, p.y, p.z).multiplyScalar(p.radius);
      t.height = p.species.height * p.scale;
      t.radius = p.species.crownRadius * p.scale;
      return t;
    }
    if (grown) {
      const p = grown.plant;
      t.key = speciesKey(body.key, grown.species.index);
      t.found = { kind: 'plant', species: grown.species };
      this.place(t, null);
      t.base.set(p.x, p.y, p.z).multiplyScalar(p.radius);
      t.height = grown.species.height * p.scale;
      t.radius = grown.species.crownRadius * p.scale;
      return t;
    }
    return null;
  }

  /** A target's home: this body, or `origin` if it was brought here from there. */
  private place(t: ScanTarget, origin: string | null): void {
    const away = origin !== null && origin !== this.body.name;
    t.home = away ? origin : this.body.name;
    t.system = away ? null : this.body.system;
    t.seenOn = away ? this.body.name : null;
  }

  private say(text: string): void {
    this.note = text;
    this.noteTime = NOTE_SECONDS;
  }
}

const CONE_VERTEX = /* glsl */ `
  uniform float uFrom;
  uniform float uTo;
  varying float vFacing;
  varying float vAlong;
  void main() {
    vAlong = position.y;
    vec3 p = position;
    p.xz *= mix(uFrom, uTo, position.y);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vec3 n = normalize(normalMatrix * normal);
    vFacing = abs(dot(n, normalize(-mv.xyz)));
    gl_Position = projectionMatrix * mv;
  }
`;

const CONE_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uLength;
  varying float vFacing;
  varying float vAlong;
  void main() {
    // A shell of light, brightest at its rim; bands of it running down from the ship.
    float rim = 0.18 + 0.82 * pow(1.0 - vFacing, 2.0);
    float band = 0.55 + 0.45 * smoothstep(0.4, 1.0, sin(vAlong * uLength * 1.6 - uTime * 9.0));
    // Fading in from the ship's underside, brightest at the foot.
    float along = smoothstep(0.0, 0.25, vAlong) * (0.55 + 0.45 * vAlong);
    gl_FragColor = vec4(uColor * uOpacity * rim * band * along, 1.0);
  }
`;

const RING_VERTEX = /* glsl */ `
  varying vec2 vPos;
  void main() {
    vPos = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const RING_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uProgress;
  uniform float uOpacity;
  varying vec2 vPos;
  void main() {
    // Filled clockwise from the top, the rest a faint track.
    float a = fract(0.25 - atan(vPos.y, vPos.x) / 6.28318530718);
    float lit = a <= uProgress ? 1.0 : 0.22;
    gl_FragColor = vec4(uColor * uOpacity * lit, 1.0);
  }
`;

/** The scanner's light: a cone from the ship to what it reads, a band sweeping up and down it, a ring round its foot filling as it reads. */
class ScanLook {
  private readonly cone: THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>;
  private readonly sweep: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private readonly progress: THREE.Mesh<THREE.RingGeometry, THREE.ShaderMaterial>;
  private readonly glow: THREE.Sprite;
  private readonly texture = createGlowTexture();
  private readonly axis = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private time = 0;
  /** Seconds since the scan completed: the rings flare once. */
  private flare = 1;
  private wasDone = false;

  constructor(private readonly scene: THREE.Scene) {
    this.cone = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 1, 28, 1, true).translate(0, 0.5, 0),
      new THREE.ShaderMaterial({
        vertexShader: CONE_VERTEX,
        fragmentShader: CONE_FRAGMENT,
        uniforms: { uColor: { value: COLOR.clone() }, uOpacity: { value: 1 }, uTime: { value: 0 }, uLength: { value: 1 }, uFrom: { value: 0.2 }, uTo: { value: 1 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    this.sweep = new THREE.Mesh(
      new THREE.RingGeometry(0.86, 1, 48),
      new THREE.MeshBasicMaterial({ color: CORE_COLOR, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
    );
    this.progress = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1, 72),
      new THREE.ShaderMaterial({
        vertexShader: RING_VERTEX,
        fragmentShader: RING_FRAGMENT,
        uniforms: { uColor: { value: COLOR.clone() }, uProgress: { value: 0 }, uOpacity: { value: 1 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    this.glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.texture, color: COLOR, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }),
    );
    for (const o of [this.cone, this.sweep, this.progress, this.glow]) {
      o.renderOrder = RENDER_ORDER;
      o.frustumCulled = false;
    }
    this.hide();
    scene.add(this.cone, this.sweep, this.progress, this.glow);
  }

  /**
   * Shows the beam from `from` to `to`; with `target` (what it reads, on the
   * ground), its foot opens round it and a band sweeps over it. `progress`
   * fills the ring round its foot; `done` once it has been read.
   */
  show(from: THREE.Vector3, to: THREE.Vector3, target: ScanTarget | null, progress: number, done: boolean, camera: THREE.Camera, frameDt: number): void {
    this.time += frameDt;
    if (done && !this.wasDone) this.flare = 0;
    this.wasDone = done;
    this.flare += frameDt;
    const length = this.axis.subVectors(to, from).length();
    this.axis.divideScalar(Math.max(length, 1e-6));
    // Wide enough to see from afar, and at least as wide as what it reads.
    const far = camera.position.distanceTo(to);
    const foot = target ? Math.max(target.radius * scanParams.footWidth * 0.5, far * 0.01) : Math.max(0.35, far * 0.012);
    const cone = this.cone;
    cone.position.copy(from);
    cone.quaternion.setFromUnitVectors(Y, this.axis);
    cone.scale.set(1, length, 1);
    const u = cone.material.uniforms;
    u.uTime!.value = this.time;
    u.uLength!.value = length;
    u.uFrom!.value = Math.min(0.5, foot * 0.25);
    u.uTo!.value = foot;
    u.uOpacity!.value = target ? 0.7 : 0.45;
    cone.visible = true;
    this.glow.position.copy(to);
    this.glow.scale.setScalar(foot * (target ? 2.2 : 1.6));
    this.glow.material.opacity = 0.6 + 0.2 * Math.sin(this.time * 12);
    this.glow.visible = true;
    if (!target) {
      this.sweep.visible = this.progress.visible = false;
      return;
    }
    this.up.copy(target.base).normalize();
    const ring = target.radius * scanParams.footWidth * 0.6;
    // A band of light running up and down it while it reads.
    if (!done) {
      const s = 0.5 - 0.5 * Math.cos(this.time * 3.2);
      this.sweep.position.copy(target.base).addScaledVector(this.up, target.height * (0.05 + 0.95 * s));
      this.sweep.quaternion.setFromUnitVectors(FACING, this.up);
      this.sweep.scale.setScalar(ring * (0.85 + 0.15 * Math.sin(this.time * 5)));
      this.sweep.material.opacity = 0.7;
      this.sweep.visible = true;
    } else this.sweep.visible = false;
    // The ring round its foot fills as it reads, and flares once when it's done.
    const p = this.progress;
    p.position.copy(target.base).addScaledVector(this.up, 0.2);
    p.quaternion.setFromUnitVectors(FACING, this.up);
    const flare = done ? Math.max(0, 1 - this.flare / 0.6) : 0;
    p.scale.setScalar(ring * (1 + 0.5 * flare));
    p.material.uniforms.uProgress!.value = done ? 1 : progress;
    p.material.uniforms.uOpacity!.value = done ? 0.6 + 0.8 * flare : 1;
    p.visible = true;
  }

  hide(): void {
    this.cone.visible = this.sweep.visible = this.progress.visible = this.glow.visible = false;
    this.wasDone = false;
  }

  dispose(): void {
    this.scene.remove(this.cone, this.sweep, this.progress, this.glow);
    this.cone.geometry.dispose();
    this.cone.material.dispose();
    this.sweep.geometry.dispose();
    this.sweep.material.dispose();
    this.progress.geometry.dispose();
    this.progress.material.dispose();
    this.glow.material.dispose();
    this.texture.dispose();
  }
}

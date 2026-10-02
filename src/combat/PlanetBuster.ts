import * as THREE from 'three';
import type { SoundHandle } from '../audio/CuePlayer';
import type { SoundEffects } from '../audio/sfx';
import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';
import type { Input } from '../core/Input';
import type { GroundHeight } from '../planet/ground';
import type { RenderClock } from '../planet/PlanetFrame';
import { MarkerRing } from '../player/MarkerRing';
import { createCubeSphere } from '../world/cubeSphere';
import { blastParams } from '../gen/debris';
import { debrisLookParams } from '../world/DebrisField';
import { createGlowTexture } from '../world/glowTexture';
import { SIMPLEX_GLSL } from '../world/noiseGlsl';
import { CLOUD_RENDER_ORDER } from '../world/weatherLook';
import {
  blastAt,
  busterParams,
  busterPhase,
  crackSpread,
  doneAt,
  fireball,
  flashAt,
  projectileProgress,
  shockRing,
} from './buster';
import { pathControl, pathPoint } from './path';
import type { ItemStatus } from './items';

/** The aiming ring's size on the ground, planet units. */
const RETICLE_SIZE = 6;
/** Trail dots behind the projectile, and how far back along its path they go (path fraction). */
const TRAIL_POINTS = 48;
const TRAIL_LENGTH = 0.22;
/** The projectile is drawn at least this share of its distance from the camera (so it shows zoomed out). */
const MIN_ANGULAR_SIZE = 0.035;
/** Segments of the cracks' shell, which hugs the ground. */
const SHELL_SEGMENTS = 40;

/** What the planet buster needs from the globe it's fired at (see PlanetGlobe). */
export interface BusterTarget {
  /** Sea-level radius (a small body's longest reach). */
  readonly radius: number;
  readonly groundHeight: GroundHeight;
  groundHit(ray: THREE.Ray, out: THREE.Vector3): number | null;
}

/** What happens to the level as the buster goes off. */
export interface BusterEvents {
  /** Fired: the blast will be at system time `blastTime`. The level locks the ship and pulls the camera back. */
  fire(blastTime: number): void;
  /** The blast: the globe is gone, its debris flies out. */
  blast(): void;
  /** It's over: the player may fly about and leave again. */
  done(): void;
}

export type BusterState = 'ready' | 'firing' | 'spent';

const CRACK_VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const CRACK_FRAGMENT = /* glsl */ `
  uniform vec3 uImpact;
  uniform float uAngle;
  uniform float uGlow;
  uniform float uSeed;
  varying vec3 vDir;
  ${SIMPLEX_GLSL}
  void main() {
    vec3 d = normalize(vDir);
    float a = acos(clamp(dot(d, uImpact), -1.0, 1.0));
    float inside = 1.0 - smoothstep(uAngle - 0.3, uAngle, a);
    // Ridged noise: thin bright lines where it crosses zero.
    float big = 1.0 - smoothstep(0.0, 0.07, abs(snoise(d * 5.0 + uSeed)));
    float fine = 1.0 - smoothstep(0.0, 0.05, abs(snoise(d * 17.0 - uSeed)));
    float cracks = clamp(big + 0.6 * fine, 0.0, 1.0);
    float core = exp(-a * a * 8.0);
    float front = exp(-pow((a - uAngle) / 0.1, 2.0)) * step(0.05, uAngle);
    // The crust inside the front is charred dark, split by glowing cracks; white-hot round the impact.
    float glow = clamp(cracks * inside + front + 1.5 * core, 0.0, 1.0);
    vec3 hot = mix(vec3(1.0, 0.3, 0.04), vec3(1.0, 0.85, 0.5), core);
    vec3 col = mix(vec3(0.06, 0.025, 0.015), hot * 1.4, glow);
    float alpha = clamp(0.7 * inside + glow, 0.0, 1.0) * uGlow;
    gl_FragColor = vec4(col, alpha);
  }
`;

const RING_VERTEX = /* glsl */ `
  varying float vR;
  void main() {
    vR = length(position.xy);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const RING_FRAGMENT = /* glsl */ `
  uniform float uGlow;
  varying float vR;
  void main() {
    // A thin bright outer edge with a fading wake inside it.
    float f = smoothstep(0.75, 0.97, vR) * (1.0 - smoothstep(0.975, 1.0, vR));
    vec3 col = mix(vec3(1.0, 0.45, 0.15), vec3(1.0, 0.9, 0.7), smoothstep(0.85, 0.98, vR));
    gl_FragColor = vec4(col * f * uGlow, 1.0);
  }
`;

/**
 * The planet buster in low orbit. Selected on the item bar (`arm`), a red
 * ring follows the pointer over the ground; a click there fires it (once:
 * the planet is then spent). The projectile leaves the ship and arcs down to
 * the point (busterParams), flashes on impact, and glowing cracks spread
 * over the globe from there until the blast: a blinding flash, the globe
 * gives way to its debris (the level swaps it, `BusterEvents.blast`), a
 * fireball swells and a shock ring races out along the old equator. The
 * whole sequence is a function of the level's clock since firing.
 */
export class PlanetBuster implements Entity {
  private _state: BusterState;
  private _armed = false;
  private fireTime = 0;
  private blasted = false;
  private impacted = false;
  private readonly reticle: MarkerRing;
  private readonly flashEl = document.getElementById('flash');
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly point = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();
  private readonly from = new THREE.Vector3();
  private readonly to = new THREE.Vector3();
  /** The path's control point: see pathControl. */
  private readonly control = new THREE.Vector3();
  private readonly at = new THREE.Vector3();
  private flight: SoundHandle | null = null;
  /** The projectile's path at `u` seconds after firing (for the trail; reuses one vector). */
  private readonly pathAt = (u: number): THREE.Vector3 =>
    pathPoint(this.from, this.control, this.to, projectileProgress(u), this.point);
  /** Made when it's fired. */
  private fx: BusterEffects | null = null;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly clock: RenderClock,
    private readonly camera: THREE.Camera,
    private readonly input: Input,
    private readonly target: BusterTarget,
    /** Where the projectile leaves from. */
    private readonly ship: THREE.Object3D,
    private readonly sfx: SoundEffects,
    private readonly events: BusterEvents,
    /** The body was busted already: nothing to fire at. */
    spent: boolean,
    debug: Debug,
  ) {
    this._state = spent ? 'spent' : 'ready';
    this.reticle = new MarkerRing(scene, '#ff4433', 0.12, 0.2);
    const f = debug.folder('Planet buster');
    f?.add(busterParams, 'flightTime', 0.5, 6);
    f?.add(busterParams, 'fuse', 0, 5);
    f?.add(busterParams, 'settle', 0, 15);
    f?.add(busterParams, 'impactFlash', 0, 1);
    f?.add(busterParams, 'blastFlash', 0, 1);
    f?.add(busterParams, 'fireballSize', 0.5, 6);
    f?.add(busterParams, 'ringSize', 1, 15);
    f?.add(debrisLookParams, 'melt', 0, 4).name('fissure glow');
    f?.add(debrisLookParams, 'crust', 0, 1).name('crust glow');
    f?.add(debrisLookParams, 'haze', 0, 0.5).name('field glow');
    f?.add(debrisLookParams, 'pulse', 0, 1).name('fissure throb');
    f?.add(blastParams, 'hotArea', 0, 1).name('fissure area');
    f?.add(blastParams, 'crustFloor', 800, 2000).name('crust floor K');
  }

  get state(): BusterState {
    return this._state;
  }

  /** True while it's been fired and the sequence hasn't finished: the player can't leave. */
  get busy(): boolean {
    return this._state === 'firing';
  }

  /** Selected on the item bar: the next click on the ground fires it. */
  get armed(): boolean {
    return this._armed;
  }

  /** Seconds since it was fired (for tests), or null. */
  get elapsed(): number | null {
    return this._state === 'firing' || this.blasted ? this.clock.renderTime - this.fireTime : null;
  }

  arm(on: boolean): void {
    this._armed = on && this._state === 'ready';
    this.setCursor(this._armed);
  }

  status(): ItemStatus {
    if (this._state === 'spent') return { available: false, hint: '', reason: 'Nothing left here to bust' };
    if (this._state === 'firing') return { available: false, hint: 'Planet buster away…', reason: 'Planet buster away…' };
    const tap = this.input.touchMode ? 'Tap' : 'Click';
    return { available: true, hint: this._armed ? `${tap} the planet to fire` : '' };
  }

  /** A click on the ground at `point` (body frame): fires if armed. True if the click was used (or must be ignored). */
  click(point: THREE.Vector3): boolean {
    if (this._state === 'firing') return true;
    if (!this._armed || this._state !== 'ready') return false;
    this.fire(point);
    return true;
  }

  /** Fires at the ground point `point` (body frame), from the ship. */
  fire(point: THREE.Vector3): void {
    if (this._state !== 'ready') return;
    this.arm(false);
    this._state = 'firing';
    this.fireTime = this.clock.renderTime;
    this.from.copy(this.ship.position);
    this.to.copy(point);
    pathControl(this.from, this.to, this.target.groundHeight, this.control);
    this.fx = new BusterEffects(this.scene, this.target, point);
    this.sfx.play('busterFire');
    this.flight = this.sfx.start('busterFlight');
    this.events.fire(this.fireTime + blastAt());
  }

  update(frameDt: number): void {
    this.aim(frameDt);
    const fx = this.fx;
    if (!fx) return;
    const t = this.clock.renderTime - this.fireTime;
    const phase = busterPhase(t);
    if (phase !== 'flight' && !this.impacted) {
      this.impacted = true;
      this.flight?.stop();
      this.flight = null;
      this.sfx.play('busterImpact');
    }
    if (!this.blasted && t >= blastAt()) {
      this.blasted = true;
      this.sfx.play('planetExplode');
      this.events.blast();
    }
    if (phase === 'done' && this._state === 'firing') {
      this._state = 'spent';
      this.events.done();
    }
    const distance = this.camera.position.distanceTo(this.ship.position);
    pathPoint(this.from, this.control, this.to, projectileProgress(t), this.at);
    fx.pose(t, this.at, this.pathAt, distance);
    this.setFlash(flashAt(t));
    if (t > doneAt() + busterParams.ringTime) {
      // Everything has faded: drop the effects.
      fx.dispose();
      this.fx = null;
      this.setFlash(0);
    }
  }

  dispose(): void {
    this.flight?.stop();
    this.fx?.dispose();
    this.reticle.dispose();
    this.setFlash(0);
    this.setCursor(false);
  }

  /** The red ring on the ground under the pointer while armed. */
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
    this.reticle.place(this.point, size, 0.95, this.normal, frameDt);
  }

  private setFlash(amount: number): void {
    if (this.flashEl) this.flashEl.style.opacity = amount > 0.002 ? amount.toFixed(3) : '0';
  }

  private setCursor(aiming: boolean): void {
    document.body.classList.toggle('aiming', aiming);
  }
}

/** The sequence's sprites and meshes, made when the buster is fired (in the globe's body frame). */
class BusterEffects {
  private readonly group = new THREE.Group();
  private readonly glow = createGlowTexture();
  private readonly core: THREE.Sprite;
  private readonly halo: THREE.Sprite;
  private readonly trail: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private readonly impact: THREE.Sprite;
  private readonly cracks: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly ball: THREE.Sprite;
  private readonly ring: THREE.Mesh<THREE.RingGeometry, THREE.ShaderMaterial>;
  private readonly impactDir = new THREE.Vector3();
  private readonly color = new THREE.Color();
  private readonly cool = new THREE.Color('#ff6a20');

  constructor(
    private readonly scene: THREE.Scene,
    private readonly target: BusterTarget,
    point: THREE.Vector3,
  ) {
    const sprite = (color: string, depthTest = true, blending: THREE.Blending = THREE.AdditiveBlending) =>
      new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.glow,
          color,
          blending,
          depthWrite: false,
          depthTest,
          toneMapped: false,
          transparent: true,
        }),
      );
    this.core = sprite('#fff4d0');
    // Not added, so it shows red over white clouds and ice too.
    this.halo = sprite('#ff2a10', true, THREE.NormalBlending);
    this.impact = sprite('#fff0c0', false);
    this.ball = sprite('#ffd890');
    const trail = new THREE.BufferGeometry();
    trail.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_POINTS * 3), 3));
    const colors = new Float32Array(TRAIL_POINTS * 4);
    for (let i = 0; i < TRAIL_POINTS; i++) {
      const f = i / TRAIL_POINTS;
      colors.set([1, 0.55 - 0.4 * f, 0.25 - 0.2 * f, 0.9 * (1 - f) ** 1.5], i * 4);
    }
    trail.setAttribute('color', new THREE.BufferAttribute(colors, 4));
    this.trail = new THREE.Points(
      trail,
      new THREE.PointsMaterial({
        map: this.glow,
        vertexColors: true,
        depthWrite: false,
        transparent: true,
        toneMapped: false,
        sizeAttenuation: true,
      }),
    );
    this.trail.frustumCulled = false;

    // The cracks' shell hugs the ground (a small body's lumps too), just above it.
    const R = target.radius;
    const shell = createCubeSphere(1, SHELL_SEGMENTS);
    const pos = shell.attributes.position as THREE.BufferAttribute;
    const dir = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      dir.fromBufferAttribute(pos, i).normalize();
      const r = target.groundHeight(dir) + 0.012 * R + 1;
      pos.setXYZ(i, dir.x * r, dir.y * r, dir.z * r);
    }
    this.impactDir.copy(point).normalize();
    this.cracks = new THREE.Mesh(
      shell,
      new THREE.ShaderMaterial({
        vertexShader: CRACK_VERTEX,
        fragmentShader: CRACK_FRAGMENT,
        uniforms: {
          uImpact: { value: this.impactDir },
          uAngle: { value: 0 },
          uGlow: { value: 0 },
          uSeed: { value: (point.x * 0.013) % 7 },
        },
        depthWrite: false,
        transparent: true,
        toneMapped: false,
      }),
    );
    // Over the clouds and the air: the crust is breaking up under them.
    this.cracks.renderOrder = CLOUD_RENDER_ORDER + 1;
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 1, 160, 1),
      new THREE.ShaderMaterial({
        vertexShader: RING_VERTEX,
        fragmentShader: RING_FRAGMENT,
        uniforms: { uGlow: { value: 0 } },
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        toneMapped: false,
        side: THREE.DoubleSide,
      }),
    );
    // Along the old equator.
    this.ring.rotation.x = -Math.PI / 2;
    this.impact.position.copy(point);
    this.group.add(this.trail, this.halo, this.core, this.impact, this.cracks, this.ball, this.ring);
    this.group.name = 'Planet buster';
    // The projectile and the glows are drawn after the air and clouds, which would veil them.
    for (const o of [this.trail, this.halo, this.core, this.impact, this.ball, this.ring]) o.renderOrder = CLOUD_RENDER_ORDER + 2;
    // The white-hot core over its red halo and trail.
    this.core.renderOrder = CLOUD_RENDER_ORDER + 3;
    scene.add(this.group);
    this.pose(0, new THREE.Vector3().copy(point), () => point, 1);
  }

  /**
   * Poses everything `t` seconds after firing, the projectile at `at`;
   * `path(u)` is the point of its path at time u (for the trail), and
   * `distance` how far the camera is from the ship.
   */
  pose(t: number, at: THREE.Vector3, path: (u: number) => THREE.Vector3, distance: number): void {
    const p = busterParams;
    const R = this.target.radius;
    const flying = t < p.flightTime;
    const size = Math.max(2.5, distance * MIN_ANGULAR_SIZE);
    this.core.visible = this.halo.visible = this.trail.visible = flying;
    if (flying) {
      this.core.position.copy(at);
      this.halo.position.copy(at);
      this.core.scale.setScalar(size);
      this.halo.scale.setScalar(size * 2.5);
      this.halo.material.opacity = 0.9;
      const positions = this.trail.geometry.attributes.position as THREE.BufferAttribute;
      const span = TRAIL_LENGTH * p.flightTime;
      for (let i = 0; i < TRAIL_POINTS; i++) {
        const point = path(Math.max(0, t - (span * i) / TRAIL_POINTS));
        positions.setXYZ(i, point.x, point.y, point.z);
      }
      positions.needsUpdate = true;
      this.trail.material.size = size * 1.3;
    }

    // The impact's own flash where it hit, fading through the fuse.
    const sinceImpact = t - p.flightTime;
    this.impact.visible = sinceImpact >= 0 && sinceImpact < p.fuse + 0.5;
    if (this.impact.visible) {
      const k = Math.exp(-sinceImpact / 0.6);
      this.impact.scale.setScalar(R * (0.25 + 0.5 * (1 - k)) + size * 4);
      this.impact.material.opacity = 0.35 + 0.65 * k;
    }

    const crack = crackSpread(t, p);
    this.cracks.visible = crack.glow > 0;
    this.cracks.material.uniforms.uAngle!.value = crack.angle;
    this.cracks.material.uniforms.uGlow!.value = crack.glow;

    const ball = fireball(t, p);
    this.ball.visible = ball.glow > 0;
    if (this.ball.visible) {
      this.ball.scale.setScalar(2 * ball.size * R);
      this.color.set('#fff2d0').lerp(this.cool, 1 - ball.glow);
      this.ball.material.color.copy(this.color);
      this.ball.material.opacity = Math.min(1, 1.5 * ball.glow);
    }

    const ring = shockRing(t, p);
    this.ring.visible = ring.glow > 0;
    if (this.ring.visible) {
      this.ring.scale.setScalar(ring.radius * R);
      this.ring.material.uniforms.uGlow!.value = ring.glow;
    }
  }

  dispose(): void {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      // Sprites share one geometry of three's: only their materials are theirs.
      if (o instanceof THREE.Mesh || o instanceof THREE.Points) o.geometry.dispose();
      if (o instanceof THREE.Mesh || o instanceof THREE.Points || o instanceof THREE.Sprite) (o.material as THREE.Material).dispose();
    });
    this.glow.dispose();
  }
}

import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';
import { HOME_RANGE, PACK_RANGE_FACTOR, HerdPath, type AnimalPlan, type AnimalPose, type HerdData } from '../gen/animals';
import type { GroundRadius } from '../gen/plants';
import type { SoundEffects } from '../audio/sfx';
import type { SurfaceChanges } from '../surface/changes';
import type { RenderClock } from '../planet/PlanetFrame';
import type { PlanetShip } from '../planet/PlanetShip';
import { animalSkeleton } from '../surface/animalLook';
import { CLOUD_RENDER_ORDER } from '../world/weatherLook';
import { HerdCensus } from './census';
import { candidateHerds, groundDistance, pingInterval, pingPitch, proximity, radarParams, waveSpread } from './radarRules';

/** Pings whose waves can be on screen at once (the shader's loop). */
const PINGS = 4;
/** Herds posed to find the nearest animal, at most. */
const CANDIDATES = 4;
/** After the clouds, like the target rings: it writes no depth and draws over the ground. */
const RADAR_RENDER_ORDER = CLOUD_RENDER_ORDER + 1;
const COLOR = new THREE.Color('#66ffcc');

/** What the radar is doing, for the Species tab. */
/** `standby`: a species is picked but the radar is switched off (the item bar's Radar), so it does nothing. */
export type RadarState = 'off' | 'standby' | 'surveying' | 'none' | 'tracking';

const vertexShader = /* glsl */ `
  varying vec2 vP;
  void main() {
    vP = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/*
 * The disc lies in the ground's tangent plane round the ship, +x towards the
 * tracked animals. Each ping sends a few arcs out from the ship's rim to the
 * disc's edge, fading as they go, as wide as uSpread either side of +x (whole
 * rings once the animals are right below). A faint wedge stays on between
 * pings, pointing the way.
 */
const fragmentShader = /* glsl */ `
  uniform vec4 uAges;      // seconds since each of the last pings (negative: none)
  uniform float uSpread;   // half-angle of the arcs, radians
  uniform float uDuration; // seconds for a wave to reach the edge
  uniform float uGap;      // seconds between a ping's waves
  uniform float uWaves;
  uniform float uStrength;
  uniform float uInner;    // where the waves start: just outside the ship's hull
  uniform vec3 uColor;
  varying vec2 vP;

  float wave(float age, float r, float window) {
    float total = 0.0;
    for (int j = 0; j < 4; j++) {
      if (float(j) >= uWaves) break;
      float a = age - float(j) * uGap;
      if (a <= 0.0 || a >= uDuration) continue;
      float t = a / uDuration;
      // Quick off the ship, slowing as it spreads.
      float front = mix(uInner, 1.0, 1.0 - (1.0 - t) * (1.0 - t));
      float d = (r - front) / 0.022;
      float trail = r < front ? exp(-(front - r) / 0.09) * 0.25 : 0.0;
      total += (exp(-d * d) + trail) * pow(1.0 - t, 1.3) * (1.0 - 0.35 * float(j) / uWaves);
    }
    return total * window;
  }

  void main() {
    float r = length(vP);
    if (r > 1.0) discard;
    float angle = abs(atan(vP.y, vP.x));
    float soft = max(0.12, uSpread * 0.3);
    float window = uSpread >= 3.1 ? 1.0 : 1.0 - smoothstep(uSpread - soft, uSpread, angle);
    float glow = wave(uAges.x, r, window) + wave(uAges.y, r, window) + wave(uAges.z, r, window) + wave(uAges.w, r, window);
    // The standing wedge, faint, fading out towards the edge and kept off the ship.
    float wedge = window * 0.07 * smoothstep(uInner, uInner + 0.08, r) * (1.0 - r);
    float edge = smoothstep(1.0, 0.92, r) * smoothstep(uInner - 0.05, uInner, r);
    gl_FragColor = vec4(uColor * (glow + wedge) * edge * uStrength, 1.0);
  }
`;

/**
 * The radar: tracks one animal species on the planet, picked on the map's
 * Species tab. It surveys the whole globe's herds once (`HerdCensus`, a few
 * cells a frame), then a few times a second poses the herds of that species
 * nearest the ship (their paths are pure functions of the clock, so this is
 * where they really are) and keeps the nearest animal. Every ping sends
 * waves out round the ship along the ground towards it, with the
 * `radarPing` cue: arcs far off, quicker, wider and higher-pitched as it
 * comes closer, whole rings with the animals right below. Cosmetic: nothing it does changes the
 * game, so it runs in `update`.
 */
export class Radar implements Entity {
  readonly census: HerdCensus;
  private readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly uniforms: {
    uAges: { value: THREE.Vector4 };
    uSpread: { value: number };
    uDuration: { value: number };
    uGap: { value: number };
    uWaves: { value: number };
    uStrength: { value: number };
    uInner: { value: number };
    uColor: { value: THREE.Color };
  };
  private species: number | null = null;
  private surveying = false;
  /** The nearest tracked animal (unit direction, body frame) and its ground distance from the ship; distance Infinity when none. */
  private readonly target = new THREE.Vector3();
  private _distance = Infinity;
  private sinceLook = Infinity;
  private sincePing = Infinity;
  /** Seconds since each recent ping, newest first. */
  private readonly ages = [-1, -1, -1, -1];
  private pings = 0;
  private wasPowered = false;
  private readonly paths = new Map<string, HerdPath>();
  private readonly candidates: HerdData[] = [];
  private readonly reach: number;
  private readonly pose: AnimalPose = { x: 0, y: 0, z: 0, hx: 0, hy: 0, hz: 1, cycle: 0, stride: 0, trot: 0, graze: 0, idle: 0 };

  // Scratch objects, reused every frame.
  private readonly e1 = new THREE.Vector3();
  private readonly e2 = new THREE.Vector3();
  private readonly basis = new THREE.Matrix4();

  constructor(
    private readonly scene: THREE.Scene,
    readonly plan: AnimalPlan,
    private readonly ground: GroundRadius,
    private readonly ship: PlanetShip,
    private readonly camera: THREE.Camera,
    private readonly clock: RenderClock,
    private readonly sfx: SoundEffects,
    /** Whether the radar is switched on (the item bar's Radar): off, it does nothing, whatever is picked. */
    private readonly powered: () => boolean,
    debug: Debug,
    /** Animals beamed up or killed (`<herd id>:<k>`), which it no longer finds (none in tests). */
    private readonly changes: Pick<SurfaceChanges, 'removedAnimalCount' | 'isAnimalRemoved'> | null = null,
  ) {
    this.census = new HerdCensus(plan, ground);
    // A herd strays at most its range (a pack's is longer) and its spread from home.
    this.reach = Math.max(...plan.species.map((s) => s.length * 1.7 * Math.sqrt(s.herdMax + 1))) + HOME_RANGE * PACK_RANGE_FACTOR;
    this.uniforms = {
      uAges: { value: new THREE.Vector4(-1, -1, -1, -1) },
      uSpread: { value: radarParams.farSpread },
      uDuration: { value: radarParams.waveSeconds },
      uGap: { value: radarParams.waveGap },
      uWaves: { value: radarParams.waves },
      uStrength: { value: radarParams.strength },
      uInner: { value: 0.3 },
      uColor: { value: COLOR.clone() },
    };
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: this.uniforms,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    this.mesh.name = 'Radar';
    this.mesh.renderOrder = RADAR_RENDER_ORDER;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.matrixAutoUpdate = false;
    scene.add(this.mesh);

    const f = debug.folder('Radar');
    f?.add(radarParams, 'nearInterval', 0.2, 2);
    f?.add(radarParams, 'farInterval', 0.5, 5);
    f?.add(radarParams, 'nearDistance', 1, 100);
    f?.add(radarParams, 'farDistance', 100, 3000);
    f?.add(radarParams, 'nearPitch', 0.25, 4);
    f?.add(radarParams, 'farPitch', 0.25, 4);
    f?.add(radarParams, 'farSpread', 0.1, Math.PI);
    f?.add(radarParams, 'ringDistance', 0, 100);
    f?.add(radarParams, 'openDistance', 20, 500);
    f?.add(radarParams, 'waveSeconds', 0.3, 4);
    f?.add(radarParams, 'waves', 1, 4, 1);
    f?.add(radarParams, 'waveGap', 0, 0.5);
    f?.add(radarParams, 'discScale', 0.1, 2);
    f?.add(radarParams, 'minDisc', 1, 40);
    f?.add(radarParams, 'maxDisc', 0.05, 1.5);
    f?.add(radarParams, 'hull', 0, 6);
    f?.add(radarParams, 'strength', 0, 3);
  }

  /** The species tracked (its index in the plan), or null. */
  get tracking(): number | null {
    return this.species;
  }

  /** Nothing picked, picked but switched off, surveying the globe's herds, none of the species found, or tracking the nearest. */
  get state(): RadarState {
    if (this.species === null) return 'off';
    if (!this.powered()) return 'standby';
    if (!this.census.done) return 'surveying';
    return this._distance === Infinity ? 'none' : 'tracking';
  }

  /** Ground distance (units) from the ship to the nearest tracked animal (Infinity when none). */
  get distance(): number {
    return this._distance;
  }

  /** How the Species tab words that distance ('' when not tracking). */
  get proximity(): string {
    return this.state === 'tracking' ? proximity(this._distance) : '';
  }

  /** Where the nearest tracked animal is (unit direction, body frame); meaningful while `state` is 'tracking'. */
  get targetDirection(): THREE.Vector3 {
    return this.target;
  }

  /** Pings sent since the level began (for automation). */
  get pingCount(): number {
    return this.pings;
  }

  /** True while waves are on screen. */
  get visible(): boolean {
    return this.mesh.visible;
  }

  /** Starts surveying the globe's herds (the Species tab counts them), if not already. */
  survey(): void {
    this.surveying = true;
  }

  /** Tracks species `index` (its index in the plan), or stops with null. The first ping goes out as soon as it's found. */
  track(index: number | null): void {
    if (index !== null && !this.plan.species[index]) index = null;
    if (index === this.species) return;
    this.species = index;
    this._distance = Infinity;
    this.sinceLook = Infinity;
    this.sincePing = Infinity;
    if (index === null) return;
    this.surveying = true;
    // Once the globe is surveyed, it knows at once (so the tab never says none were found before it looked).
    if (this.census.done && this.powered()) {
      this.sinceLook = 0;
      this.look(index);
    }
  }

  update(frameDt: number): void {
    if (this.surveying && !this.census.done) this.census.step(radarParams.censusBudgetMs);
    for (let i = 0; i < PINGS; i++) if (this.ages[i]! >= 0) this.ages[i]! += frameDt;
    const powered = this.powered();
    if (powered !== this.wasPowered) {
      // Switched on: it looks and pings at once; switched off: it forgets what it found (the waves out already fade).
      this.wasPowered = powered;
      this._distance = Infinity;
      this.sinceLook = this.sincePing = Infinity;
    }
    if (powered && this.species !== null && this.census.done) {
      this.sinceLook += frameDt;
      if (this.sinceLook >= radarParams.lookSeconds) {
        this.sinceLook = 0;
        this.look(this.species);
      }
      if (this._distance < Infinity) {
        this.sincePing += frameDt;
        if (this.sincePing >= pingInterval(this._distance)) this.ping();
      }
    }
    this.draw();
  }

  /** Finds the nearest animal of species `index` now. */
  private look(index: number): void {
    const { plan, ship, pose } = this;
    const R = plan.radius;
    const from = ship.up;
    candidateHerds(this.census.herds, index, from, R, this.reach, CANDIDATES, this.candidates);
    const t = this.clock.renderTime;
    let best = Infinity;
    for (const herd of this.candidates) {
      const path = this.pathOf(herd);
      const removed = this.changes && this.changes.removedAnimalCount > 0 ? this.changes : null;
      for (let k = 0; k < herd.count; k++) {
        if (removed?.isAnimalRemoved(`${herd.id}:${k}`)) continue;
        path.pose(k, t, pose);
        const d = groundDistance(from, pose, R);
        if (d >= best) continue;
        best = d;
        this.target.set(pose.x, pose.y, pose.z);
      }
    }
    this._distance = best;
  }

  private pathOf(herd: HerdData): HerdPath {
    let path = this.paths.get(herd.id);
    if (!path) {
      path = new HerdPath(this.plan, this.ground, herd, animalSkeleton(this.plan.species[herd.species]!));
      this.paths.set(herd.id, path);
    }
    return path;
  }

  private ping(): void {
    this.sincePing = 0;
    this.pings++;
    for (let i = PINGS - 1; i > 0; i--) this.ages[i] = this.ages[i - 1]!;
    this.ages[0] = 0;
    // Higher the closer, like a sonar's.
    this.sfx.play('radarPing', { rate: pingPitch(this._distance) });
  }

  /** The disc round the ship in the ground's tangent plane, +x towards the target, sized by the camera's distance. */
  private draw(): void {
    const { mesh, ship, uniforms } = this;
    const lasts = radarParams.waveSeconds + radarParams.waveGap * radarParams.waves;
    let live = false;
    for (const a of this.ages) live ||= a >= 0 && a < lasts;
    mesh.visible = this.state === 'tracking' || live;
    if (!mesh.visible) return;
    const up = ship.up;
    // Towards the target along the ground (any tangent if it's straight below).
    this.e1.copy(this.target).addScaledVector(up, -up.dot(this.target));
    if (this.e1.lengthSq() < 1e-12) this.e1.set(1, 0, 0).addScaledVector(up, -up.x);
    if (this.e1.lengthSq() < 1e-12) this.e1.set(0, 0, 1).addScaledVector(up, -up.z);
    this.e1.normalize();
    this.e2.crossVectors(up, this.e1);
    // A constant share of the view, but never much wider than the globe seen whole.
    const view = radarParams.discScale * this.camera.position.distanceTo(ship.object.position);
    const size = Math.max(radarParams.minDisc, Math.min(view, radarParams.maxDisc * this.plan.radius));
    const p = ship.object.position;
    this.basis.set(
      this.e1.x * size, this.e2.x * size, up.x, p.x,
      this.e1.y * size, this.e2.y * size, up.y, p.y,
      this.e1.z * size, this.e2.z * size, up.z, p.z,
      0, 0, 0, 1,
    );
    mesh.matrix.copy(this.basis);
    mesh.matrixWorldNeedsUpdate = true;
    uniforms.uAges.value.set(this.ages[0]!, this.ages[1]!, this.ages[2]!, this.ages[3]!);
    uniforms.uSpread.value = this._distance < Infinity ? waveSpread(this._distance) : radarParams.farSpread;
    uniforms.uDuration.value = radarParams.waveSeconds;
    uniforms.uGap.value = radarParams.waveGap;
    uniforms.uWaves.value = radarParams.waves;
    uniforms.uStrength.value = radarParams.strength;
    uniforms.uInner.value = Math.min(0.5, radarParams.hull / size);
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

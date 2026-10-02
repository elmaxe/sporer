import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';
import {
  activeShower,
  collectMeteors,
  meteorHeights,
  meteorPool,
  type Meteor,
  type MeteorShower,
} from '../gen/meteors';
import type { Orbit } from '../gen/orbit';
import type { PlanetFrame } from './PlanetFrame';

export const meteorParams = {
  /** Brightness of a meteor's head. */
  brightness: 3,
  /** Width of a meteor's head, in pixels at least (and in planet radii at most 0.002). */
  pixels: 3,
  /** How much of its path the glowing trail behind the head covers. */
  tail: 0.45,
  /** By day the sky washes faint meteors out: they show this dimly on the day side. */
  day: 0.35,
  /** An impact flash's size in pixels at its brightest. */
  flashPixels: 9,
  flashBrightness: 2.5,
  /** Meteors appear this far round the view's centre: the cap's angular radius per (altitude + meteor height) / radius. */
  spread: 1.6,
};

/** At most this many meteors (or flashes) at once. */
const POOL = 48;
/** Remembered anchors (a meteor keeps its place for as long as it lasts). */
const ANCHORS = 64;

/**
 * Real meteors burn between ~120 and ~55 km up (gen/meteors.ts
 * meteorHeights), far above the clouds. The game's atmosphere is stylised
 * taller (its shell stops at 6 scale heights, gen/atmosphere.ts, with the
 * clouds at 4–10% of the radius), so the shell's top stands for this many km
 * and the streaks run at their real heights' share of it.
 */
export const METEOR_SHELL_KM = 120;

/**
 * Colours of a meteor's light from its emission lines (dust.md): fast ones
 * green and white (magnesium at 517 nm, oxygen's 557.7 nm line, the hot
 * component), slow ones yellow to orange (sodium's 589 nm, relatively
 * stronger below 35–40 km/s).
 */
const COLORS = ['#9dffcf', '#d6f2ff', '#fff3c4', '#ffb35c'].map((c) => new THREE.Color(c));
/** An impact flash's colour: 1600–3100 K (dust.md), as black bodies (Planck through the CIE functions, sRGB: 2000 K and 3100 K). */
const FLASH_COLORS = ['#ff8b16', '#ffbb74'].map((c) => new THREE.Color(c));

interface Anchor {
  id: number;
  /** Unit direction of its place over the ground (body frame). */
  dir: THREE.Vector3;
}

/**
 * Low orbit's meteor shower (gen/meteors.ts), when the body is crossing a
 * comet's dust stream: with air, streaks high up flying away from the
 * radiant, many faint and a few bright, round wherever the camera looks
 * (only where the radiant is above the horizon); airless, brief flashes
 * where the dust hits the ground on the side facing the stream. A pure
 * function of the clock but for where in the view each one lands.
 */
export class Meteors implements Entity {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly positions: THREE.BufferAttribute;
  private readonly colors: THREE.BufferAttribute;
  private readonly corners: THREE.BufferAttribute;
  private readonly pool: Meteor[] = meteorPool(POOL);
  private readonly anchors: Anchor[] = Array.from({ length: ANCHORS }, () => ({ id: -1, dir: new THREE.Vector3() }));
  private nextAnchor = 0;
  private readonly radiant = new THREE.Vector3();
  private readonly radiantSystem = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly centre = new THREE.Vector3();
  private readonly start = new THREE.Vector3();
  private readonly head = new THREE.Vector3();
  private readonly tail = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  private readonly toCamera = new THREE.Vector3();
  private readonly color = new THREE.Color();
  /** The shower running now and how strong (0 when none), for the HUD and the smoke test. */
  shower: MeteorShower | null = null;
  activity = 0;
  /** Meteors or flashes drawn at the last update. */
  count = 0;
  /** Whether the radiant is above the ship's horizon. */
  radiantUp = false;
  /** The running shower's entry speed (km/s) and the heights its meteors burn at (km). */
  private speed = 30;
  private heights = meteorHeights(30);

  constructor(
    private readonly scene: THREE.Scene,
    private readonly frame: PlanetFrame,
    readonly showers: readonly MeteorShower[],
    /** The body's orbit round the star (a moon's: its planet's): where it is on it sets the shower's strength. */
    private readonly orbit: Orbit,
    /** No air: impact flashes on the ground instead of streaks. */
    readonly airless: boolean,
    /** The globe's sea-level radius and the atmosphere shell's top (in radii; 1 when airless). */
    private readonly radius: number,
    private readonly airTop: number,
    private readonly groundHeight: (dir: THREE.Vector3) => number,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly sun: THREE.Vector3,
    /** Where the ship is (its up is the HUD's horizon). */
    private readonly ship: THREE.Object3D,
    debug: Debug,
  ) {
    const geometry = new THREE.BufferGeometry();
    this.positions = new THREE.BufferAttribute(new Float32Array(POOL * 4 * 3), 3);
    this.colors = new THREE.BufferAttribute(new Float32Array(POOL * 4 * 4), 4);
    // (along, across): along 0 at the tail, 1 at the head; flashes use both as a disc's coordinates.
    this.corners = new THREE.BufferAttribute(new Float32Array(POOL * 4 * 2), 2);
    this.positions.setUsage(THREE.DynamicDrawUsage);
    this.colors.setUsage(THREE.DynamicDrawUsage);
    this.corners.setUsage(THREE.DynamicDrawUsage);
    const index: number[] = [];
    for (let i = 0; i < POOL; i++) index.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3);
    geometry.setIndex(index);
    geometry.setAttribute('position', this.positions);
    geometry.setAttribute('aColor', this.colors);
    geometry.setAttribute('aCorner', this.corners);
    geometry.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(
      geometry,
      new THREE.ShaderMaterial({
        vertexShader: /* glsl */ `
          attribute vec4 aColor;
          attribute vec2 aCorner;
          varying vec4 vColor;
          varying vec2 vCorner;
          void main() {
            vColor = aColor;
            vCorner = aCorner;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uFlash;
          varying vec4 vColor;
          varying vec2 vCorner;
          void main() {
            float a;
            if (uFlash > 0.5) {
              // A round glow with a hot core.
              float r = length(vCorner * 2.0 - 1.0);
              a = exp(-r * r * 6.0) + 0.6 * exp(-r * r * 40.0);
            } else {
              // Brightest at the head, fading back along the trail, soft across it.
              float across = 1.0 - abs(vCorner.y * 2.0 - 1.0);
              a = pow(vCorner.x, 2.2) * smoothstep(0.0, 0.8, across);
            }
            gl_FragColor = vec4(vColor.rgb * vColor.a * a, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `,
        uniforms: { uFlash: { value: airless ? 1 : 0 } },
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
    this.mesh.name = airless ? 'Meteor impact flashes' : 'Meteors';
    this.mesh.frustumCulled = false;
    // With the clouds and rain, after the atmosphere.
    this.mesh.renderOrder = 3;
    scene.add(this.mesh);

    const f = debug.folder('Meteors');
    f?.add(meteorParams, 'brightness', 0, 6);
    f?.add(meteorParams, 'pixels', 0.5, 6);
    f?.add(meteorParams, 'tail', 0.05, 1);
    f?.add(meteorParams, 'day', 0, 1);
    f?.add(meteorParams, 'flashPixels', 1, 30);
    f?.add(meteorParams, 'flashBrightness', 0, 6);
    f?.add(meteorParams, 'spread', 0.2, 4);
  }

  update(): void {
    const time = this.frame.renderTime;
    const now = activeShower(this.showers, this.orbit, time);
    this.shower = now?.shower ?? null;
    this.activity = now?.activity ?? 0;
    this.up.copy(this.ship.position).normalize();
    let quads = 0;
    if (now) {
      const r = now.shower.radiant;
      this.speed = now.shower.speed;
      this.heights = meteorHeights(now.shower.speed);
      this.frame.toLocalDirection(this.radiantSystem.set(r[0], r[1], r[2]), this.radiant);
      this.radiantUp = this.up.dot(this.radiant) > 0;
      const n = collectMeteors(now.shower, now.activity, time, this.airless, this.pool);
      for (let i = 0; i < n; i++) if (this.place(this.pool[i]!, time, quads)) quads++;
    } else {
      this.radiantUp = false;
    }
    this.count = quads;
    this.mesh.geometry.setDrawRange(0, quads * 6);
    this.positions.needsUpdate = true;
    this.colors.needsUpdate = true;
    this.corners.needsUpdate = true;
  }

  /** Writes meteor `m` as quad `q`; false when it isn't drawn (the radiant is below its horizon). */
  private place(m: Meteor, time: number, q: number): boolean {
    const dir = this.anchorFor(m);
    const R = this.radius;
    const facing = dir.dot(this.radiant);
    // Only the side facing the stream gets its dust.
    if (facing < 0.08) return false;
    const pixel = (THREE.MathUtils.degToRad(this.camera.fov) / Math.max(1, window.innerHeight)) * 1;
    const t = (time - m.start) / m.duration;
    if (this.airless) {
      const ground = this.groundHeight(dir);
      this.head.copy(dir).multiplyScalar(ground + 0.002 * R);
      const d = this.toCamera.subVectors(this.camera.position, this.head).length();
      // A sharp flash, fading fast.
      const b = Math.exp(-t * 4) * (1 - t) * m.brightness;
      const size = meteorParams.flashPixels * pixel * d * (0.4 + 0.6 * m.brightness);
      // Brighter flashes are hotter.
      this.color.copy(FLASH_COLORS[0]!).lerp(FLASH_COLORS[1]!, m.brightness);
      this.writeColor(q, b * meteorParams.flashBrightness);
      this.writeFlash(q, this.head, size);
      return true;
    }
    const shell = (this.airTop - 1) / METEOR_SHELL_KM;
    const begin = R * (1 + shell * this.heights.begin);
    const end = R * (1 + shell * this.heights.end);
    // Down along the stream's direction (away from the radiant): a slanting path from begin to end height.
    const cosZ = Math.max(facing, 0.15);
    const length = (begin - end) / cosZ;
    this.start.copy(dir).multiplyScalar((begin + end) / 2).addScaledVector(this.radiant, length / 2);
    const s = Math.min(1, Math.max(0, t));
    this.head.copy(this.start).addScaledVector(this.radiant, -length * s);
    this.tail.copy(this.start).addScaledVector(this.radiant, -length * Math.max(0, s - meteorParams.tail));
    // Flares up and burns out.
    const b = Math.sin(Math.PI * Math.min(1, s * 1.15)) ** 0.6 * m.brightness;
    const sunlit = THREE.MathUtils.smoothstep(dir.dot(this.sun), -0.1, 0.25);
    const d = this.toCamera.subVectors(this.camera.position, this.head).length();
    const width = Math.min(meteorParams.pixels * pixel * d, 0.002 * R * 4);
    // Slow meteors orange to yellow (sodium), fast ones green to white, with some spread.
    const fast = THREE.MathUtils.clamp((this.speed - 20) / 40, 0, 1);
    this.pickColor((1 - fast) * 0.75 + m.hue * 0.25);
    this.writeColor(q, b * meteorParams.brightness * (1 - (1 - meteorParams.day) * sunlit));
    this.writeStreak(q, width);
    return true;
  }

  /** Where meteor `m` is over the ground: kept while it lasts, first placed round the view's centre. */
  private anchorFor(m: Meteor): THREE.Vector3 {
    for (const a of this.anchors) if (a.id === m.id) return a.dir;
    const a = this.anchors[this.nextAnchor]!;
    this.nextAnchor = (this.nextAnchor + 1) % ANCHORS;
    a.id = m.id;
    const cam = this.camera.position;
    const R = this.radius;
    const altitude = Math.max(0, cam.length() - R);
    const height = this.airless ? 0 : ((this.airTop - 1) * R * this.heights.begin) / METEOR_SHELL_KM;
    // Round the point the camera looks towards, a little ahead (low down it looks along the horizon).
    const reach = Math.min(R, (altitude + height) * 1.5);
    this.camera.getWorldDirection(this.forward);
    this.centre.copy(cam).addScaledVector(this.forward, reach).normalize();
    const cap = Math.min(0.9, (meteorParams.spread * (altitude + height + 0.02 * R)) / R);
    // A uniform spot in the cap: angle and distance from the meteor's two numbers.
    const angle = Math.sqrt(m.v) * cap;
    const heading = m.u * Math.PI * 2;
    const e1 = this.side.set(0, 1, 0).cross(this.centre);
    if (e1.lengthSq() < 1e-6) e1.set(1, 0, 0).cross(this.centre);
    e1.normalize();
    const e2 = this.tail.crossVectors(this.centre, e1);
    a.dir
      .copy(this.centre)
      .multiplyScalar(Math.cos(angle))
      .addScaledVector(e1, Math.sin(angle) * Math.cos(heading))
      .addScaledVector(e2, Math.sin(angle) * Math.sin(heading))
      .normalize();
    return a.dir;
  }

  /** Sets `color` along the meteor palette, 0 (green) to 1 (orange). */
  private pickColor(x: number): void {
    const k = x * (COLORS.length - 1);
    const i = Math.min(COLORS.length - 2, Math.floor(k));
    this.color.copy(COLORS[i]!).lerp(COLORS[i + 1]!, k - i);
  }

  private writeColor(q: number, brightness: number): void {
    for (let k = 0; k < 4; k++) this.colors.setXYZW(q * 4 + k, this.color.r, this.color.g, this.color.b, brightness);
  }

  /** A camera-facing ribbon from the tail to the head, `width` wide at the head. */
  private writeStreak(q: number, width: number): void {
    const along = this.side.subVectors(this.head, this.tail);
    this.toCamera.subVectors(this.camera.position, this.head);
    along.cross(this.toCamera);
    if (along.lengthSq() < 1e-12) along.set(0, 0, 1);
    along.normalize().multiplyScalar(width / 2);
    const o = q * 4;
    this.positions.setXYZ(o, this.tail.x - along.x, this.tail.y - along.y, this.tail.z - along.z);
    this.positions.setXYZ(o + 1, this.tail.x + along.x, this.tail.y + along.y, this.tail.z + along.z);
    this.positions.setXYZ(o + 2, this.head.x - along.x, this.head.y - along.y, this.head.z - along.z);
    this.positions.setXYZ(o + 3, this.head.x + along.x, this.head.y + along.y, this.head.z + along.z);
    this.corners.setXY(o, 0, 0);
    this.corners.setXY(o + 1, 0, 1);
    this.corners.setXY(o + 2, 1, 0);
    this.corners.setXY(o + 3, 1, 1);
  }

  /** A camera-facing square round `p`, `size` across. */
  private writeFlash(q: number, p: THREE.Vector3, size: number): void {
    const cam = this.camera;
    // The camera's right and up, from its world matrix.
    const e = cam.matrixWorld.elements;
    const rx = e[0]! * size * 0.5;
    const ry = e[1]! * size * 0.5;
    const rz = e[2]! * size * 0.5;
    const ux = e[4]! * size * 0.5;
    const uy = e[5]! * size * 0.5;
    const uz = e[6]! * size * 0.5;
    const o = q * 4;
    this.positions.setXYZ(o, p.x - rx - ux, p.y - ry - uy, p.z - rz - uz);
    this.positions.setXYZ(o + 1, p.x - rx + ux, p.y - ry + uy, p.z - rz + uz);
    this.positions.setXYZ(o + 2, p.x + rx - ux, p.y + ry - uy, p.z + rz - uz);
    this.positions.setXYZ(o + 3, p.x + rx + ux, p.y + ry + uy, p.z + rz + uz);
    this.corners.setXY(o, 0, 0);
    this.corners.setXY(o + 1, 0, 1);
    this.corners.setXY(o + 2, 1, 0);
    this.corners.setXY(o + 3, 1, 1);
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

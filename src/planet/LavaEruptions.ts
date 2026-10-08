import * as THREE from 'three';
import { onGroundLayers } from '../world/groundDepth';
import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';
import {
  EruptionSchedule,
  eruptionGlow,
  flightTime,
  launch,
  maxEruptionParticles,
  peakHeight,
  type EruptionEvent,
  type LavaActivity,
} from '../gen/lavaActivity';
import { GLOBE_SIZE_FACTOR } from '../gen/planets';
import { Rng } from '../gen/rng';
import { AFTER_ATMOSPHERE_RENDER_ORDER } from '../world/atmosphereShell';
import { createGlowTexture } from '../world/glowTexture';
import type { RenderClock } from './PlanetFrame';

export const eruptionParams = {
  /** Blob size, planet-level units (grows with the globes, like the arcs). */
  blobSize: 0.6 * GLOBE_SIZE_FACTOR,
  brightness: 1,
  /** Brightness of the hanging glow over big eruptions. */
  glow: 1,
  /** Peak intensity of the light an eruption throws on the terrain around it (it falls off as distance², which grows with the globes). */
  light: 400 * GLOBE_SIZE_FACTOR ** 2,
};

/** Glow sprites (the brightest vents get one). */
const GLOWS = 6;

const vertexShader = /* glsl */ `
  attribute vec4 aTime;    // launch time, flight time, kind (0 fountain, 1 eruption), random
  attribute vec3 aOrigin;  // unit direction of the vent
  attribute vec3 aTangent; // unit tangent it flies along
  attribute vec3 aLaunch;  // vertical speed, sideways speed, size
  uniform float uTime;
  uniform float uRadius;
  uniform float uGravity;
  uniform float uSize;
  uniform float uScale;    // pixels per unit at distance 1
  varying float vHeat;
  varying float vAlpha;

  void main() {
    float age = uTime - aTime.x;
    float a = age / max(aTime.y, 1e-3);
    if (a < 0.0 || a > 1.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // off screen
      gl_PointSize = 0.0;
      vAlpha = 0.0;
      return;
    }
    // Ballistic arc over the sphere (gen/lavaActivity.ts, ballisticPoint).
    float h = aLaunch.x * age - 0.5 * uGravity * age * age;
    float angle = aLaunch.y * age / uRadius;
    vec3 p = (aOrigin * cos(angle) + aTangent * sin(angle)) * (uRadius + h);
    // Cools on the way: eruption blobs start hotter and cool slower.
    vHeat = pow(1.0 - a, aTime.z > 0.5 ? 0.9 : 1.2) * (0.75 + 0.25 * aTime.w);
    // Spat out of the glare, sinking back into the melt.
    vAlpha = smoothstep(0.0, 0.04, a) * (1.0 - smoothstep(0.92, 1.0, a));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(uSize * aLaunch.z * (1.0 - 0.35 * a) * uScale / -mv.z, 1.0, 40.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uBrightness;
  uniform vec3 uTint;
  varying float vHeat;
  varying float vAlpha;

  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float d = dot(c, c);
    if (d > 1.0) discard;
    // Yellow-white → orange → dull red → dark crust, brighter than 1 while hot (tone mapped).
    float h = vHeat;
    vec3 col = mix(vec3(0.07, 0.025, 0.015), vec3(0.45, 0.05, 0.01), smoothstep(0.0, 0.3, h));
    col = mix(col, vec3(1.0, 0.35, 0.05) * 1.6, smoothstep(0.25, 0.6, h));
    col = mix(col, vec3(1.0, 0.85, 0.5) * 2.6, smoothstep(0.65, 1.0, h));
    col *= uTint * mix(1.0, uBrightness, smoothstep(0.2, 0.5, h));
    // A hot core, a slightly softer rim.
    col *= 1.0 - 0.35 * d;
    gl_FragColor = vec4(col, vAlpha * (1.0 - smoothstep(0.6, 1.0, d)));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * A lava body's eruptions in low orbit: fountains and big eruptions throw
 * glowing blobs up from vents in the lava seas on ballistic arcs; they cool
 * and darken as they fall back. One pooled `Points` animated in the vertex
 * shader (like StarStorms): each event writes its blobs into the next free
 * run of the pool when its slot opens, and only those ranges are uploaded.
 * The brightest vents also get a glow sprite (hanging over big eruptions
 * after the blobs have landed) and one flickering light on the terrain.
 * Everything depends only on the clock (gen/lavaActivity.ts).
 */
export class LavaEruptions implements Entity {
  readonly points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly schedule: EruptionSchedule;
  private readonly time: THREE.BufferAttribute;
  private readonly origin: THREE.BufferAttribute;
  private readonly tangent: THREE.BufferAttribute;
  private readonly launch: THREE.BufferAttribute;
  private readonly size: number;
  private cursor = 0;
  private readonly glowTexture: THREE.CanvasTexture;
  private readonly glows: THREE.Sprite[];
  private readonly light = onGroundLayers(new THREE.PointLight('#ff7a2a', 0, 0, 2));
  private readonly drawingSize = new THREE.Vector2();
  private readonly write = (event: EruptionEvent): void => this.writeEvent(event);
  private readonly ranked: EruptionEvent[] = [];
  /** Brightest first, at the shown time. */
  private readonly byGlow = (a: EruptionEvent, b: EruptionEvent): number =>
    eruptionGlow(b, this.shown) - eruptionGlow(a, this.shown);
  private shown = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly frame: RenderClock,
    readonly activity: LavaActivity,
    seed: number,
    /** The sea's colour, tinting the blobs. */
    color: string,
    debug: Debug,
  ) {
    this.schedule = new EruptionSchedule(activity, seed);
    this.size = Math.max(64, maxEruptionParticles(activity));
    const geometry = new THREE.BufferGeometry();
    const attr = (itemSize: number) => {
      const a = new THREE.BufferAttribute(new Float32Array(this.size * itemSize), itemSize);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.time = attr(4);
    this.origin = attr(3);
    this.tangent = attr(3);
    this.launch = attr(3);
    // Unused, but three needs a position attribute to know the draw count.
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.size * 3), 3));
    geometry.setAttribute('aTime', this.time);
    geometry.setAttribute('aOrigin', this.origin);
    geometry.setAttribute('aTangent', this.tangent);
    geometry.setAttribute('aLaunch', this.launch);

    const tint = new THREE.Color(color);
    tint.multiplyScalar(1 / Math.max(tint.r, tint.g, tint.b, 1e-3)).lerp(new THREE.Color(1, 1, 1), 0.6);
    this.points = new THREE.Points(
      geometry,
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uTime: { value: 0 },
          uRadius: { value: activity.radius },
          uGravity: { value: activity.gravity },
          uSize: { value: eruptionParams.blobSize },
          uScale: { value: 1 },
          uBrightness: { value: eruptionParams.brightness },
          uTint: { value: tint },
        },
        transparent: true,
        depthWrite: false,
      }),
    );
    this.points.name = 'Lava eruptions';
    // Positions come from the shader, so the bounding sphere can't be known.
    this.points.frustumCulled = false;
    // The blobs fly inside the atmosphere shell, like the ship.
    this.points.renderOrder = AFTER_ATMOSPHERE_RENDER_ORDER;
    this.points.onBeforeRender = (renderer, _scene, camera) => {
      renderer.getDrawingBufferSize(this.drawingSize);
      const proj = (camera as THREE.PerspectiveCamera).projectionMatrix.elements[5]!;
      this.points.material.uniforms.uScale!.value = this.drawingSize.y * 0.5 * proj;
    };

    this.glowTexture = createGlowTexture();
    this.glows = Array.from({ length: GLOWS }, () => {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.glowTexture,
          color: new THREE.Color(1, 0.45, 0.12).multiply(tint),
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          transparent: true,
        }),
      );
      sprite.renderOrder = AFTER_ATMOSPHERE_RENDER_ORDER;
      sprite.visible = false;
      return sprite;
    });
    scene.add(this.points, this.light, ...this.glows);

    const f = debug.folder('Lava eruptions');
    f?.add(eruptionParams, 'blobSize', 0.05, 2);
    f?.add(eruptionParams, 'brightness', 0, 3);
    f?.add(eruptionParams, 'glow', 0, 3);
    f?.add(eruptionParams, 'light', 0, 2000);
    this.update();
  }

  /** Pool size in blobs. */
  get capacity(): number {
    return this.size;
  }

  /** Blobs in the air at the last `update` (debugging and the smoke test; loops over the pool). */
  get liveBlobs(): number {
    const t = this.time.array;
    let n = 0;
    for (let i = 0; i < t.length; i += 4) if (this.shown >= t[i]! && this.shown < t[i]! + t[i + 1]!) n++;
    return n;
  }

  /** Events under way (or about to start). */
  get events(): readonly EruptionEvent[] {
    return this.schedule.events;
  }

  update(): void {
    const time = (this.shown = this.frame.renderTime);
    const u = this.points.material.uniforms;
    u.uTime!.value = time;
    u.uSize!.value = eruptionParams.blobSize;
    u.uBrightness!.value = eruptionParams.brightness;

    const jumped = this.schedule.jumps(time);
    if (jumped) {
      // Refilled from the events alive now (the schedule rebuilds itself).
      this.time.array.fill(0);
      this.cursor = 0;
    }
    this.schedule.advance(time, this.write);
    if (jumped) {
      // Upload the whole pool: the cleared blobs as well as what was just spawned.
      for (const attr of [this.time, this.origin, this.tangent, this.launch]) {
        attr.clearUpdateRanges();
        attr.needsUpdate = true;
      }
    }
    this.showGlows(time);
  }

  /** Glow sprites on the brightest vents, and the light at the very brightest. */
  private showGlows(time: number): void {
    const ranked = this.ranked;
    ranked.length = 0;
    for (const e of this.schedule.events) if (eruptionGlow(e, time) > 0) ranked.push(e);
    ranked.sort(this.byGlow);
    const { radius, gravity } = this.activity;
    for (let i = 0; i < GLOWS; i++) {
      const sprite = this.glows[i]!;
      const e = ranked[i];
      sprite.visible = e !== undefined;
      if (!e) continue;
      const glow = eruptionGlow(e, time);
      const big = e.kind === 'eruption';
      // Over an eruption the glow hangs at half its peak height; a fountain's sits low on the vent.
      const peak = peakHeight(e.speed, gravity);
      const height = big ? peak * 0.5 : peak * 0.2;
      const [x, y, z] = e.origin;
      sprite.position.set(x, y, z).multiplyScalar(radius + height);
      sprite.scale.setScalar((big ? 2.2 : 1.4) * Math.max(2, peak));
      sprite.material.opacity = Math.min(1, glow * (big ? 0.45 : 0.7)) * eruptionParams.glow;
    }
    const top = ranked[0];
    if (top) {
      const [x, y, z] = top.origin;
      const peak = peakHeight(top.speed, gravity);
      this.light.position.set(x, y, z).multiplyScalar(radius + Math.max(1.5 * GLOBE_SIZE_FACTOR, peak * 0.4));
      // Flicker: a few incommensurate wobbles.
      const flicker = 0.8 + 0.12 * Math.sin(time * 13.1) + 0.08 * Math.sin(time * 29.7 + 1.3);
      this.light.intensity = eruptionParams.light * eruptionGlow(top, time) * flicker;
    } else {
      this.light.intensity = 0;
    }
  }

  private writeEvent(event: EruptionEvent): void {
    const n = Math.min(event.particles, this.size);
    const rng = new Rng(event.seed);
    const kind = event.kind === 'fountain' ? 0 : 1;
    const t = this.time.array as Float32Array;
    const { gravity } = this.activity;
    for (let k = 0; k < n; k++) {
      const i = (this.cursor + k) % this.size;
      // Fountains spurt steadily; eruptions throw most of theirs at once.
      const u = rng.next();
      const start = event.start + event.life * (kind === 0 ? u : u * u);
      const l = launch(rng, event);
      t[i * 4] = start;
      t[i * 4 + 1] = flightTime(l.up, gravity);
      t[i * 4 + 2] = kind;
      t[i * 4 + 3] = rng.next();
      this.origin.setXYZ(i, event.origin[0], event.origin[1], event.origin[2]);
      this.tangent.setXYZ(i, l.tangent[0], l.tangent[1], l.tangent[2]);
      this.launch.setXYZ(i, l.up, l.side, (kind === 0 ? 1 : 1.5) * rng.range(0.5, 1.3));
    }
    this.markRange(this.cursor, n);
    this.cursor = (this.cursor + n) % this.size;
  }

  /** Uploads blobs [start, start + n) of the ring (wrapping around the end). */
  private markRange(start: number, n: number): void {
    const first = Math.min(n, this.size - start);
    for (const attr of [this.time, this.origin, this.tangent, this.launch]) {
      attr.addUpdateRange(start * attr.itemSize, first * attr.itemSize);
      if (n > first) attr.addUpdateRange(0, (n - first) * attr.itemSize);
      attr.needsUpdate = true;
    }
  }

  dispose(): void {
    this.scene.remove(this.points, this.light, ...this.glows);
    this.points.geometry.dispose();
    this.points.material.dispose();
    for (const g of this.glows) g.material.dispose();
    this.glowTexture.dispose();
    this.light.dispose();
  }
}

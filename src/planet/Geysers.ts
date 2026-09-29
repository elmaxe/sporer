import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';
import {
  GeyserSchedule,
  PARTICLE_CODE,
  geyserParticle,
  maxGeyserParticles,
  type GeyserActivity,
  type GeyserEvent,
} from '../gen/geysers';
import { Rng } from '../gen/rng';
import { AFTER_ATMOSPHERE_RENDER_ORDER } from '../world/atmosphereShell';
import type { PlanetFrame } from './PlanetFrame';

export const geyserParams = {
  /** Scales every particle's size. */
  size: 1,
  /** Scales every particle's opacity. */
  opacity: 1,
  /** How much sunlight the plumes take (the lights are colour × intensity, see PlanetLights). */
  sunlight: 0.45,
  /** Extra brightness looking towards the sun through a plume (ice grains scatter forwards). */
  forward: 2,
};

/** Largest a particle is drawn, pixels (a steam cloud right in front of the camera would fill the screen). */
const MAX_POINT_SIZE = 96;

const vertexShader = /* glsl */ `
  attribute vec4 aTime;    // launch time, lifetime, style (0 cryo, 1 puff, 2 droplet, 3 sulphur), brightness
  attribute vec4 aOrigin;  // unit direction of the vent, ground radius there
  attribute vec3 aTangent; // unit tangent it's thrown along
  attribute vec3 aLaunch;  // vertical speed, sideways speed, size at launch
  attribute vec3 aMotion;  // drag, downward acceleration (negative rises), growth
  attribute vec3 aWind;    // drift velocity, tangent to the ground at the vent
  uniform float uTime;
  uniform float uSize;
  uniform float uScale;    // pixels per unit at distance 1
  uniform float uOpacity;
  uniform float uSunlight;
  uniform float uForward;
  uniform vec3 uSun;
  uniform vec3 uSunLight;
  uniform vec3 uAmbient;
  varying vec3 vColor;
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
    // Motion under linear drag (gen/geysers.ts, plumePoint).
    float k = aMotion.x;
    float kt = k * age;
    float E;
    float F;
    if (kt < 1e-3) {
      E = age * (1.0 - kt * (0.5 - kt / 6.0));
      F = age * age * (0.5 - kt * (1.0 / 6.0 - kt / 24.0));
    } else {
      E = (1.0 - exp(-kt)) / k;
      F = (age - E) / k;
    }
    float h = aLaunch.x * E - aMotion.y * F;
    vec3 off = aTangent * (aLaunch.y * E) + aWind * age;
    float d = length(off);
    float base = aOrigin.w;
    vec3 dir = aOrigin.xyz;
    if (d > 1e-6) {
      float angle = d / base;
      dir = dir * cos(angle) + off * (sin(angle) / d);
    }
    vec3 p = dir * (base + h);

    // Lit by the sun from where the particle is (day side, dusk, faint night), brighter looking into the light.
    int style = int(aTime.z + 0.5);
    float day = smoothstep(-0.12, 0.25, dot(dir, uSun));
    vec3 toParticle = normalize(p - cameraPosition);
    float forward = pow(max(dot(toParticle, uSun), 0.0), 6.0) * (style == 3 ? 0.4 : 1.0);
    vec3 tint = style == 0 ? vec3(0.8, 0.9, 1.0) : style == 3 ? vec3(1.0, 0.88, 0.55) : vec3(1.0);
    vColor = tint * (uAmbient + uSunLight * uSunlight * day * (1.0 + uForward * forward));

    // Out of the vent, then thinning out: grains near the end of their fall, steam as it disperses.
    float opacity = style == 0 ? 0.4 : style == 1 ? 0.5 : style == 2 ? 0.6 : 0.45;
    float fade = style == 1 ? 1.0 - smoothstep(0.35, 1.0, a) : 1.0 - smoothstep(0.7, 1.0, a);
    vAlpha = uOpacity * opacity * aTime.w * smoothstep(0.0, 0.05, a) * fade;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float size = uSize * aLaunch.z * mix(1.0, aMotion.z, a);
    gl_PointSize = clamp(size * uScale / -mv.z, 1.0, ${MAX_POINT_SIZE.toFixed(1)});
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float d = dot(c, c);
    if (d > 1.0) discard;
    // A soft round puff.
    float a = vAlpha * exp(-2.5 * d) * (1.0 - smoothstep(0.6, 1.0, d));
    gl_FragColor = vec4(vColor, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * A body's geysers in low orbit (gen/geysers.ts): cryogeysers' tall jets of
 * ice grains, steam geysers' columns and drifting clouds, Io-style sulphur
 * umbrellas. One pooled `Points` animated in the vertex shader (like
 * LavaEruptions): each eruption writes its particles into the next free run
 * of the pool when its cycle opens, and only those ranges are uploaded. Lit
 * by the sun in the shader. Depends only on the clock.
 */
export class Geysers implements Entity {
  readonly points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly schedule: GeyserSchedule;
  private readonly attrs: {
    time: THREE.BufferAttribute;
    origin: THREE.BufferAttribute;
    tangent: THREE.BufferAttribute;
    launch: THREE.BufferAttribute;
    motion: THREE.BufferAttribute;
    wind: THREE.BufferAttribute;
  };
  private readonly attrList: THREE.BufferAttribute[];
  private readonly size: number;
  private cursor = 0;
  private shown = 0;
  private readonly drawingSize = new THREE.Vector2();
  private readonly write = (event: GeyserEvent): void => this.writeEvent(event);

  constructor(
    private readonly scene: THREE.Scene,
    private readonly frame: PlanetFrame,
    readonly activity: GeyserActivity,
    seed: number,
    sun: THREE.Vector3,
    sunLight: THREE.Color,
    ambientLight: THREE.Color,
    debug: Debug,
  ) {
    this.schedule = new GeyserSchedule(activity, seed);
    this.size = Math.max(64, maxGeyserParticles(activity));
    const geometry = new THREE.BufferGeometry();
    const attr = (itemSize: number) => {
      const a = new THREE.BufferAttribute(new Float32Array(this.size * itemSize), itemSize);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.attrs = { time: attr(4), origin: attr(4), tangent: attr(3), launch: attr(3), motion: attr(3), wind: attr(3) };
    this.attrList = Object.values(this.attrs);
    // Unused, but three needs a position attribute to know the draw count.
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.size * 3), 3));
    geometry.setAttribute('aTime', this.attrs.time);
    geometry.setAttribute('aOrigin', this.attrs.origin);
    geometry.setAttribute('aTangent', this.attrs.tangent);
    geometry.setAttribute('aLaunch', this.attrs.launch);
    geometry.setAttribute('aMotion', this.attrs.motion);
    geometry.setAttribute('aWind', this.attrs.wind);

    this.points = new THREE.Points(
      geometry,
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uTime: { value: 0 },
          uSize: { value: geyserParams.size },
          uScale: { value: 1 },
          uOpacity: { value: geyserParams.opacity },
          uSunlight: { value: geyserParams.sunlight },
          uForward: { value: geyserParams.forward },
          uSun: { value: sun },
          uSunLight: { value: sunLight },
          uAmbient: { value: ambientLight },
        },
        transparent: true,
        depthWrite: false,
      }),
    );
    this.points.name = 'Geysers';
    // Positions come from the shader, so the bounding sphere can't be known.
    this.points.frustumCulled = false;
    // The plumes rise inside the atmosphere shell, like the ship.
    this.points.renderOrder = AFTER_ATMOSPHERE_RENDER_ORDER;
    this.points.onBeforeRender = (renderer, _scene, camera) => {
      renderer.getDrawingBufferSize(this.drawingSize);
      const proj = (camera as THREE.PerspectiveCamera).projectionMatrix.elements[5]!;
      this.points.material.uniforms.uScale!.value = this.drawingSize.y * 0.5 * proj;
    };
    scene.add(this.points);

    const f = debug.folder('Geysers');
    f?.add(geyserParams, 'size', 0.1, 3);
    f?.add(geyserParams, 'opacity', 0, 3);
    f?.add(geyserParams, 'sunlight', 0, 2);
    f?.add(geyserParams, 'forward', 0, 6);
    this.update();
  }

  /** Pool size in particles. */
  get capacity(): number {
    return this.size;
  }

  /** Particles in the air at the last `update` (debugging and the smoke test; loops over the pool). */
  get liveParticles(): number {
    const t = this.attrs.time.array;
    let n = 0;
    for (let i = 0; i < t.length; i += 4) if (this.shown >= t[i]! && this.shown < t[i]! + t[i + 1]!) n++;
    return n;
  }

  /** Eruptions under way (or about to start). */
  get events(): readonly GeyserEvent[] {
    return this.schedule.events;
  }

  update(): void {
    const time = (this.shown = this.frame.renderTime);
    const u = this.points.material.uniforms;
    u.uTime!.value = time;
    u.uSize!.value = geyserParams.size;
    u.uOpacity!.value = geyserParams.opacity;
    u.uSunlight!.value = geyserParams.sunlight;
    u.uForward!.value = geyserParams.forward;

    const jumped = this.schedule.jumps(time);
    if (jumped) {
      // Refilled from the events alive now (the schedule rebuilds itself).
      this.attrs.time.array.fill(0);
      this.cursor = 0;
    }
    this.schedule.advance(time, this.write);
    if (jumped) {
      // Upload the whole pool: the cleared particles as well as what was just spawned.
      for (const attr of this.attrList) {
        attr.clearUpdateRanges();
        attr.needsUpdate = true;
      }
    }
  }

  private writeEvent(event: GeyserEvent): void {
    const n = Math.min(event.particles, this.size);
    const rng = new Rng(event.seed);
    const vent = this.activity.vents[event.vent]!;
    const { time, origin, tangent, launch, motion, wind } = this.attrs;
    for (let k = 0; k < n; k++) {
      const i = (this.cursor + k) % this.size;
      const p = geyserParticle(rng, this.activity, event, k);
      time.setXYZW(i, p.start, p.life, PARTICLE_CODE[p.style], p.brightness);
      origin.setXYZW(i, vent.dir[0], vent.dir[1], vent.dir[2], vent.base);
      tangent.setXYZ(i, p.tangent[0], p.tangent[1], p.tangent[2]);
      launch.setXYZ(i, p.up, p.side, p.size);
      motion.setXYZ(i, p.drag, p.gravity, p.growth);
      wind.setXYZ(i, vent.wind[0], vent.wind[1], vent.wind[2]);
    }
    this.markRange(this.cursor, n);
    this.cursor = (this.cursor + n) % this.size;
  }

  /** Uploads particles [start, start + n) of the ring (wrapping around the end). */
  private markRange(start: number, n: number): void {
    const first = Math.min(n, this.size - start);
    for (const attr of this.attrList) {
      attr.addUpdateRange(start * attr.itemSize, first * attr.itemSize);
      if (n > first) attr.addUpdateRange(0, (n - first) * attr.itemSize);
      attr.needsUpdate = true;
    }
  }

  dispose(): void {
    this.scene.remove(this.points);
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}

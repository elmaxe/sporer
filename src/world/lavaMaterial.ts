import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import { EruptionSchedule, eruptionGlow, lavaActivity, type LavaActivity } from '../gen/lavaActivity';
import { globeRadius } from '../planet/frame';
import type { PlanetConfig } from './Planet';
import { SIMPLEX_GLSL } from './noiseGlsl';

/** Global multipliers over every lava sea (debug tuning). */
export const lavaParams = {
  /** Scales the flow and crust drift. */
  pace: 1,
  /** Brightness of the molten glow. */
  glow: 1,
  /** Brightness of the glow around erupting vents. */
  vents: 1,
};

export function addLavaDebug(debug: Debug): void {
  const f = debug.folder('Lava');
  f?.add(lavaParams, 'pace', 0, 10);
  f?.add(lavaParams, 'glow', 0, 3);
  f?.add(lavaParams, 'vents', 0, 3);
}

/**
 * Lava seas draw before the terrain around them, so the sunken sea floor
 * under them fails the depth test instead of being shaded and then covered.
 */
export const SEA_RENDER_ORDER = -1;

/** How many vents glow at once (the brightest). */
const VENT_SLOTS = 4;

/**
 * GLSL shared by the lava sea (per pixel) and the system view's lava bodies
 * (per vertex): the slow heat field of the flow, the glow around erupting
 * vents, and the colour ramp from dark crust to yellow-white.
 */
const LAVA_GLSL = /* glsl */ `
  uniform float uLavaTime;       // system time × pace
  uniform vec3 uLavaOffset;      // per-body noise offset
  uniform vec4 uLavaVents[${VENT_SLOTS}]; // unit direction, glow
  uniform float uLavaVentWidth;  // 1 − cos of the glow's angular radius
  uniform vec3 uLavaTint;
  uniform float uLavaGlow;
  ${SIMPLEX_GLSL}

  // Hot currents and cooler rafts, 0–1: broad noise, domain-warped by a
  // slower field so the currents swirl rather than scroll.
  float lavaFlow(vec3 p) {
    float t = uLavaTime;
    vec3 q = p * 2.2 + uLavaOffset;
    float w = snoise(q * 0.5 + vec3(0.0, t * 0.011, 0.0));
    float n = snoise(q + vec3(1.4, -1.0, 0.7) * w + vec3(t * 0.017, -t * 0.011, t * 0.007));
    float m = snoise(q * 2.3 - vec3(0.0, t * 0.023, 0.0));
    return clamp(0.5 + 0.4 * n + 0.18 * m, 0.0, 1.0);
  }

  float lavaVents(vec3 p) {
    float g = 0.0;
    for (int i = 0; i < ${VENT_SLOTS}; i++) {
      g += uLavaVents[i].w * exp((dot(p, uLavaVents[i].xyz) - 1.0) / uLavaVentWidth);
    }
    return g;
  }

  // How much of the surface is molten at this heat (the rest is crust).
  float lavaMolten(float heat) {
    return smoothstep(0.62, 0.86, heat);
  }

  // Dark crust → deep red → orange → yellow-white, brighter than 1 when hot (tone mapped).
  vec3 lavaRamp(float h) {
    h = clamp(h, 0.0, 1.5);
    vec3 c = mix(vec3(0.04, 0.008, 0.002), vec3(0.6, 0.05, 0.0), smoothstep(0.1, 0.45, h));
    c = mix(c, vec3(1.0, 0.33, 0.03), smoothstep(0.4, 0.75, h));
    c = mix(c, vec3(1.0, 0.82, 0.45), smoothstep(0.75, 1.15, h));
    return c * uLavaTint * (0.5 + 1.8 * h * h) * uLavaGlow;
  }
`;

/**
 * The lava sea's colour at unit direction `p` (body frame) given its broad
 * `flow` (lavaFlow(p)): crust plates cracked open where the flow runs hot,
 * molten where it's hottest, the cool crust lit by the sun. Before tone
 * mapping. Needs LAVA_GLSL and the sea uniforms (`LavaLook.seaUniforms`).
 * Shared by the sea sphere and the planet level's map.
 */
export const LAVA_SEA_GLSL = /* glsl */ `
  ${LAVA_GLSL}
  uniform vec3 uSun;          // unit direction to the sun, body frame
  uniform vec3 uSunLight;     // its colour × intensity
  uniform vec3 uAmbient;
  uniform vec3 uCrust;
  uniform float uCrustScale;

  vec3 lavaSea(vec3 p, float flow) {
    float t = uLavaTime;
    // Crust plates: the cells between a drifting noise's zero crossings, bent by
    // the currents. Their seams crack open wider where the flow runs hot.
    vec3 q = p * uCrustScale + uLavaOffset * 1.7 + vec3(flow - 0.5) * 0.9;
    float a = snoise(q + vec3(t * 0.025, 0.0, -t * 0.018));
    float seam = 1.0 - smoothstep(0.0, 0.03 + 0.14 * flow * flow, abs(a));
    // Finer cracks and ridges inside each plate, running parallel to its edges
    // (like ropy crust): further contours of the same noise, no extra sample.
    float b = abs(abs(a) - 0.3);
    float fine = 1.0 - smoothstep(0.0, 0.03, b);
    float vent = 0.6 * lavaVents(p);
    float heat = flow + vent + seam * 0.5 + fine * 0.25 * flow;
    // Crust where it's cool: dark rock, lit like the terrain (Lambert), faintly red from below.
    vec3 light = uAmbient + uSunLight * max(dot(p, uSun), 0.0);
    vec3 rock = uCrust * light * (0.75 + 0.6 * smoothstep(0.0, 0.3, b));
    return mix(rock + lavaRamp(heat) * 0.12, lavaRamp(heat), lavaMolten(heat));
  }
`;

const seaVertex = /* glsl */ `
  ${LAVA_GLSL}
  varying vec3 vDir;
  varying float vFlow;
  void main() {
    vDir = normalize(position);
    vFlow = lavaFlow(vDir);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const seaFragment = /* glsl */ `
  ${LAVA_SEA_GLSL}
  varying vec3 vDir;
  varying float vFlow;

  void main() {
    gl_FragColor = vec4(lavaSea(normalize(vDir), vFlow), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * A lava body's animated look: its uniforms (time, vents) shared by every
 * material showing it, and the eruption schedule that lights the vents. Its
 * look is a pure function of the system clock (`animate`), like the stars.
 */
export class LavaLook {
  readonly uniforms: {
    uLavaTime: THREE.IUniform<number>;
    uLavaOffset: THREE.IUniform<THREE.Vector3>;
    uLavaVents: THREE.IUniform<THREE.Vector4[]>;
    uLavaVentWidth: THREE.IUniform<number>;
    uLavaTint: THREE.IUniform<THREE.Color>;
    uLavaGlow: THREE.IUniform<number>;
  };
  private readonly schedule: EruptionSchedule;
  private readonly crust: THREE.Color;

  constructor(
    readonly activity: LavaActivity,
    seed: number,
    /** The sea's colour (its hue tints the glow) and the crust's. */
    sea: string,
    crust: string,
    /** Angular radius of a vent's glow, radians (wider when drawn coarsely). */
    ventRadius: number,
  ) {
    this.schedule = new EruptionSchedule(activity, seed);
    // Half-way between a neutral ramp and the sea's own hue (red to orange).
    const tint = new THREE.Color(sea);
    tint.multiplyScalar(1 / Math.max(tint.r, tint.g, tint.b, 1e-3)).lerp(new THREE.Color(1, 1, 1), 0.5);
    this.crust = new THREE.Color(crust);
    this.uniforms = {
      uLavaTime: { value: 0 },
      uLavaOffset: {
        value: new THREE.Vector3(((seed % 997) / 997) * 40, (((seed >>> 10) % 991) / 991) * 40, (((seed >>> 20) % 983) / 983) * 40),
      },
      uLavaVents: { value: Array.from({ length: VENT_SLOTS }, () => new THREE.Vector4()) },
      uLavaVentWidth: { value: 1 - Math.cos(ventRadius) },
      uLavaTint: { value: tint },
      uLavaGlow: { value: 1 },
    };
  }

  /** Shows the lava at system time `time`: the flow, and the glow of the vents erupting now. */
  animate(time: number): void {
    const u = this.uniforms;
    u.uLavaTime.value = time * this.activity.pace * lavaParams.pace;
    u.uLavaGlow.value = lavaParams.glow;
    this.schedule.advance(time);
    // The brightest few vents, by insertion into the fixed slots.
    const slots = u.uLavaVents.value;
    for (const s of slots) s.w = 0;
    for (const e of this.schedule.events) {
      const glow = eruptionGlow(e, time) * lavaParams.vents;
      if (glow <= 0) continue;
      let k = VENT_SLOTS - 1;
      if (glow <= slots[k]!.w) continue;
      for (; k > 0 && slots[k - 1]!.w < glow; k--) slots[k]!.copy(slots[k - 1]!);
      slots[k]!.set(e.origin[0], e.origin[1], e.origin[2], glow);
    }
  }

  /**
   * The animated lava sea, shaded by hand: a sphere at sea level. `sun` is the
   * unit direction to the sun in its frame, `sunLight` and `ambient` the
   * lights' colour × intensity (all read live).
   */
  createSeaMaterial(sun: THREE.Vector3, sunLight: THREE.Color, ambient: THREE.Color): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      vertexShader: seaVertex,
      fragmentShader: seaFragment,
      uniforms: this.seaUniforms(sun, sunLight, ambient),
    });
  }

  /** The uniforms LAVA_SEA_GLSL reads (the shared lava ones plus the light), for a material of its own. */
  seaUniforms(sun: THREE.Vector3, sunLight: THREE.Color, ambient: THREE.Color): Record<string, THREE.IUniform> {
    return {
      ...this.uniforms,
      uSun: { value: sun },
      uSunLight: { value: sunLight },
      uAmbient: { value: ambient },
      uCrust: { value: this.crust },
      uCrustScale: { value: 14 },
    };
  }

  /**
   * A cheaper lava sea for small, distant views (the system view and a
   * visited planet's moons): a lit icosphere at sea level (`detail`
   * subdivisions: 20·(detail+1)² triangles, evenly spaced), whose glow is worked out per vertex from the broad flow and the vents
   * (like the stars' spots). The crust plates and their seams are averaged out.
   */
  createSeaSphere(radius: number, detail = 7): THREE.Mesh {
    const material = new THREE.MeshStandardMaterial({ color: this.crust, roughness: 0.9 });
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${LAVA_GLSL}\nvarying vec3 vLavaGlow;`)
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          {
            vec3 dir = normalize(position);
            float heat = lavaFlow(dir) + 0.6 * lavaVents(dir);
            vec3 seams = lavaRamp(heat + 0.45) * 0.035 + lavaRamp(heat) * 0.05;
            vLavaGlow = mix(seams, lavaRamp(heat), lavaMolten(heat));
          }`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vLavaGlow;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vLavaGlow;');
    };
    material.customProgramCacheKey = () => 'lava-sea';
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, detail), material);
    mesh.name = 'Lava';
    mesh.renderOrder = SEA_RENDER_ORDER;
    return mesh;
  }
}

/**
 * The lava look of a lava world or moon with seas (null for anything else).
 * `ventRadius` is the vent glow's angular radius: wider on coarse meshes.
 */
export function createLavaLook(config: PlanetConfig, ventRadius: number): LavaLook | null {
  const { type, style, seed } = config;
  if (type !== 'lava' || style.sea === null) return null;
  const activity = lavaActivity(seed, style, config.climate, globeRadius(config.radius));
  return new LavaLook(activity, seed, style.sea, style.low, ventRadius);
}

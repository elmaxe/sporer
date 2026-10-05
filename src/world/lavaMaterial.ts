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
  /** The ship's downwash on the lava below it: the crust swept aside from a molten disc, piled up round it, ripples running out. */
  downwash: true,
  /** It starts this high above the lava (units) and is at its strongest this low (the ship's lowest is 3). */
  downwashFrom: 16,
  downwashTo: 4,
  /** How far out the crust is swept, in the ship's radii. */
  downwashReach: 2.4,
};

export function addLavaDebug(debug: Debug): void {
  const f = debug.folder('Lava');
  f?.add(lavaParams, 'pace', 0, 10);
  f?.add(lavaParams, 'glow', 0, 3);
  f?.add(lavaParams, 'vents', 0, 3);
  f?.add(lavaParams, 'downwash');
  f?.add(lavaParams, 'downwashFrom', 4, 60, 1);
  f?.add(lavaParams, 'downwashTo', 0, 20, 0.5);
  f?.add(lavaParams, 'downwashReach', 0.5, 5, 0.1);
}

/**
 * Lava seas draw before the terrain around them, so the sunken sea floor
 * under them fails the depth test instead of being shaded and then covered.
 */
export const SEA_RENDER_ORDER = -1;

/** How many vents glow at once (the brightest). */
const VENT_SLOTS = 4;
/** The ship's radius, units (the UFO is ~4 wide). */
const SHIP_RADIUS = 2;
/** The downwash's ripples on the lava: wavelength (units) and speed (units/s); slow and short-lived, the lava being thick (stylised). */
const RIPPLE_LENGTH = 1.6;
const RIPPLE_SPEED = 1.2;

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
  // The ship's downwash: the point under it (unit, body frame) and its strength, then the swept disc's radius and the
  // ripples' wavenumber (both on the unit sphere), the ripples' phase now and a clock (s, wrapped).
  uniform vec4 uLavaShip;
  uniform vec4 uLavaShipWave;

  vec3 lavaSea(vec3 p, float flow) {
    float t = uLavaTime;
    // The ship's downwash sweeps the crust aside: plates pushed out from under it, bunched up in a ring round a
    // disc of bare molten lava, which churns outward; slow ripples run on beyond and crack the crust open as they go.
    float ship = uLavaShip.w;
    vec3 shipOff = vec3(0.0), radial = vec3(0.0), sq = vec3(0.0), pc = p;
    float shipR = 0.0, shipQ = 1e3, torn = 0.0, bare = 0.0, rim = 0.0, ripEnv = 0.0, ripple = 0.0, ripSlope = 0.0;
    if (ship > 0.0) {
      shipOff = p - uLavaShip.xyz;
      shipOff -= p * dot(p, shipOff);
      shipR = length(shipOff);
      shipQ = shipR / uLavaShipWave.x;
      radial = shipOff / max(shipR, 1e-7);
      // The disc's edge, torn by noise (in the disc's own size, so it looks alike on every globe).
      sq = p / uLavaShipWave.x;
      torn = snoise(sq * 0.9 + vec3(0.0, uLavaShipWave.w * 0.15, 0.0));
      // The hole opens wider as the ship comes down.
      float openQ = shipQ / (0.35 + 0.65 * ship);
      bare = smoothstep(0.0, 0.2, ship) * (1.0 - smoothstep(0.7, 1.0, openQ + 0.12 * torn));
      // Where the crust is drawn from: pulled in towards the ship, so the plates out to ~1.9 radii are squeezed into the ring.
      pc = p - radial * (ship * uLavaShipWave.x * 0.85 * (1.0 - smoothstep(0.9, 1.9, openQ)));
      rim = smoothstep(0.0, 0.3, ship) * exp(-pow((openQ - 1.08 - 0.1 * torn) / 0.28, 2.0));
      // Ripples beyond the rim, dying away within a radius or so.
      ripEnv = ship * smoothstep(1.0, 1.4, shipQ) * exp(-1.8 * max(shipQ - 1.4, 0.0));
      float ph = uLavaShipWave.y * (shipR + 0.15 * uLavaShipWave.x * torn) - uLavaShipWave.z;
      ripple = ripEnv * cos(ph);
      ripSlope = ripEnv * sin(ph);
    }

    // Crust plates: the cells between a drifting noise's zero crossings, bent by
    // the currents. Their seams crack open wider where the flow runs hot.
    vec3 q = pc * uCrustScale + uLavaOffset * 1.7 + vec3(flow - 0.5) * 0.9;
    float a = snoise(q + vec3(t * 0.025, 0.0, -t * 0.018));
    float seam = 1.0 - smoothstep(0.0, 0.03 + 0.14 * flow * flow, abs(a));
    // Finer cracks and ridges inside each plate, running parallel to its edges
    // (like ropy crust): further contours of the same noise, no extra sample.
    float b = abs(abs(a) - 0.3);
    float fine = 1.0 - smoothstep(0.0, 0.03, b);
    float vent = 0.6 * lavaVents(p);
    float heat = flow + vent + seam * 0.5 + fine * 0.25 * flow;
    // The ring of piled crust: buckled into ridges whose cracks glow; the ripples' crests stretch the crust open.
    float buckle = 0.0;
    if (rim > 0.001) {
      float r = snoise(sq * 3.2 - radial * 1.5);
      buckle = rim * (1.0 - smoothstep(0.0, 0.12, abs(r)));
      heat += 0.45 * buckle - 0.15 * rim;
    }
    heat += 0.3 * max(ripple, 0.0);
    // Crust where it's cool: dark rock, lit like the terrain (Lambert), faintly red from below; the rim's ridges and
    // the ripples tip its normal.
    vec3 n = normalize(p - radial * (0.35 * ripSlope + 0.25 * buckle));
    vec3 light = uAmbient + uSunLight * max(dot(n, uSun), 0.0);
    vec3 rock = uCrust * light * (0.75 + 0.6 * smoothstep(0.0, 0.3, b)) * (1.0 - 0.3 * rim);
    vec3 col = mix(rock + lavaRamp(heat) * 0.12, lavaRamp(heat), lavaMolten(heat));
    if (bare > 0.0) {
      // Bare molten lava, churning outward from under the ship: two layers of noise spreading out from it (scaled up
      // about the point under it, so nothing pinches there), crossfaded so it flows without smearing.
      float churn = 0.0;
      vec3 rel = shipOff / uLavaShipWave.x;
      for (int l = 0; l < 2; l++) {
        float cyc = fract(uLavaShipWave.w * 0.3 + 0.5 * float(l));
        vec3 cq = rel * (2.4 / (1.0 + 1.2 * cyc)) + float(l) * 7.3;
        churn += (1.0 - abs(2.0 * cyc - 1.0)) * snoise(cq);
      }
      // Hottest under the ship, a skin already dulling it towards the edge.
      float hot = 0.92 + 0.4 * churn - 0.25 * smoothstep(0.3, 1.0, shipQ);
      col = mix(col, lavaRamp(hot), bare);
    }
    return col;
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
  /** The ship's downwash on the lava sea (LAVA_SEA_GLSL), set each frame by `setShip`. */
  private readonly shipUniforms = {
    uLavaShip: { value: new THREE.Vector4(0, 1, 0, 0) },
    uLavaShipWave: { value: new THREE.Vector4(1, 1, 0, 0) },
  };
  private shipStrength = 0;
  /** The disc's radius and the ripples' wavenumber on the unit sphere (from the sea's radius, at `setShip`). */
  private shipDisc = 1;
  private shipK = 1;
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
    // The downwash: ripples running out at RIPPLE_SPEED, and the churn's clock (both in the clock's own seconds, not the lava's pace).
    const ship = this.downwash;
    this.shipUniforms.uLavaShip.value.w = ship;
    if (ship > 0) {
      const k = (Math.PI * 2) / RIPPLE_LENGTH;
      this.shipUniforms.uLavaShipWave.value.set(this.shipDisc, this.shipK, (k * RIPPLE_SPEED * time) % (Math.PI * 2), time % 1000);
    }
  }

  /**
   * The ship over the lava sea: `dir` the unit direction under it (body
   * frame), `height` above the lava (units) and `radius` the sea's (units), or
   * null when it isn't over lava. Its downwash grows as it comes down
   * (lavaParams.downwashFrom to downwashTo).
   */
  setShip(dir: THREE.Vector3 | null, height: number, radius: number): void {
    const p = lavaParams;
    if (!dir) {
      this.shipStrength = 0;
      return;
    }
    this.shipStrength = 1 - THREE.MathUtils.smoothstep(height, p.downwashTo, p.downwashFrom);
    this.shipUniforms.uLavaShip.value.set(dir.x, dir.y, dir.z, this.downwash);
    this.shipDisc = (SHIP_RADIUS * p.downwashReach) / radius;
    this.shipK = ((Math.PI * 2) / RIPPLE_LENGTH) * radius;
  }

  /** How strong the ship's downwash on the lava is now (0 to 1). */
  get downwash(): number {
    return lavaParams.downwash ? this.shipStrength : 0;
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
      ...this.shipUniforms,
      uSun: { value: sun },
      uSunLight: { value: sunLight },
      uAmbient: { value: ambient },
      uCrust: { value: this.crust },
      uCrustScale: { value: 14 },
    };
  }

  /**
   * A cheaper lava sea for small, distant views (the system view and a
   * visited planet's moons), painted onto the body's own terrain, which must
   * be built with a flat sea at `radius` (no `seaFloor`); `material` is its
   * lit, vertex-coloured terrain material. Where the surface is at sea level it
   * takes the crust's colour and a glow worked out per vertex from the broad
   * flow and the vents (like the stars' spots); the crust plates and their
   * seams are averaged out. One surface, so the sea can't z-fight a sea floor
   * under it when seen from far away.
   */
  paintTerrain(material: THREE.MeshStandardMaterial, radius: number): void {
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms, { uCrust: { value: this.crust }, uShore: { value: radius * (1 + 1e-4) } });
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${LAVA_GLSL}\nvarying vec3 vLavaPos;\nvarying vec3 vLavaGlow;`)
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vLavaPos = position;
          {
            vec3 dir = normalize(position);
            float heat = lavaFlow(dir) + 0.6 * lavaVents(dir);
            vec3 seams = lavaRamp(heat + 0.45) * 0.035 + lavaRamp(heat) * 0.05;
            vLavaGlow = mix(seams, lavaRamp(heat), lavaMolten(heat));
          }`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform vec3 uCrust;\nuniform float uShore;\nvarying vec3 vLavaPos;\nvarying vec3 vLavaGlow;\nfloat lavaSea;',
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          {
            // Sea where the surface is at sea level (the flat sea's chords dip just under it), the coast antialiased outward.
            float r = length(vLavaPos);
            float w = fwidth(r);
            lavaSea = 1.0 - smoothstep(uShore, uShore + 1.5 * w, r);
            diffuseColor.rgb = mix(diffuseColor.rgb, uCrust, lavaSea);
          }`,
        )
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vLavaGlow * lavaSea;');
    };
    material.customProgramCacheKey = () => 'lava-terrain';
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

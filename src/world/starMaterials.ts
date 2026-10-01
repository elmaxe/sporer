import * as THREE from 'three';
import type { StarActivity } from '../gen/starActivity';
import { SIMPLEX_GLSL } from './noiseGlsl';

/** Global multipliers over each star's own activity (debug tuning). */
export const starParams = {
  /** Scales every star's animation pace. */
  pace: 1,
  granulation: 1,
  spots: 1,
  limbDarkening: 0.65,
  corona: 1,
  /**
   * Surface brightness (1 = its plain colours). Over 1 the light bleeds into
   * white, as a bright light does on film: a white-hot disc with a coloured
   * limb, at any distance.
   */
  intensity: 2.1,
  /** Brightness of the bright inner corona hugging the disc... */
  rim: 0.9,
  /** ...which fades over this many star radii... */
  rimWidth: 0.22,
  /** ...and of the glare round it, falling off as r^-2.6 (r in star radii). */
  glare: 0.25,
};


/*
 * Star surface. The large, slow features (spots, supergranulation swell) are
 * low-frequency, so they're sampled per vertex on a fine sphere and
 * interpolated; only the granulation is per pixel.
 */
const surfaceVertex = /* glsl */ `
  uniform float uTime;        // already scaled by the star's pace
  uniform float uSpinTime;    // system time, for differential rotation
  uniform float uDiffRate;    // radians per second the poles lag the equator
  uniform float uGranulation;
  uniform vec3 uOffset;       // per-star noise offset
  varying vec3 vDir;          // differentially rotated surface direction
  varying float vSpot;
  varying float vSwell;
  varying vec3 vNormal;
  varying vec3 vView;
  ${SIMPLEX_GLSL}

  void main() {
    vec3 d = normalize(position);
    // The mesh turns at the equator's rate, higher latitudes lag.
    float lag = uSpinTime * uDiffRate * d.y * d.y;
    float c = cos(lag), s = sin(lag);
    vDir = vec3(c * d.x + s * d.z, d.y, -s * d.x + c * d.z);
    // Spots: a slow, low-frequency field (thresholded per pixel).
    vSpot = snoise(vDir * 1.7 + uOffset * 0.37 + vec3(0.0, uTime * 0.006, 0.0)) * 0.7
          + snoise(vDir * 4.1 - uOffset * 0.21) * 0.3;
    // Supergranulation: a broad, slow brightness swell under the cells.
    vSwell = snoise(vDir * uGranulation * 0.25 - uOffset + vec3(0.0, uTime * 0.03, 0.0));
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const surfaceFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uExposure;    // surface brightness, starParams.intensity
  uniform float uTime;
  uniform float uGranulation;
  uniform float uContrast;
  uniform float uSpots;
  uniform float uLimb;
  uniform vec3 uOffset;
  varying vec3 vDir;
  varying float vSpot;
  varying float vSwell;
  varying vec3 vNormal;
  varying vec3 vView;
  ${SIMPLEX_GLSL}

  void main() {
    vec3 p = normalize(vDir);
    // Granulation: bright convection cells with dark lanes, churning with time.
    vec3 q = p * uGranulation + uOffset;
    float n1 = snoise(q + vec3(0.0, 0.0, uTime * 0.12));
    float n2 = snoise(q * 2.3 + vec3(uTime * 0.2, 0.0, 0.0));
    // Dark lanes where the noise crosses zero, bright cell centres between them.
    float lanes = smoothstep(0.0, 0.3, abs(n1));
    float bright = 1.0 + uContrast * (lanes * 0.8 + 0.2 * n2 - 0.65) + uContrast * 0.35 * vSwell;

    // Sunspots: dark umbrae with a penumbra, avoiding the poles.
    float threshold = mix(1.0, 0.2, uSpots);
    float penumbra = smoothstep(threshold, threshold + 0.07, vSpot);
    float umbra = smoothstep(threshold + 0.08, threshold + 0.16, vSpot);
    float belt = 1.0 - smoothstep(0.55, 0.85, abs(p.y));
    bright *= 1.0 - belt * (penumbra * 0.35 + umbra * 0.4);

    // Limb darkening, redder towards the edge.
    float mu = clamp(dot(normalize(vNormal), normalize(vView)), 0.0, 1.0);
    float limb = mix(1.0, 0.35 + 0.65 * pow(mu, 0.55), uLimb);
    vec3 col = uColor * bright * limb;
    col *= mix(vec3(1.0, 0.72, 0.55), vec3(1.0), smoothstep(0.0, 0.6, mu) * 0.6 + 0.4);
    // Overexposed light bleeds into white, like a bright light on film: the
    // disc is white-hot with a coloured limb.
    col *= uExposure;
    float over = max(max(col.r, col.g), col.b);
    col = mix(min(col, vec3(1.0)), vec3(1.0), smoothstep(1.0, 2.4, over));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

/*
 * The corona and glare cover a large billboard, so the fragment shader only
 * does the radial falloff. The streamers are worked out per vertex on a fine
 * ring mesh (see createCoronaGeometry) and interpolated. Distances are in
 * star radii: `uExtent` is the billboard's radius in them.
 */
const coronaVertex = /* glsl */ `
  uniform float uTime;
  uniform float uPulse;       // 1 ± amplitude, from the CPU
  uniform float uStreamers;
  uniform float uExtent;
  uniform vec3 uOffset;
  varying vec2 vUv;
  varying float vGain;
  void main() {
    vUv = uv;
    vec2 c = uv * 2.0 - 1.0;
    float rs = length(c) * uExtent;
    float a = atan(c.y, c.x);
    // Radial rays from a few drifting sines of the angle, just outside the disc.
    float rays = 0.45 * sin(a * 7.0 + uOffset.x + uTime * 0.11)
               + 0.3 * sin(a * 12.0 + uOffset.y - uTime * 0.07 + 1.3 * sin(uTime * 0.05))
               + 0.25 * sin(a * 19.0 + uOffset.z + uTime * 0.17);
    float band = smoothstep(0.95, 1.25, rs) * (1.0 - smoothstep(1.5, 3.5, rs));
    vGain = uPulse * max(0.0, 1.0 + uStreamers * rays * band * 2.5);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const coronaFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uExtent;
  uniform float uRim;
  uniform float uRimWidth;
  uniform float uGlare;
  varying vec2 vUv;
  varying float vGain;
  void main() {
    float r = length(vUv * 2.0 - 1.0);
    // In star radii, from the limb out (over the disc it stays at the limb's).
    float rs = max(r * uExtent, 1.0);
    // A bright inner corona with streamers, and the glare a bright light makes
    // in an eye or lens (falling off a little faster than 1/r²), faded
    // smoothly to nothing well before the edge.
    float rim = uRim * exp(-(rs - 1.0) / uRimWidth) * vGain;
    float glare = uGlare * pow(rs, -2.6) * mix(1.0, vGain, 0.5);
    float light = (rim + glare) * (1.0 - smoothstep(0.3, 1.0, r)) * uOpacity;
    // Bright near the disc, it bleeds into white.
    gl_FragColor = vec4(mix(uColor, vec3(1.0), clamp(light * 0.7, 0.0, 0.85)) * light, 1.0);
    #include <colorspace_fragment>
  }
`;

/** A unit-wide disc with enough angular and radial vertices for smooth streamers. */
export function createCoronaGeometry(): THREE.BufferGeometry {
  return new THREE.RingGeometry(0, 0.5, 96, 8);
}

/** Per-star noise offset, so stars of one type don't share a surface. */
function noiseOffset(seed: number): THREE.Vector3 {
  return new THREE.Vector3(((seed % 997) / 997) * 50, (((seed >>> 10) % 991) / 991) * 50, (((seed >>> 20) % 983) / 983) * 50);
}

/** Unlit animated star surface: granulation, drifting spots, limb darkening. */
export function createStarSurfaceMaterial(color: string, activity: StarActivity, seed: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: surfaceVertex,
    fragmentShader: surfaceFragment,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uTime: { value: 0 },
      uSpinTime: { value: 0 },
      // Poles lag by ~20% of the equator's rate.
      uDiffRate: { value: (0.2 * 2 * Math.PI) / activity.rotationPeriod },
      uGranulation: { value: activity.granulation },
      uContrast: { value: activity.contrast },
      uSpots: { value: activity.spots },
      uLimb: { value: starParams.limbDarkening },
      uOffset: { value: noiseOffset(seed) },
      uExposure: { value: starParams.intensity },
    },
  });
}

/** Additive corona and glare billboard, `extent` star radii in radius: drifting streamers, pulsing. */
export function createCoronaMaterial(color: string, opacity: number, seed: number, extent: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: coronaVertex,
    fragmentShader: coronaFragment,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uTime: { value: 0 },
      uOpacity: { value: opacity },
      uPulse: { value: 1 },
      uStreamers: { value: 0.35 },
      uOffset: { value: noiseOffset(seed ^ 0x5bd1e995) },
      uExtent: { value: extent },
      uRim: { value: starParams.rim },
      uRimWidth: { value: starParams.rimWidth },
      uGlare: { value: starParams.glare },
    },
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
}

/** Updates both materials' uniforms for system time `time`. */
export function animateStarMaterials(
  surface: THREE.ShaderMaterial,
  corona: THREE.ShaderMaterial,
  activity: StarActivity,
  time: number,
): void {
  const t = time * activity.pace * starParams.pace;
  const s = surface.uniforms;
  s.uTime!.value = t;
  s.uSpinTime!.value = time;
  s.uGranulation!.value = activity.granulation * starParams.granulation;
  s.uSpots!.value = Math.min(1, activity.spots * starParams.spots);
  s.uLimb!.value = starParams.limbDarkening;
  s.uExposure!.value = starParams.intensity;
  const c = corona.uniforms;
  c.uTime!.value = t;
  c.uPulse!.value = 1 + activity.pulse * starParams.corona * Math.sin((2 * Math.PI * time) / activity.pulsePeriod);
  c.uStreamers!.value = 0.35 * starParams.corona;
  c.uRim!.value = starParams.rim;
  c.uRimWidth!.value = starParams.rimWidth;
  c.uGlare!.value = starParams.glare;
}

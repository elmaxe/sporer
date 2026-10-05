import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import { WIND_MIN_PRESSURE } from '../gen/geysers';
import {
  COX_MUNK,
  peakOmega,
  STANDARD_GRAVITY,
  CASCADES,
  WHITECAP,
  BREAKER_INDEX,
  coxMunkSlope,
  drawnVariance,
  seaVariance,
  seaWaves,
  shorePhase,
  shoreSwells,
  stormWind,
  wavelength,
  type SeaWaves,
  type ShoreSwell,
} from '../gen/waves';
import { MAX_STORMS, stormCentre, stormStrength, type StormEvent } from '../gen/weather';
import type { PlanetConfig } from './Planet';
import { VALUE_NOISE_GLSL } from './noiseGlsl';
import { weatherParams } from './weatherLook';
import { lodParams } from '../planet/LodSurface';
import { WaveTiles } from './waveTiles';

/** Tunables of the sea's waves (debug panel: Sea waves). They take effect on the next frame. */
export const waveParams = {
  enabled: true,
  /**
   * Wind over the sea, m/s at 10 m: Beaufort force 4, a moderate breeze (Met
   * Office: 7 m/s, waves about 1 m). Storms raise it under them. See
   * docs/research/sea-waves.md.
   */
  wind: 7,
  /**
   * Stylised: the waves are drawn as if the UFO (~4 units) were a 40 m
   * saucer, not at the planet's own scale (a unit of an Earth-sized globe is
   * ~16 km), so the swell under it is as big as it would look to a ship of
   * that size, and moves at the real speed for its length.
   */
  metresPerUnit: 10,
  /** The shortest wave drawn, metres. */
  shortest: 0.5,
  /** Count the wavelets shorter than that in the roughness (Cox & Munk's whole slope): true to life, but it spreads the sun's glint too thin to see. */
  wavelets: false,
  /** The shore swells and the downwash's ripples fade out between these many pixels long (and shorter). The wind's waves are mipmapped instead. */
  fadeFrom: 12,
  fadeTo: 4,
  /**
   * Waves are drawn out to this far from the camera (units) and gone by
   * `farTo`, fading evenly in the log of the distance (a fade over a fixed
   * span drew a hard edge round the camera at a low angle): from high up the
   * sea shows only its glint.
   */
  farFrom: 80,
  farTo: 600,
  /**
   * ...and only while the camera is low: they fade out as it climbs from
   * `highFrom` to `highTo` units over the water, so zoomed out (or in high
   * orbit) the sea shows only its sheen and glint, never stripes of waves.
   */
  highFrom: 50,
  highTo: 130,
  /** Slicks: the share of the sea where the waves are calmed (stylised), and their slope there (Cox & Munk: slicks cut it 2–3×). */
  slicks: 0.3,
  slickSlope: 1 / 2.5,
  /** How big the slicks are, units (stylised). */
  slickSize: 40,
  /** Gerstner's sharper crests and flatter troughs: 1 is a true trochoidal wave (the water's orbits as big as the wave), 0 plain sines. */
  crests: 1,
  /** Wave groups: how much each cascade's waves swell and die away from place to place (0: the same everywhere; stylised). */
  groups: 0.9,
  /** Whitecaps on the crests, as many as Monahan & O'Muircheartaigh's fit gives at the wind. */
  whitecaps: true,
  /**
   * Clear water: the depth (units) over which the seabed's light fades by e
   * through the water (stylised: the relief is exaggerated). The sea is
   * see-through over its shallows and opaque by `clearDepth`.
   */
  clarity: 1.1,
  clearDepth: 5,
  /** How deep (units) the water's colour goes from its shallows' to its deep's, and how dark the deep is (× the sea's colour). */
  deepDepth: 12,
  deep: 0.55,
  /** How much the waves tilt the sky's reflection (1: all of it; less keeps the sky's sheen smooth). */
  skyWaves: 1,
  /** The sky's light reflected off the water, by Fresnel (stylised strength; none without air). */
  sky: 0.22,
  /** Wave crests lit through from inside, lighter than the troughs (stylised strength). */
  scatter: 0.2,
  /** Surf: how deep (units) the foam along the shore reaches. */
  surfDepth: 0.25,
  /** Swells running up to the shore, refracted so their crests follow the depth contours, slowing, steepening and breaking as the water shoals. */
  shore: true,
  /**
   * The seabed's slope the shore swells are spaced for (m of depth per m out;
   * a sandy beach's is a few per cent): where the drawn seabed is steeper
   * their crests come closer, where it's flatter they spread out.
   */
  shoreSlope: 0.3,
  /** Stylised: how much steeper the shore swells are drawn than their height says (they'd hardly show from the UFO's height). */
  shoreSteep: 1.5,
  /** The ship's downwash on the water below it: a flattened, misty disc, a ring of spray and ripples running out. */
  downwash: true,
  /** It starts this high above the water (units) and is at its strongest this low (the ship's lowest is 3). */
  downwashFrom: 16,
  downwashTo: 4,
  /** How far out the downwash spreads, in the ship's radii. */
  downwashReach: 2.2,
  /** Light through the crests, seen towards the sun (Atlas's sub-surface term; stylised strength). */
  glow: 1.5,
};

/**
 * A clear sea's render order: after the ground it's seen through (0), before
 * the atmosphere's haze over it (ATMOSPHERE_RENDER_ORDER, 1).
 */
export const CLEAR_SEA_RENDER_ORDER = 0.5;

/** The wave fronts' bend: how far, and over how long a stretch, in the spectrum's peak wavelengths. */
const WARP_SHARE = 0.6;
const WARP_SIZE = 2;
/** A cascade's wave groups span this many of its tiles (stylised). */
const GROUP_TILES = 1.3;
/** Depths the shore swells' phase is tabulated at. */
const SHORE_STEPS = 32;
/** The ship's radius, units (the UFO is ~4 wide). */
const SHIP_RADIUS = 2;
/** The downwash's ripples: wavelength (m, at metresPerUnit) and how far out (in its reach) they run before dying away. */
const RIPPLE_LENGTH = 6;
/** Foam's colour (stylised: a bright, slightly blue white). */
const FOAM = new THREE.Color(0.8, 0.85, 0.88);

const SEA_WAVES_GLSL = /* glsl */ `
  #define SEA_STORMS ${MAX_STORMS}
  // The wind's waves, baked into repeating tiles (world/waveTiles.ts): per cascade the slope, height and crest term,
  // and their squares.
  uniform sampler2D uSeaTileA0;
  uniform sampler2D uSeaTileA1;
  uniform sampler2D uSeaTileA2;
  uniform sampler2D uSeaTileB0;
  uniform sampler2D uSeaTileB1;
  uniform sampler2D uSeaTileB2;
  // Per cascade: 1/tile (1/units), its slope variance, its height variance (units²), 1/the size of its wave groups.
  uniform vec4 uSeaCascade[${CASCADES}];
  uniform float uSeaGroups;
  // The whole surface's mean square slope at the wind: what the roughness and the drawn waves share.
  uniform float uSeaSlope;
  uniform float uSeaWind;
  // Storms over the sea: centre (unit, body frame) and angular radius, and the wind under them (m/s).
  uniform vec4 uSeaStorms[SEA_STORMS];
  uniform float uSeaStormWind[SEA_STORMS];
  uniform int uSeaStormCount;
  // How far the wave fronts are bent (units) and over what size (1/units): a few sines alone would make a regular grid.
  uniform vec2 uSeaWarp;
  // Wavelengths in pixels over which the shore's swells fade out (to, from); distances (units) over which all waves do.
  uniform vec2 uSeaFade;
  uniform vec2 uSeaFar;
  uniform vec2 uSeaHigh;
  // Slicks: 1/size, share, slope factor.
  uniform vec3 uSeaSlicks;
  uniform float uSeaCrests;
  uniform float uSeaWhitecaps;
  // Shallow water and surf: e-folding depth, surf depth (units), the surf's phase.
  uniform vec3 uSeaShallow;
  // Clear water: e-folding depth, opaque by, the deep colour's depth (units); the sky's reflected light; crests' scatter.
  uniform vec3 uSeaClear;
  uniform vec3 uSeaSky;
  uniform vec2 uSeaDeep;
  uniform float uSeaScatter;
  uniform vec3 uSeaFoam;
  uniform float uSeaGlow;
  // Shore swells: each one's phase (radians) at evenly spaced depths; x: depth step (units), y: deepest (units),
  // z: metres per unit, w: on (0 or 1); per swell: its phase now (radians), deep-water height (units), k0 (1/m), and
  // the slope they're spaced for, the steepening.
  uniform vec2 uSeaShoreTable[${SHORE_STEPS}];
  uniform vec4 uSeaShore;
  uniform vec4 uSeaShoreWave;
  uniform vec2 uSeaShoreK0;
  uniform vec2 uSeaShoreSpacing;
  // The sea's triangles over its shallows subtend about this angle from the camera (LodSurface splits them as the ground's).
  uniform float uSeaCell;
  // The ship's downwash: the point under it on the sea (body frame) and its strength, then the ripples' wavenumber
  // (1/units) and phase now, the disc's radius (units), and a clock (s, wrapped).
  uniform vec4 uSeaShip;
  uniform vec4 uSeaShipWave;
  uniform vec3 uSeaCamera;
  uniform vec3 uSeaSun;
  uniform vec3 uSeaSunLight;
  varying vec3 vSeaPos;
  varying float vSeaDepth;
  varying vec2 vSeaSlope;
  varying mat3 vSeaNormalMatrix;

  float seaCoxMunk(float wind) { return ${COX_MUNK[0]} + ${COX_MUNK[1]} * wind; }

  // The wind at unit direction n: the breeze, or a storm's where it's stronger.
  float seaWindAt(vec3 n) {
    float wind = uSeaWind;
    for (int i = 0; i < SEA_STORMS; i++) {
      if (i >= uSeaStormCount) break;
      vec4 s = uSeaStorms[i];
      float a = acos(clamp(dot(n, s.xyz), -1.0, 1.0));
      wind = max(wind, uSeaStormWind[i] * (1.0 - smoothstep(0.4 * s.w, s.w, a)));
    }
    return wind;
  }

  // Standard normal CDF (Page's tanh approximation).
  float seaPhi(float x) { return 0.5 + 0.5 * tanh(0.7978846 * (x + 0.044715 * x * x * x)); }

  struct SeaTile { vec2 grad; float h; float crest; float hidden; float drawn; float hVar; };

  // One cascade's tile at plane coordinates uv (units): its slope, height and crest term, scaled by g (the wind and
  // the wave groups here) and shown as much as near says. What its mipmaps averaged away (the second moment less the
  // first squared, LEAN mapping) and what near fades out are hidden: roughness.
  void seaTile(sampler2D A, sampler2D B, vec4 info, vec2 uv, float g, float near, inout SeaTile r) {
    vec2 t = uv * info.x;
    vec4 a = texture(A, t);
    vec4 b = texture(B, t);
    float lost = clamp(b.x + b.y - dot(a.xy, a.xy), 0.0, info.y);
    float shown = near * g;
    float share = 1.0 - lost / max(info.y, 1e-6);
    r.grad += shown * a.xy;
    r.h += shown * a.z;
    r.crest += shown * a.w;
    r.hidden += g * g * (lost + (1.0 - near * near) * (info.y - lost));
    r.drawn += shown * shown * (info.y - lost);
    r.hVar += shown * shown * info.z * share;
  }

  // Every cascade on one plane of the triplanar projection (offset per plane, so the planes don't repeat each other).
  SeaTile seaTiles(vec2 uv, vec3 g, float near) {
    SeaTile r = SeaTile(vec2(0.0), 0.0, 0.0, 0.0, 0.0, 0.0);
    seaTile(uSeaTileA0, uSeaTileB0, uSeaCascade[0], uv, g.x, near, r);
    seaTile(uSeaTileA1, uSeaTileB1, uSeaCascade[1], uv, g.y, near, r);
    seaTile(uSeaTileA2, uSeaTileB2, uSeaCascade[2], uv, g.z, near, r);
    return r;
  }

  // Fenton & McKee's wavenumber (1/m) in water h metres deep (gen/waves.ts shoalWavenumber) and the shoaling coefficient.
  float seaShoalK(float k0, float h) {
    float x = pow(k0 * max(h, 1e-4), 0.75);
    return k0 * pow(1.0 / tanh(min(x, 9.0)), 2.0 / 3.0);
  }
  float seaShoaling(float k0, float k, float h) {
    float kh2 = 2.0 * k * max(h, 1e-4);
    float g = kh2 > 30.0 ? 0.0 : kh2 / sinh(kh2);
    return sqrt(k / (k0 * (1.0 + g)));
  }
`;

const SEA_FRAGMENT = /* glsl */ `
  float seaAlpha = 1.0;
  {
    vec3 n = normalize(vSeaPos);
    float near = 1.0 - smoothstep(0.0, 1.0, log(max(length(vSeaPos - uSeaCamera), uSeaFar.x) / uSeaFar.x) / log(uSeaFar.y / uSeaFar.x));
    // Gone as the camera climbs high over the water (its height over the sea's sphere here).
    float low = 1.0 - smoothstep(uSeaHigh.x, uSeaHigh.y, length(uSeaCamera) - length(vSeaPos));
    near *= low;
    float fp = length(fwidth(vSeaPos));
    float wind = seaWindAt(n);
    // Slicks calm the sea in patches, where no storm blows them away.
    float q = 0.65 * valueNoise(vSeaPos * uSeaSlicks.x) + 0.35 * valueNoise(vSeaPos * uSeaSlicks.x * 2.7 + 5.1);
    float slick = (1.0 - smoothstep(uSeaSlicks.y - 0.06, uSeaSlicks.y + 0.06, q)) * (1.0 - smoothstep(uSeaWind, uSeaWind + 2.0, wind));
    // The slopes follow the wind as Cox & Munk's do (the drawn waves keep their lengths).
    float f = uSeaWind > 0.0 ? seaCoxMunk(wind) / seaCoxMunk(uSeaWind) * mix(1.0, uSeaSlicks.z, slick) : 1.0;
    float amp = sqrt(f);
    // The ship's downwash: flattens the waves in a disc under it (and roughens it with spray, below).
    vec3 shipOff = vSeaPos - uSeaShip.xyz;
    shipOff -= n * dot(n, shipOff);
    float shipR = length(shipOff);
    float shipDisc = uSeaShip.w * (1.0 - smoothstep(0.6, 1.3, shipR / uSeaShipWave.z));
    // Near the shore the swells take over from the wind's waves (gen/waves.ts shorePhase).
    float shoreDepth = max(vSeaDepth, 0.0);
    float shoreW = uSeaShore.w * (1.0 - smoothstep(0.5 * uSeaShore.y, uSeaShore.y, shoreDepth)) * low;
    amp *= (1.0 - 0.7 * shipDisc) * (1.0 - 0.6 * shoreW);
    // Each plane where it faces the surface, renormalised so the blend keeps the waves' variance.
    vec3 b = max(pow(abs(n), vec3(4.0)) - 0.02, 0.0);
    b /= b.x + b.y + b.z;
    float keep = inversesqrt(dot(b, b));
    vec3 g = vec3(0.0);
    float drawn = 0.0, h = 0.0, hVar = 0.0, crest = 0.0;
    // The slope of the waves not drawn here: hidden by the tiles' mipmaps or faded out, plus what no tile holds.
    float hidden = 0.0;
    if (uSeaWind > 0.0) {
      // Bent wave fronts: the planes' coordinates pushed about by a slow noise (seamless, being 3D).
      vec3 wq = vSeaPos * uSeaWarp.y;
      vec3 p = vSeaPos + uSeaWarp.x * (vec3(valueNoise(wq), valueNoise(wq + 17.3), valueNoise(wq + 41.7)) - 0.5);
      // Wave groups: each cascade's waves swell and die away over a few of its tiles (mean square about 1).
      vec3 groups = vec3(
        valueNoise(vSeaPos * uSeaCascade[0].w),
        valueNoise(vSeaPos * uSeaCascade[1].w + 7.3),
        valueNoise(vSeaPos * uSeaCascade[2].w + 13.9));
      vec3 ga = amp * (1.0 + uSeaGroups * (groups - 0.5));
      // Faded out altogether (far off, or seen from high up): all their slope is roughness, no tile to read.
      if (near <= 0.0) hidden = dot(ga * ga, vec3(uSeaCascade[0].y, uSeaCascade[1].y, uSeaCascade[2].y)) / (keep * keep);
      SeaTile r;
      if (near > 0.0 && b.x > 0.0) { r = seaTiles(p.zy, ga, near); g += b.x * vec3(0.0, r.grad.y, r.grad.x); drawn += b.x * b.x * r.drawn; h += b.x * r.h; hVar += b.x * b.x * r.hVar; crest += b.x * r.crest; hidden += b.x * b.x * r.hidden; }
      if (near > 0.0 && b.y > 0.0) { r = seaTiles(p.xz + vec2(0.37, 0.71) / uSeaCascade[2].x, ga, near); g += b.y * vec3(r.grad.x, 0.0, r.grad.y); drawn += b.y * b.y * r.drawn; h += b.y * r.h; hVar += b.y * b.y * r.hVar; crest += b.y * r.crest; hidden += b.y * b.y * r.hidden; }
      if (near > 0.0 && b.z > 0.0) { r = seaTiles(p.xy + vec2(0.61, 0.13) / uSeaCascade[2].x, ga, near); g += b.z * vec3(r.grad.x, r.grad.y, 0.0); drawn += b.z * b.z * r.drawn; h += b.z * r.h; hVar += b.z * b.z * r.hVar; crest += b.z * r.crest; hidden += b.z * b.z * r.hidden; }
      g *= keep;
      drawn *= keep * keep;
      h *= keep;
      hVar *= keep * keep;
      crest *= keep;
      hidden *= keep * keep;
    }
    // Shore swells: crests along the depth contours, running in to the waterline, slower, shorter and steeper as
    // the water shoals, capped at McCowan's breaker index (the surf zone) where they break.
    float breaking = 0.0;
    float shoreCrest = 0.0;
    if (shoreW > 0.0) {
      // The depth's gradient along the surface (the seabed's slope east and north, see seaDepthFrame); the frame
      // turns about the poles, so the swells fade out there.
      vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), n));
      vec3 north = cross(n, east);
      vec3 gradD = (vSeaSlope.x * east + vSeaSlope.y * north) * (1.0 - smoothstep(0.97, 0.995, abs(n.y)));
      float steep = length(gradD);
      float x = clamp(shoreDepth / uSeaShore.x, 0.0, float(${SHORE_STEPS - 1}) - 0.001);
      int i0 = int(floor(x));
      vec2 th = mix(uSeaShoreTable[i0], uSeaShoreTable[i0 + 1], fract(x));
      float hm = shoreDepth * uSeaShore.z;
      // Along the shore the swells drift in and out of step, so the crests aren't one long line.
      vec3 wq = vSeaPos * 0.035;
      // And a finer wiggle, so the crests don't run dead straight across a triangle of the chunk.
      float wiggle = 1.4 * (valueNoise(vSeaPos * 0.45 + 4.4) - 0.5);
      float wob = 6.2832 * (valueNoise(wq) - 0.5) + wiggle;
      float wob2 = 6.2832 * (valueNoise(wq * 1.7 + 9.1) - 0.5) + wiggle;
      for (int s = 0; s < 2; s++) {
        float k0 = s == 0 ? uSeaShoreK0.x : uSeaShoreK0.y;
        float h0 = s == 0 ? uSeaShoreWave.z : uSeaShoreWave.w;
        float k = seaShoalK(k0, hm);
        float hgt = h0 * seaShoaling(k0, k, hm);
        float cap = ${BREAKER_INDEX} * shoreDepth;
        breaking = max(breaking, smoothstep(0.85, 1.15, hgt / max(cap, 1e-4)));
        hgt = min(hgt, cap);
        float ph = (s == 0 ? th.x + uSeaShoreWave.x + wob : th.y + uSeaShoreWave.y + wob2);
        // Its slope along the ground: d(phase)/d(depth) is k / the slope it's spaced for, in depth units.
        float kd = k * uSeaShore.z / uSeaShoreSpacing.x;
        // Fades out as its crests come closer than a few pixels.
        float lambda = 6.2832 / max(kd * steep, 1e-4);
        // ...or than a few of the sea's triangles: the depth is linear across each, so the crests kink at their edges.
        float cell = uSeaCell * length(vSeaPos - uSeaCamera);
        float fade = smoothstep(uSeaFade.x * fp, uSeaFade.y * fp, lambda) * smoothstep(3.0 * cell, 6.0 * cell, lambda);
        g += gradD * (-0.5 * hgt * kd * sin(ph) * uSeaShoreSpacing.y * fade * shoreW);
        h += 0.5 * hgt * cos(ph) * fade * shoreW;
        shoreCrest = max(shoreCrest, smoothstep(0.55, 0.95, cos(ph)) * fade);
      }
    }
    // The downwash's ripples running out from under the ship, and the spray it raises.
    float shipSpray = 0.0;
    if (uSeaShip.w > 0.0) {
      vec3 radial = shipOff / max(shipR, 1e-4);
      float q = shipR / uSeaShipWave.z;
      // A few rings running out, bent and broken by noise, dying away within a radius or so; gone when too fine to draw.
      float bend = 1.6 * valueNoise(vSeaPos * 0.7 + 2.3);
      float ph = uSeaShipWave.x * (shipR + bend) - uSeaShipWave.y;
      float patchy = mix(0.35, 1.0, smoothstep(0.2, 0.75, valueNoise(vSeaPos * 0.45 + 8.1)));
      float env = uSeaShip.w * smoothstep(0.6, 1.1, q) * exp(-2.5 * max(q - 1.0, 0.0)) * patchy;
      float rfade = smoothstep(uSeaFade.x * fp, uSeaFade.y * fp, 6.2832 / uSeaShipWave.x);
      g += radial * (0.2 * env * rfade * cos(ph));
      // A ring of spray at the disc's edge, torn and blowing outward, and mist over the disc.
      // Two layers of noise sliding outward, each over a short stretch and crossfaded, so it flows without smearing.
      float tear = 0.0;
      for (int l = 0; l < 2; l++) {
        float cyc = fract(uSeaShipWave.w * 0.6 + 0.5 * float(l));
        vec3 sq = vSeaPos * 2.2 - radial * cyc * 3.0 + float(l) * 7.3;
        tear += (1.0 - abs(2.0 * cyc - 1.0)) * (valueNoise(sq) * 0.65 + valueNoise(sq * 2.3 + 3.7) * 0.35);
      }
      float ring = exp(-pow((q - 1.0 - 0.15 * bend) / 0.25, 2.0));
      shipSpray = uSeaShip.w * clamp(ring * smoothstep(0.3, 0.7, tear) * 1.6 + 0.25 * shipDisc * smoothstep(0.4, 0.8, tear), 0.0, 1.0);
    }
    // The height's gradient along the surface tips the normal against it (the tiles hold the crests' shape).
    g -= n * dot(n, g);
    normal = normalize(vSeaNormalMatrix * (n - g));
    // What isn't drawn is roughness: GGX's alpha (roughness²) is about the RMS slope. uSeaSlope less the tiles' is the
    // slope no tile holds (a calm sea's, or the wavelets').
    float tiles = uSeaCascade[0].y + uSeaCascade[1].y + uSeaCascade[2].y;
    roughnessFactor = sqrt(sqrt(max(f * (uSeaSlope - tiles) + hidden, ${COX_MUNK[0]})));
    // The downwash's disc is ruffled by the wind it blows.
    roughnessFactor = mix(roughnessFactor, 0.55, shipDisc);

    // The water's own colour, the light scattered back up from inside it: brighter and greener over its shallows,
    // darker over the deep.
    float depth = max(vSeaDepth, 0.0);
    vec3 seaHue = diffuseColor.rgb;
    vec3 shallowHue = seaHue * vec3(0.75, 1.3, 1.15) + vec3(0.02, 0.05, 0.04);
    vec3 body = mix(shallowHue, seaHue * uSeaDeep.x, smoothstep(0.0, uSeaClear.z, depth));
    // Crests lit through from inside, lighter than the troughs.
    float lift = hVar > 0.0 ? clamp(h * inversesqrt(hVar) * 0.5, -1.0, 1.0) : 0.0;
    // Fresnel on the wave's normal (Schlick, water's 0.02 head on): what the surface reflects never gets inside.
    vec3 viewDir = normalize(vViewPosition);
    float fresnel = 0.02 + 0.98 * pow(1.0 - clamp(dot(normal, viewDir), 0.0, 1.0), 5.0);
    diffuseColor.rgb = body * (1.0 + uSeaScatter * lift) * (1.0 - fresnel);
    // Clear water: the seabed shows through, fading by e every clarity units deeper, opaque by clearDepth.
    seaAlpha = 1.0 - exp(-depth / uSeaClear.x);
    seaAlpha = mix(seaAlpha, 1.0, smoothstep(0.5 * uSeaClear.y, uSeaClear.y, depth));

    // Whitecaps: the most squeezed crests (the tiles' 1 − J, which the short waves lead), as much of the sea as
    // Monahan & O'Muircheartaigh's fit says; where the waves are too small to draw, their share spread evenly.
    float cover = uSeaWhitecaps * min(1.0, ${WHITECAP[0]} * pow(wind, ${WHITECAP[1]}));
    float caps = cover;
    float all = f * tiles;
    if (drawn > 0.0 && all > 0.0) {
      // The crest term's spread is about Q² × the slope's (gen/waves.ts: 1 − J ≈ Q Σ s sin θ).
      float c = seaPhi(crest * inversesqrt(drawn * max(uSeaCrests * uSeaCrests, 1e-4)));
      float crestFoam = smoothstep(1.0 - 1.6 * cover, 1.0 - 0.4 * cover, c);
      if (crestFoam > 0.0) {
        // Torn into streaks and bubbles by a finer noise, each octave evening out as it gets too fine for the pixels.
        float torn = mix(0.5, valueNoise(vSeaPos * 5.0), 1.0 - smoothstep(0.08, 0.2, fp)) * 0.6
          + mix(0.5, valueNoise(vSeaPos * 13.0), 1.0 - smoothstep(0.03, 0.08, fp)) * 0.4;
        crestFoam *= smoothstep(0.25, 0.6, torn + 0.3 * (c - 0.5));
      }
      caps = mix(cover, crestFoam, clamp(drawn / all, 0.0, 1.0));
    }
    // Surf: foam on the breaking swells' crests and the wash at the waterline (or, without them, bands running in at
    // the swell's pace).
    float surf = 1.0 - smoothstep(0.0, uSeaShallow.y, depth);
    float bands = 0.5 + 0.5 * sin(depth / uSeaShallow.y * 9.42 + uSeaShallow.z + 3.0 * valueNoise(vSeaPos * 0.8));
    float churn = valueNoise(vSeaPos * 1.7 + vec3(uSeaShallow.z)) * 0.6 + 0.4;
    surf = uSeaShore.w > 0.0
      ? max(surf * mix(0.45, 0.9, churn), breaking * shoreCrest * smoothstep(0.35, 0.85, churn) * 0.8) * mix(0.75, 1.0, near)
      : surf * mix(0.6, mix(0.3, 1.0, bands), near);
    float foam = clamp(max(max(caps, surf), shipSpray), 0.0, 1.0);
    diffuseColor.rgb = mix(diffuseColor.rgb, uSeaFoam, foam);
    roughnessFactor = mix(roughnessFactor, 1.0, foam);

    // Light through the waves (Atlas's sub-surface term): seen towards the sun, the backs of the crests glow in the
    // water's shallow colour, the more the higher they stand and the more they face away from it.
    vec3 toCamera = normalize(uSeaCamera - vSeaPos);
    vec3 waveNormal = normalize(n - g);
    float up = dot(n, uSeaSun);
    float through = uSeaGlow * max(lift, 0.0) * pow(clamp(dot(uSeaSun, -toCamera), 0.0, 1.0), 4.0)
      * pow(0.5 - 0.5 * dot(uSeaSun, waveNormal), 3.0) * smoothstep(-0.02, 0.08, up) * (1.0 - foam);
    vec3 glow = through * uSeaSunLight * shallowHue * vec3(0.7, 1.2, 1.05);
    totalEmissiveRadiance += glow;
    // The sky reflected by that Fresnel: the sea brightens towards the horizon and every wave facing away catches it.
    // The sky is paler and brighter near its horizon than overhead. Lit where the sky over it is (day side, dusk),
    // none without air.
    vec3 skyNormal = normalize(mix(normalize(vSeaNormalMatrix * n), normal, uSeaDeep.y));
    float skyFresnel = 0.02 + 0.98 * pow(1.0 - clamp(dot(skyNormal, viewDir), 0.0, 1.0), 5.0);
    float elevation = dot(reflect(-viewDir, skyNormal), normalize(vSeaNormalMatrix * n));
    float horizon = 1.0 - smoothstep(0.0, 0.6, elevation);
    vec3 skyHue = mix(uSeaSky, vec3(dot(uSeaSky, vec3(0.3, 0.59, 0.11))), 0.6 * horizon) * (1.0 + 0.4 * horizon);
    float skyLit = smoothstep(-0.12, 0.3, up);
    vec3 skyLight = skyHue * uSeaSunLight * skyLit * skyFresnel * (1.0 - foam);
    totalEmissiveRadiance += skyLight;
    // See-through where shallow: foam, the glint and the sky's reflection stay (they're light off the surface).
    float shine = dot(skyLight + glow, vec3(0.3, 0.59, 0.11));
    seaAlpha = max(max(seaAlpha, foam), clamp(shine * 1.5, 0.0, 1.0));
  }
`;

/**
 * Wind waves on a water sea (issue #88): gen/waves.ts's waves, baked into
 * repeating tiles (world/waveTiles.ts), laid over the sea's normals per
 * pixel on three planes blended by the normal (triplanar, so there's no seam
 * or pole on the sphere), animated by the system clock. Waves too small for
 * the pixels average away in the tiles' mipmaps, and waves too far from the
 * camera fade out; either way their slope goes into the roughness instead,
 * so the sun's glint keeps its size from low down to high up. The water is
 * lit as the games known for theirs light it: its own colour where Fresnel
 * lets light in, the sky where it reflects, and light through the crests. The wind rises under storms (rougher water,
 * whitecaps) and dies in slicks; shallow water shows its seabed and surf runs
 * up the shores. See docs/research/sea-waves.md.
 */
export class SeaWaveLook {
  private readonly uniforms = {
    uSeaTileA0: { value: null as THREE.Texture | null },
    uSeaTileA1: { value: null as THREE.Texture | null },
    uSeaTileA2: { value: null as THREE.Texture | null },
    uSeaTileB0: { value: null as THREE.Texture | null },
    uSeaTileB1: { value: null as THREE.Texture | null },
    uSeaTileB2: { value: null as THREE.Texture | null },
    uSeaCascade: { value: Array.from({ length: CASCADES }, () => new THREE.Vector4(1, 0, 0, 1)) },
    uSeaGroups: { value: 0 },
    uSeaSlope: { value: coxMunkSlope(0) },
    uSeaWind: { value: 0 },
    uSeaStorms: { value: Array.from({ length: MAX_STORMS }, () => new THREE.Vector4()) },
    uSeaStormWind: { value: new Array<number>(MAX_STORMS).fill(0) },
    uSeaStormCount: { value: 0 },
    uSeaWarp: { value: new THREE.Vector2() },
    uSeaFade: { value: new THREE.Vector2() },
    uSeaFar: { value: new THREE.Vector2() },
    uSeaHigh: { value: new THREE.Vector2() },
    uSeaSlicks: { value: new THREE.Vector3() },
    uSeaCrests: { value: 0 },
    uSeaWhitecaps: { value: 0 },
    uSeaShallow: { value: new THREE.Vector3() },
    uSeaClear: { value: new THREE.Vector3(1, 5, 12) },
    uSeaSky: { value: new THREE.Color(0, 0, 0) },
    uSeaDeep: { value: new THREE.Vector2(0.6, 1) },
    uSeaScatter: { value: 0 },
    uSeaFoam: { value: FOAM },
    uSeaGlow: { value: 0 },
    uSeaShoreTable: { value: Array.from({ length: SHORE_STEPS }, () => new THREE.Vector2()) },
    uSeaShore: { value: new THREE.Vector4() },
    uSeaShoreWave: { value: new THREE.Vector4() },
    uSeaShoreK0: { value: new THREE.Vector2(1, 1) },
    uSeaShoreSpacing: { value: new THREE.Vector2(1, 1) },
    uSeaShip: { value: new THREE.Vector4() },
    uSeaCell: { value: lodParams.cellAngle },
    uSeaShipWave: { value: new THREE.Vector4(1, 0, 1, 0) },
    uSeaCamera: { value: new THREE.Vector3() },
    uSeaSun: { value: new THREE.Vector3(0, 1, 0) },
    uSeaSunLight: { value: new THREE.Color(1, 1, 1) },
  };
  private waves: SeaWaves | null = null;
  private swells: ShoreSwell[] = [];
  /** The ship's downwash: where it is over the sea (sea frame) and how strong (0 to 1), set each frame by `setShip`. */
  private readonly shipPoint = new THREE.Vector3();
  private shipStrength = 0;
  /** The tunables the waves were made with. */
  private made = '';
  /** The wind's waves baked into tiles, and the time they're drawn at. */
  private readonly tiles: WaveTiles;
  private time = 0;
  private readonly centre: [number, number, number] = [0, 0, 0];

  constructor(
    private readonly seed: number,
    /** Surface gravity, m/s². */
    private readonly gravity: number,
    /** Whether there's air to raise waves; without it the sea is calm. */
    private readonly air: boolean,
    /** Unit direction to the sun and its light (colour × intensity), in the sea's frame (read every frame). */
    sun: THREE.Vector3,
    sunLight: THREE.Color,
    /** The sky's colour (its atmosphere's), reflected by the water; black without air. */
    private readonly skyColor = new THREE.Color(0, 0, 0),
  ) {
    this.uniforms.uSeaSun.value = sun;
    this.uniforms.uSeaSunLight.value = sunLight;
    this.tiles = new WaveTiles();
    const u = this.uniforms;
    [u.uSeaTileA0.value, u.uSeaTileB0.value] = this.tiles.textures(0);
    [u.uSeaTileA1.value, u.uSeaTileB1.value] = this.tiles.textures(1);
    [u.uSeaTileA2.value, u.uSeaTileB2.value] = this.tiles.textures(2);
  }

  /**
   * How deep (units) the water is where the shore swells still run: half the
   * peak swell's deep-water length (as `make` tabulates it). The sea's chunks
   * that shallow split as finely as the ground (LodSurfaceOptions.shallow).
   */
  get shallowDepth(): number {
    const p = waveParams;
    const wind = p.enabled && this.air ? p.wind : 0;
    return wind > 0 ? wavelength(peakOmega(wind, this.gravity), this.gravity) / 2 / p.metresPerUnit : 0;
  }

  /** Shows the waves at system time `time`, seen from `camera` (in the sea's frame), with `storms` under way. */
  animate(time: number, camera: THREE.Vector3, storms: readonly StormEvent[] | null): void {
    const p = waveParams;
    const u = this.uniforms;
    const wind = p.enabled && this.air ? p.wind : 0;
    const key = `${wind}/${p.metresPerUnit}/${p.shortest}/${p.wavelets}/${p.shoreSlope}/${p.crests}`;
    if (key !== this.made) this.make(wind, key);
    const waves = this.waves!;
    this.time = time;
    u.uSeaGroups.value = p.groups;
    u.uSeaFade.value.set(p.fadeTo, Math.max(p.fadeFrom, p.fadeTo + 0.5));
    u.uSeaFar.value.set(p.farFrom, Math.max(p.farTo, p.farFrom + 1));
    u.uSeaHigh.value.set(p.highFrom, Math.max(p.highTo, p.highFrom + 1));
    u.uSeaSlicks.value.set(1 / p.slickSize, wind > 0 ? p.slicks : 0, p.slickSlope);
    u.uSeaCrests.value = p.crests;
    u.uSeaWhitecaps.value = p.whitecaps && wind > 0 ? 1 : 0;
    u.uSeaClear.value.set(p.clarity, Math.max(p.clearDepth, p.clarity), p.deepDepth);
    u.uSeaSky.value.copy(this.skyColor).multiplyScalar(p.sky);
    u.uSeaScatter.value = p.scatter;
    u.uSeaDeep.value.set(p.deep, p.skyWaves);
    u.uSeaCell.value = lodParams.cellAngle;
    u.uSeaGlow.value = wind > 0 ? p.glow : 0;
    u.uSeaCamera.value.copy(camera);
    // The surf comes in at the swell's pace (the spectrum's peak), its phase wrapped like the waves'.
    const surf = waves.peakOmega > 0 ? (waves.peakOmega * time) % (Math.PI * 2) : 0;
    u.uSeaShallow.value.set(p.clarity, p.surfDepth, surf);
    // The shore swells run in at their own pace (phases wrapped like the waves').
    const shore = p.shore && this.swells.length === 2;
    u.uSeaShore.value.w = shore ? 1 : 0;
    if (shore) {
      const [a, b] = this.swells as [ShoreSwell, ShoreSwell];
      u.uSeaShoreWave.value.set((a.omega * time) % (Math.PI * 2), (b.omega * time) % (Math.PI * 2), a.height / p.metresPerUnit, b.height / p.metresPerUnit);
      u.uSeaShoreSpacing.value.set(p.shoreSlope, p.shoreSteep);
    }
    // The downwash: ripples of RIPPLE_LENGTH running out at their deep-water speed.
    const ship = p.downwash ? this.shipStrength : 0;
    u.uSeaShip.value.set(this.shipPoint.x, this.shipPoint.y, this.shipPoint.z, ship);
    if (ship > 0) {
      const k = (Math.PI * 2) / RIPPLE_LENGTH;
      const omega = Math.sqrt(this.gravity * k);
      u.uSeaShipWave.value.set(k * p.metresPerUnit, (omega * time) % (Math.PI * 2), SHIP_RADIUS * p.downwashReach, time % 1000);
    }
    let count = 0;
    if (wind > 0 && storms && weatherParams.enabled) {
      for (const e of storms) {
        const w = stormWind(e.kind, stormStrength(e, time));
        if (w <= wind || count >= MAX_STORMS) continue;
        stormCentre(e, time, this.centre);
        u.uSeaStorms.value[count]!.set(this.centre[0], this.centre[1], this.centre[2], e.size);
        u.uSeaStormWind.value[count] = w;
        count++;
      }
    }
    u.uSeaStormCount.value = count;
  }

  /**
   * The ship over the sea: `point` its position (sea frame) and `height` above
   * the water (units), or null when it isn't over water. Its downwash grows as
   * it comes down (waveParams.downwashFrom to downwashTo).
   */
  setShip(point: THREE.Vector3 | null, height: number): void {
    const p = waveParams;
    if (!point || !this.air) {
      this.shipStrength = 0;
      return;
    }
    this.shipStrength = 1 - THREE.MathUtils.smoothstep(height, p.downwashTo, p.downwashFrom);
    this.shipPoint.copy(point);
  }

  /** How strong the ship's downwash on the water is now (0 to 1). */
  get downwash(): number {
    return waveParams.downwash ? this.shipStrength : 0;
  }

  private make(wind: number, key: string): void {
    const p = waveParams;
    const u = this.uniforms;
    const waves = (this.waves = seaWaves(this.seed, wind, this.gravity, p.shortest));
    // The shore swells' phase at depths out to where the peak swell stops feeling the bottom (half its deep-water length).
    this.swells = shoreSwells(waves);
    if (this.swells.length === 2) {
      const [a, b] = this.swells as [ShoreSwell, ShoreSwell];
      const deepest = wavelength(a.omega, this.gravity) / 2 / p.metresPerUnit;
      const step = deepest / (SHORE_STEPS - 1);
      u.uSeaShore.value.set(step, deepest, p.metresPerUnit, 1);
      u.uSeaShoreK0.value.set((a.omega * a.omega) / this.gravity, (b.omega * b.omega) / this.gravity);
      u.uSeaShoreTable.value.forEach((v, i) => {
        const depth = i * step * p.metresPerUnit;
        v.set(shorePhase(a.omega, depth, p.shoreSlope, this.gravity), shorePhase(b.omega, depth, p.shoreSlope, this.gravity));
      });
    } else {
      u.uSeaShore.value.set(1, 1, p.metresPerUnit, 0);
    }
    this.made = key;
    u.uSeaWind.value = wind;
    u.uSeaSlope.value = seaSlope(waves, p.wavelets);
    // Bent over twice the longest swell's length, by up to a third of it either way.
    const swell = waves.peakOmega > 0 ? wavelength(waves.peakOmega, this.gravity) / p.metresPerUnit : 1;
    u.uSeaWarp.value.set(swell * WARP_SHARE, 1 / (swell * WARP_SIZE));
    this.tiles.setWaves(waves, p.metresPerUnit, p.crests);
    u.uSeaCascade.value.forEach((v, c) => {
      const cascade = waves.cascades[c];
      if (!cascade) return v.set(1, 0, 0, 1);
      const size = cascade.size / p.metresPerUnit;
      // Its height variance, Σ a² / 2 (units²); its wave groups span a little over its tile.
      const heights = cascade.waves.reduce((sum, w) => sum + (w.slope * w.length) ** 2 / (8 * Math.PI * Math.PI), 0) / p.metresPerUnit ** 2;
      v.set(1 / size, drawnVariance(cascade.waves), heights, 1 / (size * GROUP_TILES));
    });
  }

  /** Redraws the wave tiles for this frame (call before drawing the sea). */
  render(renderer: THREE.WebGLRenderer): void {
    if (this.uniforms.uSeaWind.value > 0) this.tiles.render(renderer, this.time);
  }

  dispose(): void {
    this.tiles.dispose();
  }

  /**
   * Lays the waves over `material` (the sea's, a lit sphere in the body
   * frame). Its geometry's colour attribute carries the depth of the water
   * (units) in red, see PlanetGlobe.
   */
  apply(material: THREE.MeshStandardMaterial): void {
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          #if !defined( USE_COLOR ) && !defined( USE_COLOR_ALPHA )
          attribute vec3 color;
          #endif
          varying vec3 vSeaPos;
          varying float vSeaDepth;
          varying vec2 vSeaSlope;
          varying mat3 vSeaNormalMatrix;`,
        )
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSeaPos = position;\nvSeaDepth = color.r;\nvSeaSlope = color.gb;\nvSeaNormalMatrix = normalMatrix;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${VALUE_NOISE_GLSL}\n${SEA_WAVES_GLSL}`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${SEA_FRAGMENT}`)
        .replace('#include <opaque_fragment>', 'diffuseColor.a = seaAlpha;\n#include <opaque_fragment>');
    };
    // See-through over the shallows, blended over the ground under it. Not `transparent`: three draws those after
    // everything opaque, the atmosphere's haze among them (ATMOSPHERE_RENDER_ORDER), which the sea would then cover.
    // Instead it stays in the opaque list, after the ground and before the haze (CLEAR_SEA_RENDER_ORDER).
    material.blending = THREE.CustomBlending;
    material.blendSrc = THREE.SrcAlphaFactor;
    material.blendDst = THREE.OneMinusSrcAlphaFactor;
    material.blendSrcAlpha = THREE.OneFactor;
    material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
    material.customProgramCacheKey = () => 'sea-waves';
  }
}

/**
 * The directions east and north at unit `dir` (body frame, the spin axis +y)
 * that the sea's depth gradient is given in (the shader builds the same):
 * undefined at the poles.
 */
export function seaDepthFrame(dir: { x: number; y: number; z: number }, east: THREE.Vector3, north: THREE.Vector3): void {
  east.set(dir.z, 0, -dir.x);
  const l = east.length();
  if (l < 1e-9) east.set(1, 0, 0);
  else east.divideScalar(l);
  north.set(dir.x, dir.y, dir.z).cross(east);
}

/** The whole sea's mean square slope at the waves' wind: Cox & Munk's, or (without the wavelets) a calm sea's plus the drawn waves'. */
function seaSlope(waves: SeaWaves, wavelets: boolean): number {
  if (wavelets) return waves.meanSquareSlope;
  return coxMunkSlope(0) + seaVariance(waves);
}

/** Whether a body's sea is water with waves (not ice, not lava, not a gas giant's), and if so its gravity (m/s²) and whether air blows on it. */
function seaWater(config: PlanetConfig): { gravity: number; air: boolean } | null {
  if (config.type === 'ice' || config.type === 'lava' || config.type === 'gas' || config.style.sea === null || config.shape) return null;
  const climate = config.climate;
  return { gravity: (climate?.gravity ?? 1) * STANDARD_GRAVITY, air: (climate?.pressure ?? 1) >= WIND_MIN_PRESSURE };
}

/** Whether a body's sea is clear water (see-through over its shallows): one with waves. */
export function seaClear(config: PlanetConfig): boolean {
  return seaWater(config) !== null;
}

/** The waves of a body's water sea (null for ice, lava and bodies without one). */
export function createSeaWaves(config: PlanetConfig, sun: THREE.Vector3, sunLight: THREE.Color): SeaWaveLook | null {
  const water = seaWater(config);
  if (!water) return null;
  // The sky's colour, linear; none without air (or none to speak of).
  const sky = water.air && config.atmosphere ? new THREE.Color(config.atmosphere) : new THREE.Color(0, 0, 0);
  return new SeaWaveLook(config.seed, water.gravity, water.air, sun, sunLight, sky);
}

/**
 * The system view's sea (the terrain's own flat sea, at `radius`) as glossy
 * as low orbit's from afar, so the sun's glint carries across the zoom. Does
 * nothing for bodies without a water sea.
 */
export function applySeaGlint(material: THREE.MeshStandardMaterial, config: PlanetConfig, radius: number): void {
  const water = seaWater(config);
  if (!water) return;
  const p = waveParams;
  const waves = seaWaves(config.seed, p.enabled && water.air ? p.wind : 0, water.gravity, p.shortest);
  const roughness = Math.sqrt(Math.sqrt(seaSlope(waves, p.wavelets)));
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGlintRadius = { value: radius };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uGlintRadius;\nvarying vec3 vGlintPos;\nvarying float vGlintSea;\nvarying mat3 vGlintNormalMatrix;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vGlintPos = position;
        // The sea is the terrain flattened at sea level.
        vGlintSea = length(position) <= uGlintRadius * 1.00001 ? 1.0 : 0.0;
        vGlintNormalMatrix = normalMatrix;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGlintPos;\nvarying float vGlintSea;\nvarying mat3 vGlintNormalMatrix;')
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        roughnessFactor = mix(roughnessFactor, ${roughness.toFixed(4)}, vGlintSea);
        normal = normalize(mix(normal, normalize(vGlintNormalMatrix * normalize(vGlintPos)), vGlintSea));`,
      );
  };
  material.customProgramCacheKey = () => `sea-glint-${roughness.toFixed(4)}`;
}

export function addWaveDebug(debug: Debug): void {
  const f = debug.folder('Sea waves');
  f?.add(waveParams, 'enabled');
  f?.add(waveParams, 'wind', 0, 35, 0.5);
  f?.add(waveParams, 'metresPerUnit', 1, 100, 1);
  f?.add(waveParams, 'shortest', 0.05, 5, 0.05);
  f?.add(waveParams, 'wavelets');
  f?.add(waveParams, 'fadeFrom', 1, 40, 0.5);
  f?.add(waveParams, 'fadeTo', 0.5, 20, 0.5);
  f?.add(waveParams, 'farFrom', 5, 400, 5);
  f?.add(waveParams, 'farTo', 10, 800, 5);
  f?.add(waveParams, 'highFrom', 5, 400, 5);
  f?.add(waveParams, 'highTo', 10, 800, 5);
  f?.add(waveParams, 'slicks', 0, 1, 0.01);
  f?.add(waveParams, 'slickSlope', 0.1, 1, 0.01);
  f?.add(waveParams, 'slickSize', 5, 200, 1);
  f?.add(waveParams, 'crests', 0, 1, 0.05);
  f?.add(waveParams, 'groups', 0, 1.5, 0.05);
  f?.add(waveParams, 'whitecaps');
  f?.add(waveParams, 'clarity', 0.05, 5, 0.05);
  f?.add(waveParams, 'clearDepth', 0.5, 20, 0.5);
  f?.add(waveParams, 'deepDepth', 1, 60, 1);
  f?.add(waveParams, 'deep', 0.2, 1.2, 0.05);
  f?.add(waveParams, 'skyWaves', 0, 1, 0.05);
  f?.add(waveParams, 'sky', 0, 2, 0.05);
  f?.add(waveParams, 'scatter', 0, 1, 0.05);
  f?.add(waveParams, 'surfDepth', 0, 1, 0.01);
  f?.add(waveParams, 'shore');
  f?.add(waveParams, 'shoreSlope', 0.005, 0.5, 0.005);
  f?.add(waveParams, 'shoreSteep', 0, 6, 0.1);
  f?.add(waveParams, 'downwash');
  f?.add(waveParams, 'downwashFrom', 4, 60, 1);
  f?.add(waveParams, 'downwashTo', 0, 20, 0.5);
  f?.add(waveParams, 'downwashReach', 0.5, 5, 0.1);
  f?.add(waveParams, 'glow', 0, 3, 0.05);
}

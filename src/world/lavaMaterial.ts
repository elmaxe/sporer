import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import { fitGlow } from '../gen/incandescence';
import { EruptionSchedule, eruptionGlow, lavaActivity, type LavaActivity } from '../gen/lavaActivity';
import { globeRadius } from '../planet/frame';
import type { PlanetConfig } from './Planet';
import { SIMPLEX_GLSL } from './noiseGlsl';

/** Basaltic melt as it erupts in Hawaii, about 1170 °C (USGS), K: the sea's temperature, and where `lavaIncandescence`'s luminance is 1. */
export const MELT_T = 1443;

/** Crack scales: the biggest plates (`lavaParams.plate`), then a third, a ninth... */
const LAVA_OCTAVES = 4;

/** Global multipliers over every lava sea (debug tuning). */
export const lavaParams = {
  /** Scales the flow and crust drift. */
  pace: 1,
  /** Brightness of the molten glow. */
  glow: 1,
  /** Brightness of the glow around erupting vents. */
  vents: 1,
  /** Up close: the biggest crust plates' size (units; the cracks between them come in scales of a third, a ninth...). */
  plate: 54,
  /** The melt's temperature, K (its colour and brightness follow, as a black body's). */
  meltT: MELT_T,
  /** How many scales of cracks are drawn up close (the finest dropped first): the most per-pixel work in the sea, so one fewer on phones. */
  detail: typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? LAVA_OCTAVES - 1 : LAVA_OCTAVES,
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
  f?.add(lavaParams, 'plate', 6, 200, 1);
  f?.add(lavaParams, 'meltT', 1100, 1700, 1);
  f?.add(lavaParams, 'detail', 0, LAVA_OCTAVES, 1);
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

/** A number as a GLSL float literal. */
const glf = (v: number): string => (Number.isInteger(v) ? v.toFixed(1) : String(v));

// The close-up lava sea (LAVA_SEA_GLSL); the temperatures, colours and sizes come from docs/research/lava.md.
/** Planck × CIE 1931 → linear sRGB, relative to the luminance at MELT_T, fitted per channel as exp(ln − c/T) over 1000–1500 K. */
const GLOW = fitGlow(MELT_T);
const GLOW_FIT = { lnR: glf(GLOW.r.ln), cR: glf(GLOW.r.c), lnG: glf(GLOW.g.ln), cG: glf(GLOW.g.c) };
/**
 * The glow's exposure. Stylised: real melt is about as bright as sunlit dark rock (docs/research/lava.md), which
 * reads as glowing only at night or in an exposed-for-the-lava photo; the game keeps it that bright by day.
 */
const LAVA_EXPOSURE = glf(0.45);
/** A crack's half-width as a share of its scale's cells where the crust is whole (the biggest; finer ones narrower), and how much wider where the crust is broken open. */
const CRACK_WIDTH = glf(0.012);
const POOL_WIDTH = glf(0.42);
/** How much cooler the melt is against a crack's edge, K, and how far in that reaches, units (stylised). */
const MELT_CHILL = glf(170);
const MELT_CHILL_WIDTH = glf(1.2);
/** How much cooler each finer scale's cracks show than the melt, K (they open into the crust, not down to the melt). */
const CRACK_COOLING = glf(110);
/**
 * The crust's surface cools after Hon et al. (1994): T = 303 − 140·log10(age in hours) °C, 801 °C a second after it
 * forms, 552 °C after a minute. Its age is how far it has drifted from the crack at the lake's surface speed,
 * about 0.3 m/s (USGS), with a unit taken as a metre up close (stylised: the UFO is ~4 across).
 */
const CRUST_SPEED = 0.3;
/** The crust's sheen: the sun's highlight on fresh basaltic glass (n ≈ 1.59, F0 ≈ 0.05: the Fresnel term) and how rough it is (an exponent). */
const CRUST_SHEEN = glf(0.6);
const CRUST_GLOSS = glf(80);
/** How far each Voronoi cell's point may sit from its middle (share of a cell, both ways together). */
const CELL_JITTER = glf(0.75);
/** How far the cells' walls are bent, in cells. */
const WALL_WARP = glf(0.22);

/**
 * GLSL shared by the lava sea and the planet map (per pixel) and the system
 * view's lava bodies (per vertex): the slow heat field of the flow, the glow around erupting
 * vents, the melt's black-body glow, and its cracks averaged.
 */
const LAVA_GLSL = /* glsl */ `
  uniform float uLavaTime;       // system time × pace
  uniform vec3 uLavaOffset;      // per-body noise offset
  uniform vec4 uLavaVents[${VENT_SLOTS}]; // unit direction, glow
  uniform float uLavaVentWidth;  // 1 − cos of the glow's angular radius
  uniform vec3 uLavaTint;
  uniform float uLavaGlow;
  uniform float uLavaPlate;      // the biggest crust plates' size, units
  uniform float uLavaMeltT;      // the melt's temperature, K
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

  // A black body's glow at T kelvin, linear sRGB relative to its luminance at ${MELT_T} K: Planck's law through the
  // CIE 1931 observer, each channel fitted as exp(a − c/T) over 1000–1500 K (docs/research/lava.md). Blue is out of
  // gamut (negative) this cool, so none. Scaled by the sea's exposure and tint.
  vec3 lavaIncandescence(float T) {
    float k = 1.0 / max(T, 300.0);
    return vec3(exp(${GLOW_FIT.lnR} - ${GLOW_FIT.cR} * k), exp(${GLOW_FIT.lnG} - ${GLOW_FIT.cG} * k), 0.0) * uLavaTint * uLavaGlow * ${LAVA_EXPOSURE};
  }

  // How far the crust is broken open where the flow's heat (flow + vents) is this: thin cracks where the currents run
  // cool, wide rifts and pools with rafts of crust where they run hot.
  float lavaOpen(float heat) {
    return smoothstep(0.45, 1.05, heat);
  }

  // The half-width of scale i's cracks as a share of its cells: narrow where the crust is whole (finer scales
  // narrower), much wider where it is broken open (the biggest scale most).
  float lavaCrackWidth(float fi, float open) {
    return ${CRACK_WIDTH} / (1.0 + fi) + ${POOL_WIDTH} / (1.0 + 2.0 * fi) * open * open;
  }

  // The melt's temperature in scale i's cracks: cooler in the finer ones, which open into the crust, not down to the melt.
  float lavaCrackT(float meltT, float fi) {
    return meltT - ${CRACK_COOLING} * fi;
  }

  // Cracks of half-width a (share of cells s units across) at temperature T, averaged: their glow, and in .w the
  // share of the surface they cover (measured on these cells, docs/research/lava.md). The melt chills against their
  // edges, so a thin one glows cooler.
  vec4 lavaCracksAveraged(float a, float s, float T) {
    float cover = 1.0 - exp(-5.5 * a - 6.0 * a * a);
    T -= ${MELT_CHILL} * exp(-0.5 * a * s / ${MELT_CHILL_WIDTH});
    return vec4(lavaIncandescence(T) * cover, cover);
  }

  // The sea with every crack averaged, for views too coarse to draw any (the system view): its glow, and in .w the
  // molten share. What LAVA_SEA_GLSL fades to from afar.
  vec4 lavaAveraged(float flow, float vent) {
    float open = lavaOpen(flow + 0.6 * vent);
    float meltT = uLavaMeltT + 25.0 * vent;
    vec4 sum = vec4(0.0);
    float s = uLavaPlate;
    for (int i = 0; i < ${LAVA_OCTAVES}; i++) {
      float fi = float(i);
      sum = max(sum, lavaCracksAveraged(lavaCrackWidth(fi, open), s, lavaCrackT(meltT, fi)));
      s /= 3.0;
    }
    return sum;
  }
`;

/**
 * The lava sea's colour at unit direction `p` (body frame) given its broad
 * `flow` (lavaFlow(p)), seen from unit direction `view` (towards the eye, body
 * frame). Before tone mapping. Needs LAVA_GLSL and the sea uniforms
 * (`LavaLook.seaUniforms`). Shared by the sea sphere and the planet level's
 * map, which looks straight down.
 *
 * Drawn as a real lava lake looks (docs/research/lava.md): plates of dark,
 * glassy crust drifting on the melt, cracked apart at several scales (Voronoi
 * cells, each scale a third of the last), the cracks widening into rifts and
 * pools with rafts of crust where the currents run hot. What glows is worked
 * out as a temperature and coloured as a black body: the melt in the cracks
 * (cooler deep in the thin ones, skinning over in darker streaks) and the
 * fresh crust at a crack's edge, which cools to black within a short way. The
 * crust is lit by the sun, bumped by its plates' edges and ropy folds, with a
 * glassy sheen. A scale too small for the pixels it falls in fades to its
 * average, so the map and the globe from afar keep the look without the
 * detail.
 */
export const LAVA_SEA_GLSL = /* glsl */ `
  ${LAVA_GLSL}
  uniform vec3 uSun;          // unit direction to the sun, body frame
  uniform vec3 uSunLight;     // its colour × intensity
  uniform vec3 uAmbient;
  uniform vec3 uCrust;
  uniform float uLavaRadius;  // the sea's radius, units
  uniform vec3 uLavaDrift[${LAVA_OCTAVES}]; // how far the crust has drifted, in each scale's cells (wrapped by a whole period of them)
  uniform int uLavaDetail;    // how many scales of cracks to draw
  // The ship's downwash: the point under it (unit, body frame) and its strength, then the swept disc's radius and the
  // ripples' wavenumber (both on the unit sphere), the ripples' phase now and a clock (s, wrapped).
  uniform vec4 uLavaShip;
  uniform vec4 uLavaShipWave;

  // A lattice cell's three random numbers, periodic over 289 cells (so the drift can wrap without a jump).
  vec3 lavaHash(vec3 c) {
    c = mod(c, 289.0);
    vec3 q = fract(c * vec3(0.1031, 0.1030, 0.0973));
    q += dot(q, q.yxz + 33.33);
    return fract((q.xxy + q.yxx) * q.zyx);
  }

  // Voronoi cells of size 1: the distance from x to the wall between its nearest two cells (the crack), and the
  // nearest cell's random number. Searches only the 2×2×2 cells nearest x, each cell's point kept within
  // ${CELL_JITTER} of its middle, so a nearer point is rarely missed (8 cells, not 27).
  vec2 lavaCells(vec3 x) {
    vec3 i = floor(x - 0.5);
    vec3 f = x - i;
    vec3 r1 = vec3(0.0), r2 = vec3(0.0);
    float d1 = 1e3, d2 = 1e3, id = 0.0;
    for (int z = 0; z <= 1; z++)
    for (int y = 0; y <= 1; y++)
    for (int xx = 0; xx <= 1; xx++) {
      vec3 g = vec3(float(xx), float(y), float(z));
      vec3 h = lavaHash(i + g);
      vec3 r = g + 0.5 + ${CELL_JITTER} * (h - 0.5) - f;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; r2 = r1; d1 = d; r1 = r; id = h.x; }
      else if (d < d2) { d2 = d; r2 = r; }
    }
    return vec2(dot(0.5 * (r1 + r2), normalize(r2 - r1)), id);
  }

  vec3 lavaSea(vec3 p, float flow, vec3 view) {
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

    float R = uLavaRadius;
    // Units per pixel here, for fading out detail too small to draw.
    float px = max(length(fwidth(p)) * R, 1e-5);
    // How far the crust is broken open; the downwash's ripples stretch it open as they pass.
    float vent = lavaVents(p);
    float open = lavaOpen(flow + 0.6 * vent) + 0.3 * max(ripple, 0.0);
    // The crust's own coordinates (units): drifting, and shifted with the currents (which change slowly), so plates
    // in different currents move apart.
    vec3 shift = vec3(18.0, -11.0, 14.0) * (flow - 0.5) * (uLavaPlate / 27.0);
    vec3 w = pc * R + shift;
    // The melt's skin: folded filaments of skin (the ridges of a noise), on broader patches where it is cooler. Where
    // the melt is, not the crust (which the downwash draws in towards the ship).
    vec3 ws = p * R + shift;
    float skinScale = uLavaPlate * 0.1;
    float patches = snoise(ws / skinScale + vec3(0.0, 0.0, t * 0.03)) * (1.0 - smoothstep(0.3, 0.9, px / skinScale));
    skinScale *= 0.3;
    float folds = (1.0 - smoothstep(0.0, 0.18, abs(snoise(ws / skinScale - vec3(0.0, t * 0.05, 0.0))))) * (1.0 - smoothstep(0.2, 0.6, px / skinScale));
    float meltT = uLavaMeltT + 25.0 * vent - 60.0 * patches - 130.0 * folds * smoothstep(-0.4, 0.4, patches);

    vec3 glow = vec3(0.0);
    float melt = 0.0, height = 0.0, ropes = 0.0, shade = 0.0;
    float s = uLavaPlate;
    for (int i = 0; i < ${LAVA_OCTAVES}; i++) {
      float fi = float(i);
      // How much of this scale can be drawn: cells under ~6 pixels across fade to their average.
      float shown = i < uLavaDetail ? smoothstep(3.0, 8.0, s / px) : 0.0;
      float a = lavaCrackWidth(fi, open);
      float crackT = lavaCrackT(meltT, fi);
      if (shown > 0.0) {
        vec3 x = w / s + uLavaDrift[i] + fi * vec3(17.3, -9.1, 5.7);
        // Jagged walls: the cells bent by noise of their own size, which also narrows and widens each crack along it.
        float n1 = snoise(x * 1.1);
        float n2 = snoise(x * 2.3 + 4.7);
        vec2 c = lavaCells(x + ${WALL_WARP} * (n1 * vec3(0.8, 0.0, -0.6) + n2 * vec3(0.0, 0.7, 0.5)));
        // Each plate's cracks a little different, and narrowing and widening along them.
        float half_ = s * a * (0.6 + 0.8 * c.y) * (0.75 + 0.5 * n2);
        float out_ = c.x * s - half_;
        float inCrack = 1.0 - smoothstep(-px, px, out_);
        // The fresh crust at the crack's edge, cooling as it drifts away from it (gen/incandescence.ts crustSurfaceT,
        // Hon et al.: 303 °C = 576 K after an hour, 140 K hotter for every tenth of the age).
        float edge = max(out_, 0.0);
        float age = max(edge / ${glf(CRUST_SPEED)}, 1e-3) / 3600.0;
        float edgeT = min(576.0 - 140.0 * log(age) * ${1 / Math.LN10}, crackT);
        // In the crack, the melt chills against the crust at its edges: hottest in the middle of a wide one.
        float inside = max(-out_, 0.0);
        float T = mix(edgeT, crackT - ${MELT_CHILL} * exp(-inside / ${MELT_CHILL_WIDTH}), inCrack);
        glow = max(glow, lavaIncandescence(T) * shown);
        melt = max(melt, inCrack * shown);
        // The plates stand a little above their cracks; ropy folds run along their young edges.
        height += shown * s * 0.006 * smoothstep(0.0, s * 0.15, out_);
        if (i == 1) ropes = shown * sin(edge / (s * 0.035) + 3.0 * snoise(x * 3.0)) * exp(-edge / (s * 0.12)) * smoothstep(0.0, s * 0.02, out_);
        shade += shown * (c.y - 0.5) * 0.25 / (1.0 + fi);
      }
      // What can't be drawn adds its average.
      vec4 avg = lavaCracksAveraged(a, s, crackT) * (1.0 - shown);
      glow = max(glow, avg.rgb);
      melt = max(melt, avg.w);
      s /= 3.0;
    }
    height += ropes * uLavaPlate * 0.0015;

    // The crust: dark glassy rock lit by the sun, its normal tipped by the plates' edges, the folds, the rim's ridges
    // and the ripples.
    vec3 n = p;
    vec3 wp = p * R;
    vec3 dx = dFdx(wp), dy = dFdy(wp);
    vec3 r1 = cross(dy, n), r2 = cross(n, dx);
    float det = dot(dx, r1);
    vec3 grad = sign(det) * (dFdx(height) * r1 + dFdy(height) * r2);
    n = normalize(abs(det) * n - grad);
    n = normalize(n - radial * (0.35 * ripSlope));
    vec3 light = uAmbient + uSunLight * max(dot(n, uSun), 0.0);
    vec3 rock = uCrust * (1.0 + shade) * light * (1.0 - 0.3 * rim);
    // The fresh crust's glassy sheen (a dielectric's Fresnel, fairly rough), and the melt's (smoother).
    vec3 h = normalize(uSun + view);
    float nh = max(dot(n, h), 0.0);
    float fres = 0.05 + 0.95 * pow(1.0 - max(dot(n, view), 0.0), 5.0);
    float lit = step(0.0, dot(n, uSun));
    vec3 sheen = uSunLight * lit * fres * mix(${CRUST_SHEEN} * pow(nh, ${CRUST_GLOSS}), 2.0 * pow(nh, 300.0), melt);
    vec3 col = rock * (1.0 - melt) + glow + sheen;

    // The ring of piled crust: buckled into ridges whose cracks glow.
    if (rim > 0.001) {
      float r = snoise(sq * 3.2 - radial * 1.5);
      float buckle = rim * (1.0 - smoothstep(0.0, 0.12, abs(r)));
      col = max(col, lavaIncandescence(meltT - 60.0) * buckle);
    }
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
      // Hottest under the ship, a skin already dulling it towards the edge, folding as it goes.
      float hotT = meltT + 45.0 * churn - 110.0 * smoothstep(0.3, 1.0, shipQ);
      col = mix(col, lavaIncandescence(hotT) + uSunLight * lit * fres * 2.0 * pow(nh, 300.0), bare);
    }
    return col;
  }
`;

const seaVertex = /* glsl */ `
  varying vec3 vDir;
  varying vec3 vView;
  void main() {
    vDir = normalize(position);
    // Towards the eye, in the body frame.
    vView = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz - position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const seaFragment = /* glsl */ `
  ${LAVA_SEA_GLSL}
  varying vec3 vDir;
  varying vec3 vView;

  void main() {
    // The broad flow per pixel, not per vertex: the sea is a LodSurface, whose triangles change as its chunks split
    // and merge, and a flow blended across them would change with them.
    vec3 dir = normalize(vDir);
    gl_FragColor = vec4(lavaSea(dir, lavaFlow(dir), normalize(vView)), 1.0);
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
  /** The close-up crust (LAVA_SEA_GLSL): the sea's radius, how far the crust has drifted in each scale's cells, its plates' size, the melt's temperature. */
  private readonly crustUniforms = {
    uLavaRadius: { value: 1 },
    uLavaDrift: { value: Array.from({ length: LAVA_OCTAVES }, () => new THREE.Vector3()) },
    uLavaPlate: { value: lavaParams.plate },
    uLavaMeltT: { value: lavaParams.meltT },
    uLavaDetail: { value: lavaParams.detail },
  };
  /** Which way the crust drifts (unit, body frame). */
  private readonly driftDir: THREE.Vector3;
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
    this.driftDir = this.uniforms.uLavaOffset.value.clone().subScalar(20).normalize();
  }

  /** Shows the lava at system time `time`: the flow, and the glow of the vents erupting now. */
  animate(time: number): void {
    const u = this.uniforms;
    u.uLavaTime.value = time * this.activity.pace * lavaParams.pace;
    u.uLavaGlow.value = lavaParams.glow;
    // The crust drifts at the lake's surface speed: in each scale's cells, wrapped by the 289 its cells repeat over, so
    // every scale moves as one and the numbers stay small.
    const c = this.crustUniforms;
    c.uLavaPlate.value = lavaParams.plate;
    c.uLavaMeltT.value = lavaParams.meltT;
    c.uLavaDetail.value = lavaParams.detail;
    const drift = CRUST_SPEED * u.uLavaTime.value;
    let cell = lavaParams.plate;
    for (const d of c.uLavaDrift.value) {
      const n = drift / cell;
      d.copy(this.driftDir).multiplyScalar(n).set(d.x % 289, d.y % 289, d.z % 289);
      cell /= 3;
    }
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
  createSeaMaterial(sun: THREE.Vector3, sunLight: THREE.Color, ambient: THREE.Color, radius: number): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      vertexShader: seaVertex,
      fragmentShader: seaFragment,
      uniforms: this.seaUniforms(sun, sunLight, ambient, radius),
    });
  }

  /** The uniforms LAVA_SEA_GLSL reads (the shared lava ones plus the light) for a sea of `radius` units, for a material of its own. */
  seaUniforms(sun: THREE.Vector3, sunLight: THREE.Color, ambient: THREE.Color, radius: number): Record<string, THREE.IUniform> {
    this.crustUniforms.uLavaRadius.value = radius;
    return {
      ...this.uniforms,
      ...this.shipUniforms,
      ...this.crustUniforms,
      uSun: { value: sun },
      uSunLight: { value: sunLight },
      uAmbient: { value: ambient },
      uCrust: { value: this.crust },
    };
  }

  /**
   * A cheaper lava sea for small, distant views (the system view and a
   * visited planet's moons), painted onto the body's own terrain, which must
   * be built with a flat sea at `radius` (no `seaFloor`); `material` is its
   * lit, vertex-coloured terrain material. Where the surface is at sea level it
   * takes the crust's colour and a glow worked out per vertex from the broad
   * flow and the vents (like the stars' spots): the close-up sea's cracks
   * averaged (`lavaAveraged`), as it fades to from afar. One surface, so the sea can't z-fight a sea floor
   * under it when seen from far away.
   */
  paintTerrain(material: THREE.MeshStandardMaterial, radius: number): void {
    material.onBeforeCompile = (shader) => {
      const { uLavaPlate, uLavaMeltT } = this.crustUniforms;
      Object.assign(shader.uniforms, this.uniforms, { uLavaPlate, uLavaMeltT, uCrust: { value: this.crust }, uShore: { value: radius * (1 + 1e-4) } });
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${LAVA_GLSL}\nvarying vec3 vLavaPos;\nvarying vec4 vLavaGlow;`)
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vLavaPos = position;
          {
            vec3 dir = normalize(position);
            vLavaGlow = lavaAveraged(lavaFlow(dir), lavaVents(dir));
          }`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform vec3 uCrust;\nuniform float uShore;\nvarying vec3 vLavaPos;\nvarying vec4 vLavaGlow;\nfloat lavaSea;',
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          {
            // Sea where the surface is at sea level (the flat sea's chords dip just under it), the coast antialiased outward.
            float r = length(vLavaPos);
            float w = fwidth(r);
            lavaSea = 1.0 - smoothstep(uShore, uShore + 1.5 * w, r);
            diffuseColor.rgb = mix(diffuseColor.rgb, uCrust * (1.0 - vLavaGlow.w), lavaSea);
          }`,
        )
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vLavaGlow.rgb * lavaSea;');
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

import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';
import { dustStructure, smoothDustDensity, type DustDiscData } from '../gen/discs';
import { starLightColor, type StarData } from '../gen/stars';
import { CLUMP_SCALE, bakeDiscClumps } from './discClumps';

export const dustDiscParams = {
  /** A young disc's brightness where the star's light is a habitable radius's. */
  discBrightness: 1.1,
  /** A debris disc's (it's far thinner: drawn many times brighter than real, so it shows at all). */
  debrisBrightness: 0.15,
  /** The starlight's 1/d² is squeezed to this power, so the outer disc still shows (stylised, like the sky's stars). */
  lightPower: 0.35,
  /** Henyey–Greenstein asymmetry: the dust scatters forwards, so it's brightest looking towards the star. */
  forward: 0.45,
  /**
   * A debris disc's: gentler, so with `debrisSlantCap` the band seen from
   * inside is at most ~8× brighter towards the star than face on (the
   * zodiacal light is 3–9× brighter towards the Sun than at the ecliptic
   * pole; docs/research/dust.md).
   */
  debrisForward: 0.3,
  debrisSlantCap: 0.4,
  /** The starlight on the dust is at most this (near a bright star it would wash the view out). */
  maxLight: 2,
  /** How much of the light the midplane gets in a young disc (the flared surface catches the starlight). */
  midplane: 0.3,
  /** The dust column is drawn as column^tauPower (stylised: the outer disc still shows next to the dense inner one). */
  tauPower: 0.5,
  /** A sheet seen edge-on holds at most 1/slantCap times its face-on column. */
  slantCap: 0.15,
  /** How much brighter rings and darker gaps are than the dust's thickness alone shows. */
  contrast: 0.6,
  /** How much dust a debris disc's band along its plane shows. */
  debrisBandDepth: 0.6,
  /** Clumpy texture's strength, 0–1. */
  clumps: 0.55,
  /** The dust fades out between these distances from the camera (system units), so it never fills the view up close. */
  near: 30,
  far: 260,
};

/** Sheets stacked through the dust's thickness, in scale heights: seen edge-on (or from inside) they add up to a band. */
const LAYERS = [-0.7, 0, 0.7] as const;
/** A young disc's are closer: seen a little above edge-on, wider-spaced sheets showed as separate plates. */
const YOUNG_LAYERS = [-0.5, 0, 0.5] as const;
/** Texels of the baked clumps round the disc and across it. */
const CLUMP_TEXELS = [512, 128] as const;
/** Vertices round and across the mesh (across: evenly in log radius, so narrow inner gaps are resolved). */
const SEGMENTS_AROUND = 96;
const SEGMENTS_ACROSS = 100;

const VERTEX = /* glsl */ `
  attribute float aBase;              // the smooth disc's density here (gen/discs.ts smoothDustDensity)
  attribute float aRel;               // its structure: gaps < 1 < rings (dustStructure)
  uniform float uLayer;               // height in scale heights
  uniform float uOuter;
  uniform float uAspect;
  uniform float uFlare;
  uniform float uWobble;
  uniform float uHabitable;
  uniform float uLightPower;
  uniform float uMaxLight;
  uniform vec3 uStar;                 // star (barycentre) in world space
  varying vec3 vWorld;
  varying vec2 vLocal;
  varying float vBase;
  varying float vRel;
  varying float vLight;
  void main() {
    vec3 p = position;
    float r = length(p.xz);
    float a = atan(p.z, p.x);
    vBase = aBase;
    vRel = aRel;
    vLocal = p.xz;
    // A flared sheet: H = aspect · outer · (r / outer)^flare. Each one undulates a little (differently), so
    // seen edge-on the sheets' edges interleave into a smooth band instead of showing as separate lines.
    float x = r / uOuter;
    float wobble = uWobble * (sin(a * 5.0 + uLayer * 3.7 + x * 9.0) + sin(a * 3.0 - uLayer * 1.3 - x * 13.0));
    p.y = (uLayer + wobble) * uAspect * uOuter * pow(x, uFlare);
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    // Lit by the star: 1/d² squeezed.
    vLight = min(pow(uHabitable / max(distance(world.xyz, uStar), 1.0), 2.0 * uLightPower), uMaxLight);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D uClumpMap;        // see discClumps.ts
  uniform float uClumps;
  uniform float uInner;
  uniform float uTaper;               // the dust thins out from here to the outer edge
  uniform float uOuter;
  uniform float uLogSpan;             // log(outer / inner)
  uniform float uTime;
  uniform float uOmega;               // angular speed at the inner edge (rad/s); Kepler's ∝ r^-1.5 outside it
  uniform vec2 uSpiral;               // strength, pitch
  uniform float uTauPower;            // the column is squeezed (stylised), so the outer disc still shows
  uniform float uLayerWeight;         // this sheet's share of the column
  uniform float uDepth;               // optical depth at the inner edge, face on
  uniform float uSlantCap;
  uniform float uGrazeFade;
  uniform float uInside;
  uniform float uContrast;
  uniform float uOpaque;
  uniform float uShade;               // how much light this sheet gets
  uniform float uBrightness;
  uniform float uForward;
  uniform vec3 uColor;
  uniform vec3 uStar;
  uniform vec2 uFade;
  varying vec3 vWorld;
  varying vec2 vLocal;
  varying float vBase;
  varying float vRel;
  varying float vLight;

  void main() {
    if (vBase <= 0.0) discard;
    vec3 toEye = cameraPosition - vWorld;
    float dist = length(toEye);
    float fade = smoothstep(uFade.x, uFade.y, dist);
    if (fade <= 0.0) discard;
    // Clumps carried round at the local orbital speed (so they shear like the real thing), and a spiral in some.
    float r = length(vLocal);
    float lr = log(r / uInner);
    float a = atan(vLocal.y, vLocal.x) - uTime * uOmega * pow(r / uInner, -1.5);
    float clump = texture2D(uClumpMap, vec2(a / 6.2831853, lr / uLogSpan)).r * ${CLUMP_SCALE.toFixed(1)};
    float rel = vRel * mix(1.0, clump, uClumps);
    if (uSpiral.x > 0.0) rel *= 1.0 + uSpiral.x * cos(2.0 * (a - uSpiral.y * lr));
    vec3 v = toEye / dist;
    // A sheet seen at a slant holds more dust along the line of sight (capped: from inside it would be infinite).
    float slant = 1.0 / max(abs(v.y), uSlantCap);
    // A debris disc's sheets hand over to its band near edge-on (the band fades in as they fade out), so the
    // gap between sheets doesn't show as a dark wedge along the plane.
    slant *= mix(1.0, smoothstep(0.06, 0.35, abs(v.y)), uGrazeFade * uInside);
    float tau = uDepth * pow(vBase * rel, uTauPower) * uLayerWeight * slant;
    // Thinning out towards both edges (the disc is thick right up to them otherwise): edge-on or from a little
    // above, the stacked sheets' hard edges showed as steps.
    float edges = smoothstep(uInner, uInner * 1.6, r) * (1.0 - smoothstep(uTaper, uOuter, r));
    float alpha = (1.0 - exp(-tau)) * fade * edges;
    // Scattered forwards (Henyey–Greenstein, relative to isotropic, capped).
    float g = uForward;
    float c = dot(normalize(vWorld - uStar), v);
    float phase = min((1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * c, 1.5), 4.0);
    // Rings shine and gaps are dark even where the dust is thick enough to hide what's behind it.
    vec3 col = uColor * vLight * phase * uShade * uBrightness * pow(max(rel, 0.0), uContrast);
    // Premultiplied: a young disc's thick dust hides what's behind it; a debris disc's is too thin to, and only adds light.
    gl_FragColor = vec4(col * alpha, alpha * uOpaque);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** A debris disc's band: a short open cylinder (its far wall), ±BAND_HEIGHT scale heights tall. */
const BAND_HEIGHT = 1.3;
const BAND_SEGMENTS = [96, 16] as const;

const BAND_VERTEX = /* glsl */ `
  uniform float uHeight;              // the disc's scale height at the wall
  uniform float uHabitable;
  uniform float uLightPower;
  uniform float uMaxLight;
  uniform float uLightAt;             // lit as dust this far from the star is, not the wall itself
  varying vec3 vWorld;
  varying float vAcross;              // height over the scale height
  varying vec2 vRound;                // the wall's outward direction (x, z), unnormalised
  varying float vLight;
  void main() {
    vAcross = position.y / uHeight;
    vRound = position.xz;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vLight = min(pow(uHabitable / max(uLightAt, 1.0), 2.0 * uLightPower), uMaxLight);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const BAND_FRAGMENT = /* glsl */ `
  uniform float uBandDepth;
  uniform float uInside;              // 1 with the camera inside the dust layer (where the band shows), 0 above it
  uniform float uBrightness;
  uniform float uForward;
  uniform vec3 uColor;
  uniform vec3 uStar;
  uniform vec2 uFade;
  varying vec3 vWorld;
  varying float vAcross;
  varying vec2 vRound;
  varying float vLight;
  void main() {
    vec3 toEye = cameraPosition - vWorld;
    float dist = length(toEye);
    vec3 v = toEye / dist;
    // Only from inside the dust layer, and there near edge-on, as the sheets fade out (their uGrazeFade): the two
    // hand over. From above the layer a far wall would stand up behind the star like a screen.
    float edgeOn = 1.0 - smoothstep(0.06, 0.35, abs(v.y));
    // And fading out where the wall turns away to its outline (seen along the wall), so the band has no hard ends.
    float facing = abs(dot(normalize(vec3(vRound.x, 0.0, vRound.y)), v));
    float fade = smoothstep(uFade.x, uFade.y, dist) * edgeOn * smoothstep(0.0, 0.5, facing) * uInside;
    if (fade <= 0.0) discard;
    float s = vAcross;
    // The column along the plane: Gaussian in height.
    float tau = uBandDepth * exp(-s * s * 2.0);
    float alpha = (1.0 - exp(-tau)) * fade * (1.0 - smoothstep(1.0, ${BAND_HEIGHT.toFixed(1)}, abs(s)));
    // Its light comes from all the dust along the line of sight, most of it nearer the star than the wall:
    // scattered by the angle between the line of sight and the star (the elongation), not the wall's own.
    float g = uForward;
    float c = dot(normalize(uStar - cameraPosition), -v);
    float phase = min((1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * c, 1.5), 4.0);
    vec3 col = uColor * vLight * phase * uBrightness;
    // Thin dust: it only adds light.
    gl_FragColor = vec4(col * alpha, 0.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * A system's dust (gen/discs.ts) in the system view, and so in low orbit's
 * sky: a young star's protoplanetary disc (thick, dark gaps where planets
 * form, bright rings, clumps shearing round at Kepler's speeds) or a faint
 * debris disc. Drawn as a few flared sheets stacked through its thickness,
 * back to front from wherever the camera is: from above the top sheet hides
 * the rest, edge-on they add up to a band with a darker midplane (a young
 * disc's surface catches the starlight; its midplane is in shadow), and from
 * inside a debris disc they make a glow along the ecliptic, brightest
 * towards the star like the zodiacal light. One shader, no textures but the
 * shared noise.
 */
export class DustDisc implements Entity {
  readonly object = new THREE.Group();
  private readonly geometry: THREE.BufferGeometry;
  private readonly sheets: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>[] = [];
  /** Shared by every sheet's material (only the layer's own uniforms differ). */
  private readonly shared: Record<string, THREE.IUniform>;
  private readonly clumpMap: THREE.DataTexture;
  /** The sheets' heights, in scale heights. */
  private readonly layers: readonly number[];
  /** A debris disc's band along its plane (null for a young disc). */
  readonly band: THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial> | null;
  private readonly local = new THREE.Vector3();
  private readonly star = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    readonly data: DustDiscData,
    stars: readonly StarData[],
    habitableRadius: number,
    /** Seconds per orbit at the inner edge. */
    innerPeriod: number,
  ) {
    const young = data.kind === 'protoplanetary';
    const light = new THREE.Color(stars[0] ? starLightColor(stars[0]) : '#ffffff');
    const color = new THREE.Color(data.color).multiply(light);
    this.clumpMap = new THREE.DataTexture(bakeDiscClumps(data.seed, ...CLUMP_TEXELS), ...CLUMP_TEXELS, THREE.RedFormat);
    this.clumpMap.wrapS = THREE.RepeatWrapping;
    this.clumpMap.magFilter = this.clumpMap.minFilter = THREE.LinearFilter;
    this.clumpMap.needsUpdate = true;
    const inner = data.inner * 0.98;
    this.shared = {
      uClumpMap: { value: this.clumpMap },
      uInner: { value: inner },
      uLogSpan: { value: Math.log(data.outer / inner) },
      uTaper: { value: data.taper },
      uOuter: { value: data.outer },
      uAspect: { value: data.aspect },
      uFlare: { value: data.flare },
      // A young disc's sheets stay put (they're drawn in order, and its surface should read as one), a debris disc's interleave.
      uWobble: { value: young ? 0 : 0.1 },
      uSpiral: { value: new THREE.Vector2(data.spiral, data.pitch) },
      uClumps: { value: young ? dustDiscParams.clumps : dustDiscParams.clumps * 0.3 },
      uTime: { value: 0 },
      uOmega: { value: (2 * Math.PI) / innerPeriod },
      uDepth: { value: data.depth },
      uTauPower: { value: dustDiscParams.tauPower },
      uSlantCap: { value: young ? dustDiscParams.slantCap : dustDiscParams.debrisSlantCap },
      uContrast: { value: young ? dustDiscParams.contrast : 0 },
      uOpaque: { value: young ? 1 : 0 },
      uGrazeFade: { value: young ? 0 : 1 },
      uInside: { value: 0 },
      uBrightness: { value: 1 },
      // The habitable radius is where the light is Earth's, whatever the star.
      uHabitable: { value: habitableRadius },
      uLightPower: { value: dustDiscParams.lightPower },
      uMaxLight: { value: dustDiscParams.maxLight },
      uForward: { value: young ? dustDiscParams.forward : dustDiscParams.debrisForward },
      uColor: { value: color },
      uStar: { value: this.star },
      uFade: { value: new THREE.Vector2(dustDiscParams.near, dustDiscParams.far) },
    };
    this.geometry = discGeometry(data, inner);
    // Each sheet's share of the column: a Gaussian through the thickness.
    this.layers = young ? YOUNG_LAYERS : LAYERS;
    const weights = this.layers.map((z) => Math.exp(-(z * z) / 2));
    const total = weights.reduce((a, b) => a + b, 0);
    this.layers.forEach((_, i) => {
      const material = new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: {
          ...this.shared,
          uLayer: { value: 0 },
          uLayerWeight: { value: 0 },
          uShade: { value: 1 },
        },
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
        depthWrite: false,
        transparent: true,
        side: THREE.DoubleSide,
      });
      const sheet = new THREE.Mesh(this.geometry, material);
      sheet.name = `${young ? 'Protoplanetary' : 'Debris'} disc sheet ${i}`;
      // Drawn in this order (they share a centre, so depth sorting can't order them)...
      sheet.renderOrder = -0.01 + i * 0.001;
      sheet.frustumCulled = false;
      // ...each taking the layer that's i-th from the far side of wherever the camera is.
      sheet.onBeforeRender = (_r, _s, camera) => this.prepareSheet(sheet, i, camera, weights, total);
      this.sheets.push(sheet);
      this.object.add(sheet);
    });
    this.band = young ? null : this.createBand(color);
    this.object.name = young ? 'Protoplanetary disc' : 'Debris disc';
    scene.add(this.object);
  }

  /** Clumps orbit with the system clock. */
  animate(time: number): void {
    this.shared.uTime!.value = time;
    const young = this.data.kind === 'protoplanetary';
    this.shared.uBrightness!.value = young ? dustDiscParams.discBrightness : dustDiscParams.debrisBrightness;
    this.shared.uLightPower!.value = dustDiscParams.lightPower;
    this.shared.uForward!.value = young ? dustDiscParams.forward : dustDiscParams.debrisForward;
    this.shared.uMaxLight!.value = dustDiscParams.maxLight;
    this.shared.uTauPower!.value = dustDiscParams.tauPower;
    this.shared.uSlantCap!.value = young ? dustDiscParams.slantCap : dustDiscParams.debrisSlantCap;
    if (this.band) this.band.material.uniforms.uBandDepth!.value = dustDiscParams.debrisBandDepth;
    // Only a thick disc needs it: a thin one's brightness already follows its column.
    this.shared.uContrast!.value = young ? dustDiscParams.contrast : 0;
    this.shared.uClumps!.value = young ? dustDiscParams.clumps : dustDiscParams.clumps * 0.3;
    (this.shared.uFade!.value as THREE.Vector2).set(dustDiscParams.near, dustDiscParams.far);
  }

  update(): void {}

  /**
   * Seen from inside, stacked sheets leave a dark wedge along the plane,
   * where the real band is brightest: no sheet lies along a line of sight in
   * the plane. So a debris disc has a band: the far wall of an open cylinder
   * near its outer edge, painted with the column along the plane. From inside
   * it is the band along the ecliptic, like the zodiacal light, lit as the
   * dust near the star is; near edge-on the sheets hand over to it. Only the
   * far wall: close outside, a near wall would fill the view, while the real
   * band's height comes from the disc's thickness across its whole width.
   * (A young disc needs none: seen edge-on its flat sheets read as two lit
   * surfaces with a dark lane between, as edge-on discs look, e.g. HH 30.)
   */
  private createBand(color: THREE.Color): NonNullable<DustDisc['band']> {
    const { data } = this;
    const radius = data.outer * 0.9;
    const height = data.aspect * data.outer * (radius / data.outer) ** data.flare;
    const geometry = new THREE.CylinderGeometry(radius, radius, 2 * BAND_HEIGHT * height, BAND_SEGMENTS[0], BAND_SEGMENTS[1], true);
    const band = new THREE.Mesh(
      geometry,
      new THREE.ShaderMaterial({
        vertexShader: BAND_VERTEX,
        fragmentShader: BAND_FRAGMENT,
        uniforms: {
          uHeight: { value: height },
          uHabitable: this.shared.uHabitable!,
          uLightPower: this.shared.uLightPower!,
          uMaxLight: this.shared.uMaxLight!,
          uLightAt: { value: this.shared.uHabitable!.value as number },
          uStar: this.shared.uStar!,
          uBandDepth: { value: dustDiscParams.debrisBandDepth },
          uInside: this.shared.uInside!,
          uBrightness: this.shared.uBrightness!,
          uForward: this.shared.uForward!,
          uColor: { value: color },
          uFade: this.shared.uFade!,
        },
        // Premultiplied like the sheets: it only adds light.
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneFactor,
        depthWrite: false,
        transparent: true,
        // From outside, the back faces are the far wall; from inside, every wall is.
        side: THREE.BackSide,
      }),
    );
    band.renderOrder = -0.02;
    // Drawn first: it settles where the camera is for the sheets too.
    band.onBeforeRender = (_r, _s, camera) => this.measureInside(camera);
    band.frustumCulled = false;
    band.name = 'Debris disc band';
    this.object.add(band);
    return band;
  }

  /**
   * How far inside the dust layer the camera is, 1 within ±0.3 of its scale
   * height at the camera's distance from the star and within half the disc's
   * radius, 0 beyond ±1 or beyond 0.85 of its radius: a debris
   * disc's band (and its sheets fading out edge-on) belong to a view from
   * inside, as the zodiacal light is seen from Earth.
   */
  private measureInside(camera: THREE.Camera): void {
    this.object.worldToLocal(camera.getWorldPosition(this.local));
    const { data } = this;
    const out = Math.hypot(this.local.x, this.local.z);
    const r = Math.min(Math.max(out, data.inner), data.outer);
    const height = data.aspect * data.outer * (r / data.outer) ** data.flare;
    const within = 1 - THREE.MathUtils.smoothstep(Math.abs(this.local.y) / height, 0.3, 1);
    // And well inside the band's wall (at 0.9 of the outer edge): from outside, or close to it, its far wall
    // showed as a lit rectangle across the system, however far off the camera was.
    const among = 1 - THREE.MathUtils.smoothstep(out / data.outer, 0.5, 0.85);
    this.shared.uInside!.value = within * among;
  }

  private prepareSheet(sheet: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>, i: number, camera: THREE.Camera, weights: readonly number[], total: number): void {
    this.object.worldToLocal(camera.getWorldPosition(this.local));
    this.object.getWorldPosition(this.star);
    // From above, the bottom sheet goes first and the top one last; from below the other way round.
    const k = this.local.y >= 0 ? i : this.layers.length - 1 - i;
    const z = this.layers[k]!;
    const u = sheet.material.uniforms;
    u.uLayer!.value = z;
    u.uLayerWeight!.value = weights[k]! / total;
    // A young disc's flared surface catches the starlight; its midplane is shaded. A debris disc is thin all through.
    const top = Math.abs(z) / this.layers[this.layers.length - 1]!;
    u.uShade!.value = this.data.kind === 'protoplanetary' ? dustDiscParams.midplane + (1 - dustDiscParams.midplane) * top : 1;
  }

  dispose(): void {
    this.scene.remove(this.object);
    this.geometry.dispose();
    this.clumpMap.dispose();
    for (const s of this.sheets) s.material.dispose();
    this.band?.geometry.dispose();
    this.band?.material.dispose();
  }
}

/**
 * A flat annulus in the XZ plane, its rings of vertices spaced evenly in log
 * radius from `inner` to the disc's outer edge, each with the disc's smooth
 * density and its gaps and rings there (computed once: they never change).
 */
function discGeometry(data: DustDiscData, inner: number): THREE.BufferGeometry {
  const around = SEGMENTS_AROUND + 1;
  const count = around * (SEGMENTS_ACROSS + 1);
  const positions = new Float32Array(count * 3);
  const base = new Float32Array(count);
  const rel = new Float32Array(count);
  const index: number[] = [];
  for (let j = 0; j <= SEGMENTS_ACROSS; j++) {
    const r = inner * (data.outer / inner) ** (j / SEGMENTS_ACROSS);
    const b = smoothDustDensity(data, r);
    const k = dustStructure(data, r);
    for (let i = 0; i < around; i++) {
      const a = (2 * Math.PI * i) / SEGMENTS_AROUND;
      const v = j * around + i;
      positions.set([r * Math.cos(a), 0, r * Math.sin(a)], v * 3);
      base[v] = b;
      rel[v] = k;
      if (i < SEGMENTS_AROUND && j < SEGMENTS_ACROSS) index.push(v, v + around, v + 1, v + 1, v + around, v + around + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aBase', new THREE.BufferAttribute(base, 1));
  geometry.setAttribute('aRel', new THREE.BufferAttribute(rel, 1));
  geometry.setIndex(index);
  return geometry;
}

/** Binds the dust's tunables in the debug panel. */
export function addDustDiscDebug(debug: Debug): void {
  const f = debug.folder('Dust discs');
  f?.add(dustDiscParams, 'discBrightness', 0, 4);
  f?.add(dustDiscParams, 'debrisBrightness', 0, 1);
  f?.add(dustDiscParams, 'lightPower', 0.2, 1);
  f?.add(dustDiscParams, 'forward', 0, 0.9);
  f?.add(dustDiscParams, 'debrisForward', 0, 0.9);
  f?.add(dustDiscParams, 'debrisSlantCap', 0.02, 1);
  f?.add(dustDiscParams, 'maxLight', 0.5, 6);
  f?.add(dustDiscParams, 'debrisBandDepth', 0, 3);
  f?.add(dustDiscParams, 'midplane', 0, 1);
  f?.add(dustDiscParams, 'clumps', 0, 1);
  f?.add(dustDiscParams, 'tauPower', 0.1, 1);
  f?.add(dustDiscParams, 'slantCap', 0.02, 1);
  f?.add(dustDiscParams, 'contrast', 0, 2);
  f?.add(dustDiscParams, 'near', 0, 300);
  f?.add(dustDiscParams, 'far', 0, 1500);
}

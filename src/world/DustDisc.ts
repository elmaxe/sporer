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
  /** A young disc's rim seen edge-on: optical depth through its midplane (a dark lane, like HH 30's). */
  rimDepth: 6,
  /** A debris disc's: how much dust its band along the plane shows. */
  debrisRimDepth: 0.6,
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
  uniform float uLogSpan;             // log(outer / inner)
  uniform float uTime;
  uniform float uOmega;               // angular speed at the inner edge (rad/s); Kepler's ∝ r^-1.5 outside it
  uniform vec2 uSpiral;               // strength, pitch
  uniform float uTauPower;            // the column is squeezed (stylised), so the outer disc still shows
  uniform float uLayerWeight;         // this sheet's share of the column
  uniform float uDepth;               // optical depth at the inner edge, face on
  uniform float uSlantCap;
  uniform float uGrazeFade;
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
    // A debris disc's sheets hand over to its rim's band near edge-on (the rim fades in as they fade out), so the
    // gap between sheets doesn't show as a dark wedge along the plane.
    slant *= mix(1.0, smoothstep(0.06, 0.35, abs(v.y)), uGrazeFade);
    float tau = uDepth * pow(vBase * rel, uTauPower) * uLayerWeight * slant;
    float alpha = (1.0 - exp(-tau)) * fade;
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

/** The rim: a short open cylinder, ±RIM_HEIGHT scale heights tall (as tall as the flared sheets further out look edge-on). */
const RIM_HEIGHT = 1.3;
const RIM_SEGMENTS = [96, 16] as const;

const RIM_VERTEX = /* glsl */ `
  uniform float uHeight;              // the disc's scale height at the rim
  uniform float uHabitable;
  uniform float uLightPower;
  uniform float uMaxLight;
  uniform float uLightAt;             // > 0: the light at this distance from the star, not the wall's own
  uniform vec3 uStar;
  varying vec3 vWorld;
  varying float vAcross;              // height over the scale height
  varying vec2 vRound;               // the point's place round the disc (x, z), for its angle per pixel
  varying float vLight;
  void main() {
    vAcross = position.y / uHeight;
    vRound = position.xz;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    float d = uLightAt > 0.0 ? uLightAt : distance(world.xyz, uStar);
    vLight = min(pow(uHabitable / max(d, 1.0), 2.0 * uLightPower), uMaxLight);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const RIM_FRAGMENT = /* glsl */ `
  uniform sampler2D uClumpMap;
  uniform float uClumpV;              // the rim's place across the clump map
  uniform float uRimClumps;           // how much the clumps show on it (a slice of the map is stripes up a wall)
  uniform float uTime;
  uniform float uSpin;                // angular speed at the rim (rad/s)
  uniform float uRimDepth;
  uniform vec2 uEdgeOn;               // fades out between these sines of the view's elevation
  uniform float uMidplane;            // a young disc's shaded midplane; 1 for a debris disc, lit all through
  uniform float uOpaque;
  uniform float uBrightness;
  uniform float uForward;
  uniform vec3 uColor;
  uniform vec3 uStar;
  uniform vec2 uFade;
  varying vec3 vWorld;
  varying float vAcross;
  varying vec2 vRound;               // the point's place round the disc (x, z), for its angle per pixel
  varying float vLight;
  void main() {
    vec3 toEye = cameraPosition - vWorld;
    float dist = length(toEye);
    vec3 v = toEye / dist;
    // Only near edge-on, where the stacked sheets would show their gaps; from above the top sheet covers the disc.
    float edgeOn = 1.0 - smoothstep(uEdgeOn.x, uEdgeOn.y, abs(v.y));
    float fade = smoothstep(uFade.x, uFade.y, dist) * edgeOn;
    if (fade <= 0.0) discard;
    float s = vAcross;
    // The angle per pixel: interpolated per vertex it would jump across the seam where atan wraps round.
    float angle = atan(vRound.y, vRound.x);
    float clump = texture2D(uClumpMap, vec2((angle - uTime * uSpin) / 6.2831853, uClumpV)).r * ${CLUMP_SCALE.toFixed(1)};
    // The column through the disc's edge: Gaussian in height, so the midplane is opaque.
    float tau = uRimDepth * exp(-s * s * 2.0) * mix(1.0, clump, uRimClumps);
    float alpha = (1.0 - exp(-tau)) * fade * (1.0 - smoothstep(1.0, ${RIM_HEIGHT.toFixed(1)}, abs(s)));
    // Lit on its flared surfaces, dark in the midplane (HH 30's dark lane).
    float shade = mix(min(1.0, uMidplane * 0.4 + (1.0 - uOpaque)), 1.0, smoothstep(0.25, 1.0, abs(s)));
    // Its light comes from all the dust along the line of sight, most of it nearer the star than the wall:
    // scattered by the angle between the line of sight and the star (the elongation), not the wall's own.
    float g = uForward;
    float c = dot(normalize(uStar - cameraPosition), -v);
    float phase = min((1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * c, 1.5), 4.0);
    vec3 col = uColor * vLight * phase * shade * uBrightness;
    gl_FragColor = vec4(col * alpha, alpha * uOpaque);
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
  /** The disc's rim (its far and near halves) and their shared uniforms. */
  private readonly rim: { geometry: THREE.CylinderGeometry; meshes: THREE.Mesh[]; uniforms: Record<string, THREE.IUniform> };
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
    this.rim = this.createRim(color, innerPeriod);
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
    this.rim.uniforms.uRimDepth!.value = young ? dustDiscParams.rimDepth : dustDiscParams.debrisRimDepth;
    this.rim.uniforms.uMidplane!.value = dustDiscParams.midplane;
    // Only a thick disc needs it: a thin one's brightness already follows its column.
    this.shared.uContrast!.value = young ? dustDiscParams.contrast : 0;
    this.shared.uClumps!.value = young ? dustDiscParams.clumps : dustDiscParams.clumps * 0.3;
    (this.shared.uFade!.value as THREE.Vector2).set(dustDiscParams.near, dustDiscParams.far);
  }

  update(): void {}

  /**
   * Seen edge-on or from inside, stacked sheets leave gaps: from the side a
   * young disc showed separate plates, and from inside a debris disc a dark
   * wedge along the plane, where the real band is brightest (no sheet lies
   * along a line of sight in the plane). So both are closed off by a rim, an
   * open cylinder painted with the column through the disc's edge. A young
   * disc's stands round its dense part (out to the taper): from the side it
   * reads as one thick disc, lit on its flared surfaces with a dark lane
   * through the midplane, as edge-on discs are (HH 30); its far half is
   * drawn before the sheets, its near half after them. A debris disc's stands
   * near its outer edge, only adds light and has just its far half: from
   * inside it is the band along the ecliptic, like the zodiacal light, lit as
   * the dust near the star is.
   */
  private createRim(color: THREE.Color, innerPeriod: number): NonNullable<DustDisc['rim']> {
    const { data } = this;
    const young = data.kind === 'protoplanetary';
    const radius = young ? data.taper : data.outer * 0.9;
    const height = data.aspect * data.outer * (radius / data.outer) ** data.flare;
    const geometry = new THREE.CylinderGeometry(radius, radius, 2 * RIM_HEIGHT * height, RIM_SEGMENTS[0], RIM_SEGMENTS[1], true);
    const inner = this.shared.uInner!.value as number;
    const uniforms: Record<string, THREE.IUniform> = {
      uHeight: { value: height },
      uHabitable: this.shared.uHabitable!,
      uLightPower: this.shared.uLightPower!,
      uMaxLight: this.shared.uMaxLight!,
      uStar: this.shared.uStar!,
      uClumpMap: this.shared.uClumpMap!,
      uClumpV: { value: Math.log(radius / inner) / (this.shared.uLogSpan!.value as number) },
      // A slice of the clump map, painted up a wall, is vertical stripes: a little on a young disc's edge (seen only
      // edge-on, where they read as clumps along it), none on a debris disc's band, which shows from higher up.
      uRimClumps: { value: young ? 0.25 : 0 },
      uTime: this.shared.uTime!,
      uSpin: { value: ((2 * Math.PI) / innerPeriod) * (radius / inner) ** -1.5 },
      uLightAt: { value: young ? 0 : this.shared.uHabitable!.value as number },
      uRimDepth: { value: young ? dustDiscParams.rimDepth : dustDiscParams.debrisRimDepth },
      // A young disc's sheets show their gaps only nearly edge-on (a taller window shows the rim as a drum);
      // a debris disc's band stands in for its sheets further up (see uGrazeFade).
      uEdgeOn: { value: young ? new THREE.Vector2(0.03, 0.1) : new THREE.Vector2(0.06, 0.35) },
      uMidplane: { value: dustDiscParams.midplane },
      uOpaque: { value: young ? 1 : 0 },
      uBrightness: this.shared.uBrightness!,
      uForward: this.shared.uForward!,
      uColor: { value: color },
      uFade: this.shared.uFade!,
    };
    // A debris disc keeps only the far wall: close outside, a near wall would fill the view, while the real band's
    // height comes from the disc's thickness across its whole width (and from inside, every wall is a far one).
    const sides = young ? ([THREE.BackSide, THREE.FrontSide] as const) : ([THREE.BackSide] as const);
    const meshes = sides.map((side, k) => {
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.ShaderMaterial({
          vertexShader: RIM_VERTEX,
          fragmentShader: RIM_FRAGMENT,
          uniforms,
          blending: THREE.CustomBlending,
          blendSrc: THREE.OneFactor,
          blendDst: THREE.OneMinusSrcAlphaFactor,
          depthWrite: false,
          transparent: true,
          side,
        }),
      );
      // From outside, the back faces are the far half and the front faces the near half; from inside, all are back faces.
      mesh.renderOrder = k === 0 ? -0.02 : -0.005;
      mesh.frustumCulled = false;
      mesh.name = `${young ? 'Protoplanetary' : 'Debris'} disc rim (${k === 0 ? 'far' : 'near'})`;
      this.object.add(mesh);
      return mesh;
    });
    return { geometry, meshes, uniforms };
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
    this.rim.geometry.dispose();
    for (const m of this.rim.meshes) (m.material as THREE.Material).dispose();
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
  f?.add(dustDiscParams, 'rimDepth', 0, 20);
  f?.add(dustDiscParams, 'debrisRimDepth', 0, 3);
  f?.add(dustDiscParams, 'midplane', 0, 1);
  f?.add(dustDiscParams, 'clumps', 0, 1);
  f?.add(dustDiscParams, 'tauPower', 0.1, 1);
  f?.add(dustDiscParams, 'slantCap', 0.02, 1);
  f?.add(dustDiscParams, 'contrast', 0, 2);
  f?.add(dustDiscParams, 'near', 0, 300);
  f?.add(dustDiscParams, 'far', 0, 1500);
}

import * as THREE from 'three';
import {
  ASTEROID_COLORS,
  beltTurns,
  describeBelt,
  generateRocks,
  librationTurns,
  rockBounds,
  rockEye,
  rocksOutOfReach,
  rockWithin,
  type AsteroidClass,
  type AsteroidData,
  type BeltData,
  type RockBounds,
  type RockData,
  type RockEye,
} from '../gen/belts';
import { terrainNoise } from '../gen/noise';
import { Rng, hashSeed } from '../gen/rng';
import { generateShape, shapeRadius } from '../gen/shape';
import type { CelestialBody, Region } from './CelestialBody';
import { createCubeSphere } from './cubeSphere';
import { bakeDustPattern, dustArcHalfWidth, DUST_PATTERN_SCALE, TROJAN_DUST_SPREAD } from './beltDust';
import type { Planet, PlanetConfig } from './Planet';

export const beltParams = {
  /** A rock is a mesh from this size on screen (device px), a dot below it... */
  meshPixels: 4,
  /** ...and gone below this one; the dust band takes over. */
  minPixels: 0.6,
  /** The dots' brightness, to match the lit meshes. */
  dotBrightness: 3,
  /** The dust band fades in between these distances from the camera (system units)... */
  dustNear: 150,
  dustFar: 900,
  /** ...to this brightness: faint, a haze where the rocks are too small to see rather than a glow. */
  dustBrightness: 0.05,
  /** Seconds between choosing which rocks are near enough for a mesh (sooner if the camera moves). */
  reselect: 0.25,
  /**
   * Most rocks drawn as meshes per belt. When more are near enough, only the
   * biggest on screen get one, and the size a rock needs for a mesh rises
   * for the belt (the rest stay dots), so the triangle count is bounded
   * however close the camera is and however many pixels the screen has.
   */
  maxMeshes: 800,
};

/** Rock meshes per belt (one draw call each): two single rocks, an elongated one and a contact binary. */
const ROCK_MESHES = 4;
/** Cube sphere segments of a rock: 12·2² = 48 triangles. */
const ROCK_SEGMENTS = 2;
/** Texels of the dust's baked pattern round a full ring (an arc gets its share) and across it. */
const DUST_TEXELS_AROUND = 1024;
const DUST_TEXELS_ACROSS = 64;
/**
 * The dust's brightness by belt: the outer belts' further from the star and
 * fainter (stylised; the dust's colour is evened to one luminance first).
 */
const DUST_LIGHT: Record<BeltData['kind'], number> = { main: 1, trojan: 0.8, kuiper: 0.45 };
/** The dust's luminance before DUST_LIGHT and `dustBrightness`. */
const DUST_LUMINANCE = 0.3;
/** Seen from inside the belt (near its plane), the dust is this dim: from in there it would be all round. */
const DUST_INSIDE = 0.25;

/** The camera may move this far (system units) before the near rocks are chosen again. */
const RESELECT_MOVE = 4;
/** Chosen rocks reach this much further than they need, for the camera and rocks moving until the next choice. */
const RESELECT_MARGIN = 12;

/*
 * Each rock goes round on its own tilted circle in the vertex shader, a pure
 * function of the system clock (`rockPosition` in gen/belts.ts does the same
 * on the CPU: it chooses which rocks get a mesh, and the tests check it). Far
 * rocks are dots (one `Points` of every rock); those near enough to show a
 * shape are meshes that tumble about their own axis. Rocks smaller than a
 * pixel fade out, and the dusty band fades in.
 */
const ROCK_ORBIT_GLSL = /* glsl */ `
  attribute vec4 aOrbit;  // radius, turn at time 0, rate, size
  attribute vec4 aTilt;   // inclination, node, libration (turns), libration phase (turns)
  uniform float uTurns;
  uniform float uLibTurns;
  uniform float uPixels;  // device px per unit at distance 1
  uniform float uMeshPixels;
  uniform float uMinPixels;

  vec3 rockCentre() {
    float along = aOrbit.y + uTurns * aOrbit.z + aTilt.z * sin(6.2831853 * (uLibTurns + aTilt.w));
    float ang = 6.2831853 * fract(along) + aTilt.y;
    float flatZ = aOrbit.x * sin(ang);
    vec3 p = vec3(aOrbit.x * cos(ang), flatZ * sin(aTilt.x), flatZ * cos(aTilt.x));
    float cn = cos(aTilt.y);
    float sn = sin(aTilt.y);
    return vec3(p.x * cn + p.z * sn, p.y, -p.x * sn + p.z * cn);
  }
`;

const ROCK_MESH_HEAD = /* glsl */ `
  ${ROCK_ORBIT_GLSL}
  attribute vec4 aSpin;   // axis xyz, radians per second
  uniform float uSpinTime;

  vec3 rotateAxis(vec3 v, vec3 k, float a) {
    float c = cos(a);
    float s = sin(a);
    return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
  }
`;

const ROCK_MESH_BODY = /* glsl */ `
  vec3 centre = rockCentre();
  vec3 worldCentre = (modelMatrix * vec4(centre, 1.0)).xyz;
  float px = aOrbit.w * uPixels / max(distance(worldCentre, cameraPosition), 1e-3);
  // Grows out of the dot as it nears (the dot fades out over the same range).
  float shown = smoothstep(uMeshPixels * 0.6, uMeshPixels, px);
  vec3 transformed = centre + rotateAxis(position, aSpin.xyz, aSpin.w * uSpinTime) * (aOrbit.w * shown);
`;

const DOT_VERTEX = /* glsl */ `
  ${ROCK_ORBIT_GLSL}
  attribute vec3 aColor;
  uniform float uBrightness;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec3 centre = rockCentre();
    vec4 world = modelMatrix * vec4(centre, 1.0);
    float px = aOrbit.w * uPixels / max(distance(world.xyz, cameraPosition), 1e-3);
    // Lit by the star at the centre: from full on the day side to dark at the back.
    vec3 toSun = normalize(-world.xyz);
    vec3 toEye = normalize(cameraPosition - world.xyz);
    float phase = 0.5 + 0.5 * dot(toSun, toEye);
    vColor = aColor * uBrightness * (0.15 + 0.85 * phase);
    // Fades in from a fraction of a pixel, and out where the mesh takes over.
    vAlpha = smoothstep(uMinPixels * 0.5, uMinPixels, px) * (1.0 - smoothstep(uMeshPixels * 0.6, uMeshPixels, px)) * min(px, 1.0);
    gl_Position = projectionMatrix * viewMatrix * world;
    gl_PointSize = vAlpha > 0.0 ? clamp(2.0 * px, 1.0, 2.0 * uMeshPixels) : 0.0;
  }
`;

const DOT_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float d = dot(c, c);
    if (d > 1.0 || vAlpha <= 0.0) discard;
    gl_FragColor = vec4(vColor, vAlpha * (1.0 - d * d));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const DUST_VERTEX = /* glsl */ `
  varying vec3 vWorld;
  varying vec2 vLocal;
  void main() {
    vLocal = position.xz;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const DUST_FRAGMENT = /* glsl */ `
  uniform sampler2D uPattern; // see beltDust.ts
  uniform float uInner;
  uniform float uOuter;
  uniform vec3 uColor;
  uniform float uBrightness;
  uniform vec2 uFade;
  uniform vec2 uArc;          // local angle at u = 0, and the angle u spans
  varying vec3 vWorld;
  varying vec2 vLocal;
  void main() {
    // Near the camera, and seen edge-on, the sheet isn't drawn at all.
    vec3 toEye = cameraPosition - vWorld;
    float d = length(toEye);
    float fade = smoothstep(uFade.x, uFade.y, d) * smoothstep(0.02, 0.2, abs(toEye.y) / d);
    if (fade <= 0.0) discard;
    float t = log(length(vLocal) / uInner) / log(uOuter / uInner);
    float u = (atan(vLocal.y, vLocal.x) - uArc.x) / uArc.y;
    float a = texture2D(uPattern, vec2(u, t)).r * ${DUST_PATTERN_SCALE.toFixed(2)} * fade * uBrightness;
    gl_FragColor = vec4(uColor * a, 1.0);
    #include <colorspace_fragment>
  }
`;

/** One rock mesh's instances: every rock of that shape, the chosen near ones packed first. */
interface RockBatch {
  mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.MeshStandardMaterial>;
  rocks: RockData[];
  orbit: THREE.InstancedBufferAttribute;
  tilt: THREE.InstancedBufferAttribute;
  spin: THREE.InstancedBufferAttribute;
  color: THREE.InstancedBufferAttribute;
  /** The four above, to upload together. */
  attributes: readonly THREE.InstancedBufferAttribute[];
  /** Each rock's colour, in `rocks` order. */
  colors: Float32Array;
}

/**
 * One belt in the system view (also the planet level's sky): thousands of
 * rocks on their own orbits, moved in the vertex shader, drawn as dots far
 * away and as tumbling meshes near the camera, and a faint dusty band that
 * takes over where the rocks are too small to see. Hovering the belt names
 * it; a click flies to its nearest named asteroid (`bodyNear`), the
 * visitable `Planet`s the system builds from `data.asteroids`.
 */
export class AsteroidBelt implements Region {
  readonly object = new THREE.Group();
  readonly description: string;
  /** Where the pointer last met the belt (the tooltip's anchor). */
  readonly renderPosition = new THREE.Vector3();
  readonly radius: number;
  readonly rocks: readonly RockData[];
  private readonly batches: RockBatch[] = [];
  private readonly dots: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly dust: THREE.Mesh<THREE.RingGeometry, THREE.ShaderMaterial>;
  private readonly dustPattern: THREE.DataTexture;
  /** A Trojan swarm's Lagrange point now: the angle (atan(z, x) in the belt's plane) its dust arc centres on. */
  private arcCentre = 0;
  private readonly uniforms = {
    uTurns: { value: 0 },
    uLibTurns: { value: 0 },
    uSpinTime: { value: 0 },
    uPixels: { value: 600 },
    uMeshPixels: { value: beltParams.meshPixels },
    uMinPixels: { value: beltParams.minPixels },
    uBrightness: { value: beltParams.dotBrightness },
  };
  private time = 0;
  /** 1 outside the belt, DUST_INSIDE with the camera in it (see `prepare`). */
  private dustInside = 1;
  /** When and where the near rocks were last chosen (NaN: never). */
  private selectedTime = Number.NaN;
  private readonly selectedFrom = new THREE.Vector3();
  private readonly size = new THREE.Vector2();
  private readonly plane = new THREE.Vector3();
  private readonly local = new THREE.Vector3();
  private readonly at = new THREE.Vector3();
  private readonly eye: RockEye = { x: 0, y: 0, z: 0, distance: 0, radius: 0, turn: 0 };
  /** The size on screen (device px) a rock needs to be a mesh now: `meshPixels`, or more over the budget. */
  private meshPixels = beltParams.meshPixels;
  /** Scratch for `select`: the rocks near enough for a mesh (batch, index in it, px), and a sort buffer. */
  private readonly candidatePixels: Float32Array;
  private readonly candidateBatch: Uint8Array;
  private readonly candidateRock: Uint32Array;
  private readonly sortScratch: Float32Array;
  private readonly batchCounts = new Uint32Array(ROCK_MESHES);
  /** Where the rocks keep to: a belt far from the camera is skipped whole. */
  private readonly bounds: RockBounds;

  constructor(
    private readonly scene: THREE.Scene,
    readonly data: BeltData,
    /** Its named asteroids, as bodies. */
    readonly asteroids: readonly Planet[],
  ) {
    this.description = describeBelt(data);
    this.radius = data.outer;
    const rocks = (this.rocks = generateRocks(data, new Rng(hashSeed(data.seed, 'rocks')), ROCK_MESHES));
    const colors = classColors(data.seed);
    const tint = new Rng(hashSeed(data.seed, 'tint'));
    const rockColors = rocks.map((r) => colors[r.class].clone().multiplyScalar(tint.range(0.8, 1.15)));
    this.bounds = rockBounds(rocks);
    this.candidatePixels = new Float32Array(rocks.length);
    this.candidateBatch = new Uint8Array(rocks.length);
    this.candidateRock = new Uint32Array(rocks.length);
    this.sortScratch = new Float32Array(rocks.length);

    for (let m = 0; m < ROCK_MESHES; m++) {
      // By orbit radius, so `select` only looks at the ones near the camera's distance from the star.
      const mine = rocks.map((_, i) => i).filter((i) => rocks[i]!.mesh === m);
      mine.sort((a, b) => rocks[a]!.radius - rocks[b]!.radius);
      if (mine.length > 0) this.batches.push(this.createBatch(m, mine.map((i) => rocks[i]!), mine.map((i) => rockColors[i]!)));
    }
    this.dots = this.createDots(rocks, rockColors);
    this.dustPattern = createDustTexture(data);
    this.dust = this.createDust(colors, this.dustPattern);
    this.object.add(this.dots, this.dust, ...this.batches.map((b) => b.mesh));
    this.object.name = data.name;
    scene.add(this.object);
    this.animate(0);
  }

  get name(): string {
    return this.data.name;
  }

  /** Rocks drawn as meshes now (the rest are dots or too small to see). */
  get meshRocks(): number {
    return this.batches.reduce((n, b) => n + b.mesh.geometry.instanceCount, 0);
  }

  /** Places the rocks (in the shader) and a Trojan swarm's dust at system time `time`. */
  animate(time: number): void {
    const { data } = this;
    this.time = time;
    const u = this.uniforms;
    u.uTurns.value = beltTurns(data, time);
    u.uLibTurns.value = librationTurns(data, time);
    u.uSpinTime.value = time % 3600;
    u.uMeshPixels.value = this.meshPixels;
    u.uMinPixels.value = beltParams.minPixels;
    u.uBrightness.value = beltParams.dotBrightness;
    const d = this.dust.material.uniforms;
    d.uBrightness!.value = beltParams.dustBrightness * DUST_LIGHT[data.kind] * this.dustInside;
    (d.uFade!.value as THREE.Vector2).set(beltParams.dustNear, beltParams.dustFar);
    if (data.trojan) {
      // The swarm stays 60° from its host: the arc's centre in the ring's own angle (atan(z, x) in its plane).
      // The arc is drawn round 0, so turn it there (a turn of φ about y takes angle α to α − φ).
      const { orbit, lead } = data.trojan;
      this.arcCentre = orbit.phase + lead + (2 * Math.PI * time) / orbit.period;
      this.dust.rotation.y = -this.arcCentre;
    }
  }

  /**
   * Before drawing from `camera`: the device px per unit at distance 1 (so
   * far rocks fade), and which rocks are near enough to be meshes (again
   * when the clock or the camera has moved enough since the last time).
   */
  private prepare(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    renderer.getDrawingBufferSize(this.size);
    const pixels = this.size.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    this.uniforms.uPixels.value = pixels;
    this.object.worldToLocal(camera.getWorldPosition(this.local));
    // Inside the belt's ring and near its plane, the dust dims.
    const { inner, outer } = this.data;
    const r = Math.hypot(this.local.x, this.local.z);
    const across = THREE.MathUtils.smoothstep(r, inner * 0.85, inner) * (1 - THREE.MathUtils.smoothstep(r, outer, outer * 1.15));
    const level = 1 - THREE.MathUtils.smoothstep(Math.abs(this.local.y), 0.1 * r, 0.3 * r);
    this.dustInside = 1 - (1 - DUST_INSIDE) * across * level;
    this.dust.material.uniforms.uBrightness!.value = beltParams.dustBrightness * DUST_LIGHT[this.data.kind] * this.dustInside;
    const stale =
      !(Math.abs(this.time - this.selectedTime) < beltParams.reselect) ||
      this.local.distanceToSquared(this.selectedFrom) > RESELECT_MOVE * RESELECT_MOVE;
    if (stale) this.select(this.local, pixels);
  }

  /**
   * Packs the rocks that would be `meshPixels` or bigger seen from `eye`
   * (belt-local) first in each batch: at most `maxMeshes` of them, the
   * biggest on screen (raising the belt's mesh size to match, see `beltParams`).
   */
  private select(eye: THREE.Vector3, pixels: number): void {
    this.selectedTime = this.time;
    this.selectedFrom.copy(eye);
    const turns = this.uniforms.uTurns.value;
    const libTurns = this.uniforms.uLibTurns.value;
    const at = rockEye(eye, this.eye);
    const threshold = beltParams.meshPixels * 0.6;
    // Every rock near enough for a mesh, with its size on screen (none if the whole belt is too far).
    let n = 0;
    const maxReach = (this.bounds.maxSize * pixels) / threshold + RESELECT_MARGIN;
    const far = rocksOutOfReach(this.bounds, at, maxReach);
    for (let b = 0; b < this.batches.length && !far; b++) {
      const { rocks } = this.batches[b]!;
      // A rock is at its orbit radius from the star, so only those within reach of the eye's distance can be near.
      const top = at.distance + maxReach;
      for (let i = firstAtLeast(rocks, at.distance - maxReach); i < rocks.length && rocks[i]!.radius <= top; i++) {
        const rock = rocks[i]!;
        if (!rockWithin(rock, turns, libTurns, at, (rock.size * pixels) / threshold + RESELECT_MARGIN, this.at)) continue;
        const d = Math.max(Math.hypot(this.at.x - eye.x, this.at.y - eye.y, this.at.z - eye.z), 1e-3);
        this.candidatePixels[n] = (rock.size * pixels) / d;
        this.candidateBatch[n] = b;
        this.candidateRock[n] = i;
        n++;
      }
    }
    // Too many: only the biggest on screen, and the dots (whose shader follows uMeshPixels too) stay below them.
    let cutoff = 0;
    let meshPixels = beltParams.meshPixels;
    const budget = Math.max(1, Math.round(beltParams.maxMeshes));
    if (n > budget) {
      const sorted = this.sortScratch.subarray(0, n);
      sorted.set(this.candidatePixels.subarray(0, n));
      sorted.sort();
      cutoff = sorted[n - budget]!;
      meshPixels = Math.max(meshPixels, cutoff / 0.6);
    }
    this.meshPixels = meshPixels;
    this.uniforms.uMeshPixels.value = meshPixels;
    const counts = this.batchCounts.fill(0);
    for (let k = 0; k < n; k++) {
      if (this.candidatePixels[k]! < cutoff) continue;
      const b = this.candidateBatch[k]!;
      this.pack(this.batches[b]!, this.candidateRock[k]!, counts[b]!++);
    }
    for (let b = 0; b < this.batches.length; b++) {
      const batch = this.batches[b]!;
      const count = counts[b]!;
      const geometry = batch.mesh.geometry;
      geometry.instanceCount = count;
      for (const attribute of batch.attributes) {
        attribute.clearUpdateRanges();
        if (count > 0) {
          attribute.addUpdateRange(0, count * attribute.itemSize);
          attribute.needsUpdate = true;
        }
      }
    }
  }

  /** Writes rock `i` of the batch into instance slot `slot`. */
  private pack(batch: RockBatch, i: number, slot: number): void {
    const r = batch.rocks[i]!;
    const o = batch.orbit.array as Float32Array;
    const t = batch.tilt.array as Float32Array;
    const s = batch.spin.array as Float32Array;
    const c = batch.color.array as Float32Array;
    const k = slot * 4;
    o[k] = r.radius;
    o[k + 1] = r.turn;
    o[k + 2] = r.rate;
    o[k + 3] = r.size;
    t[k] = r.inclination;
    t[k + 1] = r.node;
    t[k + 2] = r.libration;
    t[k + 3] = r.libPhase;
    s[k] = r.axis[0];
    s[k + 1] = r.axis[1];
    s[k + 2] = r.axis[2];
    s[k + 3] = r.spin;
    c[slot * 3] = batch.colors[i * 3]!;
    c[slot * 3 + 1] = batch.colors[i * 3 + 1]!;
    c[slot * 3 + 2] = batch.colors[i * 3 + 2]!;
  }

  private createBatch(index: number, rocks: RockData[], colors: THREE.Color[]): RockBatch {
    const geometry = new THREE.InstancedBufferGeometry();
    const base = rockGeometry(hashSeed(this.data.seed, 'mesh', index), index);
    geometry.index = base.index;
    geometry.setAttribute('position', base.getAttribute('position'));
    geometry.setAttribute('normal', base.getAttribute('normal'));
    const attribute = (size: number) =>
      new THREE.InstancedBufferAttribute(new Float32Array(rocks.length * size), size).setUsage(THREE.DynamicDrawUsage);
    const batch: RockBatch = {
      mesh: null!,
      rocks,
      orbit: attribute(4),
      tilt: attribute(4),
      spin: attribute(4),
      color: attribute(3),
      attributes: [],
      colors: new Float32Array(colors.flatMap((c) => [c.r, c.g, c.b])),
    };
    batch.attributes = [batch.orbit, batch.tilt, batch.spin, batch.color];
    geometry.setAttribute('aOrbit', batch.orbit);
    geometry.setAttribute('aTilt', batch.tilt);
    geometry.setAttribute('aSpin', batch.spin);
    geometry.setAttribute('color', batch.color);
    geometry.instanceCount = 0;
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });
    material.customProgramCacheKey = () => 'asteroid-rocks';
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${ROCK_MESH_HEAD}`)
        .replace('#include <begin_vertex>', ROCK_MESH_BODY);
    };
    const mesh = new THREE.Mesh(geometry, material);
    // Placed by the shader: the bounds are unknown.
    mesh.frustumCulled = false;
    // Drawn (as nothing) even with no rocks chosen, so the choice is made just before the meshes are drawn.
    mesh.onBeforeRender = (renderer, _scene, camera) => this.prepare(renderer, camera);
    mesh.name = `${this.data.name} rocks ${index}`;
    batch.mesh = mesh;
    return batch;
  }

  private createDots(rocks: readonly RockData[], colors: readonly THREE.Color[]): THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(rocks.length * 3), 3));
    geometry.setAttribute('aOrbit', new THREE.BufferAttribute(new Float32Array(rocks.flatMap((r) => [r.radius, r.turn, r.rate, r.size])), 4));
    geometry.setAttribute(
      'aTilt',
      new THREE.BufferAttribute(new Float32Array(rocks.flatMap((r) => [r.inclination, r.node, r.libration, r.libPhase])), 4),
    );
    geometry.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(colors.flatMap((c) => [c.r, c.g, c.b])), 3));
    const dots = new THREE.Points(
      geometry,
      new THREE.ShaderMaterial({
        vertexShader: DOT_VERTEX,
        fragmentShader: DOT_FRAGMENT,
        uniforms: this.uniforms,
        transparent: true,
        depthWrite: false,
      }),
    );
    dots.frustumCulled = false;
    dots.name = `${this.data.name} dots`;
    dots.onBeforeRender = (renderer, _scene, camera) => this.prepare(renderer, camera);
    return dots;
  }

  /**
   * The dust: a flat ring a little wider than the rocks' orbits, or just a
   * Trojan swarm's arc (centred on angle 0, turned to its Lagrange point).
   */
  private createDust(
    colors: Record<AsteroidClass, THREE.Color>,
    pattern: THREE.DataTexture,
  ): THREE.Mesh<THREE.RingGeometry, THREE.ShaderMaterial> {
    const { data } = this;
    const half = dustArcHalfWidth(data);
    const ring =
      half === null
        ? new THREE.RingGeometry(data.inner * 0.97, data.outer * 1.03, 192, 6)
        : new THREE.RingGeometry(data.inner * 0.97, data.outer * 1.03, Math.max(12, Math.ceil((192 * half) / Math.PI)), 6, -half, 2 * half);
    // (x, y) to (x, 0, −y): the geometry's angle θ becomes −θ in atan(z, x), so the arc stays centred on 0.
    ring.rotateX(-Math.PI / 2);
    const { start, span } = pattern.userData as { start: number; span: number };
    const dust = new THREE.Mesh(
      ring,
      new THREE.ShaderMaterial({
        vertexShader: DUST_VERTEX,
        fragmentShader: DUST_FRAGMENT,
        uniforms: {
          uPattern: { value: pattern },
          uInner: { value: data.inner },
          uOuter: { value: data.outer },
          uColor: { value: evenLuminance(mixClasses(colors, data.classes), DUST_LUMINANCE) },
          uBrightness: { value: beltParams.dustBrightness },
          uFade: { value: new THREE.Vector2(beltParams.dustNear, beltParams.dustFar) },
          uArc: { value: new THREE.Vector2(start, span) },
        },
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        side: THREE.DoubleSide,
      }),
    );
    dust.name = `${data.name} dust`;
    // Whichever of the belt's objects is drawn first makes the choices for the frame.
    dust.onBeforeRender = (renderer, _scene, camera) => this.prepare(renderer, camera);
    return dust;
  }

  /**
   * Where `ray` meets the belt's mid-plane inside its edges (and a Trojan
   * swarm's arc): the distance along the ray, the point in `out`; else null.
   */
  hit(ray: THREE.Ray, out: THREE.Vector3): number | null {
    const { origin, direction } = ray;
    if (Math.abs(direction.y) < 1e-6) return null;
    const t = -origin.y / direction.y;
    if (t <= 0) return null;
    const p = this.plane.copy(origin).addScaledVector(direction, t);
    const r = Math.hypot(p.x, p.z);
    if (r < this.data.inner || r > this.data.outer) return null;
    const trojan = this.data.trojan;
    if (trojan) {
      const angle = Math.atan2(p.z, p.x);
      const off = Math.atan2(Math.sin(angle - this.arcCentre), Math.cos(angle - this.arcCentre));
      if (Math.abs(off) > trojan.libration * TROJAN_DUST_SPREAD) return null;
    }
    out.copy(p);
    this.renderPosition.copy(p);
    return t;
  }

  /** The named asteroid nearest `point` (flown to when the belt is clicked). */
  bodyNear(point: THREE.Vector3): CelestialBody | null {
    let best: Planet | null = null;
    let bestDistance = Infinity;
    for (const a of this.asteroids) {
      const d = a.renderPosition.distanceToSquared(point);
      if (d < bestDistance) {
        bestDistance = d;
        best = a;
      }
    }
    return best;
  }

  set visible(visible: boolean) {
    this.object.visible = visible;
  }

  dispose(): void {
    this.scene.remove(this.object);
    for (const batch of this.batches) {
      batch.mesh.geometry.dispose();
      batch.mesh.material.dispose();
    }
    this.dots.geometry.dispose();
    this.dots.material.dispose();
    this.dust.geometry.dispose();
    this.dust.material.dispose();
    this.dustPattern.dispose();
  }
}

/** What the renderers take for a named asteroid: an airless, sealess body with its shape, on its circular orbit. */
export function asteroidConfig(asteroid: AsteroidData): PlanetConfig {
  return {
    name: asteroid.name,
    type: 'barren',
    radius: asteroid.radius,
    seed: asteroid.seed,
    spin: asteroid.spin,
    orbit: asteroid.orbit,
    style: asteroid.style,
    tilt: asteroid.tilt,
    climate: null,
    shape: asteroid.shape,
    small: 'asteroid',
  };
}

/** The first of `rocks` (sorted by orbit radius) at `radius` or further out. */
function firstAtLeast(rocks: readonly RockData[], radius: number): number {
  let lo = 0;
  let hi = rocks.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (rocks[mid]!.radius < radius) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** The belt's baked dust pattern (see beltDust.ts), its angles in `userData`. */
function createDustTexture(data: BeltData): THREE.DataTexture {
  const half = dustArcHalfWidth(data);
  const around = half === null ? DUST_TEXELS_AROUND : Math.max(32, 2 ** Math.ceil(Math.log2((DUST_TEXELS_AROUND * half) / Math.PI)));
  const pattern = bakeDustPattern(data, around, DUST_TEXELS_ACROSS);
  const texture = new THREE.DataTexture(pattern.data, pattern.width, pattern.height, THREE.RedFormat, THREE.UnsignedByteType);
  texture.wrapS = pattern.wraps ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.userData = { start: pattern.start, span: pattern.span };
  texture.needsUpdate = true;
  return texture;
}

/** A rock mesh: a small cube sphere pushed out to an irregular shape (the last one a contact binary), lumpy, unit size. */
function rockGeometry(seed: number, index: number): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const binary = index === ROCK_MESHES - 1;
  const shape = generateShape(rng.fork('shape'), {
    lobes: binary ? 2 : 1,
    binary,
    elongation: index === 2 ? [1.8, 2.6] : [1.2, 1.7],
    craters: [1, 3],
  });
  const geometry = createCubeSphere(1, ROCK_SEGMENTS);
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const p = new THREE.Vector3();
  const noiseSeed = rng.int(0, 10_000);
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i).normalize();
    const r = shapeRadius(shape, p.x, p.y, p.z) * (1 + 0.12 * terrainNoise(p.x * 2, p.y * 2, p.z * 2, noiseSeed));
    position.setXYZ(i, p.x * r, p.y * r, p.z * r);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** Each class's rock colour (between its dark and light ground), jittered a little per belt. */
function classColors(seed: number): Record<AsteroidClass, THREE.Color> {
  const rng = new Rng(hashSeed(seed, 'colors'));
  const out = {} as Record<AsteroidClass, THREE.Color>;
  for (const kind of Object.keys(ASTEROID_COLORS) as AsteroidClass[]) {
    const c = ASTEROID_COLORS[kind];
    const h = rng.range(...c.hue) / 360;
    const s = rng.range(...c.sat);
    const l = (rng.range(...c.low) + rng.range(...c.high)) / 2;
    out[kind] = new THREE.Color().setHSL(h, s, l, THREE.SRGBColorSpace);
  }
  return out;
}

/** `color` scaled to relative luminance `luminance` (linear). */
function evenLuminance(color: THREE.Color, luminance: number): THREE.Color {
  const y = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
  return color.multiplyScalar(luminance / Math.max(y, 1e-4));
}

function mixClasses(colors: Record<AsteroidClass, THREE.Color>, classes: readonly AsteroidClass[]): THREE.Color {
  const c = new THREE.Color(0, 0, 0);
  for (const k of classes) c.add(colors[k]);
  return c.multiplyScalar(1 / Math.max(1, classes.length));
}

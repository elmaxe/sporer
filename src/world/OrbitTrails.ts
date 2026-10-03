import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';
import { orbitAngleOf } from '../gen/orbit';
import type { CelestialBody } from './CelestialBody';
import { isGas, type Planet } from './Planet';
import { VALUE_NOISE_GLSL } from './noiseGlsl';

export const orbitTrailParams = {
  /** How much of its orbit a trail covers, in turns. */
  length: 0.35,
  /** Peak opacity of a planet's trail. */
  opacity: 0.35,
  /** Peak opacity of the hovered or targeted body's trail. */
  highlight: 0.7,
  /** Peak opacity of a moon's trail near its planet. */
  moonOpacity: 0.3,
  /** Width at the body and at the tail's end, in body radii (the smoke spreads as it ages). */
  headWidth: 1.2,
  tailWidth: 4,
  /** Trails are drawn at least this many pixels wide (fainter when widened), so far ones still read. */
  minPixels: 3,
  /** Trails closer to the camera than this fade out (system units), so they never fill the view. */
  nearFade: 40,
  /**
   * Where a trail runs within this angle's sine of the line of sight it fades
   * out (gone at a quarter of it): seen end-on, a camera-facing ribbon fans out.
   */
  endOn: 0.5,
  /** Moon trails show when the camera is within this many of their planet's standoff distances. */
  moonRange: 5,
};

/** Segments along a trail; the geometry is shared, each trail's shape comes from its uniforms. */
const SEGMENTS = 128;
/** A trail fades out where its side turns by more than this from one segment to the next (degrees). */
const MAX_TWIST = 10;
/** How fast a trail eases to its new opacity (per second). */
const EASE_RATE = 8;
/** The smoke is mostly this neutral blue-grey, tinted by its body's colour. */
const SMOKE_COLOR = '#b4c2de';
const TINT = 0.35;

interface Trail {
  body: Planet;
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  opacity: number;
}

/**
 * A grey, smoky ribbon behind every planet (and every moon, near its
 * planet), along the arc of orbit it has just covered, so you can see the
 * path each body is taking. Its texture stays where the body left it and
 * slowly churns; the ribbon widens and thins towards the tail. The hovered or
 * targeted body's trail is brighter.
 *
 * Each trail is a camera-facing ribbon placed along the orbit in the vertex
 * shader from the body's current angle, so all trails share one static
 * geometry and only a few uniforms change per frame.
 */
export class OrbitTrails implements Entity {
  private readonly root = new THREE.Group();
  private readonly geometry = createRibbon(SEGMENTS);
  private readonly planetTrails: Trail[];
  private readonly moonTrails: Trail[];
  /** Shared by every trail's material. */
  private readonly shared = {
    time: { value: 0 },
    /** World units per pixel at distance 1, times the minimum width in pixels. */
    minWidth: { value: 0 },
    nearFade: { value: orbitTrailParams.nearFade },
    endOn: { value: orbitTrailParams.endOn },
    span: { value: orbitTrailParams.length * Math.PI * 2 },
  };
  private readonly scratch = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    planets: readonly Planet[],
    moons: readonly Planet[],
    /** Whether a body's trail should stand out (e.g. hovered or the autopilot's target). */
    private readonly highlighted: (body: CelestialBody) => boolean,
    debug: Debug,
  ) {
    this.root.name = 'Orbit trails';
    this.planetTrails = planets.map((p) => this.createTrail(p));
    this.moonTrails = moons.map((m) => this.createTrail(m));
    scene.add(this.root);

    const f = debug.folder('Orbit trails');
    f?.add(orbitTrailParams, 'length', 0.05, 1);
    f?.add(orbitTrailParams, 'opacity', 0, 1);
    f?.add(orbitTrailParams, 'highlight', 0, 1);
    f?.add(orbitTrailParams, 'moonOpacity', 0, 1);
    f?.add(orbitTrailParams, 'headWidth', 0.1, 4);
    f?.add(orbitTrailParams, 'tailWidth', 0.1, 10);
    f?.add(orbitTrailParams, 'minPixels', 0, 10);
    f?.add(orbitTrailParams, 'nearFade', 0, 200);
    f?.add(orbitTrailParams, 'endOn', 0, 1);
    f?.add(orbitTrailParams, 'moonRange', 1, 20);
    f?.add(this.root, 'visible').name('show');
  }

  /** Hides or shows every trail (the planet level's sky leaves them out). */
  set visible(visible: boolean) {
    this.root.visible = visible;
  }

  get visible(): boolean {
    return this.root.visible;
  }

  /** Trails currently drawn (for tests). */
  get visibleCount(): number {
    let n = 0;
    for (const t of [...this.planetTrails, ...this.moonTrails]) if (t.mesh.visible) n++;
    return n;
  }

  get count(): number {
    return this.planetTrails.length + this.moonTrails.length;
  }

  update(frameDt: number): void {
    const p = orbitTrailParams;
    const s = this.shared;
    s.time.value += frameDt;
    s.nearFade.value = p.nearFade;
    s.endOn.value = p.endOn;
    s.span.value = p.length * Math.PI * 2;
    s.minWidth.value = (p.minPixels * 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)) / innerHeight;

    const ease = 1 - Math.exp(-EASE_RATE * frameDt);
    for (const t of this.planetTrails) {
      this.place(t, t.body.renderPosition);
      this.ease(t, this.highlighted(t.body) ? p.highlight : p.opacity, ease);
    }
    for (const t of this.moonTrails) {
      const parent = t.body.parent!;
      t.mesh.position.copy(parent.renderPosition);
      this.place(t, this.scratch.subVectors(t.body.renderPosition, parent.renderPosition));
      const range = parent.standoff * p.moonRange;
      const distance = this.camera.position.distanceTo(parent.renderPosition);
      const near = 1 - THREE.MathUtils.smoothstep(distance, range, range * 2);
      this.ease(t, this.highlighted(t.body) ? p.highlight : p.moonOpacity * near, ease);
    }
  }

  dispose(): void {
    this.scene.remove(this.root);
    this.geometry.dispose();
    for (const { mesh } of [...this.planetTrails, ...this.moonTrails]) mesh.material.dispose();
  }

  /** Points the trail's head at where the body is drawn (relative to its orbit's centre). */
  private place(t: Trail, relative: THREE.Vector3): void {
    const u = t.mesh.material.uniforms;
    u.angle!.value = orbitAngleOf(t.body.config.orbit, relative);
    u.headWidth!.value = t.body.radius * orbitTrailParams.headWidth;
    u.tailWidth!.value = t.body.radius * orbitTrailParams.tailWidth;
  }

  private ease(t: Trail, target: number, ease: number): void {
    t.opacity += (target - t.opacity) * ease;
    t.mesh.material.uniforms.opacity!.value = t.opacity;
    t.mesh.visible = t.opacity > 0.003;
  }

  private createTrail(body: Planet): Trail {
    const { config } = body;
    const tint = config.atmosphere ?? (isGas(config) ? config.bands[config.bands.length >> 1]! : config.style.high);
    const reach = Math.max(body.radius, config.rings?.outer ?? 0);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        ...this.shared,
        color: { value: new THREE.Color(SMOKE_COLOR).lerp(new THREE.Color(tint), TINT) },
        opacity: { value: 0 },
        angle: { value: 0 },
        radius: { value: config.orbit.radius },
        inclination: { value: config.orbit.inclination },
        node: { value: config.orbit.node ?? 0 },
        headWidth: { value: 1 },
        tailWidth: { value: 1 },
        // Live reference: the smoke thins out where it meets its body (and rings).
        body: { value: body.renderPosition },
        reach: { value: reach },
        // Each trail's smoke has its own pattern.
        seed: { value: (config.seed % 1000) * 0.37 },
      },
      vertexShader: TRAIL_VERTEX,
      fragmentShader: TRAIL_FRAGMENT,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.geometry, material);
    mesh.name = `${body.name} trail`;
    mesh.frustumCulled = false;
    mesh.visible = false;
    this.root.add(mesh);
    return { body, mesh, opacity: 0 };
  }
}

/** A strip of quads: `trail` = (t from the head 0 to the tail 1, side −1..1). */
function createRibbon(segments: number): THREE.BufferGeometry {
  const trail = new Float32Array((segments + 1) * 2 * 2);
  const index: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    trail.set([t, -1, t, 1], i * 4);
    if (i < segments) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('trail', new THREE.BufferAttribute(trail, 2));
  // Unused by the shader, but THREE expects a position attribute (e.g. for the draw range).
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array((segments + 1) * 2 * 3), 3));
  geometry.setIndex(index);
  return geometry;
}

const TRAIL_VERTEX = /* glsl */ `
  attribute vec2 trail;
  uniform float angle;
  uniform float span;
  uniform float radius;
  uniform float inclination;
  uniform float node;
  uniform float headWidth;
  uniform float tailWidth;
  uniform float minWidth;
  varying vec2 vTrail;
  varying float vAngle;
  varying float vWidth;
  varying float vThin;
  varying float vAcross;
  varying float vSteady;
  varying vec3 vWorld;

  // A point on the orbit at angle a, in world space, and the orbit's direction there.
  vec3 orbitPoint(float a, out vec3 tangent) {
    float si = sin(inclination);
    float ci = cos(inclination);
    // Turned about +Y by the node (Orbit.node).
    mat3 turn = mat3(cos(node), 0.0, -sin(node), 0.0, 1.0, 0.0, sin(node), 0.0, cos(node));
    tangent = normalize(mat3(modelMatrix) * (turn * vec3(-sin(a), cos(a) * si, cos(a) * ci)));
    return (modelMatrix * vec4(turn * (radius * vec3(cos(a), sin(a) * si, sin(a) * ci)), 1.0)).xyz;
  }

  // Across the orbit at angle a, perpendicular to the view; its length is the
  // sine of the angle between the orbit and the line of sight.
  vec3 acrossAt(float a) {
    vec3 tangent;
    vec3 p = orbitPoint(a, tangent);
    return cross(tangent, normalize(cameraPosition - p));
  }

  void main() {
    float t = trail.x;
    // Back along the orbit from the body (orbits run towards increasing angle).
    float a = angle - t * span;
    vec3 tangent;
    vec3 world = orbitPoint(a, tangent);

    // Face the camera: spread across the orbit, perpendicular to the view.
    vec3 toCamera = cameraPosition - world;
    vec3 across = cross(tangent, normalize(toCamera));
    vAcross = length(across);
    // No width where it points straight at the camera.
    vec3 side = across / max(vAcross, 1e-6);
    // Where the orbit runs along the line of sight the side turns over within
    // a few segments, and the quads fan out into a star or cross over each
    // other: fade the ribbon wherever it twists that fast.
    float segment = span / ${SEGMENTS}.0;
    vec3 before = acrossAt(a + segment);
    vec3 after = acrossAt(a - segment);
    float turn = min(dot(side, before / max(length(before), 1e-6)), dot(side, after / max(length(after), 1e-6)));
    vSteady = smoothstep(${Math.cos(THREE.MathUtils.degToRad(MAX_TWIST)).toFixed(4)}, ${Math.cos(THREE.MathUtils.degToRad(MAX_TWIST / 3)).toFixed(4)}, turn);
    float w = mix(headWidth, tailWidth, t);
    float width = max(w, minWidth * length(toCamera));
    world += side * trail.y * width * 0.5;

    vTrail = trail;
    vAngle = a;
    vWidth = width;
    // Trails widened to the minimum on-screen width are fainter, like a thin wisp.
    vThin = sqrt(w / width);
    vWorld = world;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }`;

const TRAIL_FRAGMENT = /* glsl */ `
  uniform vec3 color;
  uniform float opacity;
  uniform float radius;
  uniform float headWidth;
  uniform float time;
  uniform float seed;
  uniform vec3 body;
  uniform float reach;
  uniform float nearFade;
  uniform float endOn;
  varying vec2 vTrail;
  varying float vAngle;
  varying float vWidth;
  varying float vThin;
  varying float vAcross;
  varying float vSteady;
  varying vec3 vWorld;
  ${VALUE_NOISE_GLSL}

  void main() {
    float t = vTrail.x;
    float s = vTrail.y;
    // Noise anchored along the orbit (round the circle, so it never jumps) in
    // units of the head's width: the texture stays where the body left it,
    // stretches as the trail widens, and churns slowly.
    float scale = radius / (headWidth * 1.6);
    vec3 p = vec3(cos(vAngle) * scale, sin(vAngle) * scale, s * vWidth / (headWidth * 1.6));
    p += vec3(seed, seed * 0.7, time * 0.06);
    float n = fbm(p, 4);
    float wisps = fbm(p * 3.1 + vec3(0.0, 0.0, time * 0.1), 3);

    // Ragged edges: the noise eats into the ribbon, more so towards the tail.
    float edge = 1.0 - smoothstep(0.35 - 0.2 * t, 1.0, abs(s) + (n - 0.5) * (0.5 + 0.6 * t));
    float density = smoothstep(0.2, 0.75, n * 0.75 + wisps * 0.35 + 0.2 * (1.0 - t));
    // Fades in just behind the body and thins out along the tail.
    float fade = smoothstep(0.0, 0.04, t) * pow(1.0 - t, 1.4);
    float gap = smoothstep(reach * 0.9, reach * 1.6, distance(vWorld, body));
    float near = smoothstep(nearFade * 0.2, nearFade, distance(vWorld, cameraPosition));
    float sideways = smoothstep(endOn * 0.25, endOn, vAcross) * vSteady;

    float a = opacity * edge * density * fade * gap * near * sideways * vThin;
    gl_FragColor = vec4(color, a);
    #include <colorspace_fragment>
  }`;

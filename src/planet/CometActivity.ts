import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';
import { cometVents, type CometVent } from '../gen/comets';
import { Rng, hashSeed } from '../gen/rng';
import type { ShapeData } from '../gen/shape';
import { ATMOSPHERE_RENDER_ORDER, AFTER_ATMOSPHERE_RENDER_ORDER } from '../world/atmosphereShell';
import type { RenderClock } from './PlanetFrame';

/** Tunables (debug folder `Comet activity`). */
export const cometActivityParams = {
  /** Particles per vent. */
  particles: 360,
  /** Seconds a jet particle lives (each one between 0.7× and 1.3× this). */
  life: 6,
  /** How far the fastest particles get in a lifetime, in nucleus radii. */
  reach: 3,
  /** Particle size at the vent, in nucleus radii (they grow 4× as they spread). */
  size: 0.035,
  opacity: 0.55,
  /** Anti-sunward push on the dust over a lifetime, in nucleus radii (radiation pressure bends the jets back). */
  push: 0.8,
  /** The coma's radius, in nucleus radii, and its brightness when fully active. */
  comaRadii: 14,
  coma: 0.06,
  /** The tails' brightness seen from inside, fully active. */
  tails: 0.2,
};

/** Largest a jet particle is drawn, pixels. */
const MAX_POINT_SIZE = 64;

const jetVertex = /* glsl */ `
  attribute vec3 aOrigin;  // the vent on the ground (body frame)
  attribute vec4 aAxis;    // the jet's axis (the ground's normal) and its cone's half-angle
  attribute vec4 aSeed;    // phase in its cycle, two random numbers, the vent's strength
  uniform float uTime;
  uniform float uLife;
  uniform float uSpeed;
  uniform float uPush;
  uniform float uSize;
  uniform float uScale;    // pixels per unit at distance 1
  uniform float uOpacity;
  uniform float uStrength; // the comet's activity, 0–1
  uniform vec3 uSun;
  uniform vec3 uSunLight;
  uniform vec3 uAmbient;
  varying vec3 vColor;
  varying float vAlpha;

  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  }

  void main() {
    // Each particle loops forever, re-thrown with a new direction and speed every cycle.
    float life = uLife * (0.7 + 0.6 * aSeed.y);
    float t = uTime / life + aSeed.x;
    float cycle = floor(t);
    float a = t - cycle;
    float age = a * life;
    vec3 key = vec3(cycle, aSeed.y * 91.7, aSeed.z * 53.3);
    float h1 = hash(key);
    float h2 = hash(key + 1.7);
    float h3 = hash(key + 3.1);
    float h4 = hash(key + 5.3);

    // Only vents in sunlight blow, as hard as the comet is active: a thinner jet when weaker.
    vec3 axis = aAxis.xyz;
    float sunlit = smoothstep(-0.05, 0.35, dot(axis, uSun));
    float on = step(h4, uStrength * aSeed.w * sunlit);
    if (on < 0.5) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // off screen
      gl_PointSize = 0.0;
      vAlpha = 0.0;
      return;
    }

    vec3 t1 = normalize(cross(axis, abs(axis.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
    vec3 t2 = cross(axis, t1);
    float angle = aAxis.w * sqrt(h1);
    float turn = 6.2831853 * h2;
    vec3 dir = axis * cos(angle) + (t1 * cos(turn) + t2 * sin(turn)) * sin(angle);
    // No gravity worth the name on a nucleus: straight out, the dust pushed away from the sun.
    vec3 p = aOrigin + dir * (uSpeed * (0.45 + 0.55 * h3) * age) - uSun * (uPush * a * a);

    vColor = vec3(0.92, 0.9, 0.86) * (uAmbient + uSunLight * (1.0 + 2.0 * pow(max(dot(normalize(p - cameraPosition), uSun), 0.0), 6.0)));
    vAlpha = uOpacity * aSeed.w * smoothstep(0.0, 0.04, a) * pow(1.0 - a, 1.5);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(uSize * (1.0 + 3.0 * a) * uScale / -mv.z, 1.0, ${MAX_POINT_SIZE.toFixed(1)});
  }
`;

const jetFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float d = dot(c, c);
    if (d > 1.0) discard;
    gl_FragColor = vec4(vColor, vAlpha * exp(-3.0 * d));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/*
 * The coma and the tails as seen from inside them. The coma is gas and dust
 * thinning out as 1/r² from the nucleus, drawn as the column along each view
 * ray inside a sphere round it, the density taken to 0 at the sphere's edge
 * so it has none; brighter looking towards the sun (dust scatters forwards).
 * The tails stream away from the sun, so from the nucleus they're glows
 * converging on the point opposite it: the narrow blue ion tail straight
 * there, the broader warm dust tail bent back along the orbit, both
 * streaked. Drawn on the far side of the sphere with the depth test on, so
 * the dark nucleus stands out against them.
 */
const comaVertex = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const comaFragment = /* glsl */ `
  uniform vec3 uCentre;
  uniform float uRadius;   // the coma's edge
  uniform float uInner;    // about the nucleus's size: the density stops growing inside it
  uniform float uBrightness;
  uniform float uTails;
  uniform vec3 uSun;
  uniform vec3 uBack;      // opposite the direction of travel
  uniform vec3 uColor;
  uniform vec3 uIonColor;
  uniform vec3 uDustColor;
  uniform float uTime;
  varying vec3 vWorld;

  // ∫ (1/(b² + s²) − 1/R²) ds from 0 to s.
  float column(float s, float b, float R) {
    return atan(s / b) / b - s / (R * R);
  }

  // A glow round unit direction 'axis', 'width' radians wide, streaked by the angle round it.
  float streamer(vec3 ray, vec3 axis, float width, float streaks, float contrast, float drift) {
    float x = 1.0 - dot(ray, axis); // ≈ angle² / 2
    vec3 t1 = normalize(cross(axis, abs(axis.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
    vec3 t2 = cross(axis, t1);
    float turn = atan(dot(ray, t2), dot(ray, t1));
    float streak = 1.0 + contrast * sin(turn * streaks + 2.0 * sin(turn * 5.0 + drift));
    return exp(-x / (0.5 * width * width)) * streak;
  }

  void main() {
    vec3 ray = normalize(vWorld - cameraPosition);
    vec3 toCentre = uCentre - cameraPosition;
    float along = dot(toCentre, ray);
    float b = max(length(toCentre - ray * along), uInner);
    float R = uRadius;
    float half_ = sqrt(max(R * R - b * b, 0.0));
    // From where the ray enters the sphere (or the camera, inside it) to where it leaves, about the closest point.
    float s0 = max(-half_, -along);
    float s1 = half_;
    float c = min(max(column(s1, b, R) - column(s0, b, R), 0.0) * uInner, 3.0);
    float forward = 1.0 + 2.0 * pow(max(dot(ray, uSun), 0.0), 4.0);
    vec3 glow = uColor * (uBrightness * forward * c);

    vec3 away = -uSun;
    vec3 dust = normalize(away + 0.45 * uBack);
    glow += uTails * (uIonColor * streamer(ray, away, 0.08, 31.0, 0.35, uTime * 0.2) + 0.5 * uDustColor * streamer(ray, dust, 0.32, 9.0, 0.15, 0.0));
    gl_FragColor = vec4(glow, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * A comet's activity in low orbit (gen/comets.ts): jets of gas and dust from
 * vents on the sunlit side, along the ground's normal, the coma round the
 * nucleus and its tails seen from inside, all as strong as the comet is
 * active (`strength`, from its distance to the star: 1/r², off far out). The jets are one static `Points`
 * whose particles loop in the vertex shader, re-thrown each cycle, so they
 * depend only on the clock and nothing is uploaded per frame.
 */
export class CometActivity implements Entity {
  readonly vents: CometVent[];
  readonly jets: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  readonly coma: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  /** The comet's activity at the last update, 0–1. */
  strength = 0;
  /**
   * Unit direction opposite the comet's travel (body frame), where the dust
   * tail bends: kept up to date by the owner (the planet level from the orbit).
   */
  readonly back = new THREE.Vector3(1, 0, 0);
  /** Unit direction to the sun (body frame; the globe's, kept up to date by the lights). */
  readonly sun: THREE.Vector3;
  private readonly drawingSize = new THREE.Vector2();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly clock: RenderClock,
    seed: number,
    shape: ShapeData,
    /** The nucleus's radius (its longest reach), planet units. */
    private readonly radius: number,
    /** The ground's radius in a unit direction, as drawn. */
    ground: (dir: THREE.Vector3) => number,
    sun: THREE.Vector3,
    sunLight: THREE.Color,
    ambientLight: THREE.Color,
    /** The comet's activity now, 0–1. */
    private readonly activity: () => number,
    /** Its tails' colours (CometData's). */
    colors: { ion: string; dust: string },
    debug: Debug,
  ) {
    this.sun = sun;
    this.vents = cometVents(seed, shape);
    const per = cometActivityParams.particles;
    const count = this.vents.length * per;
    const origin = new Float32Array(count * 3);
    const axis = new Float32Array(count * 4);
    const seeds = new Float32Array(count * 4);
    const rng = new Rng(hashSeed(seed, 'jets'));
    const dir = new THREE.Vector3();
    this.vents.forEach((vent, v) => {
      dir.fromArray(vent.dir);
      const base = ground(dir);
      for (let k = 0; k < per; k++) {
        const i = v * per + k;
        origin.set([dir.x * base, dir.y * base, dir.z * base], i * 3);
        axis.set([...vent.normal, vent.spread], i * 4);
        seeds.set([rng.next(), rng.next(), rng.next(), vent.strength], i * 4);
      }
    });
    const geometry = new THREE.BufferGeometry();
    // Unused, but three needs a position attribute to know the draw count.
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute('aOrigin', new THREE.BufferAttribute(origin, 3));
    geometry.setAttribute('aAxis', new THREE.BufferAttribute(axis, 4));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    this.jets = new THREE.Points(
      geometry,
      new THREE.ShaderMaterial({
        vertexShader: jetVertex,
        fragmentShader: jetFragment,
        uniforms: {
          uTime: { value: 0 },
          uLife: { value: 1 },
          uSpeed: { value: 1 },
          uPush: { value: 0 },
          uSize: { value: 1 },
          uScale: { value: 1 },
          uOpacity: { value: 1 },
          uStrength: { value: 0 },
          uSun: { value: sun },
          uSunLight: { value: sunLight },
          uAmbient: { value: ambientLight },
        },
        transparent: true,
        depthWrite: false,
      }),
    );
    this.jets.name = 'Comet jets';
    // Positions come from the shader.
    this.jets.frustumCulled = false;
    this.jets.renderOrder = AFTER_ATMOSPHERE_RENDER_ORDER;
    this.jets.onBeforeRender = (renderer, _scene, camera) => {
      renderer.getDrawingBufferSize(this.drawingSize);
      const proj = (camera as THREE.PerspectiveCamera).projectionMatrix.elements[5]!;
      this.jets.material.uniforms.uScale!.value = this.drawingSize.y * 0.5 * proj;
    };

    this.coma = new THREE.Mesh(
      new THREE.SphereGeometry(1, 48, 24),
      new THREE.ShaderMaterial({
        vertexShader: comaVertex,
        fragmentShader: comaFragment,
        uniforms: {
          uCentre: { value: new THREE.Vector3() },
          uRadius: { value: 1 },
          uInner: { value: radius * 0.6 },
          uBrightness: { value: 0 },
          uTails: { value: 0 },
          uSun: { value: sun },
          uBack: { value: this.back },
          uColor: { value: new THREE.Color('#cfe4ff') },
          uIonColor: { value: new THREE.Color(colors.ion) },
          uDustColor: { value: new THREE.Color(colors.dust) },
          uTime: { value: 0 },
        },
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.coma.name = 'Coma';
    this.coma.renderOrder = ATMOSPHERE_RENDER_ORDER;
    scene.add(this.jets, this.coma);

    const f = debug.folder('Comet activity');
    f?.add(cometActivityParams, 'life', 1, 15);
    f?.add(cometActivityParams, 'reach', 0.5, 8);
    f?.add(cometActivityParams, 'size', 0.005, 0.15);
    f?.add(cometActivityParams, 'opacity', 0, 2);
    f?.add(cometActivityParams, 'push', 0, 4);
    f?.add(cometActivityParams, 'comaRadii', 3, 40);
    f?.add(cometActivityParams, 'coma', 0, 1);
    f?.add(cometActivityParams, 'tails', 0, 2);
    this.update();
  }

  update(): void {
    const p = cometActivityParams;
    const strength = (this.strength = this.activity());
    const R = this.radius;
    const u = this.jets.material.uniforms;
    u.uTime!.value = this.clock.renderTime;
    u.uLife!.value = p.life;
    u.uSpeed!.value = (p.reach * R) / p.life;
    u.uPush!.value = p.push * R;
    u.uSize!.value = p.size * R;
    u.uOpacity!.value = p.opacity;
    u.uStrength!.value = strength;
    this.jets.visible = strength > 0;

    const c = this.coma.material.uniforms;
    const comaRadius = p.comaRadii * R;
    this.coma.scale.setScalar(comaRadius);
    c.uRadius!.value = comaRadius;
    c.uBrightness!.value = p.coma * strength;
    c.uTails!.value = p.tails * strength;
    c.uTime!.value = this.clock.renderTime;
    this.coma.visible = strength > 0;
  }

  dispose(): void {
    this.scene.remove(this.jets, this.coma);
    this.jets.geometry.dispose();
    this.jets.material.dispose();
    this.coma.geometry.dispose();
    this.coma.material.dispose();
  }
}

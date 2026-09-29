import * as THREE from 'three';
import { Rng } from '../gen/rng';
import {
  maxStormParticles,
  stormEvent,
  stormSlots,
  type StarActivity,
  type StormEvent,
  type StormKind,
} from '../gen/starActivity';

export const stormParams = {
  /** Particle size in star radii. */
  particleSize: 0.05,
  brightness: 1.4,
};

const KINDS: readonly StormKind[] = ['prominence', 'flare'];
/**
 * A clock jump forward by more than this, or back by more than `MAX_BACK`
 * (e.g. handing over between the system level and the planet level's sky),
 * rebuilds the pool from the events alive now.
 */
const MAX_STEP = 2;
const MAX_BACK = 0.1;

const vertexShader = /* glsl */ `
  attribute vec4 aTime;   // start, life, kind (0 prominence, 1 flare), random
  attribute vec3 aA;      // prominence: footpoint A; flare: origin
  attribute vec3 aB;      // prominence: footpoint B; flare: particle direction
  attribute vec4 aC;      // prominence: arc position, height, lateral, flow; flare: speed, -, size, -
  uniform float uTime;
  uniform float uRadius;
  uniform float uSize;
  uniform float uScale;   // pixels per unit at distance 1
  varying float vAlpha;
  varying float vHeat;
  varying float vKind;

  void main() {
    vKind = aTime.z;
    float age = uTime - aTime.x;
    float a = age / max(aTime.y, 1e-3);
    vec3 p;
    float size = uSize;
    if (a < 0.0 || a > 1.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // off screen
      gl_PointSize = 0.0;
      vAlpha = 0.0;
      return;
    }
    if (aTime.z < 0.5) {
      // Prominence: plasma flowing along a magnetic loop that rises, hangs and falls back.
      float rise = smoothstep(0.0, 0.3, a);
      float fall = 1.0 - smoothstep(0.7, 1.0, a);
      float u = fract(aC.x + age * aC.w);
      float arch = sin(3.14159265 * u);
      vec3 dir = normalize(mix(aA, aB, u));
      vec3 side = normalize(cross(aA, aB) + 1e-5);
      float h = aC.y * min(rise, fall);
      p = dir * (1.0 + h * arch) + side * aC.z * (0.3 + arch) * 0.05;
      // Many strands overlap, so each is faint (additive).
      vAlpha = 0.12 * min(rise * 2.0, 1.0) * fall * (0.35 + 0.65 * arch);
      vHeat = 0.3 * (1.0 - arch);
    } else {
      // Flare / CME: a burst flying out along a cone, fading as it spreads.
      float dist = aC.x * age * (1.0 - 0.35 * a);
      p = aA * 1.0 + aB * dist;
      size *= aC.z * (1.0 + 2.0 * a);
      vAlpha = 0.35 * pow(1.0 - a, 1.5) * (0.4 + 0.6 * aTime.w);
      vHeat = 1.0 - a;
    }
    vec4 mv = modelViewMatrix * vec4(p * uRadius, 1.0);
    // In front of the bright disc, plasma shows far less than against space
    // (those behind it are hidden by the depth test).
    vec4 centre = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vec2 off = mv.xy - centre.xy * (mv.z / centre.z);
    vAlpha *= mix(1.0, 0.35, 1.0 - smoothstep(0.9, 1.05, length(off) / uRadius));
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(size * uRadius * uScale / -mv.z, 1.5, 48.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uBrightness;
  varying float vAlpha;
  varying float vHeat;
  varying float vKind;

  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float d = dot(c, c);
    if (d > 1.0) discard;
    float soft = (1.0 - d) * (1.0 - d);
    // Prominences glow a hotter, redder shade of the star (like H-alpha); flares start white-hot.
    vec3 base = vKind < 0.5 ? mix(uColor, vec3(1.0, 0.25, 0.2), 0.5) : uColor * 1.2;
    vec3 col = mix(base, vec3(1.0), vHeat * 0.6);
    gl_FragColor = vec4(col * soft * vAlpha * uBrightness, 1.0);
    #include <colorspace_fragment>
  }
`;

/**
 * A star's storms: one pooled `Points` animated entirely in the vertex
 * shader. Each event writes its particles into the next free run of the pool
 * (a ring buffer); only those attribute ranges are re-uploaded. Events come
 * from the star's seeded slot grid (gen/starActivity.ts), so what's on screen
 * depends only on the clock.
 */
export class StarStorms {
  readonly points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly time: THREE.BufferAttribute;
  private readonly a: THREE.BufferAttribute;
  private readonly b: THREE.BufferAttribute;
  private readonly c: THREE.BufferAttribute;
  private readonly size: number;
  private cursor = 0;
  /** Next slot to spawn, per kind. */
  private readonly next = new Map<StormKind, number>();
  private last = Number.NaN;
  private readonly drawingSize = new THREE.Vector2();

  constructor(
    private readonly activity: StarActivity,
    private readonly seed: number,
    radius: number,
    color: THREE.ColorRepresentation,
  ) {
    this.size = Math.max(64, maxStormParticles(activity));
    const geometry = new THREE.BufferGeometry();
    const attr = (itemSize: number) => {
      const a = new THREE.BufferAttribute(new Float32Array(this.size * itemSize), itemSize);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.time = attr(4);
    this.a = attr(3);
    this.b = attr(3);
    this.c = attr(4);
    // Unused, but three needs a position attribute to know the draw count.
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.size * 3), 3));
    geometry.setAttribute('aTime', this.time);
    geometry.setAttribute('aA', this.a);
    geometry.setAttribute('aB', this.b);
    geometry.setAttribute('aC', this.c);

    this.points = new THREE.Points(
      geometry,
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uTime: { value: 0 },
          uRadius: { value: radius },
          uSize: { value: stormParams.particleSize },
          uScale: { value: 1 },
          uColor: { value: new THREE.Color(color) },
          uBrightness: { value: stormParams.brightness },
        },
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
    this.points.name = 'Star storms';
    // Positions come from the shader, so the bounding sphere can't be known.
    this.points.frustumCulled = false;
    // Pixel scale for the camera actually drawing it (the planet level's sky camera too).
    this.points.onBeforeRender = (renderer, _scene, camera) => {
      renderer.getDrawingBufferSize(this.drawingSize);
      const proj = (camera as THREE.PerspectiveCamera).projectionMatrix.elements[5]!;
      this.points.material.uniforms.uScale!.value = this.drawingSize.y * 0.5 * proj;
    };
  }

  /** Pool size in particles. */
  get capacity(): number {
    return this.size;
  }

  /** Particles under way at the last `update` (debugging and the smoke test; loops over the pool). */
  get liveParticles(): number {
    const t = this.time.array;
    let n = 0;
    for (let i = 0; i < t.length; i += 4) if (this.last >= t[i]! && this.last < t[i]! + t[i + 1]!) n++;
    return n;
  }

  /** System time the storms were last shown at. */
  get shownTime(): number {
    return this.last;
  }

  /** Shows the storms at system time `time`, spawning the events that have come up. */
  update(time: number): void {
    const u = this.points.material.uniforms;
    u.uTime!.value = time;
    u.uSize!.value = stormParams.particleSize;
    u.uBrightness!.value = stormParams.brightness;

    const jumped = !(time >= this.last - MAX_BACK && time - this.last <= MAX_STEP);
    if (jumped) this.reset(time);
    this.last = time;
    for (const kind of KINDS) {
      const spec = this.activity[kind];
      let slot = this.next.get(kind)!;
      // Spawn a slot as soon as it opens; its event may start later in the slot (the shader waits).
      for (; slot * spec.interval <= time; slot++) {
        const event = stormEvent(this.activity, this.seed, kind, slot);
        if (event) this.write(event);
      }
      this.next.set(kind, slot);
    }
    if (jumped) {
      // Upload the whole pool: the cleared lifetimes as well as what was just spawned.
      for (const attr of [this.time, this.a, this.b, this.c]) {
        attr.clearUpdateRanges();
        attr.needsUpdate = true;
      }
    }
  }

  /** Empties the pool and spawns every event that could still be alive at `time`. */
  private reset(time: number): void {
    this.time.array.fill(0);
    this.cursor = 0;
    for (const kind of KINDS) this.next.set(kind, stormSlots(this.activity[kind], time, time)[0]);
  }

  private write(event: StormEvent): void {
    const n = Math.min(event.particles, this.size);
    const rng = new Rng(event.seed);
    const kind = event.kind === 'prominence' ? 0 : 1;
    const [ox, oy, oz] = event.origin;
    const t = this.time.array as Float32Array;
    const a = this.a.array as Float32Array;
    const b = this.b.array as Float32Array;
    const c = this.c.array as Float32Array;
    for (let k = 0; k < n; k++) {
      const i = (this.cursor + k) % this.size;
      t.set([event.start, event.life, kind, rng.next()], i * 4);
      a.set(event.origin, i * 3);
      if (kind === 0) {
        b.set(event.end, i * 3);
        // Arc position, height (varies by strand), lateral offset, flow speed along the loop.
        c.set(
          [rng.next(), event.size * rng.range(0.75, 1.1), rng.range(-1, 1), rng.range(0.03, 0.09) * rng.sign()],
          i * 4,
        );
      } else {
        // Direction: the origin tilted by up to the cone angle, about a random axis.
        const spread = event.size * Math.sqrt(rng.next());
        let x = ox + rng.range(-1, 1) * spread;
        let y = oy + rng.range(-1, 1) * spread;
        let z = oz + rng.range(-1, 1) * spread;
        const l = Math.hypot(x, y, z);
        x /= l;
        y /= l;
        z /= l;
        this.b.setXYZ(i, x, y, z);
        // 1 in 8 particles stays behind as the bright flash at the footpoint.
        const flash = rng.chance(0.125);
        c.set([flash ? 0 : event.speed * rng.range(0.4, 1.2), 0, flash ? 2 : rng.range(0.6, 1.4), 0], i * 4);
      }
    }
    this.markRange(this.cursor, n);
    this.cursor = (this.cursor + n) % this.size;
  }

  /** Uploads particles [start, start + n) of the ring (wrapping around the end). */
  private markRange(start: number, n: number): void {
    const first = Math.min(n, this.size - start);
    for (const attr of [this.time, this.a, this.b, this.c]) {
      attr.addUpdateRange(start * attr.itemSize, first * attr.itemSize);
      if (n > first) attr.addUpdateRange(0, (n - first) * attr.itemSize);
      attr.needsUpdate = true;
    }
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}

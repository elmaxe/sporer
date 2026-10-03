import * as THREE from 'three';
import type { CometData } from '../gen/comets';
import { keplerPosition } from '../gen/orbit';
import { ATMOSPHERE_RENDER_ORDER } from './atmosphereShell';
import type { Planet, PlanetConfig } from './Planet';

export const cometParams = {
  /** Distance (in habitable radii) at which the tail is at `tailLength`; it scales with 1/r². */
  activeDistance: 1.2,
  tailLength: 140,
  maxTailLength: 320,
  tailWidth: 7,
  /** How far the dust tail curves back along the orbit, relative to its length. */
  dustCurve: 0.35,
  /**
   * The tails fade out closer than this to the camera (system units, from
   * the first to the second), so a camera right by the nucleus sees them
   * stream away instead of filling the view.
   */
  nearFade: [2, 24] as [number, number],
};

/** Segments along each tail ribbon. */
const SEGMENTS = 32;
/** Time step used to estimate the direction of travel. */
const VELOCITY_DT = 0.25;
/** The dust tail is shorter and wider than the ion tail. */
const DUST_LENGTH = 0.75;
const ION_WIDTH = 0.6;
/**
 * The tails fade out as the line of sight comes within these sines of the
 * tail's direction (about 6° to 27°), where the end-on glow fades in.
 */
const END_ON_FADE = [0.1, 0.45] as const;
/** The end-on glow's size, in tail widths. */
const END_ON_SIZE = 4;
/**
 * The glows are drawn after the system's other see-through things (the belts'
 * far rocks, planets' rings), which sort from their centres like the tails (at
 * the star, as the shader places them) and would otherwise paint over them, and
 * before the atmospheres, clouds and ship. They add light, so anything drawn
 * before them shows through.
 */
const GLOW_RENDER_ORDER = ATMOSPHERE_RENDER_ORDER / 2;

/*
 * Both tails are ribbons in one mesh (one draw call per comet), bent and
 * billboarded in the vertex shader. `aTail` picks the ribbon: 0 = the straight
 * ion tail, 1 = the curved dust tail. Uniform vec2s hold (ion, dust) values.
 */
const tailVertex = /* glsl */ `
  const vec2 END_ON_FADE = vec2(${END_ON_FADE[0].toFixed(3)}, ${END_ON_FADE[1].toFixed(3)});
  attribute float aS;       // 0 at the head, 1 at the tip
  attribute float aSide;    // -1 or 1 across the ribbon
  attribute float aTail;    // 0 ion, 1 dust
  uniform vec3 uHead;
  uniform vec3 uAway;       // unit, away from the star
  uniform vec3 uBack;       // unit, opposite the direction of travel
  uniform vec2 uLength;
  uniform vec2 uCurve;
  uniform vec2 uWidth;
  uniform vec2 uBrightness;
  uniform vec2 uNearFade;
  varying vec2 vUv;
  varying float vTail;
  varying float vBrightness;
  void main() {
    float s = aS;
    float len = mix(uLength.x, uLength.y, aTail);
    float curve = mix(uCurve.x, uCurve.y, aTail);
    vec3 p = uHead + uAway * (s * len) + uBack * (s * s * len * curve);
    vec3 tangent = normalize(uAway * len + uBack * (2.0 * s * len * curve) + vec3(1e-4));
    // Billboard: widen across the view direction.
    vec3 side = normalize(cross(tangent, cameraPosition - p) + vec3(1e-4));
    // A flat ribbon can't show a tail seen end-on (its width turns round the line of sight and fans into rays):
    // it fades out as the view lines up with the tail, and the head's end-on glow takes over (see Comet).
    float edgeOn = length(cross(tangent, normalize(cameraPosition - p)));
    p += side * aSide * mix(uWidth.x, uWidth.y, aTail) * (0.25 + 1.5 * s);
    vUv = vec2(s, aSide);
    vTail = aTail;
    vBrightness = mix(uBrightness.x, uBrightness.y, aTail) * smoothstep(uNearFade.x, uNearFade.y, distance(p, cameraPosition))
      * smoothstep(END_ON_FADE.x, END_ON_FADE.y, edgeOn);
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;

const tailFragment = /* glsl */ `
  uniform vec3 uIonColor;
  uniform vec3 uDustColor;
  uniform float uTime;
  varying vec2 vUv;
  varying float vTail;
  varying float vBrightness;
  void main() {
    float across = 1.0 - vUv.y * vUv.y;
    float along = pow(1.0 - vUv.x, 1.6) * smoothstep(0.0, 0.04, vUv.x);
    // Faint streaks drifting down the ion tail.
    float streak = 1.0 + 0.25 * (1.0 - vTail) * sin(vUv.y * 9.0 + sin(vUv.x * 7.0 - uTime * 1.3) * 1.5);
    float a = across * across * along * streak * vBrightness;
    gl_FragColor = vec4(mix(uIonColor, uDustColor, vTail) * a, 1.0);
    #include <colorspace_fragment>
  }
`;

function tailGeometry(): THREE.BufferGeometry {
  const perTail = (SEGMENTS + 1) * 2;
  const s = new Float32Array(perTail * 2);
  const side = new Float32Array(perTail * 2);
  const tail = new Float32Array(perTail * 2);
  const index: number[] = [];
  for (let t = 0; t < 2; t++) {
    const base = t * perTail;
    for (let i = 0; i <= SEGMENTS; i++) {
      const v = base + i * 2;
      s[v] = s[v + 1] = i / SEGMENTS;
      side[v] = -1;
      side[v + 1] = 1;
      tail[v] = tail[v + 1] = t;
      if (i < SEGMENTS) index.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  // Positions come from the shader; this attribute only sets the vertex count.
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(perTail * 2 * 3), 3));
  g.setAttribute('aS', new THREE.BufferAttribute(s, 1));
  g.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  g.setAttribute('aTail', new THREE.BufferAttribute(tail, 1));
  g.setIndex(index);
  return g;
}

/**
 * What the renderers take for a comet's nucleus: an airless, sealess barren
 * body with the comet's shape, following its Kepler orbit.
 */
export function cometConfig(comet: CometData): PlanetConfig {
  const { orbit } = comet;
  return {
    name: comet.name,
    type: 'barren',
    radius: comet.radius,
    seed: comet.seed,
    spin: comet.spin,
    // Unused (`path` is followed instead), but a circle of the same size and period.
    orbit: { radius: orbit.semiMajor, period: orbit.period, phase: orbit.phase, inclination: orbit.inclination },
    path: orbit,
    style: comet.style,
    tilt: comet.tilt,
    climate: null,
    shape: comet.shape,
    small: 'comet',
  };
}

/**
 * A comet's look in the system view around its nucleus: a glowing coma and
 * both tails, a straight blue ion tail pointing away from the star and a
 * curved dust tail lagging along the orbit. Both grow and brighten with 1/r²
 * as it nears the star. The nucleus itself is a `Planet` (an irregular,
 * visitable body on the same Kepler orbit, see StarSystem); this follows it.
 * Its pose is a pure function of the system clock.
 */
export class Comet {
  readonly object = new THREE.Group();
  readonly position = new THREE.Vector3();
  /** 0 far out, 1 at `activeDistance` or closer: drives the tails and coma. */
  activity = 0;
  /** The glow round the nucleus. */
  private readonly head = new THREE.Group();
  private readonly coma: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly tails: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  /** The tails seen end-on: a soft glow round the head, as bright as the ribbons are faded. */
  private readonly endOn: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private endOnBrightness = 0;
  private readonly before = new THREE.Vector3();
  private readonly away = new THREE.Vector3();
  private readonly view = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    readonly data: CometData,
    /** The visitable nucleus, on the same orbit. */
    readonly nucleus: Planet,
    /** The system's habitable radius: where the sun is "Earth-strength". */
    private readonly habitableRadius: number,
    glowTexture: THREE.Texture,
  ) {
    this.coma = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: glowTexture,
        color: '#cfeaff',
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        toneMapped: false,
      }),
    );
    this.coma.onBeforeRender = (_renderer, _scene, camera) => {
      this.coma.lookAt(camera.position);
      this.coma.updateMatrixWorld();
    };
    this.coma.renderOrder = GLOW_RENDER_ORDER;
    this.head.add(this.coma);

    this.endOn = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: glowTexture,
        color: new THREE.Color(data.ionColor).lerp(new THREE.Color(data.dustColor), 0.5),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        toneMapped: false,
      }),
    );
    this.endOn.onBeforeRender = (_renderer, _scene, camera) => {
      this.endOn.lookAt(camera.position);
      this.endOn.updateMatrixWorld();
      // The sine of the angle between the line of sight and the tail, as the ribbons' shader works it out.
      const sine = this.view.subVectors(camera.position, this.position).normalize().cross(this.away).length();
      const [a, b] = END_ON_FADE;
      this.endOn.material.opacity = this.endOnBrightness * (1 - THREE.MathUtils.smoothstep(sine, a, b));
    };
    this.endOn.renderOrder = GLOW_RENDER_ORDER;
    this.head.add(this.endOn);

    this.tails = new THREE.Mesh(
      tailGeometry(),
      new THREE.ShaderMaterial({
        vertexShader: tailVertex,
        fragmentShader: tailFragment,
        uniforms: {
          uHead: { value: new THREE.Vector3() },
          uAway: { value: new THREE.Vector3(1, 0, 0) },
          uBack: { value: new THREE.Vector3(-1, 0, 0) },
          uLength: { value: new THREE.Vector2() },
          uCurve: { value: new THREE.Vector2() },
          uWidth: { value: new THREE.Vector2() },
          uBrightness: { value: new THREE.Vector2() },
          uNearFade: { value: new THREE.Vector2() },
          uIonColor: { value: new THREE.Color(data.ionColor) },
          uDustColor: { value: new THREE.Color(data.dustColor) },
          uTime: { value: 0 },
        },
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        side: THREE.DoubleSide,
      }),
    );
    // Drawn in world space by the shader, so the bounds are unknown.
    this.tails.frustumCulled = false;
    this.tails.renderOrder = GLOW_RENDER_ORDER;

    this.object.add(this.head, this.tails);
    this.object.name = data.name;
    scene.add(this.object);
    this.poseAt(0);
  }

  /** Places the coma and shapes the tails for system time `time`. The star is at the barycentre. */
  poseAt(time: number): void {
    // A busted nucleus has nothing left to boil off: only its debris goes on round the orbit.
    this.object.visible = !this.nucleus.busted;
    if (this.nucleus.busted) {
      this.nucleus.pickRadius = undefined;
      return;
    }
    keplerPosition(this.data.orbit, time, this.position);
    keplerPosition(this.data.orbit, time - VELOCITY_DT, this.before);
    this.head.position.copy(this.position);

    const r = this.position.length();
    const ref = this.habitableRadius * cometParams.activeDistance;
    const strength = (ref / r) ** 2; // 1/r², 1 at the reference distance
    this.activity = Math.min(1, strength);
    const length = Math.min(cometParams.maxTailLength, cometParams.tailLength * strength);
    // Short tails far out are faint too.
    const faint = Math.min(1, length / 12);

    const u = this.tails.material.uniforms;
    (u.uHead!.value as THREE.Vector3).copy(this.position);
    (u.uAway!.value as THREE.Vector3).copy(this.away.copy(this.position).divideScalar(r));
    (u.uBack!.value as THREE.Vector3).subVectors(this.before, this.position).normalize();
    (u.uLength!.value as THREE.Vector2).set(length, length * DUST_LENGTH);
    (u.uCurve!.value as THREE.Vector2).set(0, cometParams.dustCurve);
    (u.uWidth!.value as THREE.Vector2).set(cometParams.tailWidth * ION_WIDTH, cometParams.tailWidth);
    (u.uBrightness!.value as THREE.Vector2).set(
      (0.35 + 0.65 * this.activity) * faint,
      (0.25 + 0.6 * this.activity) * faint,
    );
    (u.uNearFade!.value as THREE.Vector2).fromArray(cometParams.nearFade);
    u.uTime!.value = time;
    this.tails.visible = length > 0.5;
    this.endOn.visible = this.tails.visible;
    this.endOn.scale.setScalar(END_ON_SIZE * cometParams.tailWidth);
    this.endOnBrightness = 0.6 * (0.3 + 0.7 * this.activity) * faint;

    const comaSize = this.data.radius * 6 + 18 * this.activity;
    this.coma.scale.setScalar(comaSize);
    this.coma.material.opacity = 0.3 + 0.7 * this.activity;
    // Hovering picks the coma, which is what you see, not just the small nucleus in it.
    this.nucleus.pickRadius = comaSize / 2;
  }

  dispose(): void {
    this.scene.remove(this.object);
    this.coma.geometry.dispose();
    this.coma.material.dispose(); // the glow texture is shared; its owner disposes it
    this.tails.geometry.dispose();
    this.tails.material.dispose();
    this.endOn.geometry.dispose();
    this.endOn.material.dispose();
  }
}

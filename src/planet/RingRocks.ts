import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import { terrainNoise } from '../gen/noise';
import {
  RING_ROCK_SHAPES,
  cellSize,
  maxReach,
  ringOutOfReach,
  ringRockField,
  ringRockParams,
  ringRocksNear,
  type RingRock,
  type RingRockField,
} from '../gen/rings';
import { Rng, hashSeed } from '../gen/rng';
import { generateShape, shapeRadius } from '../gen/shape';
import type { RingData } from '../gen/system';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createCubeSphere } from '../world/cubeSphere';

export const ringRocksParams = {
  /** The flat ring fades near the camera, where the rocks take over, between these shares of the rocks' reach... */
  sheetNear: 0.1,
  sheetFar: 0.6,
  /** ...down to this much of its opacity (the dust and gravel too small to draw). */
  sheetFloor: 0.35,
  /** Seconds between choosing the rocks near the camera (sooner if it moves). */
  reselect: 1,
  /** Rocks shrink away within three of their sizes plus this (planet units) of the camera. */
  near: 2,
};

/** Colour ice is mixed towards, and how far (the ring's colour still tints it). */
const ICE_COLOR = new THREE.Color('#eef4ff');
const ICE_MIX = 0.35;
/** Rock is darker than the ring's colour (which the ice brightens), and a little greyer. */
const ROCK_LIGHT = 0.7;
const ROCK_GREY = 0.3;
/** Cube sphere segments of a rock (12·2² = 48 triangles), and the icosahedron of an ice chunk (detail 0: 20 facets). */
const ROCK_SEGMENTS = 2;
const ICE_DETAIL = 0;

/*
 * Each rock goes round the planet's axis at its own rate and tumbles about
 * its own axis, in the vertex shader, from the time since the rocks were
 * chosen (`ringRockPosition` in gen/rings.ts does the same on the CPU). It
 * grows out of nothing as it comes within its reach of the camera.
 */
const ROCK_HEAD = /* glsl */ `
  attribute vec4 aOrbit;  // radius, angle when chosen, radians per second, height
  attribute vec4 aSpin;   // axis xyz, radians per second
  attribute vec3 aBody;   // size, reach, spin angle when chosen
  uniform float uElapsed;
  uniform float uNear;

  vec3 rotateAxis(vec3 v, vec3 k, float a) {
    float c = cos(a);
    float s = sin(a);
    return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
  }
`;

const ROCK_BODY = /* glsl */ `
  float along = aOrbit.y + aOrbit.z * uElapsed;
  vec3 centre = vec3(aOrbit.x * cos(along), aOrbit.w, -aOrbit.x * sin(along));
  vec3 worldCentre = (modelMatrix * vec4(centre, 1.0)).xyz;
  float eyeDistance = distance(worldCentre, cameraPosition);
  // Grows out of nothing coming within reach, and shrinks away right in front of the camera rather than fill the view.
  float shown = (1.0 - smoothstep(aBody.y * 0.7, aBody.y, eyeDistance)) * smoothstep(aBody.x * 1.5, aBody.x * 3.0 + uNear, eyeDistance);
  vec3 transformed = centre + rotateAxis(position, aSpin.xyz, aBody.z + aSpin.w * uElapsed) * (aBody.x * shown);
`;

interface Batch {
  mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.MeshStandardMaterial>;
  orbit: THREE.InstancedBufferAttribute;
  spin: THREE.InstancedBufferAttribute;
  body: THREE.InstancedBufferAttribute;
  color: THREE.InstancedBufferAttribute;
  attributes: readonly THREE.InstancedBufferAttribute[];
  count: number;
}

/**
 * A planet's ring up close (issue #72): the rocks and ice chunks it is made
 * of, drawn near the camera in low orbit as tumbling, lit meshes that orbit
 * the planet, more of them where the ring is denser and none in its gaps
 * (gen/rings.ts). Small ones only right round the camera, boulders further
 * out. The flat ring fades a little near the camera to make way (`fadeSheet`).
 * In the planet's body frame, like the ring; `animate` with the clock.
 */
export class RingRocks {
  readonly object = new THREE.Group();
  private readonly field: RingRockField;
  private readonly batches: Batch[] = [];
  private readonly uniforms = { uElapsed: { value: 0 }, uNear: { value: ringRocksParams.near } };
  private readonly sheetUniforms = { uRingFade: { value: new THREE.Vector3() } };
  private readonly capacity: number;
  private readonly base = new THREE.Color();
  private readonly scratch = new THREE.Color();
  private readonly eye = new THREE.Vector3();
  private readonly selectedFrom = new THREE.Vector3();
  private time = 0;
  private selectedTime = Number.NaN;
  private dirty = true;

  constructor(rings: RingData, seed: number, spin: number, scale: number, debug: Debug) {
    const scaled = { ...rings, inner: rings.inner * scale, outer: rings.outer * scale };
    this.field = ringRockField(scaled, seed, spin);
    this.base.set(rings.color);
    this.capacity = Math.max(1, Math.round(ringRockParams.maxRocks));
    for (let ice = 0; ice < 2; ice++) {
      for (let s = 0; s < RING_ROCK_SHAPES; s++) this.batches.push(this.createBatch(ice === 1, s, hashSeed(seed, 'ring rock mesh', ice, s)));
    }
    this.object.add(...this.batches.map((b) => b.mesh));
    this.object.name = 'Ring rocks';
    this.addDebug(debug);
  }

  /** Share of the rocks that are ice. */
  get ice(): number {
    return this.field.ice;
  }

  /** Rocks drawn now. */
  get count(): number {
    return this.batches.reduce((n, b) => n + b.count, 0);
  }

  /** Sets the clock (system time): the rocks orbit and tumble with it. */
  animate(time: number): void {
    this.time = time;
    this.uniforms.uNear.value = ringRocksParams.near;
    this.uniforms.uElapsed.value = Number.isNaN(this.selectedTime) ? 0 : time - this.selectedTime;
    const reach = maxReach();
    const p = ringRocksParams;
    this.sheetUniforms.uRingFade.value.set(p.sheetNear * reach, p.sheetFar * reach, p.sheetFloor);
  }

  /**
   * Makes the flat ring's material (createRings) fade near the camera, down to
   * `sheetFloor`, where the rocks are drawn instead.
   */
  fadeSheet(material: THREE.Material): void {
    material.customProgramCacheKey = () => 'ring-sheet-fade';
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.sheetUniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vRingWorld;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvRingWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vRingWorld;\nuniform vec3 uRingFade;')
        .replace(
          '#include <color_fragment>',
          '#include <color_fragment>\ndiffuseColor.a *= mix(uRingFade.z, 1.0, smoothstep(uRingFade.x, uRingFade.y, distance(vRingWorld, cameraPosition)));',
        );
    };
    material.needsUpdate = true;
  }

  dispose(): void {
    for (const b of this.batches) {
      b.mesh.geometry.dispose();
      b.mesh.material.dispose();
    }
    this.object.removeFromParent();
  }

  /** Before drawing from `camera`: chooses the rocks near it again when the camera or the clock has moved enough. */
  private prepare(camera: THREE.Camera): void {
    this.object.worldToLocal(camera.getWorldPosition(this.eye));
    const move = cellSize(0) / 2;
    const stale =
      this.dirty ||
      !(Math.abs(this.time - this.selectedTime) < ringRocksParams.reselect) ||
      this.eye.distanceToSquared(this.selectedFrom) > move * move;
    if (stale) this.select();
  }

  private select(): void {
    this.dirty = false;
    this.selectedTime = this.time;
    this.selectedFrom.copy(this.eye);
    this.uniforms.uElapsed.value = 0;
    for (const b of this.batches) b.count = 0;
    if (!ringOutOfReach(this.field, this.eye)) ringRocksNear(this.field, this.eye, this.time, this.take, 1, this.capacity);
    for (const b of this.batches) {
      b.mesh.geometry.instanceCount = b.count;
      for (const attribute of b.attributes) {
        attribute.clearUpdateRanges();
        if (b.count > 0) {
          attribute.addUpdateRange(0, b.count * attribute.itemSize);
          attribute.needsUpdate = true;
        }
      }
    }
  }

  /** Packs one rock into its batch (`ringRocksNear`'s visitor). */
  private readonly take = (rock: RingRock): void => {
    const b = this.batches[(rock.ice ? RING_ROCK_SHAPES : 0) + rock.shape]!;
    if (b.count >= this.capacity) return;
    const k = b.count++;
    const t = this.time;
    const o = b.orbit.array as Float32Array;
    o[k * 4] = rock.radius;
    o[k * 4 + 1] = (rock.angle + rock.rate * t) % (2 * Math.PI);
    o[k * 4 + 2] = rock.rate;
    o[k * 4 + 3] = rock.height;
    const s = b.spin.array as Float32Array;
    s[k * 4] = rock.axisX;
    s[k * 4 + 1] = rock.axisY;
    s[k * 4 + 2] = rock.axisZ;
    s[k * 4 + 3] = rock.spin;
    const body = b.body.array as Float32Array;
    body[k * 3] = rock.size;
    body[k * 3 + 1] = rock.reach;
    body[k * 3 + 2] = (rock.spin * t) % (2 * Math.PI);
    const c = this.scratch.copy(this.base);
    if (rock.ice) c.lerp(ICE_COLOR, ICE_MIX);
    else {
      const grey = (c.r + c.g + c.b) / 3;
      c.setRGB(c.r + (grey - c.r) * ROCK_GREY, c.g + (grey - c.g) * ROCK_GREY, c.b + (grey - c.b) * ROCK_GREY).multiplyScalar(ROCK_LIGHT);
    }
    c.multiplyScalar(rock.light).toArray(b.color.array as Float32Array, k * 3);
  };

  private createBatch(ice: boolean, shape: number, seed: number): Batch {
    const base = ice ? iceGeometry(seed) : rockGeometry(seed);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = base.index;
    geometry.setAttribute('position', base.getAttribute('position'));
    geometry.setAttribute('normal', base.getAttribute('normal'));
    const attribute = (size: number) =>
      new THREE.InstancedBufferAttribute(new Float32Array(this.capacity * size), size).setUsage(THREE.DynamicDrawUsage);
    const orbit = attribute(4);
    const spin = attribute(4);
    const body = attribute(3);
    const color = attribute(3);
    geometry.setAttribute('aOrbit', orbit);
    geometry.setAttribute('aSpin', spin);
    geometry.setAttribute('aBody', body);
    geometry.setAttribute('color', color);
    geometry.instanceCount = 0;
    // Ice catches the light; rock is matte.
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: ice ? 0.35 : 0.95 });
    material.customProgramCacheKey = () => 'ring-rocks';
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${ROCK_HEAD}`)
        .replace('#include <begin_vertex>', ROCK_BODY);
    };
    const mesh = new THREE.Mesh(geometry, material);
    // Placed by the shader: the bounds are unknown.
    mesh.frustumCulled = false;
    // Drawn (as nothing) even with no rocks chosen, so the choice is made just before the rocks are drawn.
    mesh.onBeforeRender = (_renderer, _scene, camera) => this.prepare(camera);
    mesh.name = `Ring ${ice ? 'ice' : 'rocks'} ${shape}`;
    return { mesh, orbit, spin, body, color, attributes: [orbit, spin, body, color], count: 0 };
  }

  private addDebug(debug: Debug): void {
    const f = debug.folder('Ring rocks');
    if (!f) return;
    const changed = () => {
      this.dirty = true;
    };
    f.add(ringRockParams, 'minSize', 0.05, 2).onChange(changed);
    f.add(ringRockParams, 'octaves', 1, 8, 1).onChange(changed);
    f.add(ringRockParams, 'reach', 20, 400).onChange(changed);
    f.add(ringRockParams, 'cells', 2, 16, 1).onChange(changed);
    f.add(ringRockParams, 'perCell', 0, 10, 1).onChange(changed);
    f.add(ringRockParams, 'thickness', 0, 40).onChange(changed);
    f.add(ringRockParams, 'speed', 0, 30).onChange(changed);
    f.add(ringRockParams, 'spin', 0, 4).onChange(changed);
    f.add(ringRocksParams, 'sheetNear', 0, 1);
    f.add(ringRocksParams, 'sheetFar', 0, 1.5);
    f.add(ringRocksParams, 'sheetFloor', 0, 1);
    f.add(ringRocksParams, 'reselect', 0.1, 5);
    f.add(ringRocksParams, 'near', 0, 20);
  }
}

/** A rock: a small cube sphere pushed out to an irregular, lumpy, cratered shape, unit size (like the belts' rocks). */
function rockGeometry(seed: number): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const shape = generateShape(rng.fork('shape'), { lobes: 1, binary: false, elongation: [1.2, 1.8], craters: [0, 2] });
  const geometry = createCubeSphere(1, ROCK_SEGMENTS);
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const p = new THREE.Vector3();
  const noiseSeed = rng.int(0, 10_000);
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i).normalize();
    const r = shapeRadius(shape, p.x, p.y, p.z) * (1 + 0.15 * terrainNoise(p.x * 2, p.y * 2, p.z * 2, noiseSeed));
    position.setXYZ(i, p.x * r, p.y * r, p.z * r);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** An ice chunk: a jagged, faceted lump (a pushed-about icosahedron), stretched along one axis, unit size. */
function iceGeometry(seed: number): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const solid = new THREE.IcosahedronGeometry(1, ICE_DETAIL);
  solid.deleteAttribute('normal');
  solid.deleteAttribute('uv');
  // Shared corners, so pushing one about keeps the faces joined.
  const geometry = mergeVertices(solid);
  solid.dispose();
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const p = new THREE.Vector3();
  const stretch = new THREE.Vector3(rng.range(1.2, 1.8), rng.range(0.6, 0.85), rng.range(0.8, 1.05));
  const turn = new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(0, Math.PI), rng.range(0, Math.PI), 0));
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i).normalize();
    p.multiplyScalar(rng.range(0.6, 1.2)).multiply(stretch).applyQuaternion(turn);
    position.setXYZ(i, p.x, p.y, p.z);
  }
  geometry.computeVertexNormals();
  // Longest reach 1, like the rocks.
  geometry.computeBoundingSphere();
  const k = 1 / geometry.boundingSphere!.radius;
  geometry.scale(k, k, k);
  return geometry;
}

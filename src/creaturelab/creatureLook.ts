import * as THREE from 'three';
import type { AnimalSpecies } from '../gen/animals';
import { MAX_SPLATS, creatureForm, splatPosition, type CreatureDesign, type SpineFrame } from '../gen/creature';
import { addAnimationAttributes, createAnimalMaterial, type AnimalUniforms } from '../surface/animalLook';
import { linearRgb, type AnimalMeshData } from '../surface/animalMesh';

/*
 * How an editor creature is drawn: the game's animal material
 * (surface/animalLook.ts: lit, vertex-coloured, the coat's pattern per
 * pixel) on a mesh the editor poses on the CPU every frame (gen/creature.ts
 * grows it in its pose, surface/animalMesh.ts skins it). Two things are
 * added to the material:
 *  - the pattern and paint are laid out on the rest pose (`aRestPos`, the
 *    same vertex in the creature's rest pose), so they move with the body
 *    instead of swimming over it as it walks;
 *  - brush strokes: up to MAX_SPLATS soft dabs of colour (each mirrored
 *    when the brush is), read per pixel from a small float texture, so a
 *    stroke is as sharp as the screen, not the mesh's few vertices.
 */

/** Texels per dab row (each dab may be mirrored, so twice the dabs). */
const SPLAT_SLOTS = MAX_SPLATS * 2;

export interface CreatureLook {
  readonly mesh: THREE.InstancedMesh;
  /** The same geometry as a plain mesh, for picking (layer 1: never drawn). */
  readonly picker: THREE.Mesh;
  /** The mesh's edges drawn over it (the View's Wireframe switch), hidden until switched on. */
  readonly wire: THREE.Mesh;
  readonly uniforms: AnimalUniforms;
  /** Writes this frame's posed mesh; `rest` (the rest pose's positions, same topology) when the design changed. */
  update(posed: AnimalMeshData, rest: AnimalMeshData | null): void;
  /** Re-reads the coat's colours and pattern and the paint dabs. */
  repaint(design: CreatureDesign, restFrames: readonly SpineFrame[], length: number): void;
  dispose(): void;
}

export function createCreatureLook(design: CreatureDesign, length: number): CreatureLook {
  const species: AnimalSpecies = { index: 0, name: design.name, diet: 'herbivore', length, minTemperature: 0, maxTemperature: 1000, weight: 1, herdMin: 1, herdMax: 1, form: creatureForm(design) };
  const still = { swing: 0, swingTrot: 0, lift: 0, bob: 0, graze: 0 };
  const { material, uniforms } = createAnimalMaterial(0, species, still, false);

  const splatData = new Float32Array(SPLAT_SLOTS * 2 * 4);
  const splats = new THREE.DataTexture(splatData, SPLAT_SLOTS, 2, THREE.RGBAFormat, THREE.FloatType);
  splats.needsUpdate = true;
  const splatCount = { value: 0 };

  const base = material.onBeforeCompile.bind(material);
  material.customProgramCacheKey = () => 'creature';
  material.onBeforeCompile = (shader, renderer) => {
    base(shader, renderer);
    shader.uniforms.uSplats = { value: splats };
    shader.uniforms.uSplatCount = splatCount;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aRestPos;').replace('vAnimalRest = position;', 'vAnimalRest = aRestPos;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform highp sampler2D uSplats;\nuniform int uSplatCount;`)
      .replace(
        'diffuseColor.rgb = mix(diffuseColor.rgb, uTint, uTintMix);',
        `for (int i = 0; i < ${SPLAT_SLOTS}; i++) {
            if (i >= uSplatCount) break;
            vec4 at = texelFetch(uSplats, ivec2(i, 0), 0);
            vec4 col = texelFetch(uSplats, ivec2(i, 1), 0);
            float k = 1.0 - smoothstep(at.w * col.w, at.w, distance(vAnimalRest, at.xyz));
            diffuseColor.rgb = mix(diffuseColor.rgb, col.rgb, k);
          }
          diffuseColor.rgb = mix(diffuseColor.rgb, uTint, uTintMix);`,
      );
  };

  let geometry = new THREE.BufferGeometry();
  const mesh = new THREE.InstancedMesh(geometry, material, 1);
  mesh.setMatrixAt(0, new THREE.Matrix4());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  const picker = new THREE.Mesh(geometry);
  picker.layers.set(1);
  const wire = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0x0b1a24, wireframe: true, transparent: true, opacity: 0.55, depthWrite: false }));
  wire.frustumCulled = false;
  wire.visible = false;
  let vertices = -1;

  function attr(name: string, data: Float32Array, size: number): void {
    const a = geometry.getAttribute(name) as THREE.BufferAttribute | undefined;
    if (a && a.array.length === data.length) {
      (a.array as Float32Array).set(data);
      a.needsUpdate = true;
    } else {
      const b = new THREE.BufferAttribute(data.slice(), size);
      b.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute(name, b);
    }
  }

  return {
    mesh,
    picker,
    wire,
    uniforms,
    update(posed, rest) {
      const n = posed.positions.length / 3;
      if (n !== vertices) {
        // The topology changed (a part added or taken off): a new geometry.
        geometry.dispose();
        geometry = new THREE.BufferGeometry();
        mesh.geometry = geometry;
        picker.geometry = geometry;
        wire.geometry = geometry;
        addAnimationAttributes(mesh, 1);
        vertices = n;
      }
      attr('position', posed.positions, 3);
      attr('normal', posed.normals, 3);
      attr('color', posed.colors, 3);
      attr('aCoat', posed.coat, 1);
      attr('aRig', new Float32Array(n * 4), 4);
      attr('aPivot', new Float32Array(n * 3), 3);
      if (rest || !geometry.getAttribute('aRestPos')) attr('aRestPos', (rest ?? posed).positions, 3);
      geometry.computeBoundingSphere();
      geometry.computeBoundingBox();
    },
    repaint(d, restFrames, len) {
      const p = d.paint;
      uniforms.uPattern.value = ['plain', 'stripes', 'spots', 'patches'].indexOf(p.pattern);
      uniforms.uPatternK.value = p.patternScale / len;
      uniforms.uPatternColor.value.setRGB(...linearRgb(p.patternColor), THREE.LinearSRGBColorSpace);
      uniforms.uSeed.value = (d.seed % 997) / 997;
      let k = 0;
      for (const s of d.splats) {
        for (const mirrored of s.mirror ? [false, true] : [false]) {
          if (k >= SPLAT_SLOTS) break;
          const at = splatPosition(restFrames, s, mirrored);
          const col = linearRgb(s.color);
          splatData.set([at[0], at[1], at[2], s.radius], k * 4);
          splatData.set([col[0], col[1], col[2], s.hardness ?? 0.55], (SPLAT_SLOTS + k) * 4);
          k++;
        }
      }
      splatCount.value = k;
      splats.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      (wire.material as THREE.Material).dispose();
      splats.dispose();
    },
  };
}

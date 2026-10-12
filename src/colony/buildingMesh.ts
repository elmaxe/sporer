import * as THREE from 'three';
import { SHIP_PARTS, instances, type ShipDesign, type ShipPartKind } from '../gen/ship';
import { instanceMatrix, partMatrix, pieces, type Piece } from '../player/shipMesh';
import { createPlantMaterial, type PlantFadeUniforms } from '../surface/plantLook';

/*
 * A colony building drawn from its spaceship-part design (gen/colonyBuildings.ts):
 * the ship editor's own part meshes (player/shipMesh.ts `pieces`), placed as
 * the editor places them and merged into one vertex-coloured geometry per
 * level of detail, so each kind of building is one instanced mesh per level
 * (colony/Colonies.ts), faded between levels by the plants' dithered
 * material (surface/plantLook.ts) by the distance in the building's heights.
 * Level 0 is every piece; level 1 stands each piece in for a low-poly shape
 * of its size, small parts left out; level 2 is one shape per body part.
 *
 * Each vertex carries `aGlow`: 0 the walls, 1 the windows (the glass, lit
 * warm on the night side), 2 the lamps (always lit).
 */

/** Where each level ends, in the building's heights. */
export const BUILDING_LODS: readonly number[] = [14, 45, 260];
export const BUILDING_LOD_COUNT = BUILDING_LODS.length;
/** The tallest a building's levels are measured for: a tower's full detail isn't worth drawing from across the colony. */
const LOD_HEIGHT_CAP = 3;

/** The height a building of height `height` changes level of detail by (its own, up to a cap). */
export function buildingLodHeight(height: number): number {
  return Math.min(height, LOD_HEIGHT_CAP);
}

/** Small parts left out past the full level. */
const SMALL: ReadonlySet<ShipPartKind> = new Set(['light', 'antenna', 'grabber', 'cannon']);
/** How the low levels stand in for a piece: a box for blocks and wings, a short cylinder for rings and dishes, else an ellipsoid. */
function proxyShape(kind: ShipPartKind): 'box' | 'cylinder' | 'sphere' {
  if (kind === 'block' || kind === 'wing' || kind === 'fin') return 'box';
  if (kind === 'ring' || kind === 'dish' || kind === 'thruster') return 'cylinder';
  return 'sphere';
}
const PROXIES = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 10, 1),
  sphere: new THREE.SphereGeometry(0.5, 10, 6),
};
const FAR_PROXIES = {
  box: PROXIES.box,
  cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1),
  sphere: new THREE.SphereGeometry(0.5, 6, 4),
};

/** A building's geometry at each level of detail, standing on y = 0 (+y up), and its height. */
export interface BuildingGeometry {
  readonly lods: THREE.BufferGeometry[];
  readonly height: number;
}

function channelColor(piece: Piece, design: ShipDesign, own: ShipDesign['parts'][number]['paint']): { color: THREE.Color; glow: number } {
  const paint = design.paint;
  switch (piece.channel) {
    case 'base':
      return { color: new THREE.Color(own?.base ?? paint.base), glow: 0 };
    case 'trim':
      return { color: new THREE.Color(own?.trim ?? paint.trim), glow: 0 };
    case 'detail':
      return { color: new THREE.Color(paint.detail), glow: 0 };
    case 'glass':
      return { color: new THREE.Color(paint.glass), glow: 1 };
    default:
      return { color: new THREE.Color(paint.glow), glow: 2 };
  }
}

/** One piece (or its stand-in) moved into place and coloured, as plain arrays. */
function bake(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4, color: THREE.Color, glow: number, out: { position: number[]; color: number[]; glow: number[] }): void {
  const g = (geometry.index ? geometry.toNonIndexed() : geometry.clone()).applyMatrix4(matrix);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  // A mirrored copy's triangles wind the other way: turn them back so they face out.
  const flip = matrix.determinant() < 0;
  for (let i = 0; i < pos.count; i += 3) {
    const order = flip ? [0, 2, 1] : [0, 1, 2];
    for (const k of order) {
      out.position.push(pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k));
      out.color.push(color.r, color.g, color.b);
      out.glow.push(glow);
    }
  }
  g.dispose();
}

/** `geometry` of unit size fitted into `box` (in the piece's own space), then by `matrix`. */
function fitted(box: THREE.Box3, matrix: THREE.Matrix4, out: THREE.Matrix4): THREE.Matrix4 {
  const size = box.getSize(new THREE.Vector3()).max(new THREE.Vector3(0.05, 0.05, 0.05));
  const centre = box.getCenter(new THREE.Vector3());
  return out.copy(matrix).multiply(new THREE.Matrix4().makeTranslation(centre.x, centre.y, centre.z).scale(size));
}

/** The design's merged geometry at each level of detail, sitting on y = 0 (sunk `sink` units into the ground). */
export function buildingGeometry(design: ShipDesign, sink = 0.3): BuildingGeometry {
  const arrays = Array.from({ length: BUILDING_LOD_COUNT }, () => ({ position: [] as number[], color: [] as number[], glow: [] as number[] }));
  const own = new THREE.Matrix4();
  const copy = new THREE.Matrix4();
  const m = new THREE.Matrix4();
  const at = new THREE.Matrix4();
  const proxy = new THREE.Matrix4();
  for (const part of design.parts) {
    partMatrix(part, own);
    const info = SHIP_PARTS[part.kind];
    const shape = proxyShape(part.kind);
    const big = info.category === 'body' || info.category === 'cockpit';
    for (const inst of instances(part)) {
      instanceMatrix(inst.angle, inst.mirrored, copy).multiply(own);
      const partBox = new THREE.Box3();
      let partColor: THREE.Color | null = null;
      for (const piece of pieces(part.kind)) {
        if (piece.channel === 'exhaust') continue;
        const { color, glow } = channelColor(piece, design, part.paint);
        m.copy(copy);
        if (piece.at) m.multiply(at.makeTranslation(...piece.at));
        bake(piece.geometry, m, color, glow, arrays[0]!);
        piece.geometry.computeBoundingBox();
        const box = piece.geometry.boundingBox!;
        if (!SMALL.has(part.kind)) bake(PROXIES[shape], fitted(box, m, proxy), color, glow, arrays[1]!);
        partBox.union(box.clone().applyMatrix4(piece.at ? at.makeTranslation(...piece.at) : at.identity()));
        partColor ??= color;
      }
      if (big && partColor && !partBox.isEmpty()) bake(FAR_PROXIES[shape], fitted(partBox, copy, proxy), partColor, piece0Glow(part.kind), arrays[2]!);
    }
  }
  let low = Infinity;
  let high = -Infinity;
  for (let i = 1; i < arrays[0]!.position.length; i += 3) {
    low = Math.min(low, arrays[0]!.position[i]!);
    high = Math.max(high, arrays[0]!.position[i]!);
  }
  const lift = -low - sink;
  const lods = arrays.map((a) => {
    const g = new THREE.BufferGeometry();
    const position = Float32Array.from(a.position);
    for (let i = 1; i < position.length; i += 3) position[i]! += lift;
    g.setAttribute('position', new THREE.BufferAttribute(position, 3));
    g.setAttribute('color', new THREE.BufferAttribute(Float32Array.from(a.color), 3));
    g.setAttribute('aGlow', new THREE.BufferAttribute(Float32Array.from(a.glow), 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  });
  return { lods, height: Math.max(1, high + lift) };
}

/** Far away, a glass cockpit still shows as windows. */
function piece0Glow(kind: ShipPartKind): number {
  return SHIP_PARTS[kind].category === 'cockpit' ? 1 : 0;
}

/** What the buildings' materials share: where the sun is (body frame), and how bright the windows are at night. */
export interface BuildingLight {
  readonly uSun: { value: THREE.Vector3 };
  readonly uWindows: { value: number };
}

/**
 * The plants' fading material (by the distance in the building's heights)
 * with the windows lit warm on the night side and the lamps always lit.
 */
export function createBuildingMaterial(lod: number, height: number, light: BuildingLight): { material: THREE.MeshStandardMaterial; uniforms: PlantFadeUniforms } {
  const { material, uniforms } = createPlantMaterial(lod, height, BUILDING_LODS);
  const plant = material.onBeforeCompile;
  material.roughness = 0.75;
  material.customProgramCacheKey = () => 'colony-lod';
  material.onBeforeCompile = (shader, renderer) => {
    plant.call(material, shader, renderer);
    shader.uniforms.uSun = light.uSun;
    shader.uniforms.uWindows = light.uWindows;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying float vGlow;\nvarying float vNight;\nuniform vec3 uSun;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vGlow = aGlow;
        {
          // Night where the sun is below the building's horizon (its up: out from the globe's centre).
          vec3 foot = normalize((modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz);
          vNight = smoothstep(0.08, -0.12, dot(foot, normalize(uSun)));
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;\nvarying float vNight;\nuniform float uWindows;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        if (vGlow > 1.5) totalEmissiveRadiance += vColor.rgb * 1.2;
        else if (vGlow > 0.5) totalEmissiveRadiance += mix(vColor.rgb, vec3(1.0, 0.72, 0.38), 0.85) * uWindows * vNight;`,
      );
  };
  return { material, uniforms };
}

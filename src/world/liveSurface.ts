import * as THREE from 'three';
import type { ClimateData } from '../gen/climate';
import { SEA_FREEZING, SEA_ICE_COLOR, THAWED_WATER_COLOR, capLine, freezeLine } from '../terraform/liveLook';

/*
 * A terraformed world's seas and ice, per pixel on its lit materials
 * (terraform/liveLook.ts says where): ice caps on the land poleward of
 * `capLine`, sea ice poleward of the sea's `freezeLine` (or, on an ice
 * world's frozen sea, open water equatorward of it), and in the system view
 * the sea itself: the terrain under the live sea level is flooded flat to it
 * in the vertex shader (low orbit has a sea sphere of its own). Latitude and
 * the edges' noise come from the direction in the body frame, so both views
 * draw the same lines. Driven by uniforms: nothing is rebuilt as the climate
 * moves. Chained after whatever the material already does to its shader.
 */

/**
 * - `ground`: low orbit's terrain: ice caps on land above the sea.
 * - `flood`: the system view's terrain: caps, and the sea flooded and frozen.
 * - `sea`: a water sea's surface: sea ice.
 * - `iceSea`: an ice world's frozen sea: thawed water where it's warm.
 */
export type LiveSurfaceKind = 'ground' | 'flood' | 'sea' | 'iceSea';

export interface LiveSurfaceUniforms {
  [name: string]: THREE.IUniform;
  /** The sea's radius in the mesh's units (0: none). */
  uLiveSeaR: { value: number };
  uLiveSeaColor: { value: THREE.Color };
  /** 1 if the sea is ice to begin with (an ice world's): it thaws instead of freezing. */
  uLiveIceBase: { value: number };
  /** Sines of the latitudes of the caps' and the sea ice's edges (above 1: none). */
  uLiveCapSin: { value: number };
  uLiveSeaIceSin: { value: number };
  uLiveIceColor: { value: THREE.Color };
  uLiveWaterColor: { value: THREE.Color };
}

export function createLiveSurfaceUniforms(): LiveSurfaceUniforms {
  return {
    uLiveSeaR: { value: 0 },
    uLiveSeaColor: { value: new THREE.Color('#1f4f86') },
    uLiveIceBase: { value: 0 },
    uLiveCapSin: { value: 2 },
    uLiveSeaIceSin: { value: 2 },
    uLiveIceColor: { value: new THREE.Color(SEA_ICE_COLOR) },
    uLiveWaterColor: { value: new THREE.Color(THAWED_WATER_COLOR) },
  };
}

/** Sets the caps' and the sea ice's edges from a climate (`caps`: lay ice caps on the land). */
export function setLiveIce(u: LiveSurfaceUniforms, climate: ClimateData, caps: boolean): void {
  u.uLiveCapSin.value = caps ? capLine(climate) : 2;
  u.uLiveSeaIceSin.value = climate.waterState === 'none' || climate.waterState === 'steam' ? 2 : freezeLine(climate.temperature, SEA_FREEZING);
}

const VERTEX_PARS = /* glsl */ `
uniform float uLiveSeaR;
varying vec3 vLivePos;
varying float vLiveWet;
`;

const FRAGMENT_PARS = /* glsl */ `
uniform float uLiveSeaR;
uniform vec3 uLiveSeaColor;
uniform float uLiveIceBase;
uniform float uLiveCapSin;
uniform float uLiveSeaIceSin;
uniform vec3 uLiveIceColor;
uniform vec3 uLiveWaterColor;
varying vec3 vLivePos;
varying float vLiveWet;
// A ragged edge: a few sines of the direction (the same in every view, being scale-free).
float liveEdge(vec3 d) {
  return 0.02 * sin(d.x * 23.0 + d.z * 7.0) * sin(d.z * 19.0 - d.y * 11.0)
    + 0.012 * sin(d.x * 61.0 - d.y * 43.0 + d.z * 29.0);
}
`;

function fragmentCode(kind: LiveSurfaceKind): string {
  const common = /* glsl */ `
    vec3 liveDir = normalize(vLivePos);
    float liveLat = abs(liveDir.y) + liveEdge(liveDir);
    float liveFrozen = smoothstep(uLiveSeaIceSin - 0.012, uLiveSeaIceSin + 0.012, liveLat);
    float liveIce = 0.0;
  `;
  const caps = /* glsl */ `
    float liveCap = smoothstep(uLiveCapSin - 0.012, uLiveCapSin + 0.012, liveLat);
  `;
  switch (kind) {
    case 'ground':
      return `${common}${caps}
        liveCap *= step(uLiveSeaR, length(vLivePos));
        diffuseColor.rgb = mix(diffuseColor.rgb, uLiveIceColor, 0.92 * liveCap);
        roughnessFactor = mix(roughnessFactor, 0.75, liveCap);`;
    case 'flood':
      return `${common}${caps}
        float liveWet = step(0.5, vLiveWet);
        vec3 liveSea = uLiveIceBase > 0.5 ? mix(uLiveWaterColor, uLiveSeaColor, liveFrozen) : mix(uLiveSeaColor, uLiveIceColor, liveFrozen);
        vec3 liveLand = mix(diffuseColor.rgb, uLiveIceColor, 0.92 * liveCap);
        diffuseColor.rgb = mix(liveLand, liveSea, liveWet);
        float liveSeaRough = uLiveIceBase > 0.5 ? mix(0.3, roughnessFactor, liveFrozen) : mix(0.3, 0.75, liveFrozen);
        roughnessFactor = mix(mix(roughnessFactor, 0.75, liveCap), liveSeaRough, liveWet);`;
    case 'sea':
      return `${common}
        diffuseColor.rgb = mix(diffuseColor.rgb, uLiveIceColor, liveFrozen);
        roughnessFactor = mix(roughnessFactor, 0.75, liveFrozen);`;
    case 'iceSea':
      return `${common}
        diffuseColor.rgb = mix(uLiveWaterColor, diffuseColor.rgb, liveFrozen);
        roughnessFactor = mix(0.2, roughnessFactor, liveFrozen);`;
  }
}

/** Adds the live seas and ice to `material` (once); its uniforms drive it from then on. */
export function applyLiveSurface(material: THREE.MeshStandardMaterial, kind: LiveSurfaceKind, uniforms: LiveSurfaceUniforms): void {
  if (material.userData.liveSurface) return;
  material.userData.liveSurface = kind;
  const before = material.onBeforeCompile.bind(material);
  const beforeKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    before(shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    const flood = kind === 'flood';
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        ${flood ? 'if (length(position) < uLiveSeaR) objectNormal = normalize(position);' : ''}`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vLivePos = position;
        vLiveWet = 0.0;
        ${flood ? 'float liveR = length(transformed); if (liveR < uLiveSeaR) { transformed *= uLiveSeaR / liveR; vLiveWet = 1.0; }' : ''}`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
      .replace('#include <emissivemap_fragment>', `${fragmentCode(kind)}\n#include <emissivemap_fragment>`);
  };
  material.customProgramCacheKey = () => `${beforeKey}|live-${kind}`;
  material.needsUpdate = true;
}

import * as THREE from 'three';
import type { Vec3 } from '../gen/animalForm';
import { isGear, type CreatureDesign, type CreatureOutfit, type GrownCreature } from '../gen/creature';
import { defaultOutfit, gearFrame, helmetFit, suitRing, SUIT_PUFF } from '../gen/creatureOutfit';

/*
 * How an editor creature's space clothes are drawn (Outfit mode; the data
 * and fitting are gen/creatureOutfit.ts): plain meshes of their own over
 * the creature's, refitted to its posed body every frame so they walk with
 * it.
 *  - The suit is a shell a little off the skin along a stretch of the
 *    spine, its sleeves tubes down the limbs, both rebuilt from the posed
 *    spine and limbs each frame; trim at the cuffs and down the back.
 *  - The helmet is a glass bubble (brighter at its rim, as glass seen edge
 *    on reflects more) on a collar; boots and gloves sit on the feet and
 *    hands.
 *  - Gear stuck on the skin like a part (jetpack, beacon, badge, shoulder
 *    pad) is built of primitives in the frame gen/creatureOutfit.ts gives
 *    it; a jetpack's flames grow as the creature walks and a beacon blinks.
 */

export interface OutfitLook {
  readonly group: THREE.Group;
  /** Refits everything to this frame's grown creature; `thrust` 0 to 1 (how hard it is walking). */
  update(design: CreatureDesign, grown: GrownCreature, time: number, thrust: number): void;
  dispose(): void;
}

const SEGMENTS = 24;
const SLEEVE_SEGMENTS = 14;

/** A tube of rings (each `segments` points round), its geometry kept while the ring count stays. */
class Tube {
  readonly mesh: THREE.Mesh;
  private rings = -1;
  constructor(
    material: THREE.Material,
    private readonly segments: number,
  ) {
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
  }

  set(rings: readonly Vec3[][], colors: readonly THREE.Color[]): void {
    const n = rings.length;
    const m = this.segments;
    let g = this.mesh.geometry;
    if (n !== this.rings) {
      g.dispose();
      g = new THREE.BufferGeometry();
      const index: number[] = [];
      for (let i = 0; i + 1 < n; i++) {
        for (let j = 0; j < m; j++) {
          const a = i * m + j;
          const b = i * m + ((j + 1) % m);
          const c = a + m;
          const d = b + m;
          index.push(a, c, b, b, c, d);
        }
      }
      g.setIndex(index);
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * m * 3), 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * m * 3), 3).setUsage(THREE.DynamicDrawUsage));
      this.mesh.geometry = g;
      this.rings = n;
    }
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const col = g.getAttribute('color') as THREE.BufferAttribute;
    const pa = pos.array as Float32Array;
    const ca = col.array as Float32Array;
    rings.forEach((ring, i) =>
      ring.forEach((p, j) => {
        const k = (i * m + j) * 3;
        pa[k] = p[0];
        pa[k + 1] = p[1];
        pa[k + 2] = p[2];
        const c = colors[i * m + j]!;
        ca[k] = c.r;
        ca[k + 1] = c.g;
        ca[k + 2] = c.b;
      }),
    );
    pos.needsUpdate = true;
    col.needsUpdate = true;
    g.computeVertexNormals();
    g.computeBoundingSphere();
  }

  dispose(): void {
    this.mesh.geometry.dispose();
  }
}

const sphere = new THREE.SphereGeometry(1, 32, 20);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 24);
const cone = new THREE.ConeGeometry(1, 1, 18);
const torus = new THREE.TorusGeometry(1, 0.12, 10, 40);
const box = new THREE.BoxGeometry(1, 1, 1);
const padCap = new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI * 0.42);
const star = (() => {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const r = i % 2 === 0 ? 1 : 0.42;
    if (i === 0) s.moveTo(Math.sin(a) * r, Math.cos(a) * r);
    else s.lineTo(Math.sin(a) * r, Math.cos(a) * r);
  }
  return new THREE.ShapeGeometry(s);
})();

export function createOutfitLook(): OutfitLook {
  const group = new THREE.Group();
  const main = new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.15, side: THREE.DoubleSide });
  const trim = new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0.45 });
  const metal = new THREE.MeshStandardMaterial({ color: '#3b424c', roughness: 0.3, metalness: 0.85 });
  const sole = new THREE.MeshStandardMaterial({ color: '#25282d', roughness: 0.8 });
  const suit = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.08 });
  const glow = new THREE.MeshBasicMaterial({ toneMapped: false });
  const blink = new THREE.MeshBasicMaterial({ toneMapped: false });
  const core = new THREE.MeshBasicMaterial({ color: '#fff6e0', toneMapped: false });
  const flame = new THREE.MeshBasicMaterial({ color: '#ff9a3c', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const glass = new THREE.MeshPhysicalMaterial({ color: '#d8f0ff', transparent: true, opacity: 0.12, roughness: 0.03, metalness: 0, clearcoat: 1, depthWrite: false });
  // Glass reflects more seen edge on (Fresnel): a brighter, more opaque rim.
  glass.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `#include <opaque_fragment>
      float rim = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 3.0);
      gl_FragColor.rgb += vec3(0.55, 0.8, 1.0) * rim * 0.55;
      gl_FragColor.a = clamp(gl_FragColor.a + rim * 0.55, 0.0, 1.0);`,
    );
  };
  glass.customProgramCacheKey = () => 'helmet-glass';
  const materials = [main, trim, metal, sole, suit, glow, blink, core, flame, glass];

  const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, at: Vec3 = [0, 0, 0], scale: Vec3 = [1, 1, 1], rotX = 0): THREE.Mesh => {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(...at);
    m.scale.set(...scale);
    m.rotation.x = rotX;
    const lit = material !== glow && material !== blink && material !== core && material !== flame && material !== glass;
    m.castShadow = lit;
    m.receiveShadow = lit;
    return m;
  };

  // Each piece in its own frame (see gen/creatureOutfit.ts): y out of the skin, z along the spine, in units of its scale.
  const builders: Record<string, () => THREE.Object3D> = {
    jetpack: () => {
      const g = new THREE.Group();
      g.add(mesh(box, main, [0, 0.06, 0], [0.92, 0.16, 1.1]));
      for (const x of [-0.27, 0.27]) {
        g.add(mesh(cylinder, trim, [x, 0.36, 0], [0.24, 1.0, 0.24], Math.PI / 2));
        g.add(mesh(sphere, trim, [x, 0.36, 0.5], [0.24, 0.24, 0.24]));
        g.add(mesh(cone, metal, [x, 0.36, -0.62], [0.17, 0.3, 0.17], Math.PI / 2));
        g.add(mesh(sphere, glow, [x * 1.9, 0.36, 0.2], [0.055, 0.055, 0.055]));
        const f = new THREE.Group();
        f.name = 'flame';
        f.position.set(x, 0.36, -0.77);
        f.add(mesh(cone, flame, [0, 0, -0.5], [0.15, 1, 0.15], -Math.PI / 2));
        f.add(mesh(cone, core, [0, 0, -0.32], [0.07, 0.64, 0.07], -Math.PI / 2));
        g.add(f);
      }
      return g;
    },
    beacon: () => {
      const g = new THREE.Group();
      g.add(mesh(cylinder, trim, [0, 0.02, 0], [0.18, 0.08, 0.18]));
      g.add(mesh(cylinder, metal, [0, 0.5, 0], [0.035, 1, 0.035]));
      g.add(mesh(sphere, blink, [0, 1.05, 0], [0.11, 0.11, 0.11]));
      return g;
    },
    badge: () => {
      const g = new THREE.Group();
      g.add(mesh(cylinder, trim, [0, 0, 0], [0.38, 0.07, 0.38]));
      g.add(mesh(torus, metal, [0, 0.03, 0], [0.38, 0.38, 0.6], Math.PI / 2));
      g.add(mesh(star, glow, [0, 0.04, 0], [0.24, 0.24, 0.24], -Math.PI / 2));
      return g;
    },
    pad: () => {
      const g = new THREE.Group();
      g.add(mesh(padCap, main, [0, -0.1, 0], [0.62, 0.34, 0.74]));
      const rimY = -0.1 + 0.34 * Math.cos(Math.PI * 0.42);
      const rimR = Math.sin(Math.PI * 0.42);
      g.add(mesh(torus, trim, [0, rimY, 0], [0.62 * rimR, 0.74 * rimR, 0.5], Math.PI / 2));
      g.add(mesh(box, glow, [0, 0.24, 0], [0.5, 0.02, 0.06]));
      return g;
    },
    helmet: () => {
      const g = new THREE.Group();
      const bubble = mesh(sphere, glass);
      bubble.renderOrder = 5;
      g.add(bubble);
      g.add(mesh(torus, trim, [0, 0, -0.82], [0.6, 0.6, 1.4]));
      g.add(mesh(torus, glow, [0, 0, -0.74], [0.66, 0.66, 0.3]));
      return g;
    },
    boot: () => {
      const g = new THREE.Group();
      g.add(mesh(cylinder, sole, [0, 0.18, 0.15], [1.45, 0.36, 1.45]));
      g.add(mesh(cylinder, main, [0, 1.4, 0], [1.3, 2.1, 1.3]));
      g.add(mesh(sphere, main, [0, 0.8, 0.55], [1.25, 0.8, 1.6]));
      g.add(mesh(torus, trim, [0, 2.45, 0], [1.33, 1.33, 1.6], Math.PI / 2));
      return g;
    },
    glove: () => {
      const g = new THREE.Group();
      g.add(mesh(sphere, trim, [0, 0, 0], [1.4, 1.4, 1.4]));
      g.add(mesh(cylinder, main, [0, 0, -1.3], [1.45, 1, 1.45], Math.PI / 2));
      g.add(mesh(torus, glow, [0, 0, -1.75], [1.48, 1.48, 0.5]));
      return g;
    },
  };

  const pools = new Map<string, THREE.Object3D[]>();
  const used = new Map<string, number>();
  const take = (kind: string): THREE.Object3D => {
    const pool = pools.get(kind) ?? [];
    pools.set(kind, pool);
    const i = used.get(kind) ?? 0;
    used.set(kind, i + 1);
    if (!pool[i]) {
      const o = builders[kind]!();
      o.matrixAutoUpdate = false;
      pool.push(o);
      group.add(o);
    }
    const o = pool[i]!;
    o.visible = true;
    return o;
  };
  const place = (o: THREE.Object3D, p: Vec3, x: Vec3, y: Vec3, z: Vec3, scale: number): void => {
    o.matrix.makeBasis(new THREE.Vector3(...x), new THREE.Vector3(...y), new THREE.Vector3(...z));
    o.matrix.scale(new THREE.Vector3(scale, scale, scale));
    o.matrix.setPosition(...p);
    o.matrixWorldNeedsUpdate = true;
  };

  const shell = new Tube(suit, SEGMENTS);
  group.add(shell.mesh);
  const sleeves: Tube[] = [];
  const colors = { main: new THREE.Color(), trim: new THREE.Color() };

  return {
    group,
    update(design, grown, time, thrust) {
      used.clear();
      const outfit: CreatureOutfit = design.outfit ?? { ...defaultOutfit(design), suit: false, helmet: false, boots: false, gloves: false };
      main.color.set(outfit.color);
      trim.color.set(outfit.trim);
      glow.color.set(outfit.glow);
      colors.main.copy(main.color);
      colors.trim.copy(trim.color);
      // A beacon: a short flash every 1.2 s, dim between.
      const flash = Math.max(0, Math.sin(time * Math.PI * 1.7)) ** 6;
      blink.color.set(outfit.glow).multiplyScalar(0.25 + 1.4 * flash);
      const frames = grown.frames;

      // The suit's shell along its span, tucked into the skin at either end, trim at the ends and down the back.
      shell.mesh.visible = outfit.suit && outfit.suitTo > outfit.suitFrom + 0.01;
      if (shell.mesh.visible) {
        const n = Math.max(6, Math.min(64, Math.round((outfit.suitTo - outfit.suitFrom) * 70)));
        const rings: Vec3[][] = [];
        const cols: THREE.Color[] = [];
        for (let i = 0; i < n; i++) {
          const u = i / (n - 1);
          const s = outfit.suitFrom + (outfit.suitTo - outfit.suitFrom) * u;
          const edge = Math.min(i, n - 1 - i);
          rings.push(suitRing(frames, s, SEGMENTS, edge === 0 ? 1.0 : SUIT_PUFF));
          for (let j = 0; j < SEGMENTS; j++) cols.push(edge <= 1 || j === 0 ? colors.trim : colors.main);
        }
        shell.set(rings, cols);
      }

      // Sleeves down each limb to above its foot or hand.
      const legs = grown.skeleton.legs;
      let sl = 0;
      if (outfit.suit && outfit.sleeves) {
        for (const leg of legs) {
          const [hip, knee, end] = leg.points as [Vec3, Vec3, Vec3];
          const [r0, r1, r2] = leg.radii as [number, number, number];
          const tube = sleeves[sl] ?? new Tube(suit, SLEEVE_SEGMENTS);
          if (!sleeves[sl]) {
            sleeves.push(tube);
            group.add(tube.mesh);
          }
          tube.mesh.visible = true;
          sl++;
          tube.set(...sleeve(hip, knee, end, r0, r1, r2, colors.main, colors.trim));
        }
      }
      for (let i = sl; i < sleeves.length; i++) sleeves[i]!.mesh.visible = false;

      if (outfit.helmet) {
        const f = helmetFit(frames, outfit.helmetSize);
        const head = frames[frames.length - 1]!;
        place(take('helmet'), f.centre, head.side, head.up, head.t, f.radius);
      }

      legs.forEach((leg, i) => {
        const limb = grown.limbs[i];
        if (!limb) return;
        const end = leg.points[leg.points.length - 1]!;
        const paw = leg.radii[leg.radii.length - 1]!;
        if (!leg.arm && outfit.boots) place(take('boot'), [end[0], end[1] - paw, end[2]], [1, 0, 0], [0, 1, 0], [0, 0, 1], paw);
        else if (leg.arm && outfit.gloves) {
          const knee = leg.points[1]!;
          const z = norm([end[0] - knee[0], end[1] - knee[1], end[2] - knee[2]]);
          const x = norm(Math.abs(z[1]) > 0.95 ? cross([1, 0, 0], z) : cross([0, 1, 0], z));
          place(take('glove'), end, x, cross(z, x), z, paw);
        }
      });

      design.parts.forEach((part) => {
        if (!isGear(part.kind)) return;
        for (const mirrored of part.mirror && Math.abs(Math.sin(part.theta)) > 0.06 ? [false, true] : [false]) {
          const g = gearFrame(frames, part, mirrored, outfit.suit && part.s >= outfit.suitFrom && part.s <= outfit.suitTo);
          const o = take(part.kind);
          place(o, g.p, g.x, g.y, g.z, g.scale * (part.kind === 'beacon' ? 0.9 : part.kind === 'badge' ? 0.8 : 1));
          if (part.kind === 'jetpack') {
            let k = 0;
            o.traverse((c) => {
              if (c.name !== 'flame') return;
              const len = (0.25 + 0.95 * thrust) * (0.85 + 0.15 * Math.sin(time * 41 + k++ * 2.1));
              c.scale.set(1, 1, len);
            });
          }
        }
      });

      for (const [kind, pool] of pools) pool.forEach((o, i) => (o.visible = i < (used.get(kind) ?? 0)));
    },
    dispose() {
      shell.dispose();
      for (const t of sleeves) t.dispose();
      for (const m of materials) m.dispose();
    },
  };
}

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function norm(a: Vec3): Vec3 {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

/** A sleeve's rings from the hip (or shoulder) down to most of the way to the foot (or hand), a cuff of trim at its end. */
function sleeve(hip: Vec3, knee: Vec3, end: Vec3, r0: number, r1: number, r2: number, main: THREE.Color, trim: THREE.Color): [Vec3[][], THREE.Color[]] {
  const stop: Vec3 = [knee[0] + (end[0] - knee[0]) * 0.72, knee[1] + (end[1] - knee[1]) * 0.72, knee[2] + (end[2] - knee[2]) * 0.72];
  const rStop = r1 + (r2 - r1) * 0.72;
  const pts: { p: Vec3; r: number }[] = [];
  const per = 5;
  for (let i = 0; i < per; i++) {
    const t = i / per;
    pts.push({ p: [hip[0] + (knee[0] - hip[0]) * t, hip[1] + (knee[1] - hip[1]) * t, hip[2] + (knee[2] - hip[2]) * t], r: r0 + (r1 - r0) * t });
  }
  for (let i = 0; i <= per; i++) {
    const t = i / per;
    pts.push({ p: [knee[0] + (stop[0] - knee[0]) * t, knee[1] + (stop[1] - knee[1]) * t, knee[2] + (stop[2] - knee[2]) * t], r: r1 + (rStop - r1) * t });
  }
  const rings: Vec3[][] = [];
  const cols: THREE.Color[] = [];
  // Carried round the sleeve from ring to ring (as the spine's frames are), so it doesn't twist at the knee.
  let a: Vec3 | null = null;
  pts.forEach((q, i) => {
    const prev = pts[Math.max(0, i - 1)]!.p;
    const next = pts[Math.min(pts.length - 1, i + 1)]!.p;
    const t = norm([next[0] - prev[0], next[1] - prev[1], next[2] - prev[2]]);
    const ref: Vec3 = a ?? (Math.abs(t[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]);
    const d = ref[0] * t[0] + ref[1] * t[1] + ref[2] * t[2];
    a = norm([ref[0] - t[0] * d, ref[1] - t[1] * d, ref[2] - t[2] * d]);
    // Round the same way as the suit's rings (so the faces' winding points out).
    const b = cross(a, t);
    const r = q.r * (i === pts.length - 1 ? 1.32 : 1.22);
    const ring: Vec3[] = [];
    for (let j = 0; j < SLEEVE_SEGMENTS; j++) {
      const th = (j / SLEEVE_SEGMENTS) * Math.PI * 2;
      const c = Math.cos(th) * r;
      const s = Math.sin(th) * r;
      ring.push([q.p[0] + a[0] * c + b[0] * s, q.p[1] + a[1] * c + b[1] * s, q.p[2] + a[2] * c + b[2] * s]);
      cols.push(i >= pts.length - 2 ? trim : main);
    }
    rings.push(ring);
  });
  return [rings, cols];
}

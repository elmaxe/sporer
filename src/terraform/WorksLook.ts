import * as THREE from 'three';
import { beamEase } from '../cargo/beam';
import { ParticlePool, type Puff } from '../cargo/CargoFx';
import type { WorksKind, WorksRun } from '../gen/terraform';
import { Rng, hashSeed } from '../gen/rng';
import { zonalWind } from '../gen/weather';
import { CLOUD_RENDER_ORDER } from '../world/weatherLook';
import { greenhouseParams, worksDescent, type GroundWorks } from './greenhouse';

/*
 * The greenhouse works on a body's ground (terraform/greenhouse.ts), drawn
 * in low orbit and the planet lab's globe view from what the log says
 * stands there now: low-poly, flat-shaded buildings in planet units (the
 * UFO is ~4 wide). Too small to see from the system view, so it doesn't
 * draw them.
 *
 * - A greenhouse factory: a pad, two halls and two stacks, their plumes
 *   drifting off on the zonal wind while it runs.
 * - A carbon sink: a crusher with its intake tower, a conveyor and a heap
 *   of green crushed olivine (the rock that locks CO₂ away), air drawn into
 *   the intake while it runs.
 *
 * Each is lowered down a beam from above as it's set down and lifted back
 * up it as it's taken away (`worksDescent`), so a debug dump or a later
 * visit shows the same moment.
 */

const RENDER_ORDER = CLOUD_RENDER_ORDER + 1;
const Y = new THREE.Vector3(0, 1, 0);

/** Where a stack top or the intake is on a works, in its own frame (y up from the ground). */
const FACTORY_STACKS: readonly [number, number, number][] = [
  [1.6, 9.2, -1.4],
  [3.1, 7.8, -1.4],
];
const SINK_INTAKE: [number, number, number] = [-1.6, 7.6, 0];
/** The pad: its radius, its mesh's height and how high its top stands (planet units). */
const PAD_RADIUS = 5.6;
const PAD_HEIGHT = 2.6;
const PAD_TOP = 0.3;
/** How far round a works (radians of arc per planet unit of its size) plants under it are hidden. */
const FOOTPRINT = 6;

interface Part {
  geometry: THREE.BufferGeometry;
  color: string;
  emissive?: string;
  at: [number, number, number];
  rotate?: [number, number, number];
}

function box(w: number, h: number, d: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
}

function cylinder(r: number, h: number, sides = 8, top = r): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(top, r, h, sides).translate(0, h / 2, 0);
}

function factoryParts(): Part[] {
  return [
    // A pad with a skirt that reaches down into a slope.
    { geometry: cylinder(5.4, 2.6, 10, 5.2), color: '#8d8a83', at: [0, -2.3, 0] },
    { geometry: box(5.5, 3.2, 4.2), color: '#d8d3c6', at: [-1.4, 0.3, 0.6] },
    { geometry: box(3.6, 2.2, 3), color: '#b9b2a2', at: [2.1, 0.3, 1.4] },
    { geometry: box(5.9, 0.35, 4.6), color: '#8f5b45', at: [-1.4, 3.5, 0.6] },
    { geometry: box(3.9, 0.3, 3.3), color: '#7b4f3c', at: [2.1, 2.5, 1.4] },
    { geometry: box(5.6, 0.25, 0.25), color: '#ffd27a', emissive: '#ffb347', at: [-1.4, 1.6, 2.72] },
    { geometry: cylinder(0.6, 9, 8, 0.45), color: '#c9c4bb', at: [1.6, 0.3, -1.4] },
    { geometry: cylinder(0.5, 7.5, 8, 0.38), color: '#c9c4bb', at: [3.1, 0.3, -1.4] },
    { geometry: cylinder(0.47, 0.8, 8), color: '#c0483a', at: [1.6, 8.4, -1.4] },
    { geometry: cylinder(0.4, 0.7, 8), color: '#c0483a', at: [3.1, 7.1, -1.4] },
    { geometry: cylinder(1.1, 1.8, 8), color: '#7f8c8d', at: [-3.6, 0.3, -2.1] },
  ];
}

function sinkParts(): Part[] {
  const heap = new THREE.ConeGeometry(3.4, 3.2, 9).translate(0, 1.6, 0);
  return [
    { geometry: cylinder(5.8, 2.6, 10, 5.6), color: '#8d8a83', at: [0, -2.3, 0] },
    { geometry: box(3.4, 3.4, 3.4), color: '#9aa3a8', at: [-1.6, 0.3, 0] },
    { geometry: cylinder(0.9, 4, 8, 0.7), color: '#6f7a80', at: [-1.6, 3.7, 0] },
    { geometry: new THREE.CylinderGeometry(1.5, 0.75, 1, 8).translate(0, 0.5, 0), color: '#5c656a', at: [-1.6, 7.4, 0] },
    { geometry: box(4.6, 0.35, 0.9), color: '#3d4245', at: [1.3, 2.4, 0], rotate: [0, 0, -0.38] },
    { geometry: heap, color: '#7d9450', at: [2.6, 0.2, 0.3] },
    { geometry: new THREE.ConeGeometry(1.8, 1.6, 7).translate(0, 0.8, 0), color: '#93aa62', at: [1.2, 0.2, -2.4] },
    { geometry: box(0.3, 0.3, 0.3), color: '#7dffa8', emissive: '#4dff88', at: [-1.6, 3.75, 1.75] },
  ];
}

/** The meshes for one kind, shared by every works of it. */
class Kit {
  readonly parts: { geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial; part: Part }[];

  constructor(parts: Part[]) {
    this.parts = parts.map((part) => ({
      geometry: part.geometry,
      material: new THREE.MeshStandardMaterial({
        color: part.color,
        flatShading: true,
        roughness: 0.85,
        metalness: 0.05,
        emissive: part.emissive ?? '#000000',
        emissiveIntensity: part.emissive ? 1.2 : 0,
      }),
      part,
    }));
  }

  build(): THREE.Group {
    const group = new THREE.Group();
    for (const { geometry, material, part } of this.parts) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...part.at);
      if (part.rotate) mesh.rotation.set(...part.rotate);
      group.add(mesh);
    }
    return group;
  }

  dispose(): void {
    for (const { geometry, material } of this.parts) {
      geometry.dispose();
      material.dispose();
    }
  }
}

interface Shown {
  run: WorksRun;
  group: THREE.Group;
  /** Its turn about the local up, from its site. */
  yaw: number;
  owed: number;
  /** Where its pad sits (planet units from the centre), and how far its skirt reaches down to the lowest ground under its rim. */
  seat: number;
  skirt: number;
}

/** What the look needs from the globe: the ground's radius in a direction (body frame). */
export type WorksGround = (dir: THREE.Vector3) => number;

export class WorksLook {
  readonly object = new THREE.Group();
  private readonly kits: Record<WorksKind, Kit> = { factory: new Kit(factoryParts()), sink: new Kit(sinkParts()) };
  private readonly shown = new Map<string, Shown>();
  private readonly puffs: ParticlePool;
  private readonly beam: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  private readonly beams: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly rng: Rng;
  private readonly dir = new THREE.Vector3();
  private readonly ground = new THREE.Vector3();
  private readonly east = new THREE.Vector3();
  private readonly north = new THREE.Vector3();
  private readonly v = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly turn = new THREE.Quaternion();
  private readonly puff: Puff = {
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    life: 1,
    size: 1,
    endSize: 1,
    color: '#ffffff',
    alpha: 1,
    lift: 0,
    up: new THREE.Vector3(),
    drag: 0,
  };
  private sites: { dir: THREE.Vector3; cos: number }[] = [];

  constructor(
    private readonly scene: THREE.Scene,
    private readonly groundRadius: WorksGround,
    seed: string,
    /** True for a super-rotating sky (a Venus deck): the wind blows one way everywhere. */
    private readonly superRotation = false,
  ) {
    this.rng = new Rng(hashSeed('works-look', seed));
    scene.add(this.object);
    this.puffs = new ParticlePool(scene, false, RENDER_ORDER);
    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 1, 20, 1, true).translate(0, 0.5, 0),
      new THREE.MeshBasicMaterial({ color: '#ffd58a', transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    );
    this.beam.renderOrder = RENDER_ORDER;
  }

  /** How many works are drawn now. */
  get count(): number {
    return this.shown.size;
  }

  /** True if `dir` (unit, body frame) is under a works standing now (plants there are hidden). */
  covers(dir: THREE.Vector3): boolean {
    for (const s of this.sites) if (dir.dot(s.dir) > s.cos) return true;
    return false;
  }

  /**
   * Shows the works as they are at game time `time` (`dt`: the frame's
   * seconds, for the plumes; 0 to pose without them). Returns true when the
   * set standing on the ground changed (to re-hide plants).
   */
  set(works: GroundWorks, time: number, dt: number): boolean {
    const keep = new Set<string>();
    const sites: { dir: THREE.Vector3; cos: number }[] = [];
    let beam = 0;
    for (const run of works.runs) {
      const id = `${run.kind}:${run.placed}:${run.site.join(',')}`;
      keep.add(id);
      let s = this.shown.get(id);
      if (!s) {
        s = { run, group: this.kits[run.kind].build(), yaw: ((hashSeed(id) % 3600) / 3600) * Math.PI * 2, owed: 0, seat: 0, skirt: 0 };
        this.seat(s);
        this.object.add(s.group);
        this.shown.set(id, s);
      }
      s.run = run;
      const descent = beamEase(worksDescent(run, time));
      this.dir.set(...run.site).normalize();
      const r = s.seat;
      this.ground.copy(this.dir).multiplyScalar(r);
      const height = greenhouseParams.dropHeight * (1 - descent);
      const g = s.group;
      g.position.copy(this.dir).multiplyScalar(r + height);
      this.q.setFromUnitVectors(Y, this.dir);
      this.turn.setFromAxisAngle(Y, s.yaw);
      g.quaternion.copy(this.q).multiply(this.turn);
      // Small at the top of the beam (as cargo is), full size on the ground.
      g.scale.setScalar(0.25 + 0.75 * descent);
      const moving = descent < 1;
      if (moving) this.showBeam(beam++, this.ground, greenhouseParams.dropHeight);
      const standing = run.removed === null || time < run.removed;
      if (standing && descent >= 1) sites.push({ dir: this.dir.clone(), cos: Math.cos(FOOTPRINT / Math.max(r, 1)) });
      const running = run.from <= time && (run.removed === null || time < run.removed);
      if (running && dt > 0) this.emit(s, dt);
    }
    for (let i = beam; i < this.beams.length; i++) this.beams[i]!.visible = false;
    for (const [id, s] of this.shown) {
      if (keep.has(id)) continue;
      this.object.remove(s.group);
      this.shown.delete(id);
    }
    const changed = sites.length !== this.sites.length || sites.some((s, i) => !s.dir.equals(this.sites[i]!.dir));
    this.sites = sites;
    this.puffs.update(dt);
    return changed;
  }

  /** The particles' size on screen follows the canvas's height and the camera's field of view. */
  setView(viewHeight: number, fov: number): void {
    this.puffs.setView(viewHeight, fov);
  }

  dispose(): void {
    this.scene.remove(this.object);
    for (const k of Object.values(this.kits)) k.dispose();
    for (const b of this.beams) {
      this.scene.remove(b);
      b.material.dispose();
    }
    this.beam.geometry.dispose();
    this.beam.material.dispose();
    this.puffs.dispose();
  }

  /**
   * Seats a works on uneven ground: its pad at the mean height under its
   * rim (so it's neither perched on a crest nor sunk in a hollow), the skirt
   * reaching down to the lowest of it.
   */
  private seat(s: Shown): void {
    const dir = this.v.set(...s.run.site).normalize();
    this.east.crossVectors(Y, dir);
    if (this.east.lengthSq() < 1e-6) this.east.set(1, 0, 0);
    this.east.normalize();
    this.north.crossVectors(dir, this.east);
    const centre = this.groundRadius(dir);
    let sum = centre;
    let low = centre;
    const n = 8;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      this.ground
        .copy(dir)
        .multiplyScalar(centre)
        .addScaledVector(this.east, Math.cos(a) * PAD_RADIUS)
        .addScaledVector(this.north, Math.sin(a) * PAD_RADIUS)
        .normalize();
      const h = this.groundRadius(this.ground);
      sum += h;
      low = Math.min(low, h);
    }
    s.seat = sum / (n + 1);
    s.skirt = s.seat - low + 0.5;
    const pad = s.group.children[0];
    if (pad) {
      // The pad's mesh is PAD_HEIGHT tall with its top at PAD_TOP.
      pad.position.y = -Math.max(PAD_HEIGHT - PAD_TOP, s.skirt);
      pad.scale.y = (PAD_TOP - pad.position.y) / PAD_HEIGHT;
    }
  }

  /** Beam `i` from the ground point `foot` up `length` units. */
  private showBeam(i: number, foot: THREE.Vector3, length: number): void {
    let b = this.beams[i];
    if (!b) {
      b = new THREE.Mesh(this.beam.geometry, this.beam.material.clone());
      b.renderOrder = RENDER_ORDER;
      b.frustumCulled = false;
      this.scene.add(b);
      this.beams.push(b);
    }
    b.position.copy(foot);
    this.v.copy(foot).normalize();
    b.quaternion.setFromUnitVectors(Y, this.v);
    b.scale.set(4.5, length, 4.5);
    b.visible = true;
  }

  /** A running works' plume (factory) or the air drawn into its intake (sink). */
  private emit(s: Shown, dt: number): void {
    const factory = s.run.kind === 'factory';
    s.owed += dt * (factory ? 7 : 5);
    if (s.owed < 1) return;
    const up = this.dir;
    // East along the spin, north towards the pole: the zonal wind blows the plume along.
    this.east.crossVectors(Y, up);
    if (this.east.lengthSq() < 1e-6) this.east.set(1, 0, 0);
    this.east.normalize();
    this.north.crossVectors(up, this.east);
    const lat = Math.asin(Math.max(-1, Math.min(1, up.y)));
    const wind = zonalWind(lat, this.superRotation) * 2.2;
    const p = this.puff;
    while (s.owed >= 1) {
      s.owed--;
      if (factory) {
        const stack = FACTORY_STACKS[this.rng.int(0, FACTORY_STACKS.length - 1)]!;
        this.local(s.group, stack, p.position);
        p.velocity
          .copy(up)
          .multiplyScalar(2.2 + this.rng.next())
          .addScaledVector(this.east, wind + this.rng.range(-0.3, 0.3))
          .addScaledVector(this.north, this.rng.range(-0.3, 0.3));
        p.size = 1.2;
        p.endSize = 6.5;
        p.life = 5 + this.rng.next() * 2;
        p.color = this.rng.next() < 0.5 ? '#d9cfb8' : '#c4b89c';
        p.alpha = 0.42;
        p.lift = 0.3;
        p.drag = 0.15;
      } else {
        // Air drawn in from round the intake.
        const a = this.rng.next() * Math.PI * 2;
        const d = 5 + this.rng.next() * 3;
        this.local(s.group, SINK_INTAKE, this.v);
        p.position
          .copy(this.v)
          .addScaledVector(this.east, Math.cos(a) * d)
          .addScaledVector(this.north, Math.sin(a) * d)
          .addScaledVector(up, this.rng.range(1, 3));
        p.velocity.subVectors(this.v, p.position).multiplyScalar(0.55);
        p.size = 2.2;
        p.endSize = 0.4;
        p.life = 1.8;
        p.color = '#e8efe2';
        p.alpha = 0.22;
        p.lift = 0;
        p.drag = 0;
      }
      p.up.copy(up);
      this.puffs.emit(p);
    }
  }

  /** A point given in a works' own frame, in the body frame. */
  private local(group: THREE.Group, at: readonly [number, number, number], out: THREE.Vector3): THREE.Vector3 {
    return out.set(at[0], at[1], at[2]).applyQuaternion(group.quaternion).multiplyScalar(group.scale.x).add(group.position);
  }
}

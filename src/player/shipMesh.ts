import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { AFTER_ATMOSPHERE_RENDER_ORDER } from '../world/atmosphereShell';
import { HULL_DEPTH, HULL_RADIUS } from '../planet/ground';
import type { CaptainLook } from './captainMesh';
import { SHIP_PARTS, instances, partFrame, type PaintChannel, type ShipDesign, type ShipPaint, type ShipPart, type ShipPartKind } from '../gen/ship';

/*
 * How a ship design is drawn: each part kind is a few simple meshes (made
 * once, at size 1, in the part's own frame: +y out of the surface it's
 * stuck to, +z the nose), each in one paint channel. A part's copies
 * (mirror, radial) are the same meshes under a group turned about the
 * vertical axis and mirrored (three.js flips the winding of a mirrored
 * matrix itself). Every mesh knows its part and copy (`userData`), so the
 * editor picks parts by raycasting the drawn ship.
 *
 * Materials are shared per channel and colour: the hull's carries the
 * paint's pattern (a small canvas texture in the base and trim colours),
 * metal finishes reflect a soft room environment (set on the scene by the
 * editor). Glows are unlit; exhaust plumes are additive cones hidden until
 * the engines run.
 */

export interface PartMeshInfo {
  part: number;
  copy: number;
  mirrored: boolean;
}

interface Piece {
  geometry: THREE.BufferGeometry;
  channel: PaintChannel | 'exhaust' | 'blink';
  /** Pieces in a spinning group (rings) turn about the part's y while flying. */
  spins?: boolean;
  /** Where the mesh sits in the part (plumes: their base, so they scale from the nozzle). */
  at?: [number, number, number];
}

const pieceCache = new Map<ShipPartKind, Piece[]>();

/** A swept planform (span along +y, chord along z, `t` thick in x): wings and fins. */
function planform(rootChord: number, tipChord: number, span: number, sweep: number, t: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  // Shape x = chord (becomes the part's z), shape y = span.
  s.moveTo(-rootChord / 2, 0);
  s.lineTo(rootChord / 2, 0);
  s.lineTo(rootChord / 2 - sweep, span);
  s.lineTo(rootChord / 2 - sweep - tipChord, span);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: true, bevelThickness: t * 0.4, bevelSize: t * 0.4, bevelSegments: 2 });
  g.translate(0, 0, -t / 2);
  // Extrusions' uvs are in units: bring them to about 0 to 1, as the other parts' are, for the hull pattern.
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / Math.max(rootChord, span), uv.getY(i) / Math.max(rootChord, span));
  // Shape x → part z, extrusion z → part x.
  g.rotateY(-Math.PI / 2);
  return g;
}

function along(g: THREE.BufferGeometry): THREE.BufferGeometry {
  // Three's cylinders, cones and capsules stand along y; lay them along z (their +y end to +z).
  return g.rotateX(Math.PI / 2);
}

function flatRing(r: number, tube: number): THREE.BufferGeometry {
  return new THREE.TorusGeometry(r, tube, 10, 64).rotateX(Math.PI / 2);
}

function pieces(kind: ShipPartKind): Piece[] {
  const cached = pieceCache.get(kind);
  if (cached) return cached;
  const out: Piece[] = [];
  const p = (geometry: THREE.BufferGeometry, channel: Piece['channel'], spins = false, at?: Piece['at']) => out.push({ geometry, channel, spins, at });
  switch (kind) {
    case 'saucer':
      p(new THREE.SphereGeometry(2, 48, 24).scale(1, 0.28, 1), 'base');
      p(flatRing(1.97, 0.07), 'trim');
      p(new THREE.CircleGeometry(0.5, 32).rotateX(Math.PI / 2).translate(0, -0.57, 0), 'glow');
      break;
    case 'sphere':
      p(new THREE.SphereGeometry(1.2, 40, 24), 'base');
      p(flatRing(1.21, 0.06), 'trim');
      break;
    case 'pod':
      p(along(new THREE.CapsuleGeometry(0.8, 2.2, 12, 32)), 'base');
      p(flatRing(0.81, 0.06).rotateX(Math.PI / 2).translate(0, 0, 0.6), 'trim');
      p(flatRing(0.81, 0.06).rotateX(Math.PI / 2).translate(0, 0, -0.6), 'trim');
      break;
    case 'cone':
      p(along(new THREE.ConeGeometry(0.8, 2.6, 40, 1)), 'base');
      p(flatRing(0.8, 0.07).rotateX(Math.PI / 2).translate(0, 0, -1.3), 'trim');
      break;
    case 'block':
      p(new RoundedBoxGeometry(1.6, 0.7, 2.2, 3, 0.16), 'base');
      p(new RoundedBoxGeometry(1.66, 0.18, 2.26, 2, 0.06), 'trim');
      break;
    case 'ring': {
      p(flatRing(1.6, 0.16), 'trim', true);
      const bulb = new THREE.SphereGeometry(0.14, 12, 8);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        p(bulb.clone().translate(Math.cos(a) * 1.6, 0.14, Math.sin(a) * 1.6), 'blink', true);
      }
      break;
    }
    case 'dome':
      p(new THREE.SphereGeometry(0.9, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), 'glass');
      p(flatRing(0.9, 0.06), 'trim');
      break;
    case 'canopy':
      p(new THREE.SphereGeometry(0.6, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.9, 2), 'glass');
      p(flatRing(0.6, 0.05).scale(1, 1, 2), 'trim');
      break;
    case 'wing':
      p(planform(1.6, 0.6, 2.2, 1.1, 0.1), 'base');
      p(new THREE.SphereGeometry(0.09, 12, 8).translate(0, 2.2, 0.8 - 1.1 - 0.3), 'blink');
      break;
    case 'fin':
      p(planform(1.2, 0.4, 1.3, 0.9, 0.08), 'trim');
      break;
    case 'engine':
      p(along(new THREE.CylinderGeometry(0.42, 0.5, 1.4, 28, 1)), 'base');
      p(along(new THREE.SphereGeometry(0.42, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2)).translate(0, 0, 0.7), 'detail');
      p(along(new THREE.CylinderGeometry(0.44, 0.56, 0.5, 28, 1, true)).translate(0, 0, -0.95), 'detail');
      p(new THREE.CircleGeometry(0.42, 28).rotateY(Math.PI).translate(0, 0, -0.75), 'glow');
      p(flatRing(0.5, 0.06).rotateX(Math.PI / 2).translate(0, 0, 0.15), 'trim');
      // The plume: a cone from the nozzle backwards (its tip to −z).
      p(new THREE.ConeGeometry(0.42, 2.4, 20, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -1.2), 'exhaust', false, [0, 0, -1.2]);
      break;
    case 'thruster':
      p(new THREE.CylinderGeometry(0.46, 0.46, 0.12, 24).translate(0, 0.06, 0), 'trim');
      p(new THREE.CylinderGeometry(0.26, 0.4, 0.5, 24, 1, true).rotateX(Math.PI).translate(0, 0.37, 0), 'detail');
      p(new THREE.CircleGeometry(0.26, 24).rotateX(-Math.PI / 2).translate(0, 0.2, 0), 'glow');
      p(new THREE.ConeGeometry(0.4, 1.8, 20, 1, true).translate(0, 0.9, 0), 'exhaust', false, [0, 0.62, 0]);
      break;
    case 'cannon':
      p(new RoundedBoxGeometry(0.6, 0.36, 0.8, 2, 0.08), 'trim');
      for (const x of [-0.15, 0.15]) {
        p(along(new THREE.CylinderGeometry(0.07, 0.09, 1.5, 12)).translate(x, 0.04, 0.85), 'detail');
        p(flatRing(0.08, 0.035).rotateX(Math.PI / 2).translate(x, 0.04, 1.6), 'glow');
      }
      break;
    case 'light':
      p(new THREE.CylinderGeometry(0.16, 0.22, 0.1, 16).translate(0, 0.05, 0), 'trim');
      p(new THREE.SphereGeometry(0.15, 16, 10).translate(0, 0.14, 0), 'blink');
      break;
    case 'antenna':
      p(new THREE.CylinderGeometry(0.12, 0.16, 0.08, 12).translate(0, 0.04, 0), 'trim');
      p(new THREE.CylinderGeometry(0.025, 0.05, 1.6, 8).translate(0, 0.8, 0), 'detail');
      p(new THREE.SphereGeometry(0.08, 12, 8).translate(0, 1.62, 0), 'blink');
      break;
    case 'dish': {
      p(new THREE.CylinderGeometry(0.05, 0.08, 0.5, 10).translate(0, 0.25, 0), 'detail');
      const prof: THREE.Vector2[] = [];
      for (let i = 0; i <= 12; i++) {
        const r = (i / 12) * 0.9;
        prof.push(new THREE.Vector2(Math.max(0.001, r), 0.45 * r * r));
      }
      p(new THREE.LatheGeometry(prof, 32).translate(0, 0.5, 0), 'trim');
      p(new THREE.CylinderGeometry(0.015, 0.015, 0.45, 6).translate(0, 0.72, 0), 'detail');
      p(new THREE.SphereGeometry(0.05, 10, 8).translate(0, 0.95, 0), 'glow');
      break;
    }
    case 'grabber': {
      p(new THREE.CylinderGeometry(0.3, 0.36, 0.2, 20).translate(0, 0.1, 0), 'trim');
      p(new THREE.SphereGeometry(0.22, 16, 10).translate(0, 0.25, 0), 'detail');
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0.12, 0.3, 0), new THREE.Vector3(0.38, 0.7, 0), new THREE.Vector3(0.32, 1.0, 0), new THREE.Vector3(0.12, 1.12, 0)]);
      const prong = new THREE.TubeGeometry(curve, 16, 0.045, 6, false);
      for (let i = 0; i < 3; i++) p(prong.clone().rotateY((i / 3) * Math.PI * 2), 'detail');
      break;
    }
  }
  pieceCache.set(kind, out);
  return out;
}

/** The scale of a part's frame: its size, and its stretch along its stretch axis. */
export function partScale(p: ShipPart): THREE.Vector3 {
  const v = new THREE.Vector3(p.size, p.size, p.size);
  v.setComponent(SHIP_PARTS[p.kind].stretchAxis, p.size * p.stretch);
  return v;
}

/** A part's own matrix (ship space, before its copy's turn and mirror). */
export function partMatrix(p: ShipPart, out = new THREE.Matrix4()): THREE.Matrix4 {
  const f = partFrame(p);
  out.makeBasis(new THREE.Vector3(...f.x), new THREE.Vector3(...f.y), new THREE.Vector3(...f.z));
  out.scale(partScale(p));
  out.setPosition(...f.origin);
  return out;
}

/** The turn and mirror of one of a part's copies. */
export function instanceMatrix(angle: number, mirrored: boolean, out = new THREE.Matrix4()): THREE.Matrix4 {
  out.makeRotationY(angle);
  if (mirrored) out.premultiply(new THREE.Matrix4().makeScale(-1, 1, 1));
  return out;
}

/** The hull pattern, in the base and trim colours. */
function patternTexture(paint: Pick<ShipPaint, 'pattern' | 'patternScale'>, base: string, trim: string): THREE.CanvasTexture | null {
  if (paint.pattern === 'plain') return null;
  const n = 256;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d')!;
  g.fillStyle = base;
  g.fillRect(0, 0, n, n);
  g.fillStyle = trim;
  switch (paint.pattern) {
    case 'stripes':
      g.fillRect(0, n * 0.4, n, n * 0.2);
      break;
    case 'checker':
      g.fillRect(0, 0, n / 2, n / 2);
      g.fillRect(n / 2, n / 2, n / 2, n / 2);
      break;
    case 'hazard':
      for (let i = -n; i < n * 2; i += n / 2) {
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i + n / 4, 0);
        g.lineTo(i + n / 4 - n, n);
        g.lineTo(i - n, n);
        g.fill();
      }
      break;
    case 'panels': {
      // A couple of panels in the trim colour, seams and rivets.
      g.globalAlpha = 0.85;
      g.fillRect(n * 0.5, 0, n * 0.5, n * 0.25);
      g.fillRect(0, n * 0.5, n * 0.25, n * 0.5);
      g.globalAlpha = 1;
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.lineWidth = 3;
      for (const t of [0, 0.25, 0.5, 0.75]) {
        g.beginPath();
        g.moveTo(0, t * n);
        g.lineTo(n, t * n);
        g.stroke();
      }
      for (const t of [0, 0.5]) {
        g.beginPath();
        g.moveTo(t * n, 0);
        g.lineTo(t * n, n);
        g.stroke();
      }
      g.fillStyle = 'rgba(0,0,0,0.3)';
      for (let x = 0; x < 8; x++) for (const y of [0.04, 0.29, 0.54, 0.79]) g.fillRect(x * 32 + 14, y * n - 2, 4, 4);
      break;
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4 * paint.patternScale, 2 * paint.patternScale);
  t.anisotropy = 8;
  return t;
}

const FINISH: Record<ShipPaint['finish'], { metalness: number; roughness: number }> = {
  metal: { metalness: 0.8, roughness: 0.32 },
  gloss: { metalness: 0.1, roughness: 0.18 },
  matte: { metalness: 0, roughness: 0.85 },
};

/** The ship's materials, shared by channel and colour; `glowLevel` drives every glow's brightness. */
export class ShipMaterials {
  private readonly cache = new Map<string, THREE.Material>();
  /** 0 to 1+: lights and engines' brightness (the editor raises it while flying). */
  readonly blink: THREE.MeshBasicMaterial;
  readonly exhaust: THREE.MeshBasicMaterial;
  private paintKey = '';

  /**
   * `reflections`: the scene has an environment for metal to reflect (the
   * editor's hangar). The game's space has none, and metal with nothing to
   * reflect draws black, so there metal finishes are kept mostly diffuse.
   */
  constructor(private readonly reflections = true) {
    this.blink = new THREE.MeshBasicMaterial({ toneMapped: false });
    this.exhaust = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  }

  /** Drops materials when the paint changes (a part's own paint is a key of its own). */
  setPaint(paint: ShipPaint): void {
    const key = JSON.stringify(paint);
    if (key === this.paintKey) return;
    this.paintKey = key;
    this.dispose();
    this.blink.color.set(paint.glow);
    this.exhaust.color.set(paint.glow);
  }

  get(channel: Piece['channel'], paint: ShipPaint, own?: ShipPart['paint']): THREE.Material {
    if (channel === 'blink') return this.blink;
    if (channel === 'exhaust') return this.exhaust;
    const base = own?.base ?? paint.base;
    const trim = own?.trim ?? paint.trim;
    const key = channel === 'base' ? `base|${base}|${trim}` : channel === 'trim' ? `trim|${trim}` : channel;
    let m = this.cache.get(key);
    if (m) return m;
    const finish = this.reflections ? FINISH[paint.finish] : { metalness: Math.min(0.35, FINISH[paint.finish].metalness), roughness: Math.max(0.4, FINISH[paint.finish].roughness) };
    switch (channel) {
      case 'base': {
        const map = patternTexture(paint, base, trim);
        m = new THREE.MeshStandardMaterial({ color: map ? '#ffffff' : base, map, ...finish });
        break;
      }
      case 'trim':
        m = new THREE.MeshStandardMaterial({ color: trim, metalness: finish.metalness * 0.8, roughness: Math.min(0.9, finish.roughness + 0.1), side: THREE.DoubleSide });
        break;
      case 'detail':
        m = new THREE.MeshStandardMaterial({ color: paint.detail, metalness: this.reflections ? 0.7 : 0.3, roughness: 0.45, side: THREE.DoubleSide });
        break;
      case 'glass':
        // Clear enough to see the captain inside.
        m = new THREE.MeshPhysicalMaterial({ color: paint.glass, emissive: new THREE.Color(paint.glass).multiplyScalar(0.12), metalness: 0, roughness: 0.05, transparent: true, opacity: 0.45, clearcoat: 1 });
        break;
      case 'glow':
        m = new THREE.MeshBasicMaterial({ color: paint.glow, toneMapped: false, side: THREE.DoubleSide });
        break;
    }
    this.cache.set(key, m);
    return m;
  }

  dispose(): void {
    for (const m of this.cache.values()) {
      (m as THREE.MeshStandardMaterial).map?.dispose();
      m.dispose();
    }
    this.cache.clear();
  }
}

/** The drawn ship. */
export interface ShipModel {
  readonly group: THREE.Group;
  /** Everything that can be picked (not plumes). */
  readonly meshes: THREE.Mesh[];
  /** Ring parts' turning groups. */
  readonly spinners: THREE.Object3D[];
  readonly exhausts: THREE.Mesh[];
  /** Each part's meshes over all its copies. */
  readonly byPart: THREE.Mesh[][];
}

const noRaycast = () => {};

/** `ownGeometry`: each mesh gets its own copy of its geometry, so disposing the ship (as the game does) leaves the shared ones alone. */
export function buildShipModel(design: ShipDesign, materials: ShipMaterials, ownGeometry = false): ShipModel {
  materials.setPaint(design.paint);
  const group = new THREE.Group();
  const meshes: THREE.Mesh[] = [];
  const spinners: THREE.Object3D[] = [];
  const exhausts: THREE.Mesh[] = [];
  const byPart: THREE.Mesh[][] = design.parts.map(() => []);
  const own = new THREE.Matrix4();
  design.parts.forEach((part, i) => {
    partMatrix(part, own);
    for (const inst of instances(part)) {
      const copy = new THREE.Group();
      copy.matrixAutoUpdate = false;
      instanceMatrix(inst.angle, inst.mirrored, copy.matrix).multiply(own);
      group.add(copy);
      let spin: THREE.Group | null = null;
      for (const piece of pieces(part.kind)) {
        const m = new THREE.Mesh(ownGeometry ? piece.geometry.clone() : piece.geometry, materials.get(piece.channel, design.paint, part.paint));
        const info: PartMeshInfo = { part: i, copy: inst.copy, mirrored: inst.mirrored };
        m.userData = info;
        if (piece.at) m.position.set(...piece.at);
        m.castShadow = piece.channel !== 'exhaust' && piece.channel !== 'glass';
        m.receiveShadow = piece.channel === 'base' || piece.channel === 'trim';
        if (piece.channel === 'exhaust') {
          m.raycast = noRaycast;
          m.visible = false;
          m.renderOrder = 5;
          exhausts.push(m);
        } else {
          meshes.push(m);
          byPart[i]!.push(m);
        }
        if (piece.spins) {
          if (!spin) {
            spin = new THREE.Group();
            copy.add(spin);
            spinners.push(spin);
          }
          spin.add(m);
        } else copy.add(m);
      }
    }
  });
  return { group, meshes, spinners, exhausts, byPart };
}

/** An outline material: the back faces pushed out along their normals, drawn in one colour. */
export function outlineMaterial(color: string, width: number, opacity = 1): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, transparent: opacity < 1, opacity, depthWrite: false, toneMapped: false });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `vec3 transformed = position + normal * ${width.toFixed(4)};`);
  };
  return m;
}

/**
 * The player's own ship as the game's UFO (in place of `buildUfoMesh`'s
 * saucer): the design drawn, then scaled and centred to the saucer's
 * footprint, HULL_RADIUS across its widest and no deeper than HULL_DEPTH
 * below its centre (what the planet's ground keeps clear of; a taller ship
 * rides higher), so everything that flies, lands and collides with the
 * saucer does the same with it, nose first. `ring` stands for the saucer's turning
 * light ring: the levels turn it, and the ship's own rings turn with it.
 * `captain`, if given, is seated in its cockpit.
 */
export function buildDesignedUfo(design: ShipDesign, captain: CaptainLook | null = null): { group: THREE.Group; ring: THREE.Group } {
  const model = buildShipModel(design, new ShipMaterials(false), true);
  const inner = model.group;
  inner.updateMatrixWorld(true);
  const box = new THREE.Box3();
  for (const m of model.meshes) box.expandByObject(m);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const scale = HULL_RADIUS / Math.max(size.x / 2, size.z / 2, 1e-3);
  inner.scale.setScalar(scale);
  // Centred over its middle, and raised if that would put its underside lower than the saucer's.
  inner.position.set(-centre.x * scale, Math.max(-centre.y * scale, -HULL_DEPTH - box.min.y * scale), -centre.z * scale);
  captain?.seatIn(design, inner);
  // The editor's nose is +z; the game's UFO flies towards its −z.
  const turn = new THREE.Group();
  turn.rotation.y = Math.PI;
  turn.add(inner);
  const group = new THREE.Group();
  group.add(turn);
  const ring = new THREE.Group();
  const spin = () => {
    for (const s of model.spinners) s.rotation.y = ring.rotation.y;
  };
  if (model.meshes[0]) model.meshes[0].onBeforeRender = spin;
  // A group's renderOrder sorts everything under it, up to a nested group: set it on every one.
  group.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) o.renderOrder = AFTER_ATMOSPHERE_RENDER_ORDER;
  });
  return { group, ring };
}

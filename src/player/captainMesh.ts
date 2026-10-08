import * as THREE from 'three';
import type { Vec3 } from '../gen/animalForm';
import { creatureForm, growCreature, type CreatureDesign, type GrownCreature } from '../gen/creature';
import { suitUp } from '../gen/creatureOutfit';
import { SHIP_PARTS, instances, partFrame, type ShipDesign, type ShipPartKind } from '../gen/ship';
import { buildAnimalMesh, type AnimalMeshData } from '../surface/animalMesh';
import { createCreatureLook } from '../creaturelab/creatureLook';
import { createOutfitLook } from '../creaturelab/outfitLook';
import { instanceMatrix, partScale } from './shipMesh';

/*
 * The ship's captain drawn in its cockpit (player/captain.ts says which
 * creature): the creature editor's own creature, suited up for space
 * (gen/creatureOutfit.ts `suitUp`: suit, boots, gloves, bubble helmet,
 * jetpack, pads, badge) and drawn by the editor's own looks
 * (creaturelab/creatureLook.ts, outfitLook.ts), in its rest pose.
 *
 * It sits: a body carried low leans back on its hind hips until its back
 * rises SIT_ANGLE from level, and everything below its hips (legs, the
 * tail) is sunk into the hull under the glass, so what shows is its body
 * from the waist up, its arms and its helmeted head. It is scaled as large as fits under the
 * glass: the cockpit is half an ellipsoid (a dome's hemisphere, a canopy's
 * long bubble) standing on its base, and every point of the creature above
 * its seat must be inside it, facing the ship's nose.
 */

/** Half-ellipsoid radii of each glass cockpit at size 1 (shipMesh.ts draws them). */
const GLASS: Partial<Record<ShipPartKind, [number, number, number]>> = {
  dome: [0.9, 0.9, 0.9],
  canopy: [0.6, 0.54, 1.2],
};

/** How much of the glass the captain may fill. */
const FILL = 0.94;
/** How far up from level a seated creature's back rises (radians), from its hind hips to its head. */
const SIT_ANGLE = 1;

/** The last captain grown and skinned: each level's ship seats the same one. */
let grownCache: { key: string; design: CreatureDesign; grown: GrownCreature; mesh: AnimalMeshData } | null = null;

function grownCaptain(creature: CreatureDesign): { design: CreatureDesign; grown: GrownCreature; mesh: AnimalMeshData } {
  const key = JSON.stringify(creature);
  if (grownCache?.key !== key) {
    const design = suitUp(creature);
    const grown = growCreature(design);
    grownCache = { key, design, grown, mesh: buildAnimalMesh(grown.skeleton, creatureForm(design), grown.length, 0) };
  }
  return grownCache;
}

export class CaptainLook {
  /** Placed at the cockpit's base, its y up through the glass and z to the nose. */
  readonly group = new THREE.Group();
  /** The creature in its own space (z to its snout, feet on y = 0), scaled and moved onto the seat. */
  private readonly body = new THREE.Group();
  /** Points of the drawn creature above its seat, creature space, packed x, y, z. */
  private readonly points: Float32Array;
  /** The hips: where it sits. */
  private readonly seatY: number;
  /** The middle of what shows, along its length. */
  private readonly midZ: number;

  constructor(creature: CreatureDesign) {
    const { design, grown, mesh } = grownCaptain(creature);
    const look = createCreatureLook(design, grown.length);
    look.update(mesh, null);
    look.repaint(design, grown.rest, grown.length);
    const outfit = createOutfitLook();
    outfit.update(design, grown, 0, 0);
    // Jetpack flames stay off in the cockpit.
    outfit.group.traverse((o) => {
      if (o.name === 'flame') o.visible = false;
    });
    // Each mesh its own geometry, so a ship disposed mesh by mesh (as the game does) leaves the outfit's shared ones alone.
    outfit.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry = o.geometry.clone();
    });
    // Sitting up: a body carried low (a grazer's) leans back on its hind hips until its back rises SIT_ANGLE from level.
    const legs = grown.limbs.filter((l) => !l.arm);
    const hind = legs.reduce<Vec3 | null>((h, l) => (!h || l.hip[2] < h[2] ? l.hip : h), null);
    const head = grown.frames[grown.frames.length - 1]!.p;
    const sit = new THREE.Group();
    const inner = new THREE.Group();
    if (hind) {
      const angle = Math.atan2(head[1] - hind[1], head[2] - hind[2]);
      sit.position.set(0, hind[1], hind[2]);
      inner.position.set(0, -hind[1], -hind[2]);
      sit.rotation.x = -Math.max(0, SIT_ANGLE - angle);
    }
    inner.add(look.mesh, outfit.group);
    sit.add(inner);
    this.body.add(sit);
    this.group.add(this.body);
    this.group.name = 'captain';
    // Its glass (the helmet) before the cockpit's, so the cockpit's doesn't hide it.
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh && (o.material as THREE.Material).transparent) o.renderOrder = -1;
    });

    this.seatY = hind ? hind[1] * 0.95 : 0;
    const pts: number[] = [];
    const v = new THREE.Vector3();
    this.body.updateMatrixWorld(true);
    this.body.traverseVisible((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const pos = o.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
      if (!pos) return;
      const step = Math.max(1, Math.floor(pos.count / 4000));
      for (let i = 0; i < pos.count; i += step) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        if (v.y >= this.seatY) pts.push(v.x, v.y, v.z);
      }
    });
    this.points = new Float32Array(pts);
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 2; i < pts.length; i += 3) {
      lo = Math.min(lo, pts[i]!);
      hi = Math.max(hi, pts[i]!);
    }
    this.midZ = Number.isFinite(lo) ? (lo + hi) / 2 : 0;
  }

  /**
   * Seats it in a half ellipsoid of glass with radii `r` (across, up, along)
   * on its base at y = 0, the seat `seat` above the base (the hull bulges up
   * under the glass): as large as fits.
   */
  fit(r: readonly [number, number, number], seat: number): void {
    const [rx, ry, rz] = r;
    const m2 = FILL * FILL;
    const c = (seat / ry) ** 2;
    let k = Infinity;
    const p = this.points;
    // Each point (x, y', z) scaled by k and raised by the seat is inside when
    // (kx/rx)² + ((seat + ky')/ry)² + (kz/rz)² ≤ FILL²: a quadratic in k, whose root bounds k.
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i]!;
      const y = p[i + 1]! - this.seatY;
      const z = p[i + 2]! - this.midZ;
      const a = (x / rx) ** 2 + (y / ry) ** 2 + (z / rz) ** 2;
      const b = (2 * seat * y) / (ry * ry);
      if (a < 1e-12) continue;
      const root = (-b + Math.sqrt(Math.max(0, b * b - 4 * a * (c - m2)))) / (2 * a);
      k = Math.min(k, root);
    }
    if (!Number.isFinite(k) || k <= 0) k = 0.1;
    this.body.scale.setScalar(k);
    this.body.position.set(0, seat - this.seatY * k, -this.midZ * k);
  }

  /**
   * Seats it in `ship`'s first glass cockpit (its first copy), under
   * `parent` (the drawn ship's group, ship space). Hidden when the ship has
   * no cockpit.
   */
  seatIn(ship: ShipDesign, parent: THREE.Object3D): boolean {
    parent.add(this.group);
    const part = ship.parts.find((p) => GLASS[p.kind]);
    this.group.visible = !!part;
    if (!part) return false;
    const f = partFrame(part);
    const s = partScale(part);
    const base = GLASS[part.kind]!;
    const r: [number, number, number] = [base[0] * s.x, base[1] * s.y, base[2] * s.z];
    this.group.matrixAutoUpdate = false;
    const own = new THREE.Matrix4().makeBasis(new THREE.Vector3(...f.x), new THREE.Vector3(...f.y), new THREE.Vector3(...f.z)).setPosition(...f.origin);
    const inst = instances(part)[0]!;
    instanceMatrix(inst.angle, inst.mirrored, this.group.matrix).multiply(own);
    this.group.matrixWorldNeedsUpdate = true;
    // The hull it's stuck on stands a little into the glass (cockpits are sunk into it).
    this.fit(r, -SHIP_PARTS[part.kind].standoff * part.size + r[1] * 0.06);
    return true;
  }
}

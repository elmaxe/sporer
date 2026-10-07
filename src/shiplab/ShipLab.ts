import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  MAX_COMPLEXITY,
  MAX_RADIAL,
  SHIP_PARTS,
  cloneDesign,
  complexity,
  decodeShip,
  descendants,
  duplicatePart,
  encodeShip,
  instances,
  movePart,
  newPart,
  normalize,
  removePart,
  resizePart,
  unapplyInstance,
  type ShipDesign,
  type ShipPartKind,
  type Vec3,
} from '../gen/ship';
import { ShipMaterials, buildShipModel, outlineMaterial, type PartMeshInfo, type ShipModel } from './shipMesh';

/*
 * The spaceship editor (ship.html): Spore's spaceship creator. Three modes:
 *  - Build: parts come from the palette and stick to whatever surface of
 *    the ship is under the pointer (the core or any part), mirrored and/or
 *    copied round the ship as the symmetry bar says; a click sticks one on
 *    (Shift: keep placing). Drag a part to move it over the ship (what is
 *    stuck to it comes along), the wheel over it to resize it (Shift: to
 *    stretch it), Q/E to spin it, R/F to tilt it and T/G to lean it.
 *  - Paint: the ship's colours, finish and hull pattern, and a bucket that
 *    paints one part's hull and trim (Shift: every part of that kind).
 *  - Fly: a test flight over a planet; WASD or the arrows steer and bank,
 *    Shift boosts; engines burn, rings turn, lights blink.
 * The ship is rebuilt from the design after each change (gen/ship.ts is the
 * data, shipMesh.ts the drawing). `window.shipLab` is this object
 * (automation: npm run shot -- --ships).
 */

export type ShipMode = 'build' | 'paint' | 'fly';

/** The symmetry new parts are placed with. */
export interface Symmetry {
  mirror: boolean;
  radial: number;
}

/** The paint bucket: which of a part's colours it sets, and to what. */
export interface Bucket {
  slot: 'base' | 'trim';
  color: string;
}

interface Hit {
  point: Vec3;
  normal: Vec3;
  info: PartMeshInfo;
}

const SELECT_COLOR = '#ffd23f';
const HOVER_COLOR = '#ffffff';
/** Spin and tilt steps for the keys, radians. */
const TURN_STEP = Math.PI / 12;

export class ShipLab {
  design: ShipDesign;
  mode: ShipMode = 'build';
  selection: number | null = null;
  placing: ShipPartKind | null = null;
  readonly symmetry: Symmetry = { mirror: true, radial: 1 };
  readonly bucket: Bucket = { slot: 'base', color: '#e8505b' };
  /** Fly mode's throttle, 0 to 1. */
  throttle = 0.6;
  /** Called when the design, the selection or the mode changes (the panel redraws). */
  onChange: (() => void) | null = null;

  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.05, 2000);
  readonly controls: OrbitControls;
  private readonly materials = new ShipMaterials();
  private model: ShipModel | null = null;
  /** The ship's place in the scene: still while building, banking and bobbing while flying. */
  private readonly rig = new THREE.Group();
  private dirty = true;
  private framesDrawn = 0;
  private time = 0;
  private committed: string;
  private readonly undoStack: string[] = [];
  private readonly redoStack: string[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private hovered: number | null = null;
  private ghost: number | null = null;
  private placingByDrag = false;
  private drag: { index: number; grabbed: PartMeshInfo; moved: boolean } | null = null;
  private wheelTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly selectOutline = outlineMaterial(SELECT_COLOR, 0.06);
  private readonly hoverOutline = outlineMaterial(HOVER_COLOR, 0.04, 0.6);
  private readonly hangar = new THREE.Group();
  private readonly space = new THREE.Group();
  private readonly floor: THREE.Mesh;
  /** The planet's spin about x (the ground streaming backwards under the ship). */
  private readonly planet = new THREE.Group();
  private readonly sun: THREE.DirectionalLight;
  private readonly keys = new Set<string>();
  private bank = 0;
  private pitch = 0;
  private last = performance.now();

  constructor(
    private readonly container: HTMLElement,
    design: ShipDesign,
  ) {
    this.design = design;
    this.committed = JSON.stringify(design);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', (e) => this.pointerDown(e), { capture: true });
    canvas.addEventListener('wheel', (e) => this.wheel(e), { capture: true, passive: false });
    window.addEventListener('pointermove', (e) => this.pointerMove(e));
    window.addEventListener('pointerup', (e) => this.pointerUp(e));
    window.addEventListener('keydown', (e) => this.key(e));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('resize', () => this.resize());

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 60;

    // Metal needs something to reflect: a soft room, blurred.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.7;
    pmrem.dispose();
    this.scene.add(new THREE.HemisphereLight('#dcecff', '#2a3446', 0.8));
    this.sun = new THREE.DirectionalLight('#fff4e0', 2.6);
    this.sun.position.set(6, 12, 5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -9;
    sc.right = sc.top = 9;
    sc.near = 1;
    sc.far = 40;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);

    // The hangar: a round pad with a grid, in a dim blue hall.
    this.floor = new THREE.Mesh(new THREE.CircleGeometry(14, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: padTexture(), roughness: 0.7, metalness: 0.2 }));
    this.floor.receiveShadow = true;
    this.hangar.add(this.floor);
    // The test flight: stars and a planet far below.
    this.space.add(starfield());
    // Its pole along x, so the ship flies over its equator rather than a pinched pole.
    const globe = new THREE.Mesh(new THREE.SphereGeometry(400, 96, 48), new THREE.MeshStandardMaterial({ map: planetTexture(), roughness: 0.95 }));
    globe.rotation.z = Math.PI / 2;
    this.planet.add(globe);
    this.planet.position.set(0, -430, 0);
    this.space.add(this.planet);
    this.space.visible = false;
    this.scene.add(this.hangar, this.space, this.rig);
    this.raycaster.layers.enableAll();

    this.setBackdrop();
    this.resize();
    this.rebuild();
    this.frameShip();
    this.loop();
  }

  // --- State ---

  /** True once the current design has been drawn a few times (for automation). */
  get ready(): boolean {
    return this.framesDrawn >= 4 && !this.dirty;
  }

  get complexity(): number {
    return complexity(this.design);
  }

  /** Something about the design changed (it is rebuilt; call `commit` when an edit is finished). */
  changed(): void {
    this.dirty = true;
    this.onChange?.();
  }

  /** Ends an edit: it becomes a step to undo, and the page's #hash keeps the design. */
  commit(): void {
    const now = JSON.stringify(this.design);
    if (now === this.committed) return;
    this.undoStack.push(this.committed);
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack.length = 0;
    this.committed = now;
    history.replaceState(null, '', `#${encodeShip(this.design)}`);
    this.onChange?.();
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(this.committed);
    this.restore(prev);
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.committed);
    this.restore(next);
  }

  private restore(json: string): void {
    this.cancelPlacing();
    this.committed = json;
    this.design = JSON.parse(json) as ShipDesign;
    this.selection = null;
    history.replaceState(null, '', `#${encodeShip(this.design)}`);
    this.changed();
  }

  /** A whole new ship (undoable), the camera framing it. */
  setDesign(d: ShipDesign): void {
    this.cancelPlacing();
    this.design = cloneDesign(d);
    this.selection = null;
    this.changed();
    this.commit();
    this.rebuild();
    this.frameShip();
  }

  static designFromHash(): ShipDesign | null {
    const h = location.hash.slice(1);
    return h ? decodeShip(h) : null;
  }

  setMode(mode: ShipMode): void {
    this.cancelPlacing();
    this.mode = mode;
    if (mode !== 'build') this.selection = null;
    this.setBackdrop();
    if (mode === 'fly') {
      this.controls.target.set(0, 0, 0);
      this.look('chase');
    } else {
      this.rig.position.set(0, 0, 0);
      this.rig.rotation.set(0, 0, 0);
      this.frameShip();
    }
    this.dirty = true;
    this.onChange?.();
  }

  select(index: number | null): void {
    this.selection = index !== null && this.design.parts[index] ? index : null;
    this.dirty = true;
    this.onChange?.();
  }

  /** Picks a part from the palette: it follows the pointer over the ship until a click sticks it on. */
  startPlacing(kind: ShipPartKind, byDrag = false): void {
    this.cancelPlacing();
    if (this.mode !== 'build') this.setMode('build');
    this.placing = kind;
    this.placingByDrag = byDrag;
    this.onChange?.();
  }

  cancelPlacing(): void {
    if (this.ghost !== null) {
      removePart(this.design, this.ghost);
      this.ghost = null;
      this.dirty = true;
    }
    if (this.placing) {
      this.placing = null;
      this.onChange?.();
    }
  }

  /** Places a part where the screen point (NDC, −1 to 1) hits the ship, as a click would (automation). */
  placeAtScreen(kind: ShipPartKind, x: number, y: number): boolean {
    this.startPlacing(kind);
    this.ndc.set(x, y);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    this.moveGhost();
    if (this.ghost === null) {
      this.cancelPlacing();
      return false;
    }
    this.place(false);
    return true;
  }

  /** Paints the part under the screen point (NDC) with the bucket, as a click would (automation). */
  paintAtScreen(x: number, y: number, allOfKind = false): boolean {
    this.ndc.set(x, y);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hit = this.pick();
    if (hit) this.paintPart(hit.info.part, allOfKind);
    return hit !== null;
  }

  deleteSelection(): void {
    const sel = this.selection;
    if (sel === null || sel === 0) return;
    removePart(this.design, sel);
    this.selection = null;
    this.changed();
    this.commit();
  }

  duplicateSelection(): void {
    const sel = this.selection;
    if (sel === null || sel === 0) return;
    const at = duplicatePart(this.design, sel);
    if (at < 0) return;
    this.selection = at;
    this.changed();
    this.commit();
  }

  /** Turns the selected part about its normal (or length) and leans it, by whole steps. */
  turnSelection(spin: number, tilt: number, lean = 0): void {
    const p = this.selection !== null ? this.design.parts[this.selection] : undefined;
    if (!p) return;
    p.spin = wrapAngle(p.spin + spin * TURN_STEP);
    p.tilt = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, p.tilt + tilt * TURN_STEP));
    p.lean = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, p.lean + lean * TURN_STEP));
    this.changed();
    this.commit();
  }

  /** Frames the whole ship from three-quarters ahead. */
  frameShip(): void {
    const box = this.shipBox();
    const size = box.getSize(new THREE.Vector3()).length();
    const centre = box.getCenter(new THREE.Vector3());
    this.controls.target.copy(centre);
    const dir = new THREE.Vector3(1, 0.55, 1.1).normalize();
    this.camera.position.copy(centre).addScaledVector(dir, this.viewDistance(size));
    this.controls.update();
  }

  /** Points the camera from a named side (automation and the view buttons). */
  look(view: 'front' | 'side' | 'top' | 'back' | 'below' | 'three-quarter' | 'chase'): void {
    const box = this.shipBox();
    const size = box.getSize(new THREE.Vector3()).length();
    const dirs: Record<typeof view, Vec3> = {
      front: [0, 0.15, 1],
      side: [1, 0.15, 0],
      top: [0.01, 1, 0.02],
      back: [0, 0.25, -1],
      below: [0.01, -1, 0.3],
      'three-quarter': [1, 0.55, 1.1],
      chase: [0.35, 0.45, -1],
    };
    const d = new THREE.Vector3(...dirs[view]).normalize();
    this.camera.position.copy(this.controls.target).addScaledVector(d, this.viewDistance(size) * (view === 'chase' ? 1.2 : 1));
    this.controls.update();
  }

  /** How far back the camera stands to see a ship this big (further on a tall, narrow screen). */
  private viewDistance(size: number): number {
    return (size * 1.15 + 3) / Math.min(1, this.camera.aspect * 1.2);
  }

  private shipBox(): THREE.Box3 {
    const box = new THREE.Box3();
    if (this.model) {
      this.model.group.updateMatrixWorld(true);
      for (const m of this.model.meshes) box.expandByObject(m);
    }
    if (box.isEmpty()) box.set(new THREE.Vector3(-2, -1, -2), new THREE.Vector3(2, 1, 2));
    return box;
  }

  private setBackdrop(): void {
    const flying = this.mode === 'fly';
    this.hangar.visible = !flying;
    this.space.visible = flying;
    this.scene.background = new THREE.Color(flying ? '#02040a' : '#1a2638');
    this.scene.fog = flying ? null : new THREE.Fog('#1a2638', 30, 80);
    this.controls.maxPolarAngle = flying ? Math.PI : Math.PI * 0.6;
  }

  // --- Drawing ---

  private rebuild(): void {
    if (this.model) this.rig.remove(this.model.group);
    this.model = buildShipModel(this.design, this.materials);
    this.rig.add(this.model.group);
    this.addOutlines();
    // Stand the ship on its pad, a little clear of it.
    const box = this.shipBox();
    this.floor.position.y = box.min.y - 1.2;
    this.dirty = false;
  }

  private addOutlines(): void {
    const m = this.model;
    if (!m || this.mode !== 'build') return;
    const add = (index: number | null, mat: THREE.Material) => {
      if (index === null || index === this.ghost) return;
      for (const mesh of m.byPart[index] ?? []) {
        const o = new THREE.Mesh(mesh.geometry, mat);
        o.raycast = () => {};
        o.renderOrder = -1;
        mesh.add(o);
      }
    };
    add(this.selection, this.selectOutline);
    if (this.hovered !== this.selection) add(this.hovered, this.hoverOutline);
  }

  private loop = (): void => {
    requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.tick(dt);
  };

  private tick(dt: number): void {
    this.time += dt;
    if (this.dirty) this.rebuild();
    const flying = this.mode === 'fly';
    const m = this.model!;
    // Lights pulse; while flying the engines burn, flickering, as long as the throttle says.
    const pulse = 0.75 + 0.25 * Math.sin(this.time * 4);
    this.materials.blink.color.set(this.design.paint.glow).multiplyScalar(pulse * (flying ? 1.4 : 1));
    const boost = flying && (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) ? 1.6 : 1;
    const burn = flying ? this.throttle * boost : 0;
    for (const e of m.exhausts) {
      e.visible = burn > 0.02;
      const flicker = 0.85 + 0.15 * Math.sin(this.time * 47 + e.id) * Math.sin(this.time * 31);
      // The plume's base sits at the nozzle: scale it along its own length from there.
      e.scale.setScalar(0.4 + burn * 0.8 * flicker);
    }
    for (const s of m.spinners) s.rotation.y += dt * (flying ? 1.5 + burn * 2 : 0.6);
    if (flying) this.fly(dt, burn);

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.framesDrawn++;
  }

  /** The test flight: the ship hovers, banks and pitches as it's steered; the planet turns under it. */
  private fly(dt: number, burn: number): void {
    const k = this.keys;
    const left = k.has('KeyA') || k.has('ArrowLeft');
    const right = k.has('KeyD') || k.has('ArrowRight');
    const up = k.has('KeyW') || k.has('ArrowUp');
    const down = k.has('KeyS') || k.has('ArrowDown');
    const ease = 1 - Math.exp(-dt * 3);
    this.bank += ((right ? 0.5 : 0) - (left ? 0.5 : 0) - this.bank) * ease;
    this.pitch += ((down ? 0.25 : 0) - (up ? 0.25 : 0) - this.pitch) * ease;
    const t = this.time;
    this.rig.position.set(Math.sin(t * 0.37) * 0.3 - this.bank * 1.5, Math.sin(t * 1.9) * 0.18, 0);
    this.rig.rotation.set(this.pitch + Math.sin(t * 1.3) * 0.03, -this.bank * 0.4, -this.bank + Math.sin(t * 0.9) * 0.04);
    // The ground streams past below: the planet turns about x (and about its pole as the ship turns).
    this.planet.rotation.x -= dt * (0.01 + burn * 0.03);
    this.planet.rotation.y -= dt * this.bank * 0.03;
  }

  private resize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // --- Pointer ---

  private setRay(e: PointerEvent | WheelEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
  }

  private overCanvas(e: PointerEvent): boolean {
    return e.target === this.renderer.domElement;
  }

  /** The nearest part under the ray, leaving out `skip` (the part being moved and what's on it, or the ghost). */
  private pick(skip: ReadonlySet<number> = new Set(), holdersOnly = false): Hit | null {
    const m = this.model;
    if (!m) return null;
    m.group.updateMatrixWorld(true);
    const parts = this.design.parts;
    const targets = m.meshes.filter((x) => {
      const i = (x.userData as PartMeshInfo).part;
      return !skip.has(i) && (!holdersOnly || SHIP_PARTS[parts[i]!.kind].holds);
    });
    const hit = this.raycaster.intersectObjects(targets, false)[0];
    if (!hit || !hit.face) return null;
    const n = hit.face.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize();
    // Faces seen from behind (inside a dish, a double-sided fin): the side towards the pointer.
    if (n.dot(this.raycaster.ray.direction) > 0) n.negate();
    return { point: hit.point.toArray() as Vec3, normal: n.toArray() as Vec3, info: hit.object.userData as PartMeshInfo };
  }

  /** A hit on one copy of a part, carried back to where it would be on the part itself. */
  private canonical(hit: Hit, through: PartMeshInfo): { pos: Vec3; normal: Vec3 } {
    const part = this.design.parts[through.part]!;
    const inst = instances(part).find((i) => i.copy === through.copy && i.mirrored === through.mirrored) ?? { angle: 0, mirrored: false };
    return { pos: unapplyInstance(hit.point, inst), normal: normalize(unapplyInstance(hit.normal, inst)) };
  }

  private pointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    this.setRay(e);
    if (this.mode === 'build') {
      if (this.placing) {
        if (this.ghost !== null) this.place(e.shiftKey);
        else this.cancelPlacing();
        e.stopImmediatePropagation();
        return;
      }
      const hit = this.pick();
      if (hit) {
        const i = hit.info.part;
        if (e.altKey && i > 0 && !this.full) {
          // Alt-drag clones, as in Spore.
          this.selection = duplicatePart(this.design, i);
          this.rebuild();
        } else this.selection = i;
        if (this.selection > 0) this.drag = { index: this.selection, grabbed: { ...hit.info, part: this.selection }, moved: false };
        this.dirty = true;
        this.onChange?.();
        e.stopImmediatePropagation();
        return;
      }
      if (this.selection !== null) this.select(null);
    } else if (this.mode === 'paint') {
      const hit = this.pick();
      if (hit) {
        this.paintPart(hit.info.part, e.shiftKey);
        e.stopImmediatePropagation();
      }
    }
  }

  private paintPart(index: number, allOfKind: boolean): void {
    const kind = this.design.parts[index]?.kind;
    if (!kind) return;
    for (const [i, p] of this.design.parts.entries()) {
      if (i !== index && !(allOfKind && p.kind === kind)) continue;
      p.paint = { ...p.paint, [this.bucket.slot]: this.bucket.color };
    }
    this.changed();
    this.commit();
  }

  private place(keepPlacing: boolean): void {
    const index = this.ghost!;
    const kind = this.placing!;
    this.ghost = null;
    this.placing = null;
    this.selection = index;
    this.dirty = true;
    this.commit();
    if (keepPlacing) this.startPlacing(kind);
    this.onChange?.();
  }

  /** Moves the part being placed to where the ray meets the ship (adding it the first time). */
  private moveGhost(): void {
    if (this.dirty) this.rebuild();
    const skip = new Set<number>(this.ghost !== null ? [this.ghost] : []);
    const hit = this.pick(skip, true);
    if (!hit) {
      if (this.ghost !== null) {
        removePart(this.design, this.ghost);
        this.ghost = null;
        this.dirty = true;
      }
      return;
    }
    const at = this.canonical(hit, hit.info);
    const parent = this.design.parts[hit.info.part]!;
    // On a part that has copies, the new part copies the same way (so it lands on every copy).
    const sym = parent.radial > 1 || parent.mirror ? { mirror: parent.mirror || this.symmetry.mirror, radial: parent.radial > 1 ? parent.radial : this.symmetry.radial } : this.symmetry;
    if (this.ghost === null) {
      // Spore's complexity meter: a full ship takes no more parts.
      if (this.complexity + sym.radial * (sym.mirror ? 2 : 1) > MAX_COMPLEXITY) return;
      this.design.parts.push(newPart(this.placing!, at.pos, at.normal, hit.info.part, sym.mirror, sym.radial));
      this.ghost = this.design.parts.length - 1;
    } else {
      const g = this.design.parts[this.ghost]!;
      g.pos = at.pos;
      g.normal = at.normal;
      g.parent = hit.info.part;
      g.mirror = sym.mirror;
      g.radial = sym.radial;
    }
    this.dirty = true;
  }

  private pointerMove(e: PointerEvent): void {
    this.setRay(e);
    if (this.placing) {
      if (this.overCanvas(e)) this.moveGhost();
      else if (this.ghost !== null) {
        removePart(this.design, this.ghost);
        this.ghost = null;
        this.dirty = true;
      }
      return;
    }
    const drag = this.drag;
    if (!drag) {
      const over = (this.mode === 'build' || this.mode === 'paint') && this.overCanvas(e) ? this.pick() : null;
      const h = over && this.mode === 'build' ? over.info.part : null;
      if (h !== this.hovered) {
        this.hovered = h;
        this.dirty = true;
      }
      this.renderer.domElement.style.cursor = over ? (this.mode === 'paint' ? 'crosshair' : over.info.part > 0 ? 'grab' : 'pointer') : '';
      return;
    }
    this.renderer.domElement.style.cursor = 'grabbing';
    // Over the rest of the ship: not the part itself, nor what's stuck on it.
    const skip = new Set([drag.index, ...descendants(this.design, drag.index)]);
    const hit = this.pick(skip, true);
    if (!hit) return;
    // Where the copy that was grabbed should go, carried back onto the part itself.
    const at = this.canonical(hit, drag.grabbed);
    movePart(this.design, drag.index, at.pos, at.normal, hit.info.part);
    drag.moved = true;
    this.changed();
  }

  private pointerUp(e: PointerEvent): void {
    if (this.placing && this.placingByDrag) {
      this.setRay(e);
      if (this.ghost !== null && this.overCanvas(e)) this.place(false);
      else this.cancelPlacing();
      this.placingByDrag = false;
      return;
    }
    if (this.drag) {
      this.drag = null;
      this.renderer.domElement.style.cursor = '';
      this.commit();
      this.onChange?.();
    }
  }

  private wheel(e: WheelEvent): void {
    if (this.mode !== 'build' || this.placing) return;
    this.setRay(e);
    const hit = this.pick();
    if (!hit) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const i = hit.info.part;
    const f = Math.exp(-e.deltaY * 0.0012);
    if (e.shiftKey) {
      const p = this.design.parts[i]!;
      p.stretch = Math.min(4, Math.max(0.3, p.stretch * f));
    } else resizePart(this.design, i, f);
    this.selection = i;
    this.changed();
    if (this.wheelTimer) clearTimeout(this.wheelTimer);
    this.wheelTimer = setTimeout(() => this.commit(), 400);
  }

  private key(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    this.keys.add(e.code);
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.code === 'KeyZ') {
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
    } else if (mod && e.code === 'KeyY') {
      e.preventDefault();
      this.redo();
    } else if (mod && e.code === 'KeyD') {
      e.preventDefault();
      this.duplicateSelection();
    } else if (e.code === 'Escape') {
      this.cancelPlacing();
      this.select(null);
    } else if (e.code === 'Delete' || e.code === 'Backspace') this.deleteSelection();
    else if (this.mode === 'build' && e.code === 'KeyQ') this.turnSelection(-1, 0);
    else if (this.mode === 'build' && e.code === 'KeyE') this.turnSelection(1, 0);
    else if (this.mode === 'build' && e.code === 'KeyR') this.turnSelection(0, 1);
    else if (this.mode === 'build' && e.code === 'KeyF') this.turnSelection(0, -1);
    else if (this.mode === 'build' && e.code === 'KeyT') this.turnSelection(0, 0, 1);
    else if (this.mode === 'build' && e.code === 'KeyG') this.turnSelection(0, 0, -1);
    else if (this.mode === 'build' && e.code === 'KeyM') {
      this.symmetry.mirror = !this.symmetry.mirror;
      this.onChange?.();
    } else if (this.mode === 'build' && (e.code === 'BracketLeft' || e.code === 'BracketRight')) {
      this.symmetry.radial = Math.max(1, Math.min(MAX_RADIAL, this.symmetry.radial + (e.code === 'BracketRight' ? 1 : -1)));
      this.onChange?.();
    } else if (e.code === 'Digit1') this.setMode('build');
    else if (e.code === 'Digit2') this.setMode('paint');
    else if (e.code === 'Digit3') this.setMode('fly');
    else if (this.mode === 'fly' && e.code.startsWith('Arrow')) e.preventDefault();
  }

  /** Whether another part copy fits under the complexity cap. */
  get full(): boolean {
    return this.complexity >= MAX_COMPLEXITY;
  }
}

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** The hangar's landing pad: dark panels, a grid and a ring. */
function padTexture(): THREE.CanvasTexture {
  const n = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2c3a4f';
  g.fillRect(0, 0, n, n);
  g.strokeStyle = 'rgba(140,190,230,0.18)';
  g.lineWidth = 2;
  for (let i = 0; i <= n; i += n / 28) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, n);
    g.moveTo(0, i);
    g.lineTo(n, i);
    g.stroke();
  }
  g.strokeStyle = 'rgba(102,255,204,0.45)';
  g.lineWidth = 6;
  for (const r of [0.22, 0.24]) {
    g.beginPath();
    g.arc(n / 2, n / 2, r * n, 0, Math.PI * 2);
    g.stroke();
  }
  g.strokeStyle = 'rgba(255,210,63,0.5)';
  g.lineWidth = 10;
  g.setLineDash([30, 30]);
  g.beginPath();
  g.arc(n / 2, n / 2, 0.47 * n, 0, Math.PI * 2);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Stars on a far sphere. */
function starfield(): THREE.Points {
  const n = 2500;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  // A fixed sequence (not Math.random), so screenshots repeat.
  let s = 12345;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    const u = rnd() * 2 - 1;
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    pos.set([Math.cos(a) * r * 900, u * 900, Math.sin(a) * r * 900], i * 3);
    const b = 0.5 + rnd() * 0.5;
    col.set([b, b * (0.85 + rnd() * 0.15), b * (0.8 + rnd() * 0.2)], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true, fog: false }));
}

/** A green-and-blue world seen from orbit: oceans, land, cloud streaks. */
function planetTexture(): THREE.CanvasTexture {
  const w = 1024;
  const h = 512;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1f4f86';
  g.fillRect(0, 0, w, h);
  let s = 777;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 140; i++) {
    g.fillStyle = rnd() < 0.5 ? '#4f7f3a' : '#6e8a45';
    g.beginPath();
    g.ellipse(rnd() * w, rnd() * h, 20 + rnd() * 70, 10 + rnd() * 40, rnd() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = 'rgba(255,255,255,0.55)';
  for (let i = 0; i < 90; i++) {
    g.beginPath();
    g.ellipse(rnd() * w, rnd() * h, 30 + rnd() * 90, 3 + rnd() * 8, rnd() * 0.4 - 0.2, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(3, 1);
  return t;
}

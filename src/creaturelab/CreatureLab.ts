import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { animalGait } from '../gen/animals';
import {
  MAX_SPLATS,
  SPINE_SUBDIVISIONS,
  anchorOf,
  limbOffset,
  cloneDesign,
  creatureForm,
  decodeDesign,
  encodeDesign,
  growCreature,
  insertVertebra,
  isGear,
  newPart,
  removeVertebra,
  skinPoint,
  splatAt,
  tidySpine,
  type CreatureDesign,
  type GrownCreature,
  type PartKind,
} from '../gen/creature';
import { dutyFactor, legPhase, type CreaturePose } from '../gen/creatureMotion';
import type { Vec3 } from '../gen/animalForm';
import { buildAnimalMesh } from '../surface/animalMesh';
import { createCreatureLook, type CreatureLook } from './creatureLook';
import { createOutfitLook, type OutfitLook } from './outfitLook';

/*
 * The creature editor (creature.html): Spore's creature creator on the
 * game's animal body. Four modes:
 *  - Build: drag the spine's vertebrae (in the body's middle plane) to
 *    shape it, the wheel over one to fatten it (Shift: widen it); dragging
 *    an end vertebra away grows the spine. Parts come from the palette and
 *    stick to the skin wherever the pointer is; drag a part's dot to move it
 *    over the body, the wheel over it to resize it.
 *  - Paint: the coat (colours, pattern) and a brush that paints soft dabs on
 *    the body, mirrored across it.
 *  - Outfit: Spore's outfitter (gen/creatureOutfit.ts, drawn by
 *    outfitLook.ts): accessories (helmet, goggles, hat, jetpack...) dragged
 *    from their palette onto the skin, grabbed by themselves to move them,
 *    the wheel over one to resize it, dragged off the body to take it off;
 *    and a suit, boots and gloves worn over the whole body.
 *  - Play: the creature walks or trots over the floor, its legs stepping
 *    in the gait worked out for its body (gen/creatureMotion.ts), with a
 *    footfall diagram. WASD (or the arrows) steer it, relative to the
 *    camera, which follows it; Shift trots.
 * Everything is posed on the CPU each frame (one creature: a few thousand
 * triangles) and drawn with the game's animal material (creatureLook.ts).
 * `window.creatureLab` is this object (automation: npm run shot -- --creatures).
 */

export type EditorMode = 'build' | 'paint' | 'outfit' | 'play';
export type Selection = { kind: 'vertebra'; index: number } | { kind: 'part'; index: number } | null;

export interface Brush {
  color: string;
  /** Dab radius, as a share of the creature's length. */
  size: number;
  hardness: number;
  mirror: boolean;
}

/** A leg's row in the footfall diagram. */
export interface FootfallRow {
  label: string;
  phase: number;
}

interface HandleInfo {
  /** A vertebra, a part's place on the skin, or a limb's knee or elbow (`joint`) or foot or hand (`end`). */
  kind: 'vertebra' | 'part' | 'joint' | 'end';
  /** The vertebra's or part's index. */
  index: number;
  mirrored: boolean;
  /** A joint's or end's limb (index in `grown.limbs`). */
  limb?: number;
}

const HANDLE_COLOR = new THREE.Color('#66ffcc');
const PART_HANDLE_COLOR = new THREE.Color('#ffcc66');
const LIMB_HANDLE_COLOR = new THREE.Color('#ff7ad9');
const SELECTED_COLOR = new THREE.Color('#ffffff');
const BONE_COLOR = new THREE.Color('#efe4c8');
/** Floor tile (units): the floor slides back by whole tiles as the creature walks. */
const TILE = 2;
const UP = new THREE.Vector3(0, 1, 0);
const STEER_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class CreatureLab {
  design: CreatureDesign;
  mode: EditorMode = 'build';
  selection: Selection = null;
  placing: PartKind | null = null;
  walking = true;
  /** Whether the mesh's edges are drawn over the creature (a view setting, not part of the design). */
  get wireframe(): boolean {
    return this.view.wire.visible;
  }
  set wireframe(on: boolean) {
    this.view.wire.visible = on;
  }
  run = 0;
  readonly brush: Brush = { color: '#ffd23f', size: 0.035, hardness: 0.5, mirror: true };
  /** Called when the design, the selection or the mode changes (the panel redraws). */
  onChange: (() => void) | null = null;

  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(38, 1, 0.05, 500);
  readonly controls: OrbitControls;
  private readonly view: CreatureLook;
  private readonly outfit: OutfitLook;
  grown: GrownCreature;
  private restDirty = true;
  private paintDirty = true;
  private time = 0;
  private cycle = 0;
  private moving = 0;
  /** Where the creature has walked to in Play (it's back at the origin in Build and Paint). */
  private readonly body = new THREE.Group();
  private heading = 0;
  /** WASD and arrow keys held down. */
  private readonly held = new Set<string>();
  /** Shift held: eases up to 1, a trot. */
  private sprint = 0;
  private framesDrawn = 0;
  private committed: string;
  private readonly undoStack: string[] = [];
  private readonly redoStack: string[] = [];
  private readonly handles = new THREE.Group();
  private handleMeshes: THREE.Mesh[] = [];
  /** A row of little vertebrae all along the spine (drawn only: the round nodes over them are the handles), and the bones joining the nodes and down each limb. */
  private vertebraMeshes: THREE.Mesh[] = [];
  private boneMeshes: THREE.Mesh[] = [];
  private readonly vertebraMaterial = new THREE.MeshLambertMaterial({ color: BONE_COLOR, emissive: '#3a3428', depthTest: false, transparent: true });
  private readonly boneMaterial = new THREE.MeshLambertMaterial({ color: BONE_COLOR, emissive: '#3a3428', depthTest: false, transparent: true, opacity: 0.85 });
  /** The skeleton shows while the pointer is over the creature (always once a finger has touched the screen: it can't hover), fading in and out. */
  private overCreature = false;
  private hoverless = false;
  private skeletonFade = 0;
  private readonly skinPicker: THREE.Mesh;
  private readonly ground: THREE.Mesh;
  private readonly sun: THREE.DirectionalLight;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private hovered: HandleInfo | null = null;
  private drag:
    | { kind: 'vertebra'; index: number }
    | { kind: 'part'; index: number; mirrored: boolean; off?: boolean }
    | { kind: 'node'; node: 'joint' | 'end'; index: number; limb: number; plane: THREE.Plane }
    | { kind: 'paint'; last: THREE.Vector3 | null }
    | null = null;
  private ghost: number | null = null;
  private placingByDrag = false;
  private wheelTimer: ReturnType<typeof setTimeout> | null = null;
  private last = performance.now();

  constructor(
    private readonly container: HTMLElement,
    design: CreatureDesign,
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

    // Our pointer and wheel handlers go first, so a drag on a handle or a brush stroke isn't also an orbit.
    canvas.addEventListener('pointerdown', (e) => this.pointerDown(e), { capture: true });
    canvas.addEventListener('wheel', (e) => this.wheel(e), { capture: true, passive: false });
    window.addEventListener('pointermove', (e) => this.pointerMove(e));
    window.addEventListener('pointerup', (e) => this.pointerUp(e));
    window.addEventListener('keydown', (e) => this.key(e));
    window.addEventListener('keyup', (e) => {
      this.held.delete(e.code);
      if (e.key === 'Shift') this.held.delete('Shift');
    });
    window.addEventListener('blur', () => this.held.clear());
    window.addEventListener('resize', () => this.resize());

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.minDistance = 1.5;
    this.controls.maxDistance = 40;

    // A soft outdoor stage: sky light from above, warm sun with shadows, a floor fading into haze.
    const sky = new THREE.Color('#a9d6e8');
    this.scene.background = sky;
    this.scene.fog = new THREE.Fog(sky, 18, 60);
    this.scene.add(new THREE.HemisphereLight('#e8f6ff', '#5b6b4a', 1.6));
    this.sun = new THREE.DirectionalLight('#fff1d6', 2.4);
    this.sun.position.set(5, 9, 4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -7;
    sc.right = sc.top = 7;
    sc.near = 1;
    sc.far = 30;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.95 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    this.grown = growCreature(design);
    this.view = createCreatureLook(design, this.grown.length);
    this.scene.add(this.body);
    this.body.add(this.view.mesh, this.view.picker, this.view.wire);
    this.outfit = createOutfitLook();
    this.body.add(this.outfit.group);
    this.skinPicker = new THREE.Mesh(new THREE.BufferGeometry());
    this.skinPicker.layers.set(1);
    this.body.add(this.skinPicker);
    this.body.add(this.handles);
    this.raycaster.layers.set(1);

    this.resize();
    this.frameCreature();
    this.loop();
  }

  // --- State ---

  /** True once the current design has been drawn a few times (for automation). */
  get ready(): boolean {
    return this.framesDrawn >= 4 && !this.restDirty;
  }

  /** The legs' phases, front to back, as the footfall diagram shows them. */
  footfalls(): FootfallRow[] {
    const legs = this.grown.limbs.filter((l) => !l.arm);
    return legs
      .map((l) => ({ label: `${l.mirrored ? 'R' : 'L'}${l.ranks - l.rank}`, phase: legPhase(l.rank, l.ranks, l.mirrored, this.pace), order: -l.rank * 2 + (l.mirrored ? 1 : 0) }))
      .sort((a, b) => a.order - b.order)
      .map(({ label, phase }) => ({ label, phase }));
  }

  /** The gait now: stride (units), speed (units/s), duty factor, and strides walked. */
  gait(): { stride: number; speed: number; duty: number; cycle: number; hip: number } {
    const g = animalGait({ hipHeight: this.grown.hipHeight }, 1);
    const r = this.pace;
    return { stride: g.walkStride + (g.trotStride - g.walkStride) * r, speed: g.walkSpeed + (g.trotSpeed - g.walkSpeed) * r, duty: dutyFactor(r), cycle: this.cycle, hip: this.grown.hipHeight };
  }

  /** Something about the design changed (it is redrawn; call `commit` when an edit is finished). */
  changed(): void {
    this.restDirty = true;
    this.paintDirty = true;
    this.onChange?.();
  }

  /** Only the paint changed. */
  repainted(): void {
    this.paintDirty = true;
  }

  /** Ends an edit: it becomes a step to undo, and the page's #hash keeps the design. */
  commit(): void {
    const now = JSON.stringify(this.design);
    if (now === this.committed) return;
    this.undoStack.push(this.committed);
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack.length = 0;
    this.committed = now;
    history.replaceState(null, '', `#${encodeDesign(this.design)}`);
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
    this.committed = json;
    this.design = JSON.parse(json) as CreatureDesign;
    this.selection = null;
    this.cancelPlacing();
    history.replaceState(null, '', `#${encodeDesign(this.design)}`);
    this.changed();
  }

  /** A whole new creature (undoable), the camera framing it (unless `frame` is false: the same creature, dressed or undressed). */
  setDesign(d: CreatureDesign, frame = true): void {
    this.cancelPlacing();
    this.design = cloneDesign(d);
    this.selection = null;
    this.changed();
    this.commit();
    this.grown = growCreature(this.design);
    if (frame) this.frameCreature();
  }

  /** The design from the page's #hash, if it holds one. */
  static designFromHash(): CreatureDesign | null {
    const h = location.hash.slice(1);
    return h ? decodeDesign(h) : null;
  }

  /** Walk ↔ trot as it is now: the slider, or a trot while Shift is held. */
  get pace(): number {
    return Math.max(this.run, this.sprint);
  }

  setMode(mode: EditorMode): void {
    this.cancelPlacing();
    if (mode !== 'play') this.comeHome();
    if (mode !== this.mode) this.selection = null;
    this.mode = mode;
    this.onChange?.();
  }

  /** Build and Outfit: parts (or gear) are placed, picked and dragged over the body. */
  get editing(): boolean {
    return this.mode === 'build' || this.mode === 'outfit';
  }

  /** Picks a part from the palette: it follows the pointer over the body until a click places it. */
  startPlacing(kind: PartKind, byDrag = false): void {
    this.cancelPlacing();
    const mode = isGear(kind) ? 'outfit' : 'build';
    if (this.mode !== mode) this.setMode(mode);
    this.placing = kind;
    this.placingByDrag = byDrag;
    this.updateSkinPicker();
    this.onChange?.();
  }

  cancelPlacing(): void {
    if (this.ghost !== null) {
      this.design.parts.splice(this.ghost, 1);
      this.ghost = null;
      this.changed();
    }
    if (this.placing) {
      this.placing = null;
      this.onChange?.();
    }
  }

  deleteSelection(): void {
    const sel = this.selection;
    if (!sel) return;
    if (sel.kind === 'part') this.design.parts.splice(sel.index, 1);
    else removeVertebra(this.design, sel.index);
    this.selection = null;
    this.changed();
    this.commit();
  }

  /** Adds a vertebra after the selected one (or at the snout). */
  addVertebra(): void {
    const i = this.selection?.kind === 'vertebra' ? this.selection.index : this.design.spine.length - 1;
    const at = insertVertebra(this.design, i);
    tidySpine(this.design.spine);
    this.selection = { kind: 'vertebra', index: at };
    this.changed();
    this.commit();
  }

  /** Back to the origin facing ahead, where the editor's handles and picking expect it; the camera comes along. */
  private comeHome(): void {
    this.held.clear();
    this.sprint = 0;
    if (this.body.position.lengthSq() === 0 && this.heading === 0) return;
    const centre = this.controls.target.clone().sub(this.body.position).applyAxisAngle(UP, -this.heading);
    const offset = this.camera.position.clone().sub(this.controls.target).applyAxisAngle(UP, -this.heading);
    this.controls.target.copy(centre);
    this.camera.position.copy(centre).add(offset);
    this.body.position.set(0, 0, 0);
    this.heading = 0;
    this.body.rotation.y = 0;
    this.placeStage();
    this.controls.update();
  }

  /** The floor and the sun's shadow box kept round the creature (the floor by whole texture repeats, so it doesn't jump). */
  private placeStage(): void {
    const p = this.body.position;
    const step = TILE * 2;
    this.ground.position.set(Math.round(p.x / step) * step, 0, Math.round(p.z / step) * step);
    this.sun.position.set(p.x + 5, 9, p.z + 4);
    this.sun.target.position.set(p.x, 0, p.z);
  }

  /** Steers by the keys held (relative to the camera) and walks the creature on; the camera follows. */
  private steer(dt: number, speed: number): void {
    const k = this.held;
    const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const right = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    if (fwd !== 0 || right !== 0) {
      const ahead = this.controls.target.clone().sub(this.camera.position).setY(0);
      if (ahead.lengthSq() < 1e-6) ahead.set(0, 0, 1);
      ahead.normalize();
      const side = new THREE.Vector3().crossVectors(ahead, UP);
      const want = ahead.multiplyScalar(fwd).addScaledVector(side, right);
      const goal = Math.atan2(want.x, want.z);
      let turn = goal - this.heading;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      // Turns quicker when slow and small, as an animal does; never overshoots.
      const rate = 3.2 / Math.max(1, this.grown.length * 0.35);
      this.heading += Math.sign(turn) * Math.min(Math.abs(turn), rate * dt);
    }
    const before = this.body.position.clone();
    const d = speed * this.moving * dt;
    this.body.position.x += Math.sin(this.heading) * d;
    this.body.position.z += Math.cos(this.heading) * d;
    this.body.rotation.y = this.heading;
    const moved = this.body.position.clone().sub(before);
    this.controls.target.add(moved);
    this.camera.position.add(moved);
    this.placeStage();
  }

  /** Aims the camera at the whole creature from three-quarters ahead. */
  frameCreature(): void {
    this.comeHome();
    const k = this.grown.skeleton;
    const size = Math.max(k.front - k.back, k.top, k.width * 2);
    const centre = new THREE.Vector3(0, k.top * 0.45, (k.front + k.back) / 2);
    this.controls.target.copy(centre);
    const dir = new THREE.Vector3(1, 0.42, 0.85).normalize();
    this.camera.position.copy(centre).addScaledVector(dir, size * 1.9 + 2);
    this.controls.update();
  }

  /** Points the camera from a named side (automation and the view buttons). */
  look(view: 'front' | 'side' | 'top' | 'three-quarter' | 'back'): void {
    const k = this.grown.skeleton;
    const size = Math.max(k.front - k.back, k.top, k.width * 2);
    const centre = this.controls.target;
    const dirs: Record<typeof view, Vec3> = { front: [0, 0.2, 1], side: [1, 0.15, 0], top: [0.01, 1, 0.02], 'three-quarter': [1, 0.42, 0.85], back: [-0.6, 0.35, -1] };
    const d = new THREE.Vector3(...dirs[view]).normalize();
    this.camera.position.copy(centre).addScaledVector(d, size * 1.9 + 2);
    this.controls.update();
  }

  // --- The loop ---

  private loop = (): void => {
    requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.tick(dt);
  };

  private tick(dt: number): void {
    this.time += dt;
    const play = this.mode === 'play';
    const keyed = play && [...STEER_KEYS].some((c) => this.held.has(c));
    this.sprint += ((play && this.held.has('Shift') ? 1 : 0) - this.sprint) * Math.min(1, dt * 3);
    const target = play && (this.walking || keyed) ? 1 : 0;
    this.moving += (target - this.moving) * Math.min(1, dt * 2.5);
    if (this.moving < 1e-3 && target === 0) this.moving = 0;
    const g = this.gait();
    this.cycle += (dt * g.speed * this.moving) / Math.max(1e-3, g.stride);
    if (play) this.steer(dt, g.speed);

    const pose: CreaturePose = { time: this.time, cycle: this.cycle, run: this.pace, moving: this.moving };
    this.grown = growCreature(this.design, pose);
    const form = creatureForm(this.design);
    const posed = buildAnimalMesh(this.grown.skeleton, form, this.grown.length, 0);
    const rest = this.restDirty ? buildAnimalMesh(growCreature(this.design).skeleton, form, this.grown.length, 0) : null;
    this.view.update(posed, rest);
    if (this.paintDirty || this.restDirty) this.view.repaint(this.design, this.grown.rest, this.grown.length);
    this.outfit.update(this.design, this.grown, this.time, play ? this.moving : 0);
    this.restDirty = false;
    this.paintDirty = false;
    // Parts are placed and dragged over the skin alone: only needed while that happens.
    if (this.editing && (this.placing !== null || this.drag?.kind === 'part')) this.updateSkinPicker();
    this.updateHandles(dt);

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.framesDrawn++;
  }

  private resize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** The skin alone (no limbs, horns or eyes), posed: what parts are placed and dragged over. */
  private updateSkinPicker(): void {
    const skin = buildAnimalMesh({ ...this.grown.skeleton, legs: [], spikes: [], eyes: [] }, creatureForm(this.design), this.grown.length, 1);
    const g = this.skinPicker.geometry;
    const a = g.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (a && a.array.length === skin.positions.length) {
      (a.array as Float32Array).set(skin.positions);
      a.needsUpdate = true;
    } else g.setAttribute('position', new THREE.BufferAttribute(skin.positions, 3));
    g.computeBoundingSphere();
  }

  /**
   * The skeleton, where it is this frame: in Build the spine as a row of
   * vertebrae with round nodes at its control points (drag one to reshape
   * it, the wheel to fatten it), the limbs' bones with their knee and foot (or elbow and hand)
   * nodes, and the parts' dots; in Outfit the selected accessory's dot.
   * It shows while the pointer is over the creature, and fades away when
   * it leaves.
   */
  private updateHandles(dt: number): void {
    const editing = this.editing && this.placing === null;
    const want = editing && (this.overCreature || this.drag !== null || this.hoverless) ? 1 : 0;
    this.skeletonFade = want ? Math.min(1, this.skeletonFade + dt * 8) : Math.max(0, this.skeletonFade - dt * 4);
    this.handles.visible = editing && this.skeletonFade > 0.01;
    if (!editing) return;
    const fade = this.skeletonFade;
    const build = this.mode === 'build';
    const infos: HandleInfo[] = [];
    const points: Vec3[] = [];
    const frames = this.grown.frames;
    const r = Math.max(0.05, this.grown.length * 0.013);
    const sel = this.selection;
    const h = this.hovered;
    const isHovered = (info: HandleInfo) => h !== null && h.kind === info.kind && h.index === info.index && h.mirrored === info.mirrored;

    // The vertebrae, a row of little bones all along the spine, each turned along it (its spinous process up, its
    // transverse processes out to the sides); the spine's control points are the round nodes drawn over them.
    const spine = build ? this.design.spine.map((_, i) => frames[Math.min(frames.length - 1, i * SPINE_SUBDIVISIONS)]!) : [];
    const rows: { p: THREE.Vector3; side: Vec3; up: Vec3; t: Vec3 }[] = [];
    if (build)
      for (let i = 0; i < frames.length; i++) {
        const f = frames[i]!;
        rows.push({ p: new THREE.Vector3(...f.p), side: f.side, up: f.up, t: f.t });
        const g = frames[i + 1];
        if (g) rows.push({ p: new THREE.Vector3(...f.p).lerp(new THREE.Vector3(...g.p), 0.5), side: f.side, up: f.up, t: f.t });
      }
    // Spaced so neighbours just touch.
    const step = rows.length > 1 ? rows[0]!.p.distanceTo(rows[1]!.p) : r * 2;
    const vr = Math.min(r * 1.6, Math.max(r * 0.6, step * 1.2));
    while (this.vertebraMeshes.length < rows.length) {
      const m = new THREE.Mesh(vertebraGeometry, this.vertebraMaterial);
      m.renderOrder = 11;
      this.handles.add(m);
      this.vertebraMeshes.push(m);
    }
    this.vertebraMaterial.opacity = 0.9 * fade;
    const basis = new THREE.Matrix4();
    this.vertebraMeshes.forEach((m, i) => {
      const f = rows[i];
      m.visible = !!f;
      if (!f) return;
      m.position.copy(f.p);
      basis.makeBasis(new THREE.Vector3(...f.side), new THREE.Vector3(...f.up), new THREE.Vector3(...f.t));
      m.quaternion.setFromRotationMatrix(basis);
      m.scale.setScalar(vr);
    });
    spine.forEach((f, i) => {
      infos.push({ kind: 'vertebra', index: i, mirrored: false });
      points.push(f.p);
    });

    this.design.parts.forEach((p, i) => {
      if (isGear(p.kind) === build) return;
      // Accessories are grabbed by themselves: only the selected one shows its dot (where it's stuck on).
      if (!build && !(sel?.kind === 'part' && sel.index === i)) return;
      for (const mirrored of p.mirror && Math.abs(Math.sin(p.theta)) > 0.06 ? [false, true] : [false]) {
        infos.push({ kind: 'part', index: i, mirrored });
        const k = skinPoint(frames, p.s, mirrored ? -p.theta : p.theta);
        points.push([k.p[0] + k.n[0] * 0.04, k.p[1] + k.n[1] * 0.04, k.p[2] + k.n[2] * 0.04]);
      }
    });
    // Bones: from vertebra to vertebra, and down each limb from its root to its knee or elbow and its foot or hand (their nodes).
    const bones: [Vec3, Vec3, number][] = [];
    for (let i = 1; i < spine.length; i++) bones.push([spine[i - 1]!.p, spine[i]!.p, r * 0.3]);
    if (build)
      this.grown.limbs.forEach((l, li) => {
        const pts = this.grown.skeleton.legs[li]!.points;
        infos.push({ kind: 'joint', index: l.part, mirrored: l.mirrored, limb: li }, { kind: 'end', index: l.part, mirrored: l.mirrored, limb: li });
        points.push(pts[1]!, pts[2]!);
        bones.push([pts[0]!, pts[1]!, r * 0.26], [pts[1]!, pts[2]!, r * 0.22]);
      });
    while (this.boneMeshes.length < bones.length) {
      const m = new THREE.Mesh(boneGeometry, this.boneMaterial);
      m.renderOrder = 10;
      this.handles.add(m);
      this.boneMeshes.push(m);
    }
    this.boneMaterial.opacity = 0.85 * fade;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    this.boneMeshes.forEach((m, i) => {
      const bone = bones[i];
      m.visible = !!bone;
      if (!bone) return;
      a.set(...bone[0]);
      b.set(...bone[1]);
      const len = a.distanceTo(b);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(UP, b.sub(a).normalize());
      m.scale.set(bone[2], Math.max(1e-3, len), bone[2]);
    });

    while (this.handleMeshes.length < infos.length) {
      const m = new THREE.Mesh(handleGeometry, new THREE.MeshBasicMaterial({ depthTest: false, transparent: true, opacity: 0.9 }));
      m.renderOrder = 12;
      this.handles.add(m);
      this.handleMeshes.push(m);
    }
    this.handleMeshes.forEach((m, i) => {
      const info = infos[i];
      m.visible = !!info;
      if (!info) return;
      m.userData = info;
      m.position.set(...points[i]!);
      const node = info.kind === 'joint' || info.kind === 'end';
      const vertebra = info.kind === 'vertebra';
      const selected = sel !== null && sel.kind === (vertebra ? 'vertebra' : 'part') && sel.index === info.index && !node;
      const hover = isHovered(info);
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.color.copy(selected ? SELECTED_COLOR : vertebra ? HANDLE_COLOR : node ? LIMB_HANDLE_COLOR : PART_HANDLE_COLOR);
      mat.opacity = 0.9 * fade;
      m.scale.setScalar(r * (vertebra ? 1 : node ? 0.75 : 0.8) * (hover || selected ? 1.4 : 1));
    });
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

  /** A handle under the pointer, or in Outfit mode an accessory itself (grabbed as in Spore). */
  private pickHandle(): HandleInfo | null {
    const h = this.pickDot();
    if (h || this.mode !== 'outfit' || this.placing !== null) return h;
    this.raycaster.layers.set(0);
    const hit = this.outfit.pick(this.raycaster);
    this.raycaster.layers.set(1);
    return hit ? { kind: 'part', index: hit.index, mirrored: hit.mirrored } : null;
  }

  private pickDot(): HandleInfo | null {
    if (!this.editing || this.placing !== null) return null;
    // Handles draw over everything, so pick them by screen distance to the ray, nearest first.
    let best: HandleInfo | null = null;
    let bestD = Infinity;
    const ray = this.raycaster.ray;
    for (const m of this.handleMeshes) {
      if (!m.visible) continue;
      const d = ray.distanceToPoint(m.position);
      const along = ray.origin.distanceTo(m.position);
      if (d < m.scale.x * 1.6 && along < bestD) {
        bestD = along;
        best = m.userData as HandleInfo;
      }
    }
    return best;
  }

  private hitSkin(): THREE.Vector3 | null {
    this.skinPicker.updateMatrixWorld();
    const hit = this.raycaster.intersectObject(this.skinPicker, false)[0];
    return hit ? hit.point.clone() : null;
  }

  private hitBody(): THREE.Vector3 | null {
    this.view.picker.updateMatrixWorld();
    const hit = this.raycaster.intersectObject(this.view.picker, false)[0];
    return hit ? hit.point.clone() : null;
  }

  private pointerDown(e: PointerEvent): void {
    if (e.pointerType === 'touch') this.hoverless = true;
    if (e.button !== 0) return;
    this.setRay(e);
    if (this.editing) {
      if (this.placing) {
        if (this.ghost !== null) this.place(e.shiftKey);
        else this.cancelPlacing();
        e.stopImmediatePropagation();
        return;
      }
      const h = this.pickHandle();
      if (h) {
        this.selection = { kind: h.kind === 'vertebra' ? 'vertebra' : 'part', index: h.index };
        if (h.kind === 'joint' || h.kind === 'end') {
          // Knees, elbows and hands move in the view's plane through where they are; feet slide over the ground.
          const limb = this.grown.limbs[h.limb!]!;
          const at = new THREE.Vector3(...this.grown.skeleton.legs[h.limb!]!.points[h.kind === 'joint' ? 1 : 2]!);
          const normal = new THREE.Vector3();
          this.camera.getWorldDirection(normal);
          const plane = h.kind === 'end' && !limb.arm ? new THREE.Plane(new THREE.Vector3(0, 1, 0), -limb.paw) : new THREE.Plane().setFromNormalAndCoplanarPoint(normal.negate(), at);
          this.drag = { kind: 'node', node: h.kind, index: h.index, limb: h.limb!, plane };
        } else this.drag = h.kind === 'vertebra' ? { kind: 'vertebra', index: h.index } : { kind: 'part', index: h.index, mirrored: h.mirrored };
        if (h.kind === 'part') this.updateSkinPicker();
        this.onChange?.();
        e.stopImmediatePropagation();
        return;
      }
      if (this.selection) {
        this.selection = null;
        this.onChange?.();
      }
    } else if (this.mode === 'paint') {
      const p = this.hitBody();
      if (p) {
        this.drag = { kind: 'paint', last: null };
        this.dab(p);
        e.stopImmediatePropagation();
      }
    }
  }

  /** Paints a dab where the screen point (NDC, −1 to 1) hits the body, as a brush stroke would (automation). */
  dabAtScreen(x: number, y: number): boolean {
    this.ndc.set(x, y);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const p = this.hitBody();
    if (p) this.dab(p);
    return p !== null;
  }

  private place(keepPlacing: boolean): void {
    const index = this.ghost!;
    const kind = this.placing!;
    this.ghost = null;
    this.placing = null;
    this.selection = { kind: 'part', index };
    this.commit();
    if (keepPlacing) this.startPlacing(kind);
    this.onChange?.();
  }

  private pointerMove(e: PointerEvent): void {
    this.setRay(e);
    const drag = this.drag;
    if (this.placing) {
      const hit = this.overCanvas(e) ? this.hitSkin() : null;
      if (hit) {
        const a = anchorOf(this.grown.frames, hit.toArray() as Vec3);
        if (this.ghost === null) {
          this.design.parts.push(newPart(this.placing, a.s, a.theta));
          this.ghost = this.design.parts.length - 1;
        } else {
          const p = this.design.parts[this.ghost]!;
          p.s = a.s;
          p.theta = a.theta;
        }
        this.restDirty = true;
      } else if (this.ghost !== null) {
        this.design.parts.splice(this.ghost, 1);
        this.ghost = null;
        this.restDirty = true;
      }
      return;
    }
    if (!drag) {
      const over = this.editing && this.overCanvas(e);
      const h = over ? this.pickHandle() : null;
      this.hovered = h;
      this.overCreature = over && (h !== null || this.hitBody() !== null);
      this.renderer.domElement.style.cursor = h ? 'grab' : this.mode === 'paint' ? 'crosshair' : '';
      return;
    }
    if (drag.kind === 'vertebra') this.dragVertebra(drag);
    else if (drag.kind === 'node') this.dragLimbNode(drag);
    else if (drag.kind === 'part') {
      const hit = this.hitSkin();
      if (hit) {
        const a = anchorOf(this.grown.frames, hit.toArray() as Vec3);
        const p = this.design.parts[drag.index]!;
        p.s = a.s;
        p.theta = drag.mirrored ? -a.theta : a.theta;
        this.restDirty = true;
      }
      // An accessory dragged off the body comes off when let go (as in Spore); it shows faded meanwhile.
      if (this.mode === 'outfit') {
        drag.off = !hit;
        this.outfit.fade(drag.off ? drag.index : null);
      }
    } else {
      const p = this.hitBody();
      if (p && (!drag.last || p.distanceTo(drag.last) > this.brush.size * this.grown.length * 0.35)) this.dab(p);
    }
  }

  private dragVertebra(drag: { kind: 'vertebra'; index: number }): void {
    const sp = this.design.spine;
    const v = sp[drag.index]!;
    const shown = this.grown.rest[Math.min(this.grown.rest.length - 1, drag.index * SPINE_SUBDIVISIONS)]!.p;
    // Legless creatures are lowered onto the floor: keep the vertebra's own height under the pointer.
    const lift = v.y - shown[1];
    const camDir = new THREE.Vector3();
    this.camera.getWorldDirection(camDir);
    // In the middle plane when it faces the camera enough, else in the view plane through the vertebra.
    const normal = Math.abs(camDir.x) > 0.3 ? new THREE.Vector3(1, 0, 0) : camDir.clone().negate();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, new THREE.Vector3(0, shown[1], shown[2]));
    const hit = this.raycaster.ray.intersectPlane(plane, new THREE.Vector3());
    if (!hit) return;
    v.y = hit.y + lift;
    v.z = hit.z;
    tidySpine(sp);
    // Pulling an end vertebra out grows the spine.
    const gaps = sp.slice(1).map((q, i) => Math.hypot(q.y - sp[i]!.y, q.z - sp[i]!.z));
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    if (drag.index === sp.length - 1 && gaps[gaps.length - 1]! > mean * 1.8 + 0.2) {
      insertVertebra(this.design, sp.length - 2);
      drag.index = sp.length - 1;
      this.selection = { kind: 'vertebra', index: drag.index };
    } else if (drag.index === 0 && gaps[0]! > mean * 1.8 + 0.2) {
      insertVertebra(this.design, 0);
    }
    this.changed();
  }

  /** Moves a limb's knee or elbow, or its foot or hand, to where the pointer is in the plane it's dragged in (kept as offsets from its root). */
  private dragLimbNode(drag: { node: 'joint' | 'end'; index: number; limb: number; plane: THREE.Plane }): void {
    const hit = this.raycaster.ray.intersectPlane(drag.plane, new THREE.Vector3());
    const limb = this.grown.limbs[drag.limb];
    const part = this.design.parts[drag.index];
    if (!hit || !limb || !part) return;
    // The first time a limb is posed, the pose it had becomes its nodes.
    if (!part.joint || !part.end) {
      part.joint = limbOffset(limb.hip, limb.joint);
      part.end = limbOffset(limb.hip, limb.rest);
    }
    const o = limbOffset(limb.hip, hit.toArray() as Vec3);
    if (drag.node === 'joint') part.joint = o;
    else part.end = o;
    this.changed();
  }

  private dab(p: THREE.Vector3): void {
    if (this.drag?.kind === 'paint') this.drag.last = p.clone();
    if (this.design.splats.length >= MAX_SPLATS) return;
    const b = this.brush;
    this.design.splats.push(splatAt(this.grown.frames, p.toArray() as Vec3, b.size * this.grown.length, b.color, b.mirror, b.hardness));
    this.paintDirty = true;
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
      const drag = this.drag;
      this.drag = null;
      if (drag.kind === 'part' && drag.off) {
        this.outfit.fade(null);
        this.design.parts.splice(drag.index, 1);
        this.selection = null;
        this.changed();
      }
      this.commit();
      this.onChange?.();
    }
  }

  private wheel(e: WheelEvent): void {
    if (!this.editing) return;
    this.setRay(e);
    const h = this.pickHandle();
    if (!h) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const f = Math.exp(-e.deltaY * 0.0012);
    if (h.kind === 'vertebra') {
      const v = this.design.spine[h.index]!;
      if (e.shiftKey) v.w *= f;
      else v.r *= f;
      tidySpine(this.design.spine);
    } else {
      const p = this.design.parts[h.index]!;
      p.size = Math.min(3, Math.max(0.25, p.size * f));
    }
    this.selection = { kind: h.kind === 'vertebra' ? 'vertebra' : 'part', index: h.index };
    this.changed();
    if (this.wheelTimer) clearTimeout(this.wheelTimer);
    this.wheelTimer = setTimeout(() => this.commit(), 400);
  }

  private key(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Shift') this.held.add('Shift');
    if (this.mode === 'play' && !mod && STEER_KEYS.has(e.code)) {
      // Steering takes over from walking on its own: it stops when the keys are let go.
      e.preventDefault();
      if (this.walking) {
        this.walking = false;
        this.onChange?.();
      }
      this.held.add(e.code);
      return;
    }
    if (mod && e.code === 'KeyZ') {
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
    } else if (mod && e.code === 'KeyY') {
      e.preventDefault();
      this.redo();
    } else if (e.code === 'Escape') {
      this.cancelPlacing();
      this.selection = null;
      this.onChange?.();
    } else if (e.code === 'Delete' || e.code === 'Backspace') this.deleteSelection();
    else if (e.code === 'Space' && this.mode === 'play') {
      e.preventDefault();
      this.walking = !this.walking;
      this.onChange?.();
    } else if (e.code === 'KeyX' && !mod) {
      this.wireframe = !this.wireframe;
      this.onChange?.();
    } else if (e.code === 'Digit1') this.setMode('build');
    else if (e.code === 'Digit2') this.setMode('paint');
    else if (e.code === 'Digit3') this.setMode('outfit');
    else if (e.code === 'Digit4') this.setMode('play');
  }
}

const handleGeometry = new THREE.SphereGeometry(1, 16, 12);
/** A bone: a unit cylinder along y, centred. */
const boneGeometry = new THREE.CylinderGeometry(1, 1, 1, 10);
/** A vertebra, about a unit across: its body (the centrum) along the spine (z), a spinous process up (y) and transverse processes out to the sides (x). */
const vertebraGeometry = (() => {
  const centrum = new THREE.CylinderGeometry(0.5, 0.5, 0.75, 16).rotateX(Math.PI / 2);
  const spinous = new THREE.ConeGeometry(0.2, 0.95, 10).translate(0, 0.85, -0.12);
  const left = new THREE.ConeGeometry(0.16, 0.75, 8).rotateZ(-Math.PI / 2).translate(0.78, 0.2, 0);
  const right = new THREE.ConeGeometry(0.16, 0.75, 8).rotateZ(Math.PI / 2).translate(-0.78, 0.2, 0);
  const g = mergeGeometries([centrum, spinous, left, right])!;
  g.computeVertexNormals();
  return g;
})();

/** A soft meadow floor: grass tiles with a faint grid, so the walk reads against it. */
function floorTexture(): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = '#7fae6a';
  g.fillRect(0, 0, size, size);
  g.fillStyle = '#76a462';
  g.fillRect(0, 0, size / 2, size / 2);
  g.fillRect(size / 2, size / 2, size / 2, size / 2);
  g.strokeStyle = 'rgba(255,255,255,0.18)';
  g.lineWidth = 3;
  g.strokeRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  // One texture repeat is two tiles of TILE units.
  t.repeat.set(160 / (TILE * 2), 160 / (TILE * 2));
  t.anisotropy = 8;
  return t;
}

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { animalGait } from '../gen/animals';
import {
  MAX_SPLATS,
  SPINE_SUBDIVISIONS,
  anchorOf,
  cloneDesign,
  creatureForm,
  decodeDesign,
  encodeDesign,
  growCreature,
  insertVertebra,
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

/*
 * The creature editor (creature.html): Spore's creature creator on the
 * game's animal body. Three modes:
 *  - Build: drag the spine's vertebrae (in the body's middle plane) to
 *    shape it, the wheel over one to fatten it (Shift: widen it); dragging
 *    an end vertebra away grows the spine. Parts come from the palette and
 *    stick to the skin wherever the pointer is; drag a part's dot to move it
 *    over the body, the wheel over it to resize it.
 *  - Paint: the coat (colours, pattern) and a brush that paints soft dabs on
 *    the body, mirrored across it.
 *  - Play: the creature walks or trots on a moving floor, its legs stepping
 *    in the gait worked out for its body (gen/creatureMotion.ts), with a
 *    footfall diagram.
 * Everything is posed on the CPU each frame (one creature: a few thousand
 * triangles) and drawn with the game's animal material (creatureLook.ts).
 * `window.creatureLab` is this object (automation: npm run shot -- --creatures).
 */

export type EditorMode = 'build' | 'paint' | 'play';
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
  kind: 'vertebra' | 'part';
  index: number;
  mirrored: boolean;
}

const HANDLE_COLOR = new THREE.Color('#66ffcc');
const PART_HANDLE_COLOR = new THREE.Color('#ffcc66');
const SELECTED_COLOR = new THREE.Color('#ffffff');
/** Floor tile (units): the floor slides back by whole tiles as the creature walks. */
const TILE = 2;

export class CreatureLab {
  design: CreatureDesign;
  mode: EditorMode = 'build';
  selection: Selection = null;
  placing: PartKind | null = null;
  walking = true;
  run = 0;
  readonly brush: Brush = { color: '#ffd23f', size: 0.035, hardness: 0.5, mirror: true };
  /** Called when the design, the selection or the mode changes (the panel redraws). */
  onChange: (() => void) | null = null;

  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(38, 1, 0.05, 500);
  readonly controls: OrbitControls;
  private readonly view: CreatureLook;
  grown: GrownCreature;
  private restDirty = true;
  private paintDirty = true;
  private time = 0;
  private cycle = 0;
  private moving = 0;
  private travelled = 0;
  private framesDrawn = 0;
  private committed: string;
  private readonly undoStack: string[] = [];
  private readonly redoStack: string[] = [];
  private readonly handles = new THREE.Group();
  private handleMeshes: THREE.Mesh[] = [];
  private readonly spineLine: THREE.Line;
  private readonly skinPicker: THREE.Mesh;
  private readonly ground: THREE.Mesh;
  private readonly sun: THREE.DirectionalLight;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private hovered: HandleInfo | null = null;
  private drag: { kind: 'vertebra'; index: number } | { kind: 'part'; index: number; mirrored: boolean } | { kind: 'paint'; last: THREE.Vector3 | null } | null = null;
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
    this.scene.add(this.view.mesh, this.view.picker);
    this.skinPicker = new THREE.Mesh(new THREE.BufferGeometry());
    this.skinPicker.layers.set(1);
    this.scene.add(this.skinPicker);
    this.spineLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: HANDLE_COLOR, depthTest: false, transparent: true, opacity: 0.6 }));
    this.spineLine.renderOrder = 10;
    this.handles.add(this.spineLine);
    this.scene.add(this.handles);
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
      .map((l) => ({ label: `${l.mirrored ? 'R' : 'L'}${l.ranks - l.rank}`, phase: legPhase(l.rank, l.ranks, l.mirrored, this.run), order: -l.rank * 2 + (l.mirrored ? 1 : 0) }))
      .sort((a, b) => a.order - b.order)
      .map(({ label, phase }) => ({ label, phase }));
  }

  /** The gait now: stride (units), speed (units/s), duty factor, and strides walked. */
  gait(): { stride: number; speed: number; duty: number; cycle: number; hip: number } {
    const g = animalGait({ hipHeight: this.grown.hipHeight }, 1);
    const r = this.run;
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

  /** A whole new creature (undoable), the camera framing it. */
  setDesign(d: CreatureDesign): void {
    this.cancelPlacing();
    this.design = cloneDesign(d);
    this.selection = null;
    this.changed();
    this.commit();
    this.grown = growCreature(this.design);
    this.frameCreature();
  }

  /** The design from the page's #hash, if it holds one. */
  static designFromHash(): CreatureDesign | null {
    const h = location.hash.slice(1);
    return h ? decodeDesign(h) : null;
  }

  setMode(mode: EditorMode): void {
    this.cancelPlacing();
    this.mode = mode;
    if (mode !== 'build') this.selection = null;
    this.onChange?.();
  }

  /** Picks a part from the palette: it follows the pointer over the body until a click places it. */
  startPlacing(kind: PartKind, byDrag = false): void {
    this.cancelPlacing();
    if (this.mode !== 'build') this.setMode('build');
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

  /** Aims the camera at the whole creature from three-quarters ahead. */
  frameCreature(): void {
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
    const target = this.mode === 'play' && this.walking ? 1 : 0;
    this.moving += (target - this.moving) * Math.min(1, dt * 2.5);
    if (this.moving < 1e-3 && target === 0) this.moving = 0;
    const g = this.gait();
    this.cycle += (dt * g.speed * this.moving) / Math.max(1e-3, g.stride);
    this.travelled = (this.travelled + g.speed * this.moving * dt) % (TILE * 2);
    this.ground.position.z = -this.travelled;

    const pose: CreaturePose = { time: this.time, cycle: this.cycle, run: this.run, moving: this.moving };
    this.grown = growCreature(this.design, pose);
    const form = creatureForm(this.design);
    const posed = buildAnimalMesh(this.grown.skeleton, form, this.grown.length, 0);
    const rest = this.restDirty ? buildAnimalMesh(growCreature(this.design).skeleton, form, this.grown.length, 0) : null;
    this.view.update(posed, rest);
    if (this.paintDirty || this.restDirty) this.view.repaint(this.design, this.grown.rest, this.grown.length);
    this.restDirty = false;
    this.paintDirty = false;
    // Parts are placed and dragged over the skin alone: only needed while that happens.
    if (this.mode === 'build' && (this.placing !== null || this.drag?.kind === 'part')) this.updateSkinPicker();
    this.updateHandles();

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

  /** The vertebrae's and parts' dots, where they are this frame (shown in Build mode). */
  private updateHandles(): void {
    const show = this.mode === 'build' && this.placing === null;
    this.handles.visible = show;
    if (!show) return;
    const infos: HandleInfo[] = [];
    const points: Vec3[] = [];
    const frames = this.grown.frames;
    this.design.spine.forEach((_, i) => {
      infos.push({ kind: 'vertebra', index: i, mirrored: false });
      points.push(frames[Math.min(frames.length - 1, i * SPINE_SUBDIVISIONS)]!.p);
    });
    this.design.parts.forEach((p, i) => {
      for (const mirrored of p.mirror && Math.abs(Math.sin(p.theta)) > 0.06 ? [false, true] : [false]) {
        infos.push({ kind: 'part', index: i, mirrored });
        const k = skinPoint(frames, p.s, mirrored ? -p.theta : p.theta);
        points.push([k.p[0] + k.n[0] * 0.04, k.p[1] + k.n[1] * 0.04, k.p[2] + k.n[2] * 0.04]);
      }
    });
    while (this.handleMeshes.length < infos.length) {
      const m = new THREE.Mesh(handleGeometry, new THREE.MeshBasicMaterial({ depthTest: false, transparent: true, opacity: 0.9 }));
      m.renderOrder = 11;
      this.handles.add(m);
      this.handleMeshes.push(m);
    }
    const r = Math.max(0.05, this.grown.length * 0.013);
    this.handleMeshes.forEach((m, i) => {
      const info = infos[i];
      m.visible = !!info;
      if (!info) return;
      m.userData = info;
      m.position.set(...points[i]!);
      const sel = this.selection;
      const selected = sel !== null && sel.kind === info.kind && sel.index === info.index;
      const hover = this.hovered !== null && this.hovered.kind === info.kind && this.hovered.index === info.index;
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.color.copy(selected ? SELECTED_COLOR : info.kind === 'vertebra' ? HANDLE_COLOR : PART_HANDLE_COLOR);
      m.scale.setScalar(r * (info.kind === 'vertebra' ? 1 : 0.8) * (hover || selected ? 1.4 : 1));
    });
    const line = new Float32Array(this.design.spine.length * 3);
    points.slice(0, this.design.spine.length).forEach((p, i) => line.set(p, i * 3));
    this.spineLine.geometry.setAttribute('position', new THREE.BufferAttribute(line, 3));
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

  private pickHandle(): HandleInfo | null {
    if (!this.handles.visible) return null;
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
    if (e.button !== 0) return;
    this.setRay(e);
    if (this.mode === 'build') {
      if (this.placing) {
        if (this.ghost !== null) this.place(e.shiftKey);
        else this.cancelPlacing();
        e.stopImmediatePropagation();
        return;
      }
      const h = this.pickHandle();
      if (h) {
        this.selection = { kind: h.kind, index: h.index };
        this.drag = h.kind === 'vertebra' ? { kind: 'vertebra', index: h.index } : { kind: 'part', index: h.index, mirrored: h.mirrored };
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
      const h = this.mode === 'build' && this.overCanvas(e) ? this.pickHandle() : null;
      if (h?.kind !== this.hovered?.kind || h?.index !== this.hovered?.index) this.hovered = h;
      this.renderer.domElement.style.cursor = h ? 'grab' : this.mode === 'paint' ? 'crosshair' : '';
      return;
    }
    if (drag.kind === 'vertebra') this.dragVertebra(drag);
    else if (drag.kind === 'part') {
      const hit = this.hitSkin();
      if (hit) {
        const a = anchorOf(this.grown.frames, hit.toArray() as Vec3);
        const p = this.design.parts[drag.index]!;
        p.s = a.s;
        p.theta = drag.mirrored ? -a.theta : a.theta;
        this.restDirty = true;
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
    // Keep it between its neighbours.
    if (drag.index > 0) v.z = Math.max(v.z, sp[drag.index - 1]!.z + 0.08);
    if (drag.index < sp.length - 1) v.z = Math.min(v.z, sp[drag.index + 1]!.z - 0.08);
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
      this.drag = null;
      this.commit();
      this.onChange?.();
    }
  }

  private wheel(e: WheelEvent): void {
    if (this.mode !== 'build') return;
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
    this.selection = { kind: h.kind, index: h.index };
    this.changed();
    if (this.wheelTimer) clearTimeout(this.wheelTimer);
    this.wheelTimer = setTimeout(() => this.commit(), 400);
  }

  private key(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    const mod = e.ctrlKey || e.metaKey;
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
    } else if (e.code === 'Digit1') this.setMode('build');
    else if (e.code === 'Digit2') this.setMode('paint');
    else if (e.code === 'Digit3') this.setMode('play');
  }
}

const handleGeometry = new THREE.SphereGeometry(1, 16, 12);

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

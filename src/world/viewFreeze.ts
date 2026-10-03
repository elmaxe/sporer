import * as THREE from 'three';

/**
 * The frozen view (the menu's Freeze button, or F; the lab's panel): what is
 * drawn stays chosen for the camera as it was when the view froze, while the
 * camera itself moves on, so you can look round from outside at what the
 * renderer keeps and drops. The globe's level of detail and its horizon
 * culling stop (planet/LodSurface.ts), the plants stop rescanning
 * (surface/SurfaceEntities.ts), and frustum culling tests every object
 * against the frozen camera's frustum instead of the live one's. The frozen
 * frustum is drawn as an outline. Best seen with the wireframe on.
 */
export const viewFreeze = {
  enabled: false,
};

/** What the frozen frustum culling did in the frames since `resetFrozenStats`. */
export const frozenStats = {
  /** Objects tested against the frozen frustum, and those it left out. */
  tested: 0,
  culled: 0,
};

export function resetFrozenStats(): void {
  frozenStats.tested = 0;
  frozenStats.culled = 0;
}

/** The outline's colour. */
const HELPER_COLOR = 0xffd24a;

/** One camera as it was when the view froze, as seen in one scene. */
interface FrozenView {
  readonly camera: THREE.Camera;
  readonly frustum: THREE.Frustum;
  /** The frustum's outline (perspective cameras only), drawn while the live camera looks. */
  readonly helper: THREE.LineSegments | null;
}

/** Per scene, per camera drawing it (a level's scene can be drawn by more than one: the system as the planet level's sky). */
let frozen = new WeakMap<THREE.Scene, Map<THREE.Camera, FrozenView>>();
/** Every outline made since the last freeze, to dispose on the next. */
const outlines: THREE.LineSegments[] = [];

/** Freezes the view, or thaws it (a new freeze starts from the cameras as they are then). */
export function setViewFrozen(on: boolean): void {
  viewFreeze.enabled = on;
  frozen = new WeakMap();
  for (const o of outlines) {
    o.geometry.dispose();
    (o.material as THREE.Material).dispose();
  }
  outlines.length = 0;
  resetFrozenStats();
}

/** The view `camera` had of `scene` when the view froze: taken the first time it's asked for after freezing. */
function frozenView(scene: THREE.Scene, camera: THREE.Camera): FrozenView {
  let views = frozen.get(scene);
  if (!views) frozen.set(scene, (views = new Map()));
  let view = views.get(camera);
  if (!view) {
    camera.updateMatrixWorld();
    const copy = camera.clone();
    const frustum = new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(copy.projectionMatrix, copy.matrixWorldInverse),
    );
    const helper = copy instanceof THREE.PerspectiveCamera ? frustumOutline(copy, scene) : null;
    view = { camera: copy, frustum, helper };
    views.set(camera, view);
  }
  return view;
}

/**
 * Lines from the eye to the corners of the view, and round them, at the
 * distance of the scene's origin (the globe's centre in low orbit, the star
 * in a system) within the camera's range. Drawn over everything, so the
 * frustum shows through the ground.
 */
function frustumOutline(camera: THREE.PerspectiveCamera, scene: THREE.Scene): THREE.LineSegments {
  const eye = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
  const origin = new THREE.Vector3().setFromMatrixPosition(scene.matrixWorld);
  const d = THREE.MathUtils.clamp(eye.distanceTo(origin), camera.near * 10, camera.far * 0.5);
  const h = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * d;
  const w = h * camera.aspect;
  const corners = [
    [-w, -h],
    [w, -h],
    [w, h],
    [-w, h],
  ];
  const points: number[] = [];
  corners.forEach(([x, y], i) => {
    const [nx, ny] = corners[(i + 1) % 4]!;
    points.push(0, 0, 0, x!, y!, -d, x!, y!, -d, nx!, ny!, -d);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  const material = new THREE.LineBasicMaterial({ color: HELPER_COLOR, depthTest: false, depthWrite: false, transparent: true, opacity: 0.8 });
  const helper = new THREE.LineSegments(geometry, material);
  helper.name = 'Frozen view';
  helper.frustumCulled = false;
  helper.renderOrder = Infinity;
  helper.matrixAutoUpdate = false;
  helper.matrix.copy(camera.matrixWorld);
  helper.matrixWorld.copy(camera.matrixWorld);
  outlines.push(helper);
  return helper;
}

const culled: THREE.Object3D[] = [];
const culledMasks: number[] = [];
const kept: THREE.Object3D[] = [];
let active = false;

/**
 * Before drawing `scene` with `camera` while the view is frozen: objects the
 * frozen frustum leaves out are taken off every layer (so the renderer skips
 * them, but not their children, as its own culling does), and those it keeps
 * aren't culled again by the live camera. Undone by `endFrozenCulling`.
 * Nothing happens when the view isn't frozen. Allocation-free once frozen.
 */
export function beginFrozenCulling(scene: THREE.Scene, camera: THREE.Camera): void {
  if (!viewFreeze.enabled || active) return;
  active = true;
  const { frustum } = frozenView(scene, camera);
  scene.updateMatrixWorld();
  scene.traverseVisible((o) => {
    if (!o.frustumCulled || !(o instanceof THREE.Mesh || o instanceof THREE.Points || o instanceof THREE.Line || o instanceof THREE.Sprite)) return;
    frozenStats.tested++;
    const inside = o instanceof THREE.Sprite ? frustum.intersectsSprite(o) : frustum.intersectsObject(o);
    if (inside) {
      o.frustumCulled = false;
      kept.push(o);
    } else {
      frozenStats.culled++;
      culledMasks.push(o.layers.mask);
      o.layers.mask = 0;
      culled.push(o);
    }
  });
}

/** Puts back what `beginFrozenCulling` changed. */
export function endFrozenCulling(): void {
  if (!active) return;
  active = false;
  for (const o of kept) o.frustumCulled = true;
  for (let i = 0; i < culled.length; i++) culled[i]!.layers.mask = culledMasks[i]!;
  kept.length = 0;
  culled.length = 0;
  culledMasks.length = 0;
}

/** The frozen frustum's outline for `scene` drawn by `camera`, to add while drawing (null when not frozen). */
export function frozenOutline(scene: THREE.Scene, camera: THREE.Camera): THREE.LineSegments | null {
  return viewFreeze.enabled ? frozenView(scene, camera).helper : null;
}

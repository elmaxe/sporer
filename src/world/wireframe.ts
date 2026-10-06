import * as THREE from 'three';
import { thirdPersonMarker } from './thirdPerson';
import { beginFrozenCulling, endFrozenCulling, frozenOutline } from './viewFreeze';

/** The wireframe view (the menu's Wireframe switch; the lab has its own): surfaces drawn as their triangles' edges. */
export const wireframeParams = {
  enabled: false,
};

const solids: THREE.MeshStandardMaterial[] = [];
const others: THREE.Object3D[] = [];

/**
 * Draws `scene` the usual way, or as a wireframe when `wireframe` (default:
 * the game's switch). Levels draw their scenes through this instead of
 * `renderer.render`. Clears like `renderer.render` does (per autoClear).
 * While the view is frozen (world/viewFreeze.ts) objects are culled by the
 * frozen camera's frustum, which is drawn too unless `outline` is false.
 * Drawn by the third-person view's overview camera (world/thirdPerson.ts),
 * they're culled by the game camera's, which is drawn as a marker.
 */
export function renderScene(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  wireframe = wireframeParams.enabled,
  outline = true,
): void {
  beginFrozenCulling(scene, camera);
  const helper = outline ? frozenOutline(scene, camera) : null;
  if (helper) scene.add(helper);
  const marker = thirdPersonMarker(camera);
  if (marker) scene.add(marker);
  if (wireframe) renderWireframe(renderer, scene, camera);
  else renderer.render(scene, camera);
  if (marker) scene.remove(marker);
  if (helper) scene.remove(helper);
  endFrozenCulling();
}

/**
 * The lit surfaces (MeshStandardMaterial) as wireframes with hidden lines
 * removed, everything else as usual. WebGL draws a wireframe as lines, which
 * are never back-face culled, so the far side of every sphere would show
 * through the near side. First the solid surfaces go into the depth buffer
 * only (pushed back a little, so the lines on them still pass), then the
 * scene is drawn over it with those surfaces as lines. Allocation-free.
 */
export function renderWireframe(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
  solids.length = 0;
  others.length = 0;
  scene.traverseVisible((o) => {
    if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) solids.push(o.material);
    else if (o !== scene && (o instanceof THREE.Mesh || o instanceof THREE.Points || o instanceof THREE.Sprite || o instanceof THREE.Line)) others.push(o);
  });
  for (const m of solids) Object.assign(m, { wireframe: false, colorWrite: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  for (const o of others) o.visible = false;
  renderer.render(scene, camera);
  for (const m of solids) Object.assign(m, { wireframe: true, colorWrite: true, polygonOffset: false });
  for (const o of others) o.visible = true;
  const autoClear = renderer.autoClear;
  renderer.autoClear = false;
  renderer.render(scene, camera);
  renderer.autoClear = autoClear;
  for (const m of solids) m.wireframe = false;
  solids.length = 0;
  others.length = 0;
}

import * as THREE from 'three';

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
 */
export function renderScene(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  wireframe = wireframeParams.enabled,
): void {
  if (wireframe) renderWireframe(renderer, scene, camera);
  else renderer.render(scene, camera);
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

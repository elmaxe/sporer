import * as THREE from 'three';

/**
 * The third-person view (the menu's Third-person switch, or C; see
 * ui/ThirdPersonControl.ts): the level is drawn from an overview camera
 * looking at the whole planet, system or galaxy, while the game goes on with
 * its own camera as usual. Everything that chooses what to draw for that
 * camera (the globe's level of detail and horizon culling, the plants' and
 * animals' scans, billboards) still works for it, and frustum culling tests
 * every object against its frustum rather than the overview's, so what shows
 * is what the renderer would draw for the real camera. The real camera is
 * drawn as a marker: a dot where it is, its frustum out to the overview's
 * centre and a line along where it looks. Best seen with the wireframe on.
 */
export const thirdPerson = {
  /** The overview camera the levels are drawn with, while the view is on (null when off). */
  view: null as THREE.PerspectiveCamera | null,
  /** The game's own camera, which still decides what's drawn. */
  eye: null as THREE.PerspectiveCamera | null,
  /** The centre of what the overview looks at, in the level drawn now (the frustum marker reaches it). */
  centre: new THREE.Vector3(),
};

/** The camera that decides what's culled when drawing with `camera`: the game's own while the overview draws. */
export function cullingCamera(camera: THREE.Camera): THREE.Camera {
  return thirdPerson.view !== null && camera === thirdPerson.view && thirdPerson.eye ? thirdPerson.eye : camera;
}

/**
 * The camera to cast pointer rays from when the game uses `camera`: the
 * overview while it draws the picture (so a click picks what's under the
 * pointer on screen), else `camera`. The overview is posed as it was for the
 * last frame drawn, as `camera` itself is when pickers read it.
 */
export function pointerCamera(camera: THREE.Camera): THREE.Camera {
  return thirdPerson.view !== null && camera === thirdPerson.eye ? thirdPerson.view : camera;
}

/** The marker's colour (the frozen view's outline is yellow). */
const MARKER_COLOR = 0x4ad8ff;
/** After everything else in the scene (finite, so the marker's own parts keep their order). */
const MARKER_RENDER_ORDER = 1e9;
/** The dot's size in pixels. */
const DOT_PIXELS = 12;

/**
 * The real camera, drawn in whatever level the overview shows: a frustum one
 * unit deep (scaled to reach the overview's centre), its axis and a tick
 * above the far edge for up, bright where nothing hides it and faint through
 * the ground; and a dot of fixed size on screen where the camera is, so it
 * shows from the farthest zoom. Built once and moved into the scene drawn.
 */
class CameraMarker {
  readonly group = new THREE.Group();
  private readonly geometry = new THREE.BufferGeometry();
  private readonly positions = new Float32Array(LINE_VERTICES * 3);
  private readonly shown: THREE.LineSegments;
  private readonly hidden: THREE.LineSegments;
  private readonly dot: THREE.Points;
  private readonly materials: THREE.Material[];
  private readonly dotTexture: THREE.DataTexture;
  private fov = -1;
  private aspect = -1;
  private readonly scale = new THREE.Matrix4();

  constructor() {
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    const shown = new THREE.LineBasicMaterial({ color: MARKER_COLOR, transparent: true, opacity: 0.95, depthWrite: false });
    const hidden = new THREE.LineBasicMaterial({ color: MARKER_COLOR, transparent: true, opacity: 0.3, depthTest: false, depthWrite: false });
    this.shown = new THREE.LineSegments(this.geometry, shown);
    this.hidden = new THREE.LineSegments(this.geometry, hidden);
    this.dotTexture = roundDot();
    const dotMaterial = new THREE.PointsMaterial({
      color: MARKER_COLOR,
      size: DOT_PIXELS,
      sizeAttenuation: false,
      map: this.dotTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const dotGeometry = new THREE.BufferGeometry();
    dotGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
    this.dot = new THREE.Points(dotGeometry, dotMaterial);
    this.materials = [shown, hidden, dotMaterial];
    // The faint lines first, the bright ones over them, the dot over everything.
    this.hidden.renderOrder = MARKER_RENDER_ORDER;
    this.shown.renderOrder = MARKER_RENDER_ORDER + 1;
    this.dot.renderOrder = MARKER_RENDER_ORDER + 2;
    for (const o of [this.hidden, this.shown, this.dot]) {
      o.frustumCulled = false;
      this.group.add(o);
    }
    this.group.name = 'Third-person: real camera';
    this.group.matrixAutoUpdate = false;
  }

  /** Puts the marker on `camera` (in world space), its frustum reaching `depth`. */
  place(camera: THREE.PerspectiveCamera, depth: number): void {
    if (camera.fov !== this.fov || camera.aspect !== this.aspect) this.build(camera.fov, camera.aspect);
    // The dot sits at the group's origin: the camera (its size on screen doesn't scale).
    this.group.matrix.multiplyMatrices(camera.matrixWorld, this.scale.makeScale(depth, depth, depth));
    this.group.matrixWorldNeedsUpdate = true;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.geometry.dispose();
    this.dot.geometry.dispose();
    this.dotTexture.dispose();
    for (const m of this.materials) m.dispose();
  }

  /** The frustum one unit deep for a view `fov` degrees tall at `aspect`. */
  private build(fov: number, aspect: number): void {
    this.fov = fov;
    this.aspect = aspect;
    const h = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
    const w = h * aspect;
    const p = this.positions;
    let i = 0;
    const line = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => {
      p[i++] = ax;
      p[i++] = ay;
      p[i++] = az;
      p[i++] = bx;
      p[i++] = by;
      p[i++] = bz;
    };
    const corners = [
      [-w, -h],
      [w, -h],
      [w, h],
      [-w, h],
    ] as const;
    corners.forEach(([x, y], k) => {
      const [nx, ny] = corners[(k + 1) % 4]!;
      line(0, 0, 0, x, y, -1);
      line(x, y, -1, nx, ny, -1);
    });
    // The axis: where it looks.
    line(0, 0, 0, 0, 0, -1);
    // Up: a tick above the top edge.
    line(-w * 0.3, h, -1, 0, h * 1.35, -1);
    line(0, h * 1.35, -1, w * 0.3, h, -1);
    this.geometry.attributes.position!.needsUpdate = true;
    this.geometry.computeBoundingSphere();
  }
}

/** Line segments in the marker: 4 edges, 4 rim lines, the axis, 2 for the up tick. */
const LINE_VERTICES = (4 + 4 + 1 + 2) * 2;

/** A soft round dot with a dark rim, so it shows on bright and dark alike. */
function roundDot(): THREE.DataTexture {
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2);
      const i = (y * size + x) * 4;
      const fill = r < 0.62 ? 255 : r < 0.82 ? 40 : 0;
      data[i] = data[i + 1] = data[i + 2] = fill;
      data[i + 3] = r < 0.82 ? 255 : r < 1 ? Math.round(255 * (1 - (r - 0.82) / 0.18)) : 0;
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

let marker: CameraMarker | null = null;

/**
 * The real camera's marker for drawing `scene` with `camera`, to add while
 * drawing it: only when `camera` is the overview (null otherwise).
 */
export function thirdPersonMarker(camera: THREE.Camera): THREE.Object3D | null {
  const eye = thirdPerson.eye;
  if (thirdPerson.view === null || camera !== thirdPerson.view || !eye) return null;
  marker ??= new CameraMarker();
  const depth = THREE.MathUtils.clamp(eye.position.distanceTo(thirdPerson.centre), eye.near * 10, eye.far * 0.5);
  marker.place(eye, depth);
  return marker.group;
}

/** Turns the view on with `view` drawing while `eye` decides, or off (null). */
export function setThirdPerson(view: THREE.PerspectiveCamera | null, eye: THREE.PerspectiveCamera | null = null): void {
  thirdPerson.view = view;
  thirdPerson.eye = view ? eye : null;
  if (!view) {
    marker?.dispose();
    marker = null;
  }
}

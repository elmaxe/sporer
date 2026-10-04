import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';
import type { Input } from '../core/Input';
import { surfaceNoise, type TerrainNoise } from '../gen/craters';
import { LAVA_SEA_GLSL } from '../world/lavaMaterial';
import { GAS_GLSL } from '../world/gasLook';
import { isGas, type PlanetConfig } from '../world/Planet';
import { SHAPE_FLOOR, shapeRadius } from '../gen/shape';
import { gasPainter, terrainPainter, type GasPainter, type TerrainPainter } from '../world/planetGeometry';
import {
  EQUAL_EARTH_HEIGHT,
  EQUAL_EARTH_WIDTH,
  equalEarth,
  equalEarthInverse,
  fromLonLat,
  toLonLat,
} from './equalEarth';
import type { PlanetGlobe } from './PlanetGlobe';
import type { PlanetShip } from './PlanetShip';
import type { SpeciesTab } from './SpeciesTab';

/** Tunables (debug: *Planet map*). */
export const planetMapParams = {
  /** Brightness of the night side (1 = no day/night shading). */
  night: 0.45,
  /** Strength of the relief shading on land (lit from the north-west). */
  hillshade: 0.5,
};

/** The map's width in CSS pixels at most (the stylesheet sets the same): the desktop panel, the touch overlay. */
const CSS_WIDTH = 320;
const TOUCH_CSS_WIDTH = 640;
/** Margin around the projection's outline, as a fraction of its size. */
const MARGIN = 0.03;
/** Milliseconds of map baking per frame, so building it never stalls the game. */
const BAKE_BUDGET_MS = 4;
/** While baking, the texture is re-uploaded at most this often. */
const UPLOAD_SECONDS = 0.1;
const MARKS_SECONDS = 1 / 30;
/** The markers' canvas resolution, device pixels per CSS pixel at most (like the game's canvas). */
const MAX_PIXEL_RATIO = 2;
/** Rounding of the map's bottom corners, CSS px (the panel's border radius, less its border). */
const CORNER_RADIUS = 7;
/** Graticule spacing, radians. */
const GRID_STEP = Math.PI / 6;
/** Samples along the autopilot's great-circle path. */
const PATH_SAMPLES = 48;
const TOGGLE_KEY = 'KeyN';
const STORAGE_KEY = 'spore2.map';
const ACCENT = '#66ffcc';

/** The map panel's tabs: the map itself, or the planet's species (SpeciesTab). */
export type MapTab = 'map' | 'species';
/** The tab last shown, kept from planet to planet. */
let lastTab: MapTab = 'map';

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/*
 * Per pixel: the inverse Equal Earth projection (equalEarth.ts) gives the
 * direction on the globe. Terrain comes from the baked texture (alpha 1),
 * darkened on the night side; lava seas (alpha 0) are the sea sphere's own
 * shader, animated and lit the same. Outside the outline, the panel.
 */
const fragmentShader = /* glsl */ `
  #ifdef LAVA
  ${LAVA_SEA_GLSL}
  #else
  uniform vec3 uSun;
  #endif
  #ifdef GAS
  ${GAS_GLSL}
  uniform float uGasFp;   // how much of the globe a map pixel spans
  #endif
  #ifndef TONE_MAPPING
  #define toneMapping(c) (c)
  #endif
  uniform sampler2D uMap;
  uniform vec2 uExtent;   // projection units across the whole quad
  uniform vec2 uSize;     // CSS px
  uniform float uCorner;  // CSS px
  uniform float uNight;
  uniform vec4 uPanel;    // background outside the outline (linear, alpha)
  varying vec2 vUv;

  const float A1 = 1.340264;
  const float A2 = -0.081106;
  const float A3 = 0.000893;
  const float A4 = 0.003796;
  const float M = 0.8660254037844386;

  void main() {
    // Rounded bottom corners, like the panel.
    vec2 px = vUv * uSize;
    vec2 c = vec2(clamp(px.x, uCorner, uSize.x - uCorner), max(px.y, uCorner));
    if (distance(px, c) > uCorner) discard;

    vec2 xy = (vUv - 0.5) * uExtent;
    float yMax = 1.3173627;
    float t = clamp(xy.y, -yMax, yMax);
    float fp = A1;
    for (int i = 0; i < 6; i++) {
      float t2 = t * t;
      float t6 = t2 * t2 * t2;
      fp = A1 + 3.0 * A2 * t2 + t6 * (7.0 * A3 + 9.0 * A4 * t2);
      t -= (t * (A1 + A2 * t2 + t6 * (A3 + A4 * t2)) - xy.y) / fp;
    }
    float lon = M * xy.x * fp / cos(t);
    if (abs(xy.y) > yMax || abs(lon) > 3.14159265) {
      gl_FragColor = uPanel;
      return;
    }
    float lat = asin(clamp(sin(t) / M, -1.0, 1.0));
    vec3 dir = vec3(cos(lat) * sin(lon), sin(lat), cos(lat) * cos(lon));

    vec4 ground = texture2D(uMap, vUv);
    vec3 col;
    #ifdef LAVA
    if (ground.a < 0.5) {
      col = toneMapping(lavaSea(dir, lavaFlow(dir)));
    } else
    #endif
    {
      // A soft terminator, a few degrees wide.
      float day = smoothstep(-0.06, 0.06, dot(dir, uSun));
      #ifdef GAS
      // The globe's own clouds, storms and all.
      ground.rgb = gasColor(dir, uGasFp);
      #endif
      col = ground.rgb * mix(uNight, 1.0, day);
    }
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

/**
 * A map of the visited planet or moon in the Equal Earth projection (see
 * equalEarth.ts): a panel in the corner for mouse players, and for touch
 * players an overlay opened from the Map button (#touch-map) and closed by
 * its title bar's ×:
 * the same terrain and seas as the globe, coloured by the globe's own
 * painters from the same noise, with relief shading and the live night
 * side; lava seas are drawn by the globe's lava shader, so they flow and
 * glow in step with it. On top: the sun, the ship and its heading, and the
 * autopilot's destination and great-circle path. Click or tap it to fly
 * there; N (or its button) folds the desktop panel away, remembered in
 * localStorage. Given a `SpeciesTab`, the title bar has two tabs, Map and
 * Species (the planet's animals and plants, which the radar tracks); the
 * tab picked is kept from planet to planet.
 *
 * The terrain is baked on the CPU a few rows per frame into a texture; the
 * level draws the map into the game's canvas under the panel (`render`),
 * and the markers go on a 2D canvas on top. The DOM (#planet-map) is shared
 * by every planet level, so only the active one shows it, and not during
 * level transitions.
 */
export class PlanetMap implements Entity {
  private readonly root = document.getElementById('planet-map')!;
  private readonly title = document.getElementById('planet-map-title')!;
  private readonly toggle = document.getElementById('planet-map-toggle') as HTMLButtonElement;
  private readonly marksCanvas = document.getElementById('planet-map-marks') as HTMLCanvasElement;
  private readonly mapButton = document.getElementById('touch-map') as HTMLButtonElement;
  /** The tab bar (none in the planet lab's page). */
  private readonly tabs = document.getElementById('planet-map-tabs');
  private readonly tabButtons: HTMLButtonElement[] = this.tabs ? [...this.tabs.querySelectorAll<HTMLButtonElement>('button[data-tab]')] : [];
  private _tab: MapTab = 'map';
  private readonly width: number;
  private readonly height: number;
  /** Canvas pixels per projection unit. */
  private readonly scale: number;
  private readonly data: Uint8Array;
  private readonly heights: Float32Array;
  private readonly texture: THREE.DataTexture;
  private readonly material: THREE.ShaderMaterial;
  private readonly quad: THREE.Mesh;
  private readonly camera = new THREE.Camera();
  private readonly lava: boolean;
  private bakedRows = 0;
  private sinceUpload = 0;
  private readonly terrain: TerrainPainter | null;
  /** The ground's noise as low orbit's globe reads it (its craters too). */
  private readonly noise: TerrainNoise;
  private readonly gas: GasPainter | null;
  private readonly relief: number;
  private active = false;
  private shown = false;
  private folded: boolean;
  /** Touch mode: whether the overlay is open (it starts closed). */
  private open = false;
  /** The input mode the panel was last laid out for. */
  private touchLayout: boolean | null = null;
  private keyWasDown = false;
  private sinceMarks = MARKS_SECONDS;
  /** Where the map is drawn, CSS px from the canvas's top left (re-read when the layout may have changed). */
  private readonly rect = { x: 0, y: 0, w: 0, h: 0 };
  private rectDirty = true;

  // Scratch objects, reused every frame.
  private readonly color = new THREE.Color();
  private readonly srgb = { r: 0, g: 0, b: 0 };
  private readonly point = { x: 0, y: 0 };
  private readonly lonLat = { lon: 0, lat: 0 };
  private readonly dir3 = [0, 0, 0];
  private readonly forward = new THREE.Vector3();
  private readonly ahead = new THREE.Vector3();
  private readonly along = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly click = new THREE.Vector3();
  private readonly viewport = new THREE.Vector4();

  constructor(
    private readonly config: PlanetConfig,
    /** Shown in the map's title bar. */
    private readonly name: string,
    private readonly ship: PlanetShip,
    /** Its sun direction and lights (kept up to date by PlanetLights) and its lava. */
    private readonly globe: PlanetGlobe,
    private readonly input: Input,
    debug: Debug,
    /** The Species tab, if the map has one (the game's; not the planet lab's). */
    private readonly species: SpeciesTab | null = null,
  ) {
    // Baked for the size it will mostly be shown at (the touch overlay is bigger).
    const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    this.width = Math.round((input.touchMode ? TOUCH_CSS_WIDTH : CSS_WIDTH) * pixelRatio);
    this.scale = this.width / (EQUAL_EARTH_WIDTH * (1 + MARGIN));
    this.height = Math.round(EQUAL_EARTH_HEIGHT * (1 + MARGIN) * this.scale);
    this.data = new Uint8Array(this.width * this.height * 4);
    this.heights = new Float32Array(this.width * this.height);
    this.texture = new THREE.DataTexture(this.data, this.width, this.height, THREE.RGBAFormat);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    // Scaled to the panel's size (the shader reads alpha < 0.5 as lava, so coasts stay crisp).
    this.texture.magFilter = this.texture.minFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;

    const gas = isGas(config);
    // Gas giants' clouds are drawn by the globe's shader (GAS); the bake only fills the outline.
    this.gas = gas ? gasPainter(config.seed, config.bands, config.size === 'iceGiant') : null;
    this.terrain = gas ? null : terrainPainter(config.style, false, config.seed);
    this.noise = surfaceNoise(config, true);
    this.relief = gas ? 0 : config.style.relief;
    this.lava = globe.lava !== null;
    this.folded = loadFolded();

    const panel = new THREE.Color(8 / 255, 14 / 255, 28 / 255);
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      defines: this.lava ? { LAVA: '' } : globe.gas ? { GAS: '' } : {},
      uniforms: {
        ...(globe.lava ? globe.lava.seaUniforms(globe.sun, globe.sunLight, globe.ambientLight) : { uSun: { value: globe.sun } }),
        ...(globe.gas ? { ...globe.gas.uniforms, uGasFp: { value: (2 * Math.PI) / this.width } } : {}),
        uMap: { value: this.texture },
        uExtent: { value: new THREE.Vector2(this.width / this.scale, this.height / this.scale) },
        uSize: { value: new THREE.Vector2() },
        uCorner: { value: CORNER_RADIUS },
        uNight: { value: planetMapParams.night },
        uPanel: { value: new THREE.Vector4(panel.r, panel.g, panel.b, 0.72) },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;

    const f = debug.folder('Planet map');
    f?.add(planetMapParams, 'night', 0, 1);
    f?.add(planetMapParams, 'hillshade', 0, 2).onChange(() => (this.bakedRows = 0));
  }

  /** True once every row of the map is baked (for tests). */
  get baked(): boolean {
    return this.bakedRows >= this.height;
  }

  /** True while the panel is open on screen (on either tab). */
  get visible(): boolean {
    return this.shown && !this.hidesBody;
  }

  /** True while the map itself is drawn (the panel open on the Map tab). */
  get drawing(): boolean {
    return this.visible && this._tab === 'map';
  }

  /** The tab on show. */
  get tab(): MapTab {
    return this._tab;
  }

  /** Shows tab `tab` (the map only, without a Species tab). */
  setTab(tab: MapTab): void {
    if (!this.species) tab = 'map';
    this._tab = tab;
    if (this.active) lastTab = tab;
    for (const b of this.tabButtons) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
    this.marksCanvas.hidden = tab !== 'map';
    this.species?.show(this.active && tab === 'species');
    this.rectDirty = true;
    this.sinceMarks = Infinity;
  }

  /** The desktop panel folded down to its title bar. */
  private get hidesBody(): boolean {
    return this.folded && !this.input.touchMode;
  }

  /** Where `direction` (body frame) is on the map, in CSS pixels from its top left (for tests and automation). */
  mapPosition(direction: THREE.Vector3): { x: number; y: number } {
    this.project(direction, this.point);
    const k = this.marksCanvas.getBoundingClientRect().width / this.width;
    return { x: this.point.x * k, y: this.point.y * k };
  }

  activate(): void {
    this.active = true;
    this.title.textContent = this.name;
    this.open = false;
    this.touchLayout = null;
    // The texture's aspect until measured, so the panel lays out at the right height.
    this.marksCanvas.width = this.width;
    this.marksCanvas.height = this.height;
    this.showFolded();
    this.showOpen();
    this.toggle.addEventListener('click', this.onToggle);
    this.mapButton.addEventListener('click', this.onMapButton);
    this.marksCanvas.addEventListener('click', this.onClick);
    window.addEventListener('resize', this.onResize);
    if (this.tabs) this.tabs.hidden = !this.species;
    if (this.species) {
      this.species.attach();
      for (const b of this.tabButtons) b.addEventListener('click', this.onTab);
    }
    this.setTab(lastTab);
    this.sinceMarks = Infinity;
    this.rectDirty = true;
  }

  deactivate(): void {
    if (!this.active) return;
    this.active = false;
    this.setShown(false);
    this.toggle.removeEventListener('click', this.onToggle);
    this.mapButton.removeEventListener('click', this.onMapButton);
    this.marksCanvas.removeEventListener('click', this.onClick);
    window.removeEventListener('resize', this.onResize);
    for (const b of this.tabButtons) b.removeEventListener('click', this.onTab);
    this.species?.detach();
    this.marksCanvas.hidden = false;
    this.tabs?.classList.remove('tracking');
  }

  update(frameDt: number): void {
    // Still updated while crossfading out, but the DOM belongs to the level taking over.
    if (!this.active) return;
    const key = this.input.isDown(TOGGLE_KEY);
    if (key && !this.keyWasDown) this.setFolded(!this.folded);
    this.keyWasDown = key;
    const touch = this.input.touchMode;
    if (touch !== this.touchLayout) {
      // The stylesheet moves and resizes the panel between the modes.
      this.touchLayout = touch;
      this.rectDirty = true;
      this.showFolded();
    }
    // Touch players open it from the Map button; never while zooming in or out (input is blocked then).
    this.setShown((!this.input.touchMode || this.open) && !this.input.blocked);
    if (this.species) {
      this.species.update(frameDt);
      this.tabs?.classList.toggle('tracking', this.species.active);
    }
    if (!this.drawing) return;

    if (!this.baked) {
      this.bake();
      this.sinceUpload += frameDt;
      if (this.baked || this.sinceUpload >= UPLOAD_SECONDS) {
        this.sinceUpload = 0;
        this.texture.needsUpdate = true;
      }
    }
    this.sinceMarks += frameDt;
    if (this.sinceMarks >= MARKS_SECONDS) {
      this.sinceMarks = 0;
      this.drawMarks();
    }
  }

  /** Draws the map into the game's canvas, under the panel. Called by the level after its scene. */
  render(renderer: THREE.WebGLRenderer): void {
    if (!this.drawing) return;
    if (this.rectDirty) this.measure(renderer.domElement);
    const { x, y, w, h } = this.rect;
    if (w <= 0 || h <= 0) return;
    const u = this.material.uniforms;
    u.uSize!.value.set(w, h);
    u.uNight!.value = planetMapParams.night;
    renderer.getViewport(this.viewport);
    const canvasHeight = renderer.domElement.clientHeight;
    renderer.setViewport(x, canvasHeight - y - h, w, h);
    renderer.render(this.quad, this.camera);
    renderer.setViewport(this.viewport);
  }

  dispose(): void {
    this.deactivate();
    this.quad.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }

  private measure(canvas: HTMLElement): void {
    this.rectDirty = false;
    const r = this.marksCanvas.getBoundingClientRect();
    const c = canvas.getBoundingClientRect();
    this.rect.x = r.left - c.left;
    this.rect.y = r.top - c.top;
    this.rect.w = r.width;
    // From the texture's aspect: the canvas's own height follows it once resized below.
    this.rect.h = (r.width * this.height) / this.width;
    // The markers are drawn at the size they're shown.
    const width = Math.round(r.width * Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    if (width > 0 && width !== this.marksCanvas.width) {
      this.marksCanvas.width = width;
      this.marksCanvas.height = Math.round((width * this.height) / this.width);
      this.sinceMarks = Infinity;
    }
  }

  /** Canvas pixel (column, row) ← projection point. */
  private toCanvas(x: number, y: number, out: { x: number; y: number }): void {
    out.x = this.width / 2 + x * this.scale;
    out.y = this.height / 2 - y * this.scale;
  }

  /** A body-frame direction's canvas pixel. */
  private project(d: THREE.Vector3, out: { x: number; y: number }, lonOffset = 0): void {
    toLonLat(d.x, d.y, d.z, this.lonLat);
    equalEarth(this.lonLat.lon + lonOffset, this.lonLat.lat, out);
    this.toCanvas(out.x, out.y, out);
  }

  /**
   * Bakes rows of the map texture until the frame's budget runs out: sRGB
   * colour, alpha 0 where a lava sea is (the shader draws it) and 1 elsewhere.
   * Row 0 of the texture is the bottom of the map.
   */
  private bake(): void {
    const { width, height, data, heights, color, lonLat, dir3 } = this;
    const { seed, shape } = this.config;
    const start = performance.now();
    // Relief shading: a slope's brightness from its height change per pixel against the angle a pixel spans.
    const shadeGain = planetMapParams.hillshade * this.relief * this.scale;
    // The angle a pixel spans: craters smaller than that are left out (they'd only speckle it).
    const spacing = 1 / this.scale;
    while (this.bakedRows < height && performance.now() - start < BAKE_BUDGET_MS) {
      const j = this.bakedRows++;
      const y = (height / 2 - j - 0.5) / this.scale;
      const row = (height - 1 - j) * width;
      for (let i = 0; i < width; i++) {
        const p = j * width + i;
        const o = (row + i) * 4;
        const x = (i + 0.5 - width / 2) / this.scale;
        heights[p] = -1;
        if (!equalEarthInverse(x, y, lonLat)) continue;
        fromLonLat(lonLat.lon, lonLat.lat, dir3);
        const [dx, dy, dz] = dir3 as [number, number, number];
        let alpha = 255;
        if (this.gas) {
          this.gas(dx, dy, dz, color);
        } else if (shape) {
          // A small body: the ground's radius in relief units (its shape plus the detail, read at the surface
          // point as the globe does), never negative, so the whole of it is shaded as land.
          const r = shapeRadius(shape, dx, dy, dz);
          const h = (heights[p] = this.terrain!(this.noise(dx * r, dy * r, dz * r, seed, spacing), color, dx, dy, dz) + (r - SHAPE_FLOOR) / this.relief);
          if (i > 0 && j > 0 && heights[p - 1]! >= 0 && heights[p - width]! >= 0) {
            const slope = heights[p - 1]! + heights[p - width]! - 2 * h;
            color.multiplyScalar(THREE.MathUtils.clamp(1 - slope * shadeGain, 0.55, 1.45));
          }
        } else {
          const n = this.noise(dx, dy, dz, seed, spacing);
          const h = (heights[p] = this.terrain!(n, color, dx, dy, dz));
          if (this.lava && n < this.config.style.seaLevel) alpha = 0;
          // Lit from the upper left: darker where the ground falls away towards the lower right.
          if (h > 0 && i > 0 && j > 0 && heights[p - 1]! >= 0 && heights[p - width]! >= 0) {
            const slope = heights[p - 1]! + heights[p - width]! - 2 * h;
            color.multiplyScalar(THREE.MathUtils.clamp(1 - slope * shadeGain, 0.55, 1.45));
          }
        }
        color.getRGB(this.srgb, THREE.SRGBColorSpace);
        data[o] = Math.round(THREE.MathUtils.clamp(this.srgb.r, 0, 1) * 255);
        data[o + 1] = Math.round(THREE.MathUtils.clamp(this.srgb.g, 0, 1) * 255);
        data[o + 2] = Math.round(THREE.MathUtils.clamp(this.srgb.b, 0, 1) * 255);
        data[o + 3] = alpha;
      }
    }
  }

  /** Outline, graticule, the sun, the autopilot's path and destination, and the ship. */
  private drawMarks(): void {
    const ctx = this.marksCanvas.getContext('2d')!;
    const { width, height, point } = this;
    if (this.rect.w <= 0) return;
    // Drawn in texture pixels, scaled to the canvas; `px` is one CSS pixel, so markers keep their size.
    const k = this.marksCanvas.width / width;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    const px = width / this.rect.w;
    ctx.clearRect(0, 0, width, height);
    ctx.lineJoin = ctx.lineCap = 'round';

    // Graticule every 30°, then the outline (the meridians at ±180° and the pole lines).
    ctx.beginPath();
    for (let lat = -Math.PI / 2 + GRID_STEP; lat < Math.PI / 2 - 1e-6; lat += GRID_STEP) {
      this.lonLatPath(ctx, -Math.PI, lat, Math.PI, lat);
    }
    for (let lon = -Math.PI + GRID_STEP; lon < Math.PI - 1e-6; lon += GRID_STEP) {
      this.lonLatPath(ctx, lon, -Math.PI / 2, lon, Math.PI / 2);
    }
    ctx.strokeStyle = 'rgba(207, 227, 255, 0.14)';
    ctx.lineWidth = px;
    ctx.stroke();
    ctx.beginPath();
    this.lonLatPath(ctx, -Math.PI, -Math.PI / 2, -Math.PI, Math.PI / 2);
    this.lonLatPath(ctx, Math.PI, -Math.PI / 2, Math.PI, Math.PI / 2);
    this.lonLatPath(ctx, -Math.PI, Math.PI / 2, Math.PI, Math.PI / 2);
    this.lonLatPath(ctx, -Math.PI, -Math.PI / 2, Math.PI, -Math.PI / 2);
    ctx.strokeStyle = 'rgba(102, 255, 204, 0.45)';
    ctx.stroke();

    // The point under the sun.
    this.project(this.globe.sun, point);
    ctx.beginPath();
    ctx.arc(point.x, point.y, 4 * px, 0, Math.PI * 2);
    ctx.fillStyle = '#ffe28a';
    ctx.shadowColor = '#ffcc55';
    ctx.shadowBlur = 8 * px;
    ctx.fill();
    ctx.shadowBlur = 0;

    const ship = this.ship;
    const u = ship.up;
    if (ship.enRoute) {
      // The great circle the autopilot flies, broken where it crosses the map's edge.
      this.target.copy(ship.destination).normalize();
      const angle = u.angleTo(this.target);
      const s = Math.sin(angle);
      ctx.beginPath();
      let lastX = 0;
      for (let k = 0; k <= PATH_SAMPLES; k++) {
        const t = k / PATH_SAMPLES;
        if (s < 1e-6) this.along.copy(this.target);
        else
          this.along
            .copy(u)
            .multiplyScalar(Math.sin((1 - t) * angle) / s)
            .addScaledVector(this.target, Math.sin(t * angle) / s);
        this.project(this.along, point);
        if (k === 0 || Math.abs(point.x - lastX) > width / 2) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
        lastX = point.x;
      }
      ctx.setLineDash([4 * px, 4 * px]);
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 1.5 * px;
      ctx.stroke();
      ctx.setLineDash([]);
      this.project(this.target, point);
      ctx.beginPath();
      ctx.arc(point.x, point.y, 5 * px, 0, Math.PI * 2);
      ctx.stroke();
    }

    // The ship: an arrow along its heading, with a pulsing halo.
    this.project(u, point);
    const sx = point.x;
    const sy = point.y;
    const lon = this.lonLat.lon;
    // A point a little ahead (the UFO's front is -Z), projected without wrapping round the map's edge.
    this.forward.set(0, 0, -1).applyQuaternion(ship.object.quaternion);
    this.ahead.copy(u).addScaledVector(this.forward, 0.02).normalize();
    toLonLat(this.ahead.x, this.ahead.y, this.ahead.z, this.lonLat);
    const wrap = Math.round((lon - this.lonLat.lon) / (2 * Math.PI)) * 2 * Math.PI;
    this.project(this.ahead, point, wrap);
    const heading = Math.atan2(point.y - sy, point.x - sx);
    const pulse = (performance.now() / 1000) % 1.4;
    ctx.beginPath();
    ctx.arc(sx, sy, (5 + 9 * pulse) * px, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.8 * (1 - pulse / 1.4)})`;
    ctx.lineWidth = 1.5 * px;
    ctx.stroke();
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(heading);
    ctx.beginPath();
    ctx.moveTo(9 * px, 0);
    ctx.lineTo(-5 * px, 5.5 * px);
    ctx.lineTo(-2.5 * px, 0);
    ctx.lineTo(-5 * px, -5.5 * px);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.lineWidth = 1.5 * px;
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  }

  /** Adds the path along a parallel or meridian from (lon1, lat1) to (lon2, lat2). */
  private lonLatPath(ctx: CanvasRenderingContext2D, lon1: number, lat1: number, lon2: number, lat2: number): void {
    const steps = 36;
    const p = this.point;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      equalEarth(lon1 + (lon2 - lon1) * t, lat1 + (lat2 - lat1) * t, p);
      this.toCanvas(p.x, p.y, p);
      if (k === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
  }

  private setShown(shown: boolean): void {
    if (shown === this.shown) return;
    this.shown = shown;
    this.root.hidden = !shown;
    this.rectDirty = true;
    this.sinceMarks = Infinity;
  }

  private setOpen(open: boolean): void {
    this.open = open;
    this.showOpen();
  }

  private showOpen(): void {
    this.mapButton.classList.toggle('active', this.open);
    this.mapButton.setAttribute('aria-expanded', String(this.open));
  }

  private setFolded(folded: boolean): void {
    this.folded = folded;
    saveFolded(folded);
    this.showFolded();
    this.rectDirty = true;
    this.sinceMarks = Infinity;
  }

  private showFolded(): void {
    this.root.classList.toggle('folded', this.folded);
    const label = this.input.touchMode ? 'Close map' : this.folded ? 'Show map (N)' : 'Hide map (N)';
    this.toggle.setAttribute('aria-expanded', String(!this.hidesBody));
    this.toggle.setAttribute('aria-label', label);
    this.toggle.title = label;
  }

  /** The title bar's button: folds the desktop panel, closes the touch overlay. */
  private onToggle = () => {
    if (this.input.touchMode) this.setOpen(false);
    else this.setFolded(!this.folded);
  };

  private onMapButton = () => {
    if (!this.input.blocked) this.setOpen(!this.open);
  };

  private onTab = (e: Event) => {
    const tab = (e.currentTarget as HTMLElement).dataset.tab;
    if (tab === 'map' || tab === 'species') this.setTab(tab);
  };

  private onResize = () => {
    this.rectDirty = true;
  };

  /** Click or tap the map: fly to that point. */
  private onClick = (e: MouseEvent) => {
    if (this.input.blocked) return;
    const rect = this.marksCanvas.getBoundingClientRect();
    // One scale for both axes, as the map is drawn (the canvas's own height is rounded).
    const x = ((e.clientX - rect.left) / rect.width) * this.width;
    const y = ((e.clientY - rect.top) / rect.width) * this.width;
    if (!equalEarthInverse((x - this.width / 2) / this.scale, (this.height / 2 - y) / this.scale, this.lonLat)) return;
    fromLonLat(this.lonLat.lon, this.lonLat.lat, this.dir3);
    this.ship.moveTo(this.click.fromArray(this.dir3));
  };
}

function loadFolded(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'folded';
  } catch {
    return false;
  }
}

function saveFolded(folded: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, folded ? 'folded' : 'open');
  } catch {
    // Storage blocked (private mode etc.): the choice just won't persist.
  }
}

import * as THREE from 'three';
import type { Entity } from '../core/Entity';
import type { Input } from '../core/Input';
import { isBlackHole } from '../gen/blackHoles';
import { DEBRIS_REACH, debrisPalette, debrisPosition, generateDebris } from '../gen/debris';
import { surfaceNoise } from '../gen/craters';
import type { SystemData } from '../gen/system';
import type { Picker } from '../player/Picker';
import type { Ship } from '../player/Ship';
import type { CelestialBody } from '../world/CelestialBody';
import { isGas, type Planet } from '../world/Planet';
import type { Star } from '../world/Star';
import { gasPainter, terrainPainter } from '../world/planetGeometry';
import type { AsteroidBelt } from '../world/AsteroidBelt';
import {
  distanceToMapX,
  layoutSystemMap,
  mapBeltGroups,
  mapBeltInputs,
  mapLayoutParams,
  type MapBeltGroup,
  type MapDisc,
  type SystemMapLayout,
  staggerLabels,
} from './systemMapLayout';

/** The map's height at most, CSS px, for mouse players (the touch overlay gets what fits on screen). */
const MAX_HEIGHT = 230;
/** Room the touch overlay leaves above and below it, CSS px (the stylesheet's 150 px, plus the title bar). */
const TOUCH_MARGIN = 190;
/** Milliseconds of disc painting per frame, so building the map never stalls the game. */
const BAKE_BUDGET_MS = 3;
const DRAW_SECONDS = 1 / 30;
/** The canvas's resolution, device pixels per CSS pixel at most (like the game's canvas). */
const MAX_PIXEL_RATIO = 2;
/** A disc can be hovered or clicked this far outside its edge, CSS px, and small ones within this radius. */
const PICK_SLOP = 3;
const MIN_PICK_RADIUS = 8;
/** Sunlight on the discs: from the left, where the star is, and a little from above and the front. */
const LIGHT = new THREE.Vector3(-0.8, 0.3, 0.55).normalize();
/** Brightness of the discs' unlit side. */
const NIGHT = 0.3;
const TOGGLE_KEY = 'KeyN';
/** A busted body is drawn as this many of its pieces, where they settle (seconds after the blast). */
const RUBBLE_DOTS = 60;
const SETTLED = 600;
const STORAGE_KEY = 'spore2.systemMap';
const ACCENT = '#66ffcc';
const LABEL = 'rgba(207, 227, 255, 0.6)';

/** A planet or moon's disc, painted once from its own surface colours. */
interface BodyDisc {
  body: Planet;
  /** The planet's roman numeral (planets only). */
  label: string | null;
  disc: MapDisc;
  /** Outer ring radius, px (0 without rings). */
  ring: number;
  /** The painted sphere, or null until painted at the current size. */
  sprite: HTMLCanvasElement | null;
  /** Painting in progress: the pixels and the rows done. */
  image: ImageData | null;
  rows: number;
  /** A flat colour to show until the sprite is painted. */
  fill: string;
  /** CSS colours: the rings, and the atmosphere's halo from its inner to its outer edge (null without). */
  ringStyle: string;
  halo: readonly [string, string] | null;
}

/** A star's CSS colours: its glow's inner and outer edge, and its disc from the rim inwards. */
interface StarColors {
  glow: readonly [string, string];
  rim: string;
  inner: string;
  /** A black hole: a black shadow with its disc's glow round it and across it. */
  hole: boolean;
}

/**
 * The system level's map, like the planet level's: a panel in the corner for
 * mouse players, an overlay from the Map button (#touch-map) on touch. The
 * star is cut off by the left edge, the planets follow in a row in order of
 * distance, each with its moons stacked above it (see systemMapLayout.ts),
 * and the title bar counts them. Each disc is painted from the body's own
 * surface colours (the globe's painters), lit from the star's side.
 *
 * On top: where the ship is (parked beside a body, or between the orbits at
 * its distance from the star), the autopilot's destination, and the body
 * hovered here or in the view. Hover a disc for its tooltip (the HUD shows
 * it), click or tap it to fly there; N (or the title bar's button) folds the
 * desktop panel away, remembered in localStorage. All on one 2D canvas
 * (#system-map-canvas), redrawn a few dozen times a second.
 */
export class SystemMap implements Entity {
  /** The body under the mouse on the map, if any (the HUD shows its tooltip). */
  hovered: CelestialBody | null = null;
  /** The mouse is over the map (the HUD then ignores what's behind the panel). */
  pointerOver = false;
  /** Where the mouse last was over the map, client px (for the tooltip). */
  readonly pointer = { clientX: 0, clientY: 0 };

  private readonly root = document.getElementById('system-map')!;
  private readonly title = document.getElementById('system-map-title')!;
  private readonly toggle = document.getElementById('system-map-toggle') as HTMLButtonElement;
  private readonly canvas = document.getElementById('system-map-canvas') as HTMLCanvasElement;
  private readonly mapButton = document.getElementById('touch-map') as HTMLButtonElement;
  private readonly discs: BodyDisc[] = [];
  /** Planet discs, in orbit order, each followed in `discs` by its moons. */
  private readonly planetDiscs: BodyDisc[] = [];
  /** Belt columns (a giant's Trojan swarms share one); their asteroids' discs come after the planets' in `discs`. */
  private readonly beltGroups: MapBeltGroup[];
  private readonly beltColors: string[];
  private readonly orbits: number[];
  private readonly starColors: StarColors[];
  private readonly titleText: string;
  private layout: SystemMapLayout | null = null;
  /** Which row each planet's name is on (see staggerLabels). */
  private labelRows: number[] = [];
  private pixelRatio = 1;
  private layoutDirty = true;
  private active = false;
  private shown = false;
  private folded: boolean;
  /** Touch mode: whether the overlay is open (it starts closed). */
  private open = false;
  private touchLayout: boolean | null = null;
  private keyWasDown = false;
  private sinceDraw = DRAW_SECONDS;
  /** Busted bodies' dots (see drawRubble), in disc radii. */
  private readonly rubble = new Map<Planet, { x: number; y: number; size: number; color: string }[]>();
  private bakeIndex = 0;
  private readonly color = new THREE.Color();
  private readonly srgb = { r: 0, g: 0, b: 0 };

  constructor(
    private readonly data: SystemData,
    private readonly stars: readonly Star[],
    planets: readonly Planet[],
    moons: readonly Planet[],
    private readonly ship: Ship,
    private readonly picker: Picker,
    private readonly input: Input,
    /** Asteroid belts and Trojan swarms, with their named asteroids. */
    private readonly belts: readonly AsteroidBelt[] = [],
  ) {
    const empty = { x: 0, y: 0, r: 0 };
    for (const planet of planets) {
      const disc = this.createDisc(planet, planet.name.split(' ').pop() ?? '', empty);
      this.discs.push(disc);
      this.planetDiscs.push(disc);
      for (const moon of moons) if (moon.parent === planet) this.discs.push(this.createDisc(moon, null, empty));
    }
    this.beltGroups = mapBeltGroups(
      data.planets.map((p) => p.orbit.radius),
      belts.map((b) => b.data),
    );
    for (const group of this.beltGroups) {
      for (const m of group.members) for (const a of belts[m]!.asteroids) this.discs.push(this.createDisc(a, null, empty));
    }
    this.beltColors = this.beltGroups.map((g) => {
      const belt = belts[g.members[0]!]!.data;
      return belt.icy ? 'rgba(200, 220, 255, 0.55)' : belt.trojan ? 'rgba(220, 170, 140, 0.55)' : 'rgba(225, 205, 175, 0.55)';
    });
    this.orbits = data.planets.map((p) => p.orbit.radius);
    this.starColors = data.stars.map((s) => ({
      glow: [withAlpha(s.color, 0.55), withAlpha(s.color, 0)],
      rim: s.color,
      inner: mixWhite(s.color, 0.55),
      hole: isBlackHole(s),
    }));
    this.folded = loadFolded();
    const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
    this.titleText = [
      data.name,
      count(planets.length, 'planet', 'planets'),
      ...(moons.length > 0 ? [count(moons.length, 'moon', 'moons')] : []),
      ...(belts.length > 0 ? [count(this.beltGroups.length, 'belt', 'belts')] : []),
    ].join(' · ');
  }

  /** True while the map is on screen. */
  get visible(): boolean {
    return this.shown && !this.hidesBody;
  }

  /** True once every disc is painted (for tests). */
  get baked(): boolean {
    return this.discs.every((d) => d.sprite !== null);
  }

  /** The map's layout in CSS px, once shown (for tests and automation). */
  get currentLayout(): SystemMapLayout | null {
    return this.layout;
  }

  /** Where `body` is drawn, in CSS px from the canvas's top left, or null if it isn't on the map (for tests). */
  mapPosition(body: CelestialBody): { x: number; y: number } | null {
    const star = this.stars.indexOf(body as Star);
    if (star >= 0 && this.layout) {
      const s = this.layout.stars[star]!;
      return { x: this.layout.sunEdge / 2, y: s.y };
    }
    const disc = this.discs.find((d) => d.body === body);
    return disc && this.layout ? { x: disc.disc.x, y: disc.disc.y } : null;
  }

  private get hidesBody(): boolean {
    return this.folded && !this.input.touchMode;
  }

  activate(): void {
    this.active = true;
    this.title.textContent = this.titleText;
    this.open = false;
    this.touchLayout = null;
    this.showFolded();
    this.showOpen();
    this.toggle.addEventListener('click', this.onToggle);
    this.mapButton.addEventListener('click', this.onMapButton);
    this.canvas.addEventListener('click', this.onClick);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerleave', this.onPointerLeave);
    window.addEventListener('resize', this.onResize);
    this.layoutDirty = true;
    this.sinceDraw = Infinity;
  }

  deactivate(): void {
    if (!this.active) return;
    this.active = false;
    this.setShown(false);
    this.onPointerLeave();
    this.toggle.removeEventListener('click', this.onToggle);
    this.mapButton.removeEventListener('click', this.onMapButton);
    this.canvas.removeEventListener('click', this.onClick);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    window.removeEventListener('resize', this.onResize);
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
      this.layoutDirty = true;
      this.showFolded();
    }
    // Touch players open it from the Map button; never while zooming in or out (input is blocked then).
    this.setShown((!touch || this.open) && !this.input.blocked);
    if (!this.visible) return;

    if (this.layoutDirty) this.measure();
    this.bake();
    this.sinceDraw += frameDt;
    if (this.sinceDraw >= DRAW_SECONDS) {
      this.sinceDraw = 0;
      this.draw();
    }
  }

  dispose(): void {
    this.deactivate();
  }

  private createDisc(body: Planet, label: string | null, disc: MapDisc): BodyDisc {
    const { config } = body;
    const fill = isGas(config) ? config.bands[Math.floor(config.bands.length / 2)]! : (config.style.sea ?? config.style.low);
    const { rings, atmosphere } = config;
    return {
      body,
      label,
      disc: { ...disc },
      ring: 0,
      sprite: null,
      image: null,
      rows: 0,
      fill,
      ringStyle: rings ? withAlpha(rings.color, rings.opacity) : '',
      halo: atmosphere && config.climate ? [withAlpha(atmosphere, 0.55), withAlpha(atmosphere, 0)] : null,
    };
  }

  private labelFont(): string {
    return `600 ${this.input.touchMode ? 12 : 10}px system-ui, sans-serif`;
  }

  /** Lays the map out for the panel's current width, and sizes the canvas to match. */
  private measure(): void {
    const width = this.canvas.clientWidth;
    if (width <= 0) return;
    this.layoutDirty = false;
    const maxHeight = this.input.touchMode ? Math.max(120, window.innerHeight - TOUCH_MARGIN) : MAX_HEIGHT;
    const lay = (labelRows: number): SystemMapLayout =>
      layoutSystemMap(
        this.data.planets.map((p) => ({
          radius: p.radius,
          ringOuter: p.rings?.outer ?? null,
          moons: p.moons.map((m) => ({ radius: m.radius })),
        })),
        {
          width,
          maxHeight,
          stars: this.data.stars.map((s) => s.radius),
          belts: mapBeltInputs(
            this.beltGroups,
            this.belts.map((b) => b.data),
          ),
          labelRows,
        },
      );
    let layout = lay(1);
    // Names that would run into their neighbours' (small planets close together) go on a second row.
    const ctx = this.canvas.getContext('2d')!;
    ctx.font = this.labelFont();
    this.labelRows = staggerLabels(
      layout.planets.map((d) => d.x),
      this.planetDiscs.map((d) => ctx.measureText(d.label ?? '').width),
    );
    if (this.labelRows.some((row) => row > 0)) layout = lay(2);
    this.layout = layout;
    let k = 0;
    const columns = [
      ...layout.planets.map((planet) => [planet, ...planet.moons] as MapDisc[]),
      ...layout.belts.map((belt) => belt.asteroids),
    ];
    for (const column of columns) {
      for (const disc of column) {
        const d = this.discs[k++]!;
        const r = d.disc.r;
        d.disc.x = disc.x;
        d.disc.y = disc.y;
        d.disc.r = disc.r;
        d.ring = 'ring' in disc ? (disc as { ring: number }).ring : 0;
        // Repainted at the new size (the old sprite stands in meanwhile).
        if (Math.abs(r - disc.r) > 0.25) {
          d.image = null;
          d.rows = 0;
          this.bakeIndex = 0;
        }
      }
    }
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    this.canvas.width = Math.round(width * this.pixelRatio);
    this.canvas.height = Math.round(layout.height * this.pixelRatio);
    this.canvas.style.height = `${layout.height}px`;
    this.sinceDraw = Infinity;
  }

  /**
   * Paints discs, a few rows at a time within the frame's budget: each pixel
   * is a point on the sphere seen from the front (tilted like the body), its
   * colour from the globe's painters, lit from the star's side.
   */
  private bake(): void {
    if (!this.layout) return;
    const start = performance.now();
    while (this.bakeIndex < this.discs.length && performance.now() - start < BAKE_BUDGET_MS) {
      const d = this.discs[this.bakeIndex]!;
      if (d.sprite && !d.image && d.rows > 0) {
        this.bakeIndex++;
        continue;
      }
      const size = Math.max(2, Math.ceil(2 * d.disc.r * this.pixelRatio) + 2);
      if (!d.image) {
        d.image = new ImageData(size, size);
        d.rows = 0;
      }
      const { config } = d.body;
      const gas = isGas(config) ? gasPainter(config.seed, config.bands, config.size === 'iceGiant') : null;
      const terrain = gas ? null : terrainPainter(config.style, false, config.seed);
      const noise = surfaceNoise(config, false);
      const tilt = config.tilt ?? 0;
      const cos = Math.cos(tilt);
      const sin = Math.sin(tilt);
      const img = d.image;
      const half = size / 2;
      const radius = half - 1;
      while (d.rows < size && performance.now() - start < BAKE_BUDGET_MS) {
        const j = d.rows++;
        for (let i = 0; i < size; i++) {
          const nx = (i + 0.5 - half) / radius;
          const ny = (half - j - 0.5) / radius;
          const rr = nx * nx + ny * ny;
          const edge = THREE.MathUtils.clamp((1 - Math.sqrt(rr)) * radius + 0.5, 0, 1);
          if (edge <= 0) continue;
          const nz = Math.sqrt(Math.max(0, 1 - rr));
          // Into the body's frame: undo the axial tilt (the rings and bands lean with it).
          const bx = nx * cos + ny * sin;
          const by = -nx * sin + ny * cos;
          if (gas) gas(bx, by, nz, this.color);
          else terrain!(noise(bx, by, nz, config.seed), this.color, bx, by, nz);
          const lit = Math.max(0, nx * LIGHT.x + ny * LIGHT.y + nz * LIGHT.z);
          this.color.multiplyScalar(NIGHT + (1 - NIGHT) * lit);
          this.color.getRGB(this.srgb, THREE.SRGBColorSpace);
          const o = (j * size + i) * 4;
          img.data[o] = Math.round(THREE.MathUtils.clamp(this.srgb.r, 0, 1) * 255);
          img.data[o + 1] = Math.round(THREE.MathUtils.clamp(this.srgb.g, 0, 1) * 255);
          img.data[o + 2] = Math.round(THREE.MathUtils.clamp(this.srgb.b, 0, 1) * 255);
          img.data[o + 3] = Math.round(edge * 255);
        }
      }
      if (d.rows < size) return;
      const sprite = document.createElement('canvas');
      sprite.width = sprite.height = size;
      sprite.getContext('2d')!.putImageData(img, 0, 0);
      d.sprite = sprite;
      d.image = null;
      this.sinceDraw = Infinity;
      this.bakeIndex++;
    }
  }

  /** The star(s), the planets and moons, then the marks: hover, destination and the ship. */
  private draw(): void {
    const layout = this.layout;
    if (!layout) return;
    const ctx = this.canvas.getContext('2d')!;
    ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    ctx.clearRect(0, 0, layout.width, layout.height);

    // The orbits' line, from the star to the last planet.
    const last = layout.planets[layout.planets.length - 1];
    if (last) {
      ctx.beginPath();
      ctx.moveTo(layout.sunEdge, layout.axisY);
      ctx.lineTo(last.x, layout.axisY);
      ctx.strokeStyle = 'rgba(207, 227, 255, 0.12)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    this.starColors.forEach((colors, i) => this.drawStar(ctx, layout.stars[i]!, colors));
    layout.belts.forEach((belt, i) => this.drawBelt(ctx, belt.x, layout.axisY, belt.halfWidth, belt.halfHeight, i));
    for (const d of this.discs) this.drawBody(ctx, d);

    ctx.font = this.labelFont();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = LABEL;
    this.planetDiscs.forEach((d, i) => ctx.fillText(d.label ?? '', d.disc.x, layout.labelY + (this.labelRows[i] ?? 0) * mapLayoutParams.labelRowHeight));
    if (this.discs.length === 0) {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('No planets', layout.sunEdge + 16, layout.axisY);
    }

    // The body hovered here or in the view.
    const hovered = this.hovered ?? this.picker.hovered;
    const hoveredAt = hovered ? this.markAt(hovered as CelestialBody) : null;
    if (hoveredAt) {
      ctx.beginPath();
      ctx.arc(hoveredAt.x, hoveredAt.y, hoveredAt.r + 3, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    const ship = this.ship;
    const target = ship.targetBody;
    const parked = !ship.enRoute ? this.markAt(target) : null;
    if (ship.enRoute) {
      // The destination: a dashed ring round the body.
      const at = this.markAt(target);
      if (at) {
        ctx.beginPath();
        ctx.arc(at.x, at.y, at.r + 4, 0, Math.PI * 2);
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = ACCENT;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // The ship: beside the body it's parked at, else between the orbits at its distance from the star.
    const x = parked
      ? parked.x + parked.r * 0.7 + 4
      : this.data.stars.length === 0
        ? // Round a rogue planet everything is in its one column.
          (layout.planets[0]?.x ?? layout.sunEdge)
        : distanceToMapX(layout, this.data.starZone, this.orbits, ship.object.position.length());
    const y = parked ? parked.y - parked.r * 0.7 - 4 : layout.axisY;
    const pulse = (performance.now() / 1000) % 1.4;
    ctx.beginPath();
    ctx.arc(x, y, 4 + 8 * pulse, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.8 * (1 - pulse / 1.4)})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    drawShip(ctx, x, y);
  }

  /** A belt's strip: a scatter of specks across the axis, seeded per column so it doesn't flicker. */
  private drawBelt(ctx: CanvasRenderingContext2D, x: number, y: number, halfWidth: number, halfHeight: number, index: number): void {
    ctx.fillStyle = this.beltColors[index]!;
    const specks = Math.round(10 + halfWidth * halfHeight * 0.6);
    for (let i = 0; i < specks; i++) {
      // A cheap hash of (column, speck): the same specks every frame.
      const u = fract(Math.sin((index + 1) * 12.9898 + i * 78.233) * 43758.5453);
      const v = fract(Math.sin((index + 1) * 39.3468 + i * 11.135) * 24634.6345);
      const w = fract(Math.sin((index + 1) * 73.156 + i * 52.235) * 12345.6789);
      ctx.beginPath();
      ctx.arc(x + (u * 2 - 1) * halfWidth, y + (v * 2 - 1) * halfHeight, 0.5 + w, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawStar(ctx: CanvasRenderingContext2D, s: MapDisc, colors: StarColors): void {
    if (colors.hole) {
      this.drawBlackHole(ctx, s, colors);
      return;
    }
    // A glow round the rim, then the disc, white-hot inside.
    const glow = ctx.createRadialGradient(s.x, s.y, s.r * 0.95, s.x, s.y, s.r + 22);
    glow.addColorStop(0, colors.glow[0]);
    glow.addColorStop(1, colors.glow[1]);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r + 22, 0, Math.PI * 2);
    ctx.fill();
    const disc = ctx.createRadialGradient(s.x, s.y, s.r * 0.6, s.x, s.y, s.r);
    disc.addColorStop(0, '#ffffff');
    disc.addColorStop(0.75, colors.inner);
    disc.addColorStop(1, colors.rim);
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }

  /** A black hole: its disc's glow, the shadow with a thin bright photon ring, the disc's near side across it. */
  private drawBlackHole(ctx: CanvasRenderingContext2D, s: MapDisc, colors: StarColors): void {
    const glow = ctx.createRadialGradient(s.x, s.y, s.r * 0.5, s.x, s.y, s.r + 22);
    glow.addColorStop(0, colors.glow[0]);
    glow.addColorStop(1, colors.glow[1]);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r + 22, 0, Math.PI * 2);
    ctx.fill();
    const shadow = s.r * 0.55;
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(s.x, s.y, shadow, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = colors.inner;
    ctx.lineWidth = Math.max(1.5, s.r * 0.06);
    ctx.stroke();
    // The disc seen almost edge on, in front of the shadow.
    ctx.fillStyle = colors.inner;
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, s.r * 1.05, Math.max(1.5, s.r * 0.09), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawBody(ctx: CanvasRenderingContext2D, d: BodyDisc): void {
    const { x, y, r } = d.disc;
    const { config } = d.body;
    if (d.body.busted) {
      this.drawRubble(ctx, d);
      return;
    }
    const rings = config.rings;
    const tilt = config.tilt ?? 0;
    const inner = rings ? (d.ring * rings.inner) / rings.outer : 0;
    // The far half of the rings, behind the body.
    if (rings && d.ring > 0) ringHalf(ctx, x, y, d.ring, inner, tilt, false, d.ringStyle);

    if (d.halo) {
      const halo = ctx.createRadialGradient(x, y, r * 0.9, x, y, r * 1.35 + 1);
      halo.addColorStop(0, d.halo[0]);
      halo.addColorStop(1, d.halo[1]);
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(x, y, r * 1.35 + 1, 0, Math.PI * 2);
      ctx.fill();
    }
    if (d.sprite) {
      // The sprite has a pixel of margin round the disc.
      const m = 1 / this.pixelRatio;
      ctx.drawImage(d.sprite, x - r - m, y - r - m, 2 * (r + m), 2 * (r + m));
    } else {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = d.fill;
      ctx.fill();
    }
    // The near half, in front.
    if (rings && d.ring > 0) ringHalf(ctx, x, y, d.ring, inner, tilt, true, d.ringStyle);
  }

  /** A busted body: its biggest pieces as dots, seen from above the old pole, inside its disc. */
  private drawRubble(ctx: CanvasRenderingContext2D, d: BodyDisc): void {
    const { x, y, r } = d.disc;
    const { config } = d.body;
    let rubble = this.rubble.get(d.body);
    if (!rubble) {
      const palette = debrisPalette(config.style, config.bands).map((c) => `#${new THREE.Color(c).multiplyScalar(1.3).getHexString()}`);
      const at = { x: 0, y: 0, z: 0 };
      rubble = generateDebris(config.seed, RUBBLE_DOTS, 0).chunks.map((c) => {
        debrisPosition(c, SETTLED, at);
        return { x: at.x / DEBRIS_REACH, y: at.y / DEBRIS_REACH, size: c.size / DEBRIS_REACH, color: palette[c.shade]! };
      });
      this.rubble.set(d.body, rubble);
    }
    for (const dot of rubble) {
      ctx.fillStyle = dot.color;
      ctx.beginPath();
      ctx.arc(x + dot.x * r, y - dot.y * r, Math.max(0.7, dot.size * r * 1.6), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Where a body is drawn, with the radius its marks go round (stars: at the edge). */
  private markAt(body: CelestialBody): MapDisc | null {
    const layout = this.layout!;
    const star = this.stars.indexOf(body as Star);
    if (star >= 0) {
      const s = layout.stars[star]!;
      return { x: layout.sunEdge * 0.6, y: s.y, r: 6 };
    }
    return this.discs.find((d) => d.body === body)?.disc ?? null;
  }

  /** The body at a point of the canvas (CSS px): the nearest disc it's on, else the star it's on. */
  private bodyAt(x: number, y: number): CelestialBody | null {
    const layout = this.layout;
    if (!layout) return null;
    let best: CelestialBody | null = null;
    let bestDistance = Infinity;
    for (const d of this.discs) {
      const distance = Math.hypot(x - d.disc.x, y - d.disc.y);
      if (distance <= Math.max(d.disc.r + PICK_SLOP, MIN_PICK_RADIUS) && distance < bestDistance) {
        best = d.body;
        bestDistance = distance;
      }
    }
    if (best) return best;
    if (x > layout.sunEdge + PICK_SLOP) return null;
    // The star whose disc is nearest (binaries: one above the other).
    let starDistance = Infinity;
    layout.stars.forEach((s, i) => {
      const distance = Math.hypot(x - s.x, y - s.y) - s.r;
      if (distance < starDistance) {
        starDistance = distance;
        best = this.stars[i] ?? null;
      }
    });
    return best;
  }

  private setShown(shown: boolean): void {
    if (shown === this.shown) return;
    this.shown = shown;
    this.root.hidden = !shown;
    this.layoutDirty = true;
    this.sinceDraw = Infinity;
    if (!shown) this.onPointerLeave();
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
    this.layoutDirty = true;
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

  private onResize = () => {
    this.layoutDirty = true;
  };

  private onPointerMove = (e: PointerEvent) => {
    // Touch players identify bodies by holding a finger on the view; a tap here flies.
    if (e.pointerType !== 'mouse') return;
    const rect = this.canvas.getBoundingClientRect();
    this.pointerOver = true;
    this.pointer.clientX = e.clientX;
    this.pointer.clientY = e.clientY;
    this.hovered = this.input.blocked ? null : this.bodyAt(e.clientX - rect.left, e.clientY - rect.top);
    this.canvas.style.cursor = this.hovered ? 'pointer' : '';
  };

  private onPointerLeave = () => {
    this.pointerOver = false;
    this.hovered = null;
    this.canvas.style.cursor = '';
  };

  /** Click or tap a body: fly there. */
  private onClick = (e: MouseEvent) => {
    if (this.input.blocked) return;
    const rect = this.canvas.getBoundingClientRect();
    const body = this.bodyAt(e.clientX - rect.left, e.clientY - rect.top);
    if (body) this.picker.select(body);
  };
}

/**
 * One half of a ring system seen from a little above: the far half (above
 * the equator line, drawn before the body) or the near half (below it, after).
 */
function ringHalf(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  outer: number,
  inner: number,
  tilt: number,
  near: boolean,
  style: string,
): void {
  const flat = mapLayoutParams.ringTilt;
  ctx.save();
  ctx.translate(x, y);
  // Canvas angles run clockwise (y down), so the tilt is negated to lean like the globe.
  ctx.rotate(-tilt);
  ctx.beginPath();
  ctx.rect(-outer - 1, near ? 0 : -outer - 1, 2 * outer + 2, outer + 1);
  ctx.clip();
  ctx.beginPath();
  ctx.ellipse(0, 0, outer, outer * flat, 0, 0, Math.PI * 2);
  ctx.ellipse(0, 0, inner, inner * flat, 0, 0, Math.PI * 2);
  ctx.fillStyle = style;
  ctx.fill('evenodd');
  ctx.restore();
}

/** A little UFO: a saucer with a dome, outlined so it shows on anything. */
function drawShip(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.beginPath();
  ctx.ellipse(x, y - 1.5, 2.6, 2.6, 0, Math.PI, Math.PI * 2);
  ctx.ellipse(x, y + 0.5, 6, 2.2, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fill();
}

function fract(v: number): number {
  return v - Math.floor(v);
}

function withAlpha(hex: string, alpha: number): string {
  const c = new THREE.Color(hex);
  const s = { r: 0, g: 0, b: 0 };
  c.getRGB(s, THREE.SRGBColorSpace);
  return `rgba(${Math.round(s.r * 255)}, ${Math.round(s.g * 255)}, ${Math.round(s.b * 255)}, ${alpha})`;
}

function mixWhite(hex: string, t: number): string {
  const c = new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), t);
  return `#${c.getHexString()}`;
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

import type { TerraformMode } from '../gen/terraform';
import type GUI from 'lil-gui';
import { GASES, compositionOf, gasesOf, totalPressure, type Composition, type Gas } from '../gen/climate';
import { MOON_RADIUS, gasStyle, type MoonType, type PlanetType } from '../gen/planets';
import { cometActivity } from '../gen/comets';
import { iceShare } from '../gen/rings';
import { Rng, hashSeed } from '../gen/rng';
import { generateShape, normaliseShape, shapeExtents } from '../gen/shape';
import { cometParams } from '../world/Comet';
import {
  LAB_STARS,
  LAB_TYPES,
  climateTint,
  kindRadiusRange,
  labFromBody,
  labRings,
  labStyle,
  mixHex,
  withGeneratedClimate,
  withMoons,
  withUpgradedClimate,
  type LabKind,
  type LabPlanet,
} from './labPlanet';
import type { FpsCounter } from '../ui/FpsCounter';
import { setViewFrozen, viewFreeze } from '../world/viewFreeze';
import type { PlanetLab } from './PlanetLab';

const COMPOSITIONS: Record<string, Composition> = {
  none: 'none',
  'N₂–O₂ (Earth)': 'oxygenNitrogen',
  'N₂ (Titan)': 'nitrogen',
  'CO₂ (Venus, Mars)': 'carbonDioxide',
  'H₂ (rogue planets)': 'hydrogen',
};
const KIND_LABELS: Record<string, LabKind> = {
  dwarf: 'dwarf',
  small: 'small',
  'Earth-sized': 'earth',
  'super-Earth': 'superEarth',
  'ice giant': 'iceGiant',
  'gas giant': 'gasGiant',
  moon: 'moon',
  'comet (irregular)': 'comet',
  'asteroid (irregular)': 'asteroid',
};
/** Fallback sea colours when a sea is switched on for a type that has none. */
const SEA_COLOR: Record<PlanetType, string> = {
  lava: '#ff5a1f',
  barren: '#3a5a7a',
  desert: '#2e8a8f',
  terran: '#1f4f96',
  ocean: '#1f4f96',
  ice: '#9cc9e6',
  gas: '#1f4f96',
};
const DEG = 180 / Math.PI;

/**
 * The lab's control panel (lil-gui): the view and light at the top, then
 * every property of the planet in folders (body, surface or bands,
 * atmosphere, climate, rings, moons), then the game's own tunables. Slider
 * drags edit the planet in place and the lab rebuilds once they pause;
 * choices that replace the planet (type, size, regenerate) rebuild the
 * planet folders so they show what's there.
 */
export class LabPanel {
  private readonly planetRoot: GUI;
  /** Open/closed state of the planet folders across rebuilds. */
  private readonly closed = new Map<string, boolean>();
  private readonly loader = { seed: '1337', star: 0, planet: 0, moon: -1, comet: -1, belt: 0, asteroid: -1 };
  private recolours = 0;

  constructor(
    private readonly gui: GUI,
    private readonly lab: PlanetLab,
    /** The FPS counter, switched from the Lab folder (the same setting as the game menu's Show FPS). */
    private readonly fps: FpsCounter,
  ) {
    this.buildLab();
    this.buildLight();
    this.planetRoot = gui.addFolder('Planet');
    this.buildPlanet();
    lab.onReplaced = () => this.refresh();
  }

  /**
   * Rebuilds the planet folders after the current event (a controller's
   * change handler may be what replaced the planet, and it can't be destroyed
   * while it runs).
   */
  private refresh(): void {
    queueMicrotask(() => this.buildPlanet());
  }

  private get p(): LabPlanet {
    return this.lab.planet;
  }

  private buildLab(): void {
    const lab = this.lab;
    const f = this.gui.addFolder('Lab');
    const view = lab.view;
    f.add(view, 'view', { 'Low orbit (globe)': 'globe', 'System view': 'system' })
      .name('view')
      .onChange(() => lab.rebuild());
    f.add(view, 'camera', { 'Orbit the planet': 'orbit', 'Follow the UFO': 'fly' })
      .name('camera')
      .onChange(() => lab.rebuild());
    f.add(view, 'map').name('map (globe)').onChange(() => lab.rebuild());
    f.add(view, 'wireframe').onChange(() => lab.applyLive());
    // Holds what's drawn for the camera as it is now, and outlines its view (world/viewFreeze.ts).
    f.add(viewFreeze, 'enabled').name('freeze view').listen().onChange((on: boolean) => setViewFrozen(on));
    f.add(view, 'axes').name('axes (Y = spin axis)').onChange(() => lab.applyLive());
    f.add(view, 'starfield').onChange(() => lab.rebuild());
    f.add(this.fps, 'shown').name('FPS counter');
    const actions = {
      random: () => void lab.generate(),
      sameKind: () => void lab.generate(lab.nextSeed(), { type: this.p.type, kind: this.p.kind }),
      vent: () => lab.lookAtVent(),
      copyLink: () => void copy(lab.link),
      copyJson: () => void copy(JSON.stringify(lab.planet, null, 2)),
      pasteJson: () => {
        const text = prompt('Planet JSON (as copied with "Copy planet JSON")');
        if (!text) return;
        try {
          void lab.replace(withUpgradedClimate({ ...lab.planet, ...(JSON.parse(text) as Partial<LabPlanet>) }), null);
        } catch (err) {
          alert(`Not valid JSON: ${String(err)}`);
        }
      },
    };
    f.add(actions, 'random').name('🎲 Random planet');
    f.add(actions, 'sameKind').name('🎲 Another of this type & size');
    f.add(actions, 'vent').name('Look at next vent / geyser');
    f.add(actions, 'copyLink').name('Copy link to this planet');
    f.add(actions, 'copyJson').name('Copy planet JSON');
    f.add(actions, 'pasteJson').name('Paste planet JSON…');

    const g = f.addFolder('Load from the game').close();
    g.add(this.loader, 'seed').name('galaxy seed');
    g.add(this.loader, 'star', 0, 5000, 1).name('star id');
    g.add(this.loader, 'planet', 0, 8, 1).name('planet #');
    g.add(this.loader, 'moon', -1, 4, 1).name('moon # (-1: planet)');
    g.add(this.loader, 'comet', -1, 2, 1).name('comet # (-1: planet)');
    g.add(this.loader, 'belt', 0, 6, 1).name('belt #');
    g.add(this.loader, 'asteroid', -1, 5, 1).name('asteroid # (-1: planet)');
    g.add(
      {
        load: () => {
          const { seed, star, planet, moon, comet, belt, asteroid } = this.loader;
          const loading =
            asteroid >= 0
              ? lab.loadAsteroid(seed, star, belt, asteroid)
              : comet >= 0
                ? lab.loadComet(seed, star, comet)
                : lab.load(seed, star, planet, moon >= 0 ? moon : undefined);
          loading.catch((err: unknown) => alert(String(err)));
        },
      },
      'load',
    ).name('Load');
  }

  private buildLight(): void {
    const lab = this.lab;
    const view = lab.view;
    const f = this.gui.addFolder('Light & time');
    const live = () => lab.applyLive();
    f.add(view, 'star', [...LAB_STARS]).name('star (light only)').onChange(live);
    f.add(view, 'sunAzimuth', -180, 180, 1).name('sun azimuth °').onChange(live);
    f.add(view, 'sunElevation', -90, 90, 1).name('sun elevation °').onChange(live);
    f.add(view, 'dayCycle').name('day cycle (globe)').onChange(live);
    f.add(view, 'paused').onChange(live);
    f.add(view, 'speed', 0, 10, 0.1).onChange(live);
    const time = {
      get t() {
        return Math.round(lab.clock.time * 10) / 10;
      },
      set t(v: number) {
        lab.setTime(v);
      },
    };
    f.add(time, 't', 0, 600, 0.1).name('time (s)').listen();
  }

  /** (Re)builds the planet folders for the current planet. */
  private buildPlanet(): void {
    for (const folder of [...this.planetRoot.folders]) folder.destroy();
    for (const c of [...this.planetRoot.controllers]) c.destroy();
    const p = this.p;
    this.buildBody();
    if (p.type === 'gas') this.buildBands();
    else this.buildSurface();
    if (p.shape) {
      this.buildShape();
      this.buildActivity();
      return;
    }
    if (p.type !== 'gas') {
      this.buildAtmosphere();
      this.buildClimate();
      this.buildTerraform();
    }
    if (p.kind !== 'moon') {
      this.buildRings();
      this.buildMoons();
    }
  }

  private folder(name: string, closed = false): GUI {
    const f = this.planetRoot.addFolder(name);
    if (this.closed.get(name) ?? closed) f.close();
    f.onOpenClose((g) => {
      if (g === f) this.closed.set(name, g._closed);
    });
    return f;
  }

  private buildBody(): void {
    const lab = this.lab;
    const p = this.p;
    const changed = () => lab.changed();
    const f = this.folder('Body');
    f.add(p, 'name').onFinishChange(changed);
    f.add(p, 'type', [...LAB_TYPES]).onChange((t: PlanetType) => void lab.setType(t));
    f.add(p, 'kind', KIND_LABELS).name('size class').onChange((k: LabKind) => void lab.setKind(k));
    const [min, max] = kindRadiusRange(p.kind);
    f.add(p, 'radius', min, max, 0.01).name('radius (u, class range)').onChange(() => lab.radiusChanged());
    f.add(p, 'seed', 0, 999_999, 1).name('seed (terrain)').onFinishChange(changed);
    const body = {
      get tilt() {
        return Math.round(lab.planet.tilt * DEG * 10) / 10;
      },
      set tilt(v: number) {
        lab.planet.tilt = v / DEG;
      },
    };
    f.add(body, 'tilt', -90, 90, 0.5).name('axial tilt °').onChange(changed);
    f.add(p, 'spin', -1, 1, 0.01).name('spin (rad/s)').onChange(changed);
    f.add(lab.view, 'autoSetting').name('gravity etc. follow size');
    const actions = {
      nextSeed: () => {
        p.seed = lab.nextSeed();
        this.refresh();
        lab.changed();
      },
      recolour: () => {
        const { style, bands } = labStyle(hashSeed(p.seed, 'recolour', ++this.recolours), p.type, p.kind);
        void lab.replace({ ...lab.planet, style, bands });
      },
    };
    f.add(actions, 'nextSeed').name('New terrain (next seed)');
    f.add(actions, 'recolour').name('New colours');
  }

  private buildSurface(): void {
    const lab = this.lab;
    const style = this.p.style;
    const changed = () => lab.changed();
    const f = this.folder('Surface');
    let lastSea = style.sea ?? SEA_COLOR[this.p.type];
    const sea = {
      get on() {
        return style.sea !== null;
      },
      set on(v: boolean) {
        if (style.sea) lastSea = style.sea;
        style.sea = v ? lastSea : null;
      },
    };
    // Small bodies have no seas.
    if (!this.p.shape)
      f.add(sea, 'on').name('sea (water, lava or ice)').onChange(() => {
        this.refresh();
        changed();
      });
    if (style.sea !== null) {
      f.addColor(style, 'sea').name('sea colour').onChange(changed);
      f.add(style, 'seaLevel', -1, 1, 0.01).name('sea level (noise)').onChange(changed);
    }
    f.addColor(style, 'low').name('lowland colour').onChange(changed);
    f.addColor(style, 'high').name('highland colour').onChange(changed);
    f.add(style, 'relief', 0, 0.2, 0.001).name('relief (× radius)').onChange(changed);
    // Lowlands flattened into plains under the mountains (gen/planets.ts landElevation): 1 is green worlds'.
    const plains = {
      get amount() {
        return style.plains ?? 0;
      },
      set amount(v: number) {
        style.plains = v;
      },
    };
    if (this.p.type !== 'gas') f.add(plains, 'amount', 0, 1, 0.01).name('plains').onChange(changed);
    // Impact craters (gen/craters.ts): 1 is airless rock's.
    const craters = {
      get cover() {
        return style.craters ?? 0;
      },
      set cover(v: number) {
        style.craters = v;
      },
    };
    if (this.p.type !== 'gas') f.add(craters, 'cover', 0, 1, 0.01).name('craters').onChange(changed);
  }

  /** A small body's shape (gen/shape.ts): new lobes, or the lumps and craters of this one. */
  private buildShape(): void {
    const lab = this.lab;
    const shape = this.p.shape!;
    const f = this.folder('Shape');
    const renormalise = () => {
      normaliseShape(shape);
      lab.changed();
    };
    const form = this.shapeForm;
    form.lobes = form.binary === shape.binary ? shape.lobes.length : form.lobes;
    form.binary = shape.binary;
    const regenerate = () => {
      const rng = new Rng(hashSeed(lab.planet.seed, 'shape', ++form.rolls));
      void lab.replace({ ...lab.planet, shape: generateShape(rng, { lobes: form.lobes, binary: form.lobes > 1 && form.binary }) });
    };
    f.add(form, 'lobes', 1, 3, 1).name('lobes').onFinishChange(regenerate);
    f.add(form, 'binary').name('contact binary (2+ lobes)').onChange(regenerate);
    f.add({ regenerate }, 'regenerate').name('🎲 New shape');
    f.add(shape, 'blend', 0.02, 0.6, 0.01).name('neck fillet (smooth union)').onChange(renormalise);
    f.add(shape.lumps, 'amplitude', 0, 0.3, 0.005).name('lumps').onChange(renormalise);
    f.add(shape.lumps, 'frequency', 0.3, 3, 0.05).name('lump size (frequency)').onChange(renormalise);
    const craters = {
      get depth() {
        return shape.craters.reduce((d, c) => Math.max(d, c.depth), 0);
      },
      set depth(v: number) {
        const max = Math.max(1e-6, shape.craters.reduce((d, c) => Math.max(d, c.depth), 0));
        for (const c of shape.craters) c.depth = (c.depth / max) * v;
      },
    };
    f.add(craters, 'depth', 0, 0.2, 0.005).name(`craters (${shape.craters.length}): depth`).onChange(renormalise);
    const extents = shapeExtents(shape);
    f.add({ size: extents.map((e) => (e / extents[0]).toFixed(2)).join(' : ') }, 'size').name('proportions').disable();
  }

  /** How far a comet is from its star, which sets its jets, coma and tails. */
  private buildActivity(): void {
    const lab = this.lab;
    const f = this.folder('Activity');
    const info = {
      get activity() {
        return Math.round(cometActivity(lab.planet.zone, 1, cometParams.activeDistance) * 100) / 100;
      },
    };
    // Read live each frame by the level, so no rebuild.
    f.add(lab.planet, 'zone', 0.3, 5, 0.01).name('distance from star (hab. radii ≈ AU)');
    f.add(info, 'activity').name('activity (1/r², off past 3)').listen().disable();
  }

  /** The Shape folder's choices for a new shape. */
  private readonly shapeForm = { lobes: 1, binary: false, rolls: 0 };

  private buildBands(): void {
    const lab = this.lab;
    const p = this.p;
    const bands = p.bands!;
    const changed = () => {
      p.style = gasStyle(bands);
      lab.changed();
    };
    const f = this.folder('Gas bands');
    const count = {
      get n() {
        return bands.length;
      },
      set n(v: number) {
        while (bands.length > Math.max(2, v)) bands.pop();
        // New bands continue the ramp: a little lighter than the last.
        while (bands.length < v) bands.push(mixHex(bands[bands.length - 1]!, '#ffffff', 0.25));
      },
    };
    f.add(count, 'n', 2, 8, 1)
      .name('bands')
      .onFinishChange(() => {
        this.refresh();
        changed();
      });
    bands.forEach((_, i) => f.addColor(bands, i).name(`band ${i + 1}${i === 0 ? ' (dark)' : ''}`).onChange(changed));
  }

  private buildAtmosphere(): void {
    const lab = this.lab;
    const p = this.p;
    const f = this.folder('Atmosphere glow');
    let last = p.atmosphere ?? '#8fc8ff';
    const glow = {
      get on() {
        return lab.planet.atmosphere !== null;
      },
      set on(v: boolean) {
        if (lab.planet.atmosphere) last = lab.planet.atmosphere;
        lab.planet.atmosphere = v ? last : null;
      },
    };
    f.add(glow, 'on')
      .name('glow (needs air)')
      .onChange(() => {
        this.refresh();
        lab.changed();
      });
    if (p.atmosphere !== null) f.addColor(p, 'atmosphere').name('colour').onChange(() => lab.changed());
    f.add(
      {
        tint: () => {
          lab.planet.atmosphere = climateTint(lab.planet);
          this.refresh();
          lab.changed();
        },
      },
      'tint',
    ).name('Colour from climate (as the game)');
  }

  private buildClimate(): void {
    const lab = this.lab;
    const climate = this.p.climate!;
    const { state, setting } = climate;
    const changed = () => lab.changed();
    const f = this.folder('Climate');
    // The air as a composition and a total pressure; both rewrite the gases (gasesOf), which the Gases folder edits directly.
    let lastComposition: Composition = compositionOf(state.gases) === 'none' ? 'oxygenNitrogen' : compositionOf(state.gases);
    const air = {
      get composition(): Composition {
        return compositionOf(state.gases);
      },
      set composition(c: Composition) {
        if (c !== 'none') lastComposition = c;
        Object.assign(state.gases, gasesOf(totalPressure(state.gases), c));
      },
      get pressure(): number {
        return totalPressure(state.gases);
      },
      set pressure(v: number) {
        const p = totalPressure(state.gases);
        if (p > 0 && v > 0) for (const gas of GASES) state.gases[gas] *= v / p;
        else Object.assign(state.gases, gasesOf(v, lastComposition));
      },
    };
    f.add(air, 'composition', COMPOSITIONS).name('air').onChange(changed).listen();
    const log = {
      get pressure() {
        return Math.round(Math.log10(Math.max(air.pressure, 1e-7)) * 100) / 100;
      },
      set pressure(v: number) {
        air.pressure = v <= -7 ? 0 : 10 ** v;
      },
      get insolation() {
        return Math.round(Math.log10(Math.max(setting.insolation, 1e-3)) * 100) / 100;
      },
      set insolation(v: number) {
        setting.insolation = 10 ** v;
      },
      get heatFlow() {
        return Math.round(Math.log10(Math.max(setting.heatFlow, 1e-4)) * 100) / 100;
      },
      set heatFlow(v: number) {
        setting.heatFlow = 10 ** v;
      },
    };
    f.add(log, 'pressure', -7, 3.5, 0.01).name('log₁₀ pressure (bar)').onChange(changed).listen();
    f.add(air, 'pressure', 0, 3000).name('pressure (bar)').onChange(changed).listen();
    f.add(state, 'greenhouse', 0, 10, 0.01).name('trace greenhouse (× Earth)').onChange(changed).listen();
    f.add(state, 'water', 0, 1, 0.01).onChange(changed).listen();
    f.add(state, 'surfaceAlbedo', 0, 1, 0.01).name('surface albedo').onChange(changed).listen();
    const g = f.addFolder('Gases (bar)').close();
    const gasMax: Record<Gas, number> = { n2: 10, o2: 2, co2: 100, h2: 500 };
    const gasName: Record<Gas, string> = { n2: 'N₂', o2: 'O₂', co2: 'CO₂', h2: 'H₂' };
    for (const gas of GASES) g.add(state.gases, gas, 0, gasMax[gas], 0.001).name(gasName[gas]).onChange(changed).listen();
    const t = f.addFolder('Terraforming levers').close();
    t.add(state, 'starlight', 0, 3, 0.01).name('starlight (mirrors, shades)').onChange(changed).listen();
    t.add(state, 'aerosol', 0, 0.9, 0.01).name('aerosol haze reflectance').onChange(changed).listen();
    t.add(state, 'magicHeat', -300, 300, 1).name('magic heat (W/m²)').onChange(changed).listen();
    const presets = {
      earth: () => void lab.terraform({ composition: 'oxygenNitrogen', pressure: 1, greenhouse: 1, water: Math.max(state.water, 0.6) }),
      venus: () => void lab.terraform({ composition: 'carbonDioxide', pressure: 92, greenhouse: 1 }),
      mars: () => void lab.terraform({ composition: 'carbonDioxide', pressure: 0.006, greenhouse: 1 }),
      titan: () => void lab.terraform({ composition: 'nitrogen', pressure: 1.5, greenhouse: 1 }),
      airless: () => void lab.terraform({ composition: 'none', pressure: 0 }),
      regenerate: () => void lab.replace(withGeneratedClimate(lab.planet, setting.insolation)),
    };
    f.add(presets, 'earth').name('Air: Earth (1 bar N₂–O₂)');
    f.add(presets, 'venus').name('Air: Venus (92 bar CO₂)');
    f.add(presets, 'mars').name('Air: Mars (6 mbar CO₂)');
    f.add(presets, 'titan').name('Air: Titan (1.5 bar N₂)');
    f.add(presets, 'airless').name('Air: none');
    f.add(presets, 'regenerate').name('Climate as generated');

    const s = f.addFolder('Setting (fixed by the body)');
    s.add(log, 'insolation', -3, 2, 0.01).name('log₁₀ starlight (× Earth)').onChange(changed).listen();
    s.add(setting, 'gravity', 0.005, 5, 0.001).name('gravity (g)').onChange(changed).listen();
    s.add(setting, 'escapeVelocity', 0.1, 40, 0.01).name('escape velocity (km/s)').onChange(changed).listen();
    s.add(log, 'heatFlow', -4, 1, 0.01).name('log₁₀ heat flow (W/m²)').onChange(changed).listen();
  }

  /**
   * The magic rays over time, as the game plays them (gen/terraform.ts): each
   * button holds a ray for `seconds` from the time shown, which moves on by
   * as much; the time slider scrubs through the log; the chart shows it.
   */
  private buildTerraform(): void {
    const lab = this.lab;
    const f = this.folder('Terraform (rays, mirrors, shade, works)', true);
    const gasName: Record<Gas, string> = { n2: 'N₂', o2: 'O₂', co2: 'CO₂', h2: 'H₂' };
    f.add(lab, 'raySeconds', 1, 30, 1).name('hold each ray (s)');
    f.add(lab.rayChoice, 'gas', Object.fromEntries(GASES.map((g) => [gasName[g], g]))).name('air / vacuum gas').onChange(() => lab.showChartNow());
    f.add(lab.rayChoice, 'water', { rain: 'add', steam: 'take' }).name('water ray').onChange(() => lab.showChartNow());
    const rays = {
      heat: () => void lab.ray('heatRay'),
      cool: () => void lab.ray('coolRay'),
      air: () => void lab.ray('airRay'),
      vacuum: () => void lab.ray('vacuumRay'),
      water: () => void lab.ray('waterRay'),
      clear: () => void lab.clearTerraform(),
    };
    f.add(rays, 'heat').name('Heat ray');
    f.add(rays, 'cool').name('Cool ray');
    f.add(rays, 'air').name('Air ray');
    f.add(rays, 'vacuum').name('Vacuum ray');
    f.add(rays, 'water').name('Water ray');
    // Heat and light (terraform/light.ts): the mirrors and the shade stay; the spray is held like a ray.
    const light = {
      deploy: () => void lab.mirror('deploy'),
      recall: () => void lab.mirror('recall'),
      close: () => void lab.shade('close'),
      open: () => void lab.shade('open'),
      spray: () => void lab.aerosol(),
      get note(): string {
        return lab.lightNote;
      },
    };
    f.add(light, 'deploy').name('Deploy a mirror');
    f.add(light, 'recall').name('Recall a mirror');
    f.add(light, 'close').name('Close the sunshade a step');
    f.add(light, 'open').name('Open the sunshade a step');
    f.add(light, 'spray').name('Spray aerosol');
    // Greenhouse (terraform/greenhouse.ts): works set down on dry land near the view, running until beamed up.
    const works = {
      factory: () => void lab.works('factory'),
      sink: () => void lab.works('sink'),
      remove: () => void lab.removeWorks(),
      run: () => void lab.runOn(60),
    };
    f.add(works, 'factory').name('Set down a greenhouse factory');
    f.add(works, 'sink').name('Set down a carbon sink');
    f.add(works, 'remove').name('Beam the last works up');
    f.add(works, 'run').name('Run on a minute');
    f.add(light, 'note').name('tools').disable().listen();
    const time = {
      get mode(): TerraformMode {
        return lab.terraformState?.mode ?? 'relaxed';
      },
      set mode(m: TerraformMode) {
        void lab.setTerraformMode(m);
      },
      get time(): number {
        return lab.terraformState?.time ?? 0;
      },
      set time(t: number) {
        void lab.setTerraformTime(t);
      },
      get chart(): boolean {
        return lab.showChart;
      },
      set chart(on: boolean) {
        lab.showChart = on;
        lab.showChartNow();
      },
    };
    f.add(time, 'mode', { Sandbox: 'sandbox', Relaxed: 'relaxed', Real: 'real' }).name('mode').listen();
    f.add(time, 'time', 0, 1800, 1).name('time (s)').listen();
    f.add(time, 'chart').name('show the chart').listen();
    f.add(rays, 'clear').name('Undo all terraforming');
  }

  private buildRings(): void {
    const lab = this.lab;
    const p = this.p;
    const changed = () => lab.changed();
    const f = this.folder('Rings', p.rings === null);
    const rings = {
      get on() {
        return lab.planet.rings !== null;
      },
      set on(v: boolean) {
        const q = lab.planet;
        q.rings = v ? labRings(q.seed, q.type, q.radius, q.style, true) : null;
      },
      get inner() {
        return lab.planet.rings ? Math.round((lab.planet.rings.inner / lab.planet.radius) * 100) / 100 : 0;
      },
      set inner(v: number) {
        const r = lab.planet.rings;
        if (r) r.inner = Math.min(v * lab.planet.radius, r.outer - 0.05);
      },
      get outer() {
        return lab.planet.rings ? Math.round((lab.planet.rings.outer / lab.planet.radius) * 100) / 100 : 0;
      },
      set outer(v: number) {
        const r = lab.planet.rings;
        if (r) r.outer = Math.max(v * lab.planet.radius, r.inner + 0.05);
      },
      /** Share of ice among the rocks up close: set, or from the colour (gen/rings.ts iceShare). */
      get ice() {
        const r = lab.planet.rings;
        return r ? Math.round((r.ice ?? iceShare(r.color)) * 100) / 100 : 0;
      },
      set ice(v: number) {
        const r = lab.planet.rings;
        if (r) r.ice = v;
      },
    };
    f.add(rings, 'on')
      .name('rings')
      .onChange(() => {
        this.refresh();
        changed();
      });
    if (!p.rings) return;
    f.add(rings, 'inner', 1, 4, 0.01).name('inner edge (× R)').onChange(changed).listen();
    f.add(rings, 'outer', 1.05, 6, 0.01).name('outer edge (× R)').onChange(changed).listen();
    f.addColor(p.rings, 'color').onChange(changed);
    f.add(p.rings, 'opacity', 0, 1, 0.01).onChange(changed);
    f.add(rings, 'ice', 0, 1, 0.01).name('ice (rocks up close)').onChange(changed).listen();
  }

  private buildMoons(): void {
    const lab = this.lab;
    const f = this.folder('Moons', true);
    const moons = { n: lab.planet.moons.length };
    f.add(moons, 'n', 0, 6, 1)
      .name('moons (system view)')
      .onFinishChange((n: number) => void lab.replace(withMoons(lab.planet, n)));
    f.add({ show: () => void lab.setView({ view: 'system' }) }, 'show').name('Show them (system view)');
    lab.planet.moons.forEach((moon) => {
      const m = f.addFolder(moon.name).close();
      m.add(moon, 'type', ['barren', 'ice', 'lava'])
        .name('type (colours)')
        .onChange((type: MoonType) => {
          moon.style = labStyle(moon.seed, type, 'moon').style;
          lab.changed();
        });
      m.add(moon, 'radius', MOON_RADIUS.min, MOON_RADIUS.max, 0.01).onChange(() => lab.changed());
      m.add({ edit: () => void lab.replace(labFromBody(moon, true), null) }, 'edit').name('Edit this moon in the lab');
    });
  }
}

async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    prompt('Copy this:', text);
  }
}

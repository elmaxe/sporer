import { describeGasWeather } from '../gen/gasWeather';
import type { Entity } from '../core/Entity';
import type { Input } from '../core/Input';
import { celsius, describeAtmosphere } from '../gen/climate';
import { EARTH_RADIUS_KM, atmosphereLook, scaleHeight } from '../gen/atmosphere';
import { shapeExtents } from '../gen/shape';
import { plantLabLink } from '../plantlab/labPlants';
import { animalLabLink } from '../animallab/labAnimals';
import { starLabLink } from '../starlab/labStars';
import { describeLab, isSmallKind, labClimateData, labEarthRadii, labLife } from './labPlanet';
import { formatChance, type LifeEstimate } from '../gen/life';
import type { PlanetLab } from './PlanetLab';

/** Seconds between refreshes of the live values. */
const REFRESH = 0.2;
const GEOTHERMAL = ['quiet', 'low', 'moderate', 'active', 'volcanic'] as const;
const GAS: Record<string, string> = { oxygenNitrogen: 'N₂–O₂', nitrogen: 'N₂', carbonDioxide: 'CO₂', hydrogen: 'H₂' };

/**
 * The lab's readout (#lab-info): what the planet is, every derived climate
 * value, what's active on it (geysers, lava) and the build's cost. Rewritten
 * after each build and refreshed a few times a second for the live values.
 */
export class LabInfo implements Entity {
  private readonly root = document.getElementById('lab-info')!;
  private readonly back = document.createElement('a');
  /** To the plant lab with this planet's species (shown when it has plants). */
  private readonly plants = document.createElement('a');
  /** To the animal lab with this planet's species (shown when it has animals). */
  private readonly animals = document.createElement('a');
  /** To the star lab at the system the planet came from (shown when it came from one). */
  private readonly star = document.createElement('a');
  private readonly details = document.createElement('button');
  /** Opens the debug dump (DebugDumpControl finds it by its id). */
  private readonly report = document.createElement('button');
  private readonly head = document.createElement('div');
  private readonly table = document.createElement('table');
  private readonly help = document.createElement('div');
  private since = REFRESH;
  private touch: boolean | null = null;

  constructor(
    private readonly lab: PlanetLab,
    private readonly input: Input,
  ) {
    const top = document.createElement('div');
    top.className = 'lab-top';
    this.back.className = 'lab-back';
    this.back.textContent = '← Game';
    this.details.type = 'button';
    this.details.className = 'lab-details';
    this.details.addEventListener('click', this.onDetails);
    this.plants.className = 'lab-back';
    this.plants.textContent = 'Plants';
    this.plants.title = "This planet's plant species in the plant lab";
    this.animals.className = 'lab-back';
    this.animals.textContent = 'Animals';
    this.animals.title = "This planet's animal species in the animal lab";
    this.star.className = 'lab-back';
    this.star.textContent = 'Star';
    this.star.title = "This planet's star and system in the star lab";
    this.report.type = 'button';
    this.report.id = 'lab-dump';
    this.report.className = 'lab-back';
    this.report.textContent = 'Report';
    this.report.title = 'Save a debug dump (F8): the screen, your marks and a note, and this planet, in one file to send';
    const links = document.createElement('div');
    links.className = 'lab-links';
    links.append(this.back, this.star, this.plants, this.animals, this.report);
    top.append(links, this.details);
    this.help.className = 'lab-help';
    this.root.append(top, this.head, this.table, this.help);
    // Phones start with just the name, so the planet has the screen.
    this.setCollapsed(matchMedia('(max-width: 700px)').matches);
  }

  /** The name, source and help line (after each build; the table refreshes by itself). */
  rebuilt(): void {
    const { planet, source } = this.lab;
    const from = !source
      ? ''
      : source.asteroid !== undefined
        ? `Star ${source.star}, belt ${source.belt ?? 0}, asteroid ${source.asteroid} (seed ${source.seed})`
        : source.comet !== undefined
        ? `Star ${source.star}, comet ${source.comet} (seed ${source.seed})`
        : `Star ${source.star}, planet ${source.planet}${source.moon !== undefined ? `, moon ${source.moon}` : ''} (seed ${source.seed})`;
    // Back to the game: at this planet's system when it came from one.
    this.back.href = this.lab.gameLink ?? new URL('./', location.href).href;
    this.back.title = this.lab.gameLink ? 'The game, at this planet\'s system' : 'The game';
    this.head.innerHTML =
      `<h1>${escape(planet.name)}</h1>` + `<div class="lab-sub">${escape(describeLab(planet))}${from ? ` · ${escape(from)}` : ''}</div>`;
    this.star.hidden = !source;
    if (source) this.star.href = starLabLink(source.seed, source.star, location.href, 'system');
    const plants = this.lab.level?.plants;
    this.plants.hidden = !plants;
    if (plants) {
      const s = this.lab.source;
      const from = s && s.comet === undefined && s.asteroid === undefined ? { seed: s.seed, star: s.star, planet: s.planet, moon: s.moon } : null;
      this.plants.href = plantLabLink(plants.plan.species, plants.plan.tier, plants.plan.seed, from, location.href);
    }
    const animals = this.lab.level?.animals;
    this.animals.hidden = !animals;
    if (animals) {
      const s = this.lab.source;
      const from = s && s.comet === undefined && s.asteroid === undefined ? { seed: s.seed, star: s.star, planet: s.planet, moon: s.moon } : null;
      this.animals.href = animalLabLink(animals.plan.species, animals.plan.tier, animals.plan.seed, animals.plan.gravity, from, location.href);
    }
    this.touch = null;
    this.render();
  }

  private setCollapsed(collapsed: boolean): void {
    this.root.classList.toggle('collapsed', collapsed);
    this.details.textContent = collapsed ? 'Details ▾' : 'Details ▴';
    this.details.setAttribute('aria-expanded', String(!collapsed));
  }

  private onDetails = () => this.setCollapsed(!this.root.classList.contains('collapsed'));

  private writeHelp(): void {
    const { view } = this.lab;
    const touch = this.input.touchMode;
    if (view.view === 'system') {
      this.help.textContent = touch ? 'Drag to orbit · pinch to zoom' : 'Drag to orbit · scroll to zoom';
    } else if (touch) {
      this.help.textContent =
        'Drag to orbit · pinch to zoom · tap the globe to fly the UFO there · the stick flies it' + (view.map ? ' · Map button: the map' : '');
    } else {
      this.help.textContent =
        'Drag to orbit · scroll to zoom · click the globe to fly the UFO there' +
        (view.camera === 'fly' ? ' · WASD flies' : '') +
        (view.map ? ' · N folds the map' : '');
    }
  }

  update(frameDt: number): void {
    if (this.input.touchMode !== this.touch) {
      this.touch = this.input.touchMode;
      this.writeHelp();
    }
    this.since += frameDt;
    if (this.since < REFRESH) return;
    this.since = 0;
    this.render();
  }

  render(): void {
    const { planet, level, view } = this.lab;
    const climate = labClimateData(planet);
    const rows: [string, string][] = [];
    const R = labEarthRadii(planet);
    rows.push(['Radius', `${planet.radius.toFixed(2)} u · ${R.toFixed(3)} R⊕ · ${Math.round(R * EARTH_RADIUS_KM)} km`]);
    if (climate) {
      rows.push(['Gravity', `${fmt(climate.gravity)} g · escape ${fmt(climate.escapeVelocity)} km/s`]);
      rows.push(['Starlight', `${fmt(climate.insolation)} × Earth`]);
      rows.push(['Temperature', `${celsius(climate.temperature)} (${Math.round(climate.temperature)} K) · no greenhouse ${celsius(climate.equilibriumTemperature)}`]);
      const air =
        climate.composition === 'none'
          ? 'none'
          : `${GAS[climate.composition]} ${fmt(climate.pressure)} bar · ${describeAtmosphere(climate)} · τ ${fmt(climate.opticalDepth)}`;
      rows.push(['Air', air]);
      rows.push(['Albedo', `${fmt(climate.albedo)} (surface ${fmt(climate.surfaceAlbedo)})`]);
      rows.push(['Water', `${climate.waterState} (${fmt(climate.water)})`]);
      rows.push(['Retention', `${climate.retentionClass} (${signed(climate.retention)})${climate.leaking ? ' · air escaping' : ''}`]);
      rows.push([
        'Heat',
        `${fmt(climate.heatFlow)} W/m² · ${GEOTHERMAL[Math.min(4, Math.floor(climate.geothermal * 5))]} (${fmt(climate.geothermal)})`,
      ]);
      rows.push(['Habitability', `T${climate.habitability}`]);
      const life = labLife(planet, view.star);
      if (life) rows.push(['Life', describeLifeDetail(life)]);
      const look = planet.atmosphere ? atmosphereLook(climate, planet.radius) : null;
      if (look) {
        rows.push(['Haze', `${fmt(scaleHeight(climate))} km scale height → shell ${fmt((look.top - 1) * 100)}% of R · depth ${fmt(look.depth)}`]);
      }
    }
    const geysers = level?.geysers;
    if (geysers) {
      const a = geysers.activity;
      rows.push(['Geysers', `${a.kind} · ${a.vents.length} vents · heat ${fmt(a.heat)} · ${geysers.events.length} erupting`]);
    } else if (view.view === 'globe' && planet.type !== 'gas' && !planet.shape) {
      rows.push(['Geysers', 'none']);
    }
    const comet = level?.comet;
    if (planet.shape) {
      const e = shapeExtents(planet.shape);
      const lobes = `${planet.shape.lobes.length} lobe${planet.shape.lobes.length > 1 ? 's' : ''}${planet.shape.binary ? ' (contact binary)' : ''}`;
      rows.push(['Shape', `${lobes} · ${e.map((v) => fmt((v / e[0]) * 100) + '%').join(' × ')} · thinnest ${fmt(planet.shape.min * 100)}% of the longest reach`]);
    }
    if (comet) {
      const sunlit = comet.vents.filter((v) => v.normal[0] * comet.sun.x + v.normal[1] * comet.sun.y + v.normal[2] * comet.sun.z > 0).length;
      rows.push(['Activity', `${fmt(comet.strength)} at ${fmt(planet.zone)} hab. radii · ${comet.vents.length} vents, ${sunlit} in sunlight`]);
    }
    const eruptions = level?.eruptions;
    if (eruptions && level?.globe?.lava) {
      const a = level.globe.lava.activity;
      const live = eruptions.events;
      const count = (k: string) => live.filter((e) => e.kind === k).length;
      rows.push(['Lava', `${a.vents.length} vents · ${count('fountain')} fountains, ${count('eruption')} eruptions`]);
    }
    const weather = level?.globe?.weather ?? level?.bodies?.planet.weather;
    if (weather) {
      const w = weather.data;
      const parts = [w.kind, `cover ${fmt(w.coverage)}`];
      if (w.precipitation) parts.push(w.precipitation);
      if (w.volcanic) parts.push('volcanic lightning');
      parts.push(`${weather.shown.length} storms · ${weather.flashCount} flashes`);
      const puffs = weather.puffs[0];
      if (puffs) parts.push(`${puffs.clusterCount} clouds · ${puffs.puffCount} puffs drawn`);
      rows.push(['Weather', parts.join(' · ')]);
    } else if (planet.type !== 'gas' && !planet.shape) {
      rows.push(['Weather', 'none']);
    }
    const gas = level?.globe?.gas ?? level?.bodies?.planet.gas;
    if (gas) {
      const kinds = gas.shown.map((e) => e.kind).join(', ');
      rows.push(['Weather', `${describeGasWeather(gas.weather)} · ${gas.shown.length} storms${kinds ? ` (${kinds})` : ''} · ${gas.flashCount} flashes`]);
    }
    const plants = level?.plants;
    if (plants) {
      const st = plants.stats();
      rows.push([
        'Plants',
        `T${plants.plan.tier} · ${plants.plan.species.length} species · ${st.plants} in ${st.cells} cells · ${st.lods.join(' / ')} by detail · ${st.drawCalls} draws, ${Math.round(st.triangles / 1000)}k triangles`,
      ]);
    } else if (view.view === 'globe' && planet.type !== 'gas' && !planet.shape) {
      rows.push(['Plants', 'none']);
    }
    const rocks = level?.rocks;
    if (rocks) {
      const st = rocks.stats();
      rows.push(['Rocks', st.cells ? `${st.rocks} in ${st.cells} cells · ${st.drawn} drawn` : 'none near (come closer to the ground)']);
    }
    const animals = level?.animals;
    if (animals) {
      const st = animals.stats();
      rows.push(['Animals', `${animals.plan.species.length} species · ${st.animals} in ${st.herds} herds near · ${st.drawn} drawn · ${st.walking} walking, ${st.grazing} grazing`]);
    }
    if (planet.rings) {
      const rocks = level?.globe?.rings;
      const near = rocks ? ` · ${Math.round(rocks.ice * 100)}% ice · ${rocks.count} rocks near` : '';
      rows.push(['Rings', `${fmt(planet.rings.inner / planet.radius)}–${fmt(planet.rings.outer / planet.radius)} R${near}`]);
    }
    if (planet.kind !== 'moon' && !isSmallKind(planet.kind)) rows.push(['Moons', `${planet.moons.length}${planet.moons.length ? ' (system view)' : ''}`]);
    if (level) rows.push(['Build', `${Math.round(level.triangles / 1000)}k triangles · ${Math.round(level.buildMs)} ms`]);
    const lod = level?.globe?.lodStats();
    const sea = level?.globe?.waterStats();
    if (lod) rows.push(['Detail', `${lod.chunks} chunks drawn · depth ${lod.minDepth}–${lod.maxDepth}${sea ? ` · sea ${sea.chunks}${sea.chunks ? ` · depth ${sea.minDepth}–${sea.maxDepth}` : ''}` : ''}`]);
    const clock = this.lab.clock;
    rows.push(['Time', `${clock.time.toFixed(1)} s${clock.paused ? ' · paused' : clock.speed !== 1 ? ` · ×${clock.speed}` : ''}`]);

    this.table.innerHTML = rows.map(([k, v]) => `<tr><th>${k}</th><td>${escape(v)}</td></tr>`).join('');
  }

  dispose(): void {
    this.details.removeEventListener('click', this.onDetails);
  }
}

function fmt(v: number): string {
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 100) return v.toFixed(0);
  if (a >= 1) return v.toFixed(2);
  if (a >= 0.01) return v.toFixed(3);
  return v.toExponential(1);
}

function signed(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;
}

function escape(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/** The chance of life and what it's made of, e.g. "52% · surface 0% (no liquid water) · ocean under 12 km of ice: 54% · star's age 95%". */
function describeLifeDetail(life: LifeEstimate): string {
  const { surface: s, subsurface: u } = life;
  const parts = [life.plants ? `${formatChance(life.chance)} (plants grow here)` : formatChance(life.chance)];
  const dose = `${fmt(s.dose)} mGy/day${s.flare > 0 ? ` + flares ${fmt(s.flare)} Sv` : ''} (×${fmt(s.radiation)})`;
  parts.push(
    s.area > 0
      ? `surface ${formatChance(s.chance)}: liquid water on ${fmt(s.area * 100)}% · radiation ${dose} · energy ×${fmt(s.energy)}`
      : `surface 0% (no liquid water) · radiation ${dose}`,
  );
  if (u.kind !== 'none') {
    const where = u.kind === 'ocean' ? 'ice' : 'rock';
    const depth = Number.isFinite(u.depth) ? `${fmt(u.depth)} km` : 'no heat';
    parts.push(
      u.liquid
        ? `${u.kind} under ${depth} of ${where}: ${formatChance(u.chance)} (energy ×${fmt(u.energy)})`
        : `no ${u.kind}: melts at ${depth}, water reaches ${fmt(u.reach)} km`,
    );
  }
  parts.push(`star's age ×${fmt(life.time)}`);
  return parts.join(' · ');
}

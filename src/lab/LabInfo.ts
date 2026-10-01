import type { Entity } from '../core/Entity';
import type { Input } from '../core/Input';
import { celsius, describeAtmosphere } from '../gen/climate';
import { EARTH_RADIUS_KM, atmosphereLook, scaleHeight } from '../gen/atmosphere';
import { shapeExtents } from '../gen/shape';
import { describeLab, labClimateData, labEarthRadii } from './labPlanet';
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
  private readonly details = document.createElement('button');
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
    top.append(this.back, this.details);
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
      : source.comet !== undefined
        ? `Star ${source.star}, comet ${source.comet} (seed ${source.seed})`
        : `Star ${source.star}, planet ${source.planet}${source.moon !== undefined ? `, moon ${source.moon}` : ''} (seed ${source.seed})`;
    // Back to the game: at this planet's system when it came from one.
    this.back.href = this.lab.gameLink ?? new URL('./', location.href).href;
    this.back.title = this.lab.gameLink ? 'The game, at this planet\'s system' : 'The game';
    this.head.innerHTML =
      `<h1>${escape(planet.name)}</h1>` + `<div class="lab-sub">${escape(describeLab(planet))}${from ? ` · ${escape(from)}` : ''}</div>`;
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
      rows.push(['Weather', parts.join(' · ')]);
    } else if (planet.type !== 'gas' && !planet.shape) {
      rows.push(['Weather', 'none']);
    }
    const plants = level?.plants;
    if (plants) {
      const st = plants.stats();
      rows.push([
        'Plants',
        `T${plants.plan.tier} · ${plants.plan.species.length} species · ${st.plants} in ${st.cells} cells · ${st.near} near, ${st.mid} mid · ${st.drawCalls} draws, ${Math.round(st.triangles / 1000)}k triangles`,
      ]);
    } else if (view.view === 'globe' && planet.type !== 'gas' && !planet.shape) {
      rows.push(['Plants', 'none']);
    }
    if (planet.rings) rows.push(['Rings', `${fmt(planet.rings.inner / planet.radius)}–${fmt(planet.rings.outer / planet.radius)} R`]);
    if (planet.kind !== 'moon' && planet.kind !== 'comet') rows.push(['Moons', `${planet.moons.length}${planet.moons.length ? ' (system view)' : ''}`]);
    if (level) rows.push(['Build', `${Math.round(level.triangles / 1000)}k triangles · ${Math.round(level.buildMs)} ms`]);
    const lod = level?.globe?.lodStats();
    if (lod) rows.push(['Detail', `${lod.chunks} chunks drawn · depth ${lod.minDepth}–${lod.maxDepth}`]);
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

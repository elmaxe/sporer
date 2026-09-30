import type { Entity } from '../core/Entity';
import { celsius, describeAtmosphere } from '../gen/climate';
import { EARTH_RADIUS_KM, atmosphereLook, scaleHeight } from '../gen/atmosphere';
import { describeLab, labClimateData, labEarthRadii } from './labPlanet';
import type { PlanetLab } from './PlanetLab';

/** Seconds between refreshes of the live values. */
const REFRESH = 0.2;
const GEOTHERMAL = ['quiet', 'low', 'moderate', 'active', 'volcanic'] as const;
const GAS: Record<string, string> = { oxygenNitrogen: 'N₂–O₂', nitrogen: 'N₂', carbonDioxide: 'CO₂' };

/**
 * The lab's readout (#lab-info): what the planet is, every derived climate
 * value, what's active on it (geysers, lava) and the build's cost. Rewritten
 * after each build and refreshed a few times a second for the live values.
 */
export class LabInfo implements Entity {
  private readonly head = document.createElement('div');
  private readonly table = document.createElement('table');
  private readonly help = document.createElement('div');
  private since = REFRESH;

  constructor(private readonly lab: PlanetLab) {
    this.help.className = 'lab-help';
    document.getElementById('lab-info')!.append(this.head, this.table, this.help);
  }

  /** The name, source and help line (after each build; the table refreshes by itself). */
  rebuilt(): void {
    const { planet, view, source } = this.lab;
    const from = source
      ? `Star ${source.star}, planet ${source.planet}${source.moon !== undefined ? `, moon ${source.moon}` : ''} (seed ${source.seed})`
      : '';
    const game = this.lab.gameLink;
    this.head.innerHTML =
      `<h1>${escape(planet.name)}</h1>` +
      `<div class="lab-sub">${escape(describeLab(planet))}${from ? ` · ${escape(from)}` : ''}` +
      `${game ? ` · <a href="${escape(game)}" target="_blank">open in game</a>` : ''}</div>`;
    this.help.textContent =
      view.view === 'globe'
        ? 'Drag to orbit · scroll to zoom · click the globe to fly the UFO there' +
          (view.camera === 'fly' ? ' · WASD flies' : '') +
          (view.map ? ' · N folds the map' : '')
        : 'Drag to orbit · scroll to zoom';
    this.render();
  }

  update(frameDt: number): void {
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
    } else if (view.view === 'globe' && planet.type !== 'gas') {
      rows.push(['Geysers', 'none']);
    }
    const eruptions = level?.eruptions;
    if (eruptions && level?.globe?.lava) {
      const a = level.globe.lava.activity;
      const live = eruptions.events;
      const count = (k: string) => live.filter((e) => e.kind === k).length;
      rows.push(['Lava', `${a.vents.length} vents · ${count('fountain')} fountains, ${count('eruption')} eruptions`]);
    }
    if (planet.rings) rows.push(['Rings', `${fmt(planet.rings.inner / planet.radius)}–${fmt(planet.rings.outer / planet.radius)} R`]);
    if (planet.kind !== 'moon') rows.push(['Moons', `${planet.moons.length}${planet.moons.length ? ' (system view)' : ''}`]);
    if (level) rows.push(['Build', `${Math.round(level.triangles / 1000)}k triangles · ${Math.round(level.buildMs)} ms`]);
    const clock = this.lab.clock;
    rows.push(['Time', `${clock.time.toFixed(1)} s${clock.paused ? ' · paused' : clock.speed !== 1 ? ` · ×${clock.speed}` : ''}`]);

    this.table.innerHTML = rows.map(([k, v]) => `<tr><th>${k}</th><td>${escape(v)}</td></tr>`).join('');
  }

  dispose(): void {}
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

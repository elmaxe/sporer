import type { Entity } from '../core/Entity';
import type { Input } from '../core/Input';
import { bodyLife, formatChance } from '../gen/life';
import { hashSeed } from '../gen/rng';
import { starActivity } from '../gen/starActivity';
import { describeStar, describeStars, nominalStar, starLightColor } from '../gen/stars';
import { describeSized, systemExtent } from '../gen/system';
import { labFromSystem, labLink } from '../lab/labPlanet';
import { stormsAt, tunable } from './labStars';
import type { StarLab } from './StarLab';

/** Seconds between refreshes of the live values. */
const REFRESH = 0.2;
/** A typical G star's radius: the unit the readout gives sizes in. */
const G_RADIUS = nominalStar('mainSequence', 'G').radius;
const TUNING_LABELS: Record<string, string> = { planets: 'planets', spacing: 'spacing ×', moons: 'moons each', comets: 'comets', mainBelt: 'main belt', debris: 'debris disc' };

/**
 * The star lab's readout (#lab-info): the star(s) and their numbers, the
 * storms under way, the habitable zone, the system they grow (each planet
 * with a link to it in the planet lab), the tuner's changes, the camera and
 * the build's cost, and a link back to the game.
 */
export class StarLabInfo implements Entity {
  private readonly root = document.getElementById('lab-info')!;
  private readonly back = document.createElement('a');
  private readonly planetLab = document.createElement('a');
  private readonly details = document.createElement('button');
  private readonly head = document.createElement('div');
  private readonly table = document.createElement('table');
  private readonly planets = document.createElement('div');
  private readonly help = document.createElement('div');
  private since = REFRESH;
  private touch: boolean | null = null;

  constructor(
    private readonly lab: StarLab,
    private readonly input: Input,
  ) {
    const top = document.createElement('div');
    top.className = 'lab-top';
    this.back.className = 'lab-back';
    this.back.textContent = '← Game';
    this.planetLab.className = 'lab-back';
    this.planetLab.textContent = 'Planet lab';
    this.details.type = 'button';
    this.details.className = 'lab-details';
    this.details.addEventListener('click', this.onDetails);
    const links = document.createElement('div');
    links.className = 'lab-links';
    links.append(this.back, this.planetLab);
    top.append(links, this.details);
    this.planets.className = 'lab-planets';
    this.help.className = 'lab-help';
    this.root.append(top, this.head, this.table, this.planets, this.help);
    this.setCollapsed(matchMedia('(max-width: 700px)').matches);
  }

  /** The name, source, planet list and help line (after each build; the table refreshes by itself). */
  rebuilt(): void {
    const { state, system } = this.lab;
    this.back.href = this.lab.gameLink ?? new URL('./', location.href).href;
    this.back.title = this.lab.gameLink ? 'The game, at this system' : 'The game';
    const first = system.planets.length > 0 ? labFromSystem(system, 0) : null;
    this.planetLab.href = first ? labLink(first, location.href) : new URL('lab.html', location.href).href;
    this.planetLab.title = first ? 'Its first planet in the planet lab' : 'The planet lab';
    const s = state.source;
    const from = s ? `star ${s.star} (seed ${s.seed})` : `generated (seed ${state.seed})`;
    const kind = state.real ? 'our own' : state.young ? 'young' : '';
    this.head.innerHTML =
      `<h1>${escape(state.name)}</h1>` + `<div class="lab-sub">${escape(describeStars(state.stars))}${kind ? ` · ${kind}` : ''} · ${escape(from)}</div>`;
    // Every planet and its moons, each a link to it in the planet lab.
    const rows = system.planets.map((p, i) => {
      const lab = labFromSystem(system, i);
      const life = bodyLife(system, p);
      const bits = [
        describeSized(p.type, p.size),
        `orbit ${Math.round(p.orbit.radius)}${system.habitableRadius > 0 ? ` (${fmt(p.orbit.radius / system.habitableRadius)} HZ)` : ''}`,
      ];
      if (p.rings) bits.push('rings');
      if (p.moons.length) bits.push(p.moons.length === 1 ? '1 moon' : `${p.moons.length} moons`);
      if (life && life.chance > 0) bits.push(`life ${formatChance(life.chance)}`);
      const name = lab ? `<a href="${escape(labLink(lab, location.href))}" target="_blank" rel="noopener" title="In the planet lab">${escape(p.name)}</a>` : escape(p.name);
      return `<li>${name} <span>${escape(bits.join(' · '))}</span></li>`;
    });
    this.planets.innerHTML = rows.length ? `<ol>${rows.join('')}</ol>` : '<div class="lab-sub">No planets.</div>';
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
    const touch = this.input.touchMode;
    const zoom = touch ? 'pinch to zoom' : 'scroll to zoom';
    const pick = this.lab.view.view === 'system' ? (touch ? ' · tap a body to follow it, empty space for the whole system' : ' · click a body to follow it, empty space for the whole system') : '';
    this.help.textContent = `Drag to orbit · ${zoom}${pick}`;
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
    const { level, state, system } = this.lab;
    const rows: [string, string][] = [];
    const time = level?.world.time ?? 0;
    state.stars.forEach((star, i) => {
      const label = state.stars.length > 1 ? `Star ${'AB'[i]}` : 'Star';
      rows.push([label, `${describeStar(star)} · class ${star.spectralClass} · radius ${fmt(star.radius)} (${fmt(star.radius / G_RADIUS)}× G) · luminosity ${fmt(star.luminosity)} · mass ${fmt(star.mass)}`]);
      const a = starActivity(star);
      const storms = stormsAt(a, hashSeed(state.seed, 'star', i), time);
      rows.push(['', `turns in ${fmt(a.rotationPeriod)} s · spots ${Math.round(a.spots * 100)}% · now ${storms.prominence} prominence${storms.prominence === 1 ? '' : 's'}, ${storms.flare} flare${storms.flare === 1 ? '' : 's'} · light ${starLightColor(star)}`]);
    });
    if (system.habitableRadius > 0) rows.push(['Habitable', `zone at ${Math.round(system.habitableRadius)} units (HZ = 1)`]);
    const moons = system.planets.reduce((n, p) => n + p.moons.length, 0);
    const dust = system.dust ? (system.dust.kind === 'protoplanetary' ? 'protoplanetary disc' : 'debris disc') : 'no dust disc';
    rows.push(['System', `${system.planets.length} planets, ${moons} moons · ${system.belts.length} belts · ${system.comets.length} comets · ${dust} · reaches ${Math.round(systemExtent(system))}`]);
    const tuned = Object.entries(state.tuning).map(([k, v]) => `${TUNING_LABELS[k] ?? k} ${typeof v === 'boolean' ? (v ? 'yes' : 'no') : fmt(v)}`);
    rows.push(['Tuner', !tunable(state) ? (state.real ? 'off (Sol is hand-made)' : 'off (a young system: its disc decides)') : tuned.length ? tuned.join(' · ') : 'as drawn']);
    if (level) {
      const focus = level.focus;
      rows.push(['Camera', `${focus ? `following ${focus.name}` : 'at the centre'} · ${fmt(level.orbit.zoom)} away · time ${fmt(time)} s × ${fmt(state.view.speed)}`]);
      rows.push(['Build', `${Math.round(level.buildMs)} ms`]);
    }
    this.table.innerHTML = rows.map(([k, v]) => `<tr><th>${k}</th><td>${escape(v)}</td></tr>`).join('');
  }

  dispose(): void {
    this.details.removeEventListener('click', this.onDetails);
  }
}

function fmt(v: number): string {
  if (Number.isInteger(v)) return String(v);
  const a = Math.abs(v);
  if (a >= 100) return v.toFixed(0);
  if (a >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

function escape(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

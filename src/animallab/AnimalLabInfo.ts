import type { Entity } from '../core/Entity';
import type { Input } from '../core/Input';
import { animalMass } from '../gen/animals';
import type { AnimalLab } from './AnimalLab';

const REFRESH = 0.2;
const PLANS: Record<string, string> = { quadruped: 'four legs', hexapod: 'six legs', biped: 'two legs' };

/**
 * The animal lab's readout (#lab-info): the species, its body and gait
 * (speeds and strides from dynamic similarity at the lab's gravity), each
 * level of detail's triangles and where the game draws it, the camera's
 * level now, the herds' counts, and links back to the game and the planet lab.
 */
export class AnimalLabInfo implements Entity {
  private readonly root = document.getElementById('lab-info')!;
  private readonly back = document.createElement('a');
  private readonly planet = document.createElement('a');
  private readonly details = document.createElement('button');
  private readonly head = document.createElement('div');
  private readonly table = document.createElement('table');
  private readonly help = document.createElement('div');
  private since = REFRESH;
  private touch: boolean | null = null;

  constructor(
    private readonly lab: AnimalLab,
    private readonly input: Input,
  ) {
    const top = document.createElement('div');
    top.className = 'lab-top';
    this.back.className = 'lab-back';
    this.back.textContent = '← Game';
    this.planet.className = 'lab-back';
    this.planet.textContent = 'Planet lab';
    this.details.type = 'button';
    this.details.className = 'lab-details';
    this.details.addEventListener('click', this.onDetails);
    const links = document.createElement('div');
    links.className = 'lab-links';
    links.append(this.back, this.planet);
    top.append(links, this.details);
    this.help.className = 'lab-help';
    this.root.append(top, this.head, this.table, this.help);
    this.setCollapsed(matchMedia('(max-width: 700px)').matches);
  }

  rebuilt(): void {
    const { species: s, state } = this.lab;
    this.back.href = this.lab.gameLink ?? new URL('./', location.href).href;
    this.planet.href = this.lab.planetLink ?? new URL('lab.html', location.href).href;
    this.planet.title = this.lab.planetLink ? 'The planet these animals live on, in the planet lab' : 'The planet lab';
    const from = state.source
      ? `star ${state.source.star}, planet ${state.source.planet}${state.source.moon !== undefined ? `, moon ${state.source.moon}` : ''} (seed ${state.source.seed})`
      : `generated set ${state.seed}`;
    this.head.innerHTML =
      `<h1>${escape(s.name)}</h1>` +
      `<div class="lab-sub">${s.diet === 'carnivore' ? 'Carnivore' : 'Herbivore'} · ${PLANS[s.form.plan]} · species ${state.selected + 1} of ${state.species.length} · T${state.tier} · ${escape(from)}</div>`;
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
    if (this.lab.view.view === 'herds') {
      this.help.textContent = `Drag to orbit, or to turn the planet from high up · ${zoom} out to the whole planet${touch ? '' : ' · WASD to move'}`;
      return;
    }
    const auto = this.lab.view.view === 'specimen' && this.lab.view.lod === 'auto' ? ' out through the levels of detail' : '';
    this.help.textContent = `Drag to orbit · ${zoom}${auto}`;
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
    const { level, view } = this.lab;
    const s = this.lab.species;
    const rows: [string, string][] = [];
    if (level) {
      const k = level.skeleton;
      const g = level.gait;
      rows.push(['Size', `${fmt(s.length)} long · ${fmt(k.top)} tall · hips ${fmt(k.hipHeight)} up · ~${fmt(animalMass(k.hipHeight))} kg by its legs`]);
      rows.push(['Gait', `walks ${fmt(g.walkSpeed)} u/s, strides ${fmt(g.walkStride)} · trots ${fmt(g.trotSpeed)} u/s, strides ${fmt(g.trotStride)} · at ${fmt(view.gravity)} g`]);
      rows.push(['Herds', `${s.herdMin}–${s.herdMax} · ${Math.round(s.minTemperature - 273.15)} to ${Math.round(s.maxTemperature - 273.15)} °C`]);
      rows.push(['Skeleton', `${k.spine.length} spine rings · ${k.legs.filter((l) => !l.arm).length} legs${k.legs.some((l) => l.arm) ? ' + 2 arms' : ''} · ${k.spikes.length} spikes`]);
      for (const l of level.lods) rows.push([`LOD ${l.lod}`, `${l.triangles} triangles · drawn ${fmt(l.from)}–${fmt(l.to)} units away`]);
      if (level.mode === 'specimen') {
        const at = level.lodNow();
        const d = level.distanceInLengths;
        const now = at.lod >= level.lods.length ? 'not drawn (past the last fade)' : at.fade > 0 ? `LOD ${at.lod} fading ${Math.round(at.fade * 100)}%` : `LOD ${at.lod}`;
        rows.push(['Camera', `${fmt(d)} lengths · ${view.lod === 'auto' ? now : `showing LOD ${view.lod} (auto would be ${now})`}`]);
      }
      const herds = level.herds;
      if (herds) {
        const st = herds.stats();
        rows.push(['Herds now', `${st.animals} animals in ${st.herds} herds · ${st.drawn} drawn (${st.lods.join(' / ')} by LOD) · ${st.walking} walking, ${st.grazing} grazing · ${st.drawCalls} draws`]);
      }
      rows.push(['Build', `${Math.round(level.buildMs)} ms`]);
    }
    this.table.innerHTML = rows.map(([k, v]) => `<tr><th>${k}</th><td>${escape(v)}</td></tr>`).join('');
  }

  dispose(): void {
    this.details.removeEventListener('click', this.onDetails);
  }
}

function fmt(v: number): string {
  const a = Math.abs(v);
  if (a >= 100) return v.toFixed(0);
  if (a >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

function escape(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

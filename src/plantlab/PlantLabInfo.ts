import type { Entity } from '../core/Entity';
import type { Input } from '../core/Input';
import { PLANT_KINDS } from '../gen/plants';
import type { PlantLab } from './PlantLab';

/** Seconds between refreshes of the live values. */
const REFRESH = 0.2;
const ARCH: Record<string, string> = { conifer: 'conifer', broadleaf: 'broadleaf', palm: 'palm', shrub: 'shrub' };

/**
 * The plant lab's readout (#lab-info): the species, its skeleton, each level
 * of detail's triangles and where the game draws it, the level the camera is
 * at now, the grove's counts, and links back to the game and the planet lab.
 */
export class PlantLabInfo implements Entity {
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
    private readonly lab: PlantLab,
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
    this.planet.title = this.lab.planetLink ? 'The planet these plants grow on, in the planet lab' : 'The planet lab';
    const from = state.source
      ? `star ${state.source.star}, planet ${state.source.planet}${state.source.moon !== undefined ? `, moon ${state.source.moon}` : ''} (seed ${state.source.seed})`
      : `generated set ${state.seed}`;
    this.head.innerHTML =
      `<h1>${escape(s.name)}</h1>` +
      `<div class="lab-sub">${escape(PLANT_KINDS[s.kind].label)} · ${ARCH[s.form.architecture]} · species ${state.selected + 1} of ${state.species.length} · T${state.tier} · ${escape(from)}</div>`;
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
    if (this.lab.view.view === 'grove') {
      const walk = touch ? '' : ' · WASD to move';
      this.help.textContent = `Drag to orbit, or to turn the planet from high up · ${zoom} out to the whole planet${walk}`;
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
    rows.push(['Size', `${fmt(s.height)} tall · crown ${fmt(s.crownRadius * 2)} wide (${s.crown}) · bare trunk ${Math.round(s.trunkShare * 100)}%`]);
    rows.push(['Climate', `${Math.round(s.minTemperature - 273.15)} to ${Math.round(s.maxTemperature - 273.15)} °C (annual mean)`]);
    if (level) {
      const k = level.skeleton;
      const orders = [0, 0, 0, 0];
      for (const stem of k.stems) orders[Math.min(3, stem.order)]!++;
      const stems = orders.map((n, i) => (n ? `${n} order ${i}` : '')).filter(Boolean).join(', ');
      rows.push(['Skeleton', `${stems || 'no stems'} · ${k.leaves.length} leaf masses${k.fronds.length ? ` · ${k.fronds.length} fronds` : ''}${k.accents.length ? ` · ${k.accents.length} flowers` : ''}`]);
      for (const l of level.lods) rows.push([`LOD ${l.lod}`, `${l.triangles} triangles · drawn ${fmt(l.from)}–${fmt(l.to)} units away`]);
      if (level.mode === 'specimen') {
        const at = level.lodNow();
        const d = level.distanceInHeights;
        const now =
          at.lod >= level.lods.length ? 'not drawn (past the last fade)' : at.fade > 0 ? `LOD ${at.lod} fading ${Math.round(at.fade * 100)}% to ${at.lod + 1 < level.lods.length ? `LOD ${at.lod + 1}` : 'nothing'}` : `LOD ${at.lod}`;
        rows.push(['Camera', `${fmt(d)} heights (${fmt(d * s.height)} units) · ${view.lod === 'auto' ? now : `showing LOD ${view.lod} (auto would be ${now})`}`]);
      }
      const grove = level.grove;
      if (grove) {
        const st = grove.stats();
        rows.push(['Grove', `${st.plants} plants in ${st.cells} cells · ${st.lods.join(' / ')} by LOD · ${st.drawCalls} draws, ${Math.round(st.triangles / 1000)}k triangles`]);
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

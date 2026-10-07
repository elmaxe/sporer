import { BODY_PLANS, COAT_PATTERNS, generateAnimalForm, type CoatPattern } from '../gen/animalForm';
import { defaultCreature, designFromAnimal, randomCreature, randomPaint, type CreaturePart, type PartKind, PART_KINDS } from '../gen/creature';
import { Rng } from '../gen/rng';
import type { CreatureLab, EditorMode } from './CreatureLab';

/*
 * The creature editor's controls, plain DOM: a top bar (modes, undo, new
 * creatures, share), the parts palette on the left in Build mode, and an
 * inspector on the right for whatever is selected, the paint, or the walk
 * (with a live footfall diagram: one row per leg, dark while its foot is
 * on the ground, as gait diagrams are drawn).
 */

const PART_LABELS: Record<PartKind, { icon: string; name: string; tip: string }> = {
  leg: { icon: '🦵', name: 'Leg', tip: 'Legs carry the body; the gait is worked out from how many and where' },
  arm: { icon: '💪', name: 'Arm', tip: 'Arms swing as it walks but never touch the ground' },
  eye: { icon: '👁', name: 'Eye', tip: 'Anywhere: one on the middle line, or a pair' },
  horn: { icon: '🦏', name: 'Horn', tip: 'Tilt curls it back or forward' },
  ear: { icon: '👂', name: 'Ear', tip: 'Flat lobes' },
  spike: { icon: '🔺', name: 'Spike', tip: 'Plates and spines, often along the back' },
  antenna: { icon: '📡', name: 'Antenna', tip: 'Long feelers with a bobble' },
};

const MODES: { mode: EditorMode; label: string }[] = [
  { mode: 'build', label: 'Build' },
  { mode: 'paint', label: 'Paint' },
  { mode: 'play', label: 'Play' },
];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

export class CreaturePanel {
  private readonly top = el('div', 'cr-top');
  private readonly palette = el('div', 'cr-palette');
  private readonly inspector = el('div', 'cr-inspector');
  private readonly hint = el('div', 'cr-hint');
  private readonly modeButtons = new Map<EditorMode, HTMLButtonElement>();
  private readonly paletteButtons = new Map<PartKind, HTMLButtonElement>();
  private undoBtn!: HTMLButtonElement;
  private redoBtn!: HTMLButtonElement;
  private nameInput!: HTMLInputElement;
  private footfall: HTMLCanvasElement | null = null;
  private gaitText: HTMLElement | null = null;
  private inspectorKey = '';
  private rolls = 1;

  constructor(
    root: HTMLElement,
    private readonly lab: CreatureLab,
  ) {
    root.append(this.top, this.palette, this.inspector, this.hint);
    this.buildTop();
    this.buildPalette();
    lab.onChange = () => this.refresh();
    this.refresh();
    const tick = () => {
      requestAnimationFrame(tick);
      this.drawFootfall();
    };
    tick();
  }

  private buildTop(): void {
    const title = el('div', 'cr-title');
    title.append(el('span', 'cr-logo', 'Creature editor'));
    this.nameInput = el('input', 'cr-name');
    this.nameInput.maxLength = 24;
    this.nameInput.addEventListener('input', () => {
      this.lab.design.name = this.nameInput.value;
    });
    this.nameInput.addEventListener('change', () => this.lab.commit());
    title.append(this.nameInput);

    const modes = el('div', 'cr-modes');
    for (const { mode, label } of MODES) {
      const b = el('button', 'cr-mode', label);
      b.addEventListener('click', () => this.lab.setMode(mode));
      this.modeButtons.set(mode, b);
      modes.append(b);
    }

    const actions = el('div', 'cr-actions');
    this.undoBtn = this.button(actions, '↶', () => this.lab.undo(), 'Undo (Ctrl+Z)');
    this.redoBtn = this.button(actions, '↷', () => this.lab.redo(), 'Redo (Ctrl+Shift+Z)');
    this.button(actions, 'Blob', () => this.lab.setDesign(defaultCreature()), 'Start again from the round four-legged blob');
    this.button(actions, '🎲 Random', () => this.lab.setDesign(randomCreature(Date.now() % 100000)), 'A random creature');
    this.button(
      actions,
      '🌍 Game animal',
      () => {
        const seed = this.rolls++;
        const rng = new Rng(seed * 7919);
        const plan = BODY_PLANS[seed % BODY_PLANS.length]!;
        const form = generateAnimalForm(rng, plan, rng.chance(0.3) ? 'carnivore' : 'herbivore', rng.range(0, 360));
        this.lab.setDesign(designFromAnimal(form, 4, `Species ${seed}`));
      },
      "One of the game's own generated animals, opened in the editor",
    );
    this.button(
      actions,
      '🔗 Share',
      () => {
        this.lab.commit();
        void navigator.clipboard?.writeText(location.href).then(
          () => this.flash('Link copied'),
          () => this.flash('Copy the address bar to share'),
        );
      },
      'Copy a link to this creature',
    );
    this.top.append(title, modes, actions);
  }

  private buildPalette(): void {
    this.palette.append(el('div', 'cr-palette-head', 'Parts'));
    for (const kind of PART_KINDS) {
      const info = PART_LABELS[kind];
      const b = el('button', 'cr-part');
      b.title = `${info.tip}. Click, then click the body (Shift: place more), or drag it onto the body.`;
      b.append(el('span', 'cr-part-icon', info.icon), el('span', 'cr-part-name', info.name));
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (this.lab.placing === kind) this.lab.cancelPlacing();
        else this.lab.startPlacing(kind, true);
      });
      // A click (press and release on the button) leaves the part following the pointer until the body is clicked.
      b.addEventListener('pointerup', () => {
        if (this.lab.placing === kind) this.lab.startPlacing(kind, false);
      });
      this.paletteButtons.set(kind, b);
      this.palette.append(b);
    }
  }

  private button(parent: HTMLElement, label: string, onClick: () => void, title = ''): HTMLButtonElement {
    const b = el('button', 'cr-btn', label);
    if (title) b.title = title;
    b.addEventListener('click', onClick);
    parent.append(b);
    return b;
  }

  private flash(text: string): void {
    const f = el('div', 'cr-flash', text);
    document.body.append(f);
    setTimeout(() => f.remove(), 1600);
  }

  /** Redraws what depends on the lab's state; the inspector only when what it shows changes. */
  private refresh(): void {
    const lab = this.lab;
    for (const [m, b] of this.modeButtons) b.classList.toggle('on', lab.mode === m);
    for (const [k, b] of this.paletteButtons) b.classList.toggle('on', lab.placing === k);
    this.palette.hidden = lab.mode !== 'build';
    this.undoBtn.disabled = !lab.canUndo;
    this.redoBtn.disabled = !lab.canRedo;
    if (document.activeElement !== this.nameInput) this.nameInput.value = lab.design.name;
    const sel = lab.selection;
    const key = `${lab.mode}:${sel ? `${sel.kind}${sel.index}` : '-'}:${lab.design.parts.length}:${lab.design.spine.length}:${lab.placing ?? ''}`;
    if (key !== this.inspectorKey || lab.mode === 'build') this.buildInspector(key);
    this.hint.textContent =
      lab.mode === 'build'
        ? lab.placing
          ? `Move over the body to place the ${PART_LABELS[lab.placing].name.toLowerCase()}; click to stick it on (Shift: keep placing), Esc to cancel.`
          : 'Drag the green dots (spine) to shape the body, wheel over one to fatten it (Shift: widen). Pull an end dot out to grow the spine. Drag a yellow dot to move a part, wheel to resize; drag the pink elbow and hand dots to pose an arm. Drag empty space to turn the view.'
        : lab.mode === 'paint'
          ? 'Paint on the body with the brush; it paints both sides when mirrored. Pick the coat on the right.'
          : 'Space: walk or stand. The legs step in a wave from back to front, the two sides half a stride apart; faster, the wave closes up into a trot.';
  }

  /** The inspector, rebuilt (cheap) while a slider isn't being dragged. */
  private buildInspector(key: string): void {
    const active = document.activeElement;
    if (active instanceof HTMLInputElement && this.inspector.contains(active) && key === this.inspectorKey) {
      // Keep the control being used; just refresh nothing.
      return;
    }
    this.inspectorKey = key;
    this.inspector.replaceChildren();
    this.footfall = null;
    this.gaitText = null;
    const lab = this.lab;
    if (lab.mode === 'build') this.buildInspectorBuild();
    else if (lab.mode === 'paint') this.buildInspectorPaint();
    else this.buildInspectorPlay();
  }

  private section(title: string): HTMLElement {
    const s = el('div', 'cr-section');
    s.append(el('div', 'cr-section-head', title));
    this.inspector.append(s);
    return s;
  }

  private slider(parent: HTMLElement, label: string, min: number, max: number, step: number, get: () => number, set: (v: number) => void, after: () => void = () => this.lab.changed()): void {
    const row = el('label', 'cr-row');
    row.append(el('span', 'cr-label', label));
    const input = el('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(get());
    const out = el('span', 'cr-value', get().toFixed(2));
    input.addEventListener('input', () => {
      set(Number(input.value));
      out.textContent = Number(input.value).toFixed(2);
      after();
    });
    input.addEventListener('change', () => this.lab.commit());
    row.append(input, out);
    parent.append(row);
  }

  private color(parent: HTMLElement, label: string, get: () => string, set: (v: string) => void): void {
    const row = el('label', 'cr-row');
    row.append(el('span', 'cr-label', label));
    const input = el('input');
    input.type = 'color';
    input.value = get();
    input.addEventListener('input', () => {
      set(input.value);
      this.lab.changed();
    });
    input.addEventListener('change', () => this.lab.commit());
    row.append(input);
    parent.append(row);
  }

  private check(parent: HTMLElement, label: string, get: () => boolean, set: (v: boolean) => void): void {
    const row = el('label', 'cr-row cr-check');
    const input = el('input');
    input.type = 'checkbox';
    input.checked = get();
    input.addEventListener('change', () => {
      set(input.checked);
      this.lab.changed();
      this.lab.commit();
    });
    row.append(input, el('span', 'cr-label', label));
    parent.append(row);
  }

  private buildInspectorBuild(): void {
    const lab = this.lab;
    const d = lab.design;
    const sel = lab.selection;
    if (sel?.kind === 'vertebra' && d.spine[sel.index]) {
      const v = d.spine[sel.index]!;
      const s = this.section(`Vertebra ${sel.index + 1} of ${d.spine.length}`);
      this.slider(s, 'Girth', 0.04, 2.5, 0.01, () => v.r, (x) => (v.r = x));
      this.slider(s, 'Width', 0.4, 2.5, 0.01, () => v.w, (x) => (v.w = x));
      const row = el('div', 'cr-buttons');
      this.button(row, '+ Add after', () => lab.addVertebra());
      this.button(row, 'Remove', () => lab.deleteSelection()).disabled = d.spine.length <= 3;
      s.append(row);
    } else if (sel?.kind === 'part' && d.parts[sel.index]) {
      const p = d.parts[sel.index]!;
      const info = PART_LABELS[p.kind];
      const s = this.section(`${info.icon} ${info.name}`);
      this.slider(s, 'Size', 0.25, 3, 0.01, () => p.size, (x) => (p.size = x));
      if (p.kind !== 'eye' && p.kind !== 'arm') this.slider(s, p.kind === 'leg' ? 'Reach fore/aft' : 'Lean', -1, 1, 0.01, () => p.tilt, (x) => (p.tilt = x));
      if (p.kind === 'leg') this.slider(s, 'Sprawl', 0, 1, 0.01, () => p.spread, (x) => (p.spread = x));
      if (p.kind === 'arm') {
        s.append(el('div', 'cr-note', 'Three nodes: the yellow dot where it sits on the body, the pink elbow and the pink hand. Drag them to pose the arm; the wheel over one thickens it.'));
        const r = el('div', 'cr-buttons');
        this.button(r, 'Reset arm pose', () => {
          delete p.elbow;
          delete p.hand;
          lab.changed();
          lab.commit();
        });
        s.append(r);
      }
      this.slider(s, 'Along body', -0.06, 1.06, 0.001, () => p.s, (x) => (p.s = x));
      this.slider(s, 'Round body', -Math.PI, Math.PI, 0.01, () => p.theta, (x) => (p.theta = x));
      this.check(s, 'Mirrored pair', () => p.mirror, (x) => (p.mirror = x));
      const row = el('div', 'cr-buttons');
      this.button(row, 'Duplicate', () => {
        const copy: CreaturePart = { ...p, s: Math.min(1, p.s + 0.08) };
        d.parts.push(copy);
        lab.selection = { kind: 'part', index: d.parts.length - 1 };
        lab.changed();
        lab.commit();
      });
      this.button(row, 'Remove', () => lab.deleteSelection());
      s.append(row);
    } else {
      const s = this.section('Body');
      const legs = d.parts.filter((p) => p.kind === 'leg').reduce((n, p) => n + (p.mirror && Math.abs(Math.sin(p.theta)) > 0.06 ? 2 : 1), 0);
      s.append(el('div', 'cr-note', `${d.spine.length} vertebrae, ${d.parts.length} parts, ${legs} legs.`));
      s.append(el('div', 'cr-note', 'Select a green dot (vertebra) or a yellow one (part) to edit it.'));
      const row = el('div', 'cr-buttons');
      this.button(row, '+ Vertebra at the snout', () => lab.addVertebra());
      s.append(row);
    }
    const views = this.section('View');
    const row = el('div', 'cr-buttons');
    for (const v of ['side', 'front', 'top', 'three-quarter'] as const) this.button(row, v, () => lab.look(v));
    views.append(row);
  }

  private buildInspectorPaint(): void {
    const lab = this.lab;
    const p = lab.design.paint;
    const coat = this.section('Coat');
    this.color(coat, 'Back', () => p.base, (v) => (p.base = v));
    this.color(coat, 'Belly', () => p.belly, (v) => (p.belly = v));
    const row = el('label', 'cr-row');
    row.append(el('span', 'cr-label', 'Pattern'));
    const select = el('select');
    for (const pat of COAT_PATTERNS) {
      const o = el('option', '', pat);
      o.value = pat;
      select.append(o);
    }
    select.value = p.pattern;
    select.addEventListener('change', () => {
      p.pattern = select.value as CoatPattern;
      lab.changed();
      lab.commit();
    });
    row.append(select);
    coat.append(row);
    this.color(coat, 'Pattern colour', () => p.patternColor, (v) => (p.patternColor = v));
    this.slider(coat, 'Pattern size', 0.5, 4, 0.05, () => p.patternScale, (v) => (p.patternScale = v));
    this.color(coat, 'Horns & claws', () => p.accent, (v) => (p.accent = v));
    this.color(coat, 'Eyes', () => p.eye, (v) => (p.eye = v));
    const rb = el('div', 'cr-buttons');
    this.button(rb, '🎲 Random coat', () => {
      lab.design.paint = randomPaint(new Rng(Date.now() % 1e6));
      lab.changed();
      lab.commit();
    });
    coat.append(rb);

    const brush = this.section('Brush');
    const b = lab.brush;
    this.color(brush, 'Colour', () => b.color, (v) => (b.color = v));
    this.slider(brush, 'Size', 0.01, 0.12, 0.001, () => b.size, (v) => (b.size = v), () => {});
    this.slider(brush, 'Hardness', 0, 0.95, 0.01, () => b.hardness, (v) => (b.hardness = v), () => {});
    this.check(brush, 'Mirror across the body', () => b.mirror, (v) => (b.mirror = v));
    const swatches = el('div', 'cr-swatches');
    for (const c of ['#ffd23f', '#ff6b6b', '#ffffff', '#222233', '#7a3cff', '#3ddc97', '#ff9f1c', '#2ec4f1']) {
      const sw = el('button', 'cr-swatch');
      sw.style.background = c;
      sw.title = c;
      sw.addEventListener('click', () => {
        b.color = c;
        this.inspectorKey = '';
        this.refresh();
      });
      swatches.append(sw);
    }
    brush.append(swatches);
    brush.append(el('div', 'cr-note', `${lab.design.splats.length} dabs painted.`));
    const cb = el('div', 'cr-buttons');
    this.button(cb, 'Clear paint', () => {
      lab.design.splats = [];
      lab.changed();
      lab.commit();
    });
    brush.append(cb);
  }

  private buildInspectorPlay(): void {
    const lab = this.lab;
    const s = this.section('Walk');
    const row = el('div', 'cr-buttons');
    this.button(row, lab.walking ? '⏸ Stand' : '▶ Walk', () => {
      lab.walking = !lab.walking;
      this.inspectorKey = '';
      this.refresh();
    });
    s.append(row);
    this.slider(s, 'Walk ↔ trot', 0, 1, 0.01, () => lab.run, (v) => (lab.run = v), () => {});
    this.gaitText = el('div', 'cr-note');
    s.append(this.gaitText);
    const f = this.section('Footfalls');
    this.footfall = el('canvas', 'cr-footfall');
    this.footfall.width = 260;
    this.footfall.height = 120;
    f.append(this.footfall);
    f.append(el('div', 'cr-note', 'One row per leg, front to back (L/R, 1 the front pair): dark while its foot is on the ground, over two strides. The line is now.'));
  }

  private drawFootfall(): void {
    const c = this.footfall;
    if (!c) return;
    const lab = this.lab;
    const rows = lab.footfalls();
    const g = lab.gait();
    if (this.gaitText) {
      const legs = rows.length;
      this.gaitText.textContent = legs === 0 ? `No legs: it slithers, a wave running down its spine. ${g.speed.toFixed(2)} units/s.` : `${legs} legs, hips ${g.hip.toFixed(2)} up. Stride ${g.stride.toFixed(2)}, ${g.speed.toFixed(2)} units/s, each foot down ${(g.duty * 100).toFixed(0)}% of a stride (${g.duty > 0.5 ? 'a walk' : 'a run'}).`;
    }
    const x = c.getContext('2d')!;
    const w = c.width;
    const h = c.height;
    x.clearRect(0, 0, w, h);
    if (rows.length === 0) return;
    const labelW = 26;
    const rowH = Math.min(18, (h - 4) / rows.length);
    const strides = 2;
    const span = w - labelW - 4;
    x.font = '11px system-ui, sans-serif';
    x.textBaseline = 'middle';
    rows.forEach((r, i) => {
      const y = 2 + i * rowH;
      x.fillStyle = 'rgba(255,255,255,0.08)';
      x.fillRect(labelW, y + 2, span, rowH - 4);
      x.fillStyle = '#cfe';
      x.fillText(r.label, 2, y + rowH / 2);
      // Stance: from the foot's touchdown (stride phase 0) for the duty factor; drawn over two strides, oldest at the left.
      x.fillStyle = '#66ffcc';
      const start = Math.floor(g.cycle) - 1;
      for (let k = start; k <= start + strides + 1; k++) {
        const t0 = k - r.phase;
        const t1 = t0 + g.duty;
        const a = Math.max(0, (t0 - (g.cycle - strides / 2)) / strides);
        const b = Math.min(1, (t1 - (g.cycle - strides / 2)) / strides);
        if (b > a) x.fillRect(labelW + a * span, y + 2, (b - a) * span, rowH - 4);
      }
    });
    x.fillStyle = '#fff';
    x.fillRect(labelW + span / 2 - 1, 0, 2, h);
  }
}

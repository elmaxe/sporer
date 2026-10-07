import { CORE_KINDS, HULL_FINISHES, HULL_PATTERNS, MAX_COMPLEXITY, MAX_RADIAL, SHIP_CATEGORIES, SHIP_PARTS, SHIP_PART_KINDS, defaultShip, onMiddleLine, randomShip, type HullFinish, type HullPattern, type ShipCategory, type ShipPaint, type ShipPartKind } from '../gen/ship';
import type { ShipLab, ShipMode } from './ShipLab';

/*
 * The spaceship editor's controls, plain DOM (the creature editor's look,
 * creature.css, plus ship.css): a top bar (modes, undo, new ships, share,
 * the complexity meter), the parts palette on the left in Build mode (a tab
 * per category, as Spore's), and an inspector on the right for the
 * symmetry and the selected part, the paint, or the test flight.
 */

const PART_LABELS: Record<ShipPartKind, { icon: string; name: string; tip: string }> = {
  saucer: { icon: '🛸', name: 'Saucer', tip: 'A flat disc hull' },
  sphere: { icon: '⚪', name: 'Sphere', tip: 'A ball hull' },
  pod: { icon: '💊', name: 'Pod', tip: 'A long rounded hull, lying along the ship' },
  cone: { icon: '🔺', name: 'Cone', tip: 'A pointed nose or tail, lying along the ship' },
  block: { icon: '🧱', name: 'Block', tip: 'A boxy hull section' },
  ring: { icon: '⭕', name: 'Ring', tip: 'A ring that turns in flight' },
  dome: { icon: '🫧', name: 'Dome', tip: 'A round glass cockpit' },
  canopy: { icon: '🥚', name: 'Canopy', tip: 'A long glass cockpit' },
  wing: { icon: '🪽', name: 'Wing', tip: 'A swept wing with a light at its tip' },
  fin: { icon: '🦈', name: 'Fin', tip: 'A tail fin' },
  engine: { icon: '🚀', name: 'Engine', tip: 'Pushes backwards wherever it is stuck; burns in flight' },
  thruster: { icon: '🔥', name: 'Thruster', tip: 'A lift jet, pointing out of the surface' },
  cannon: { icon: '🔫', name: 'Cannon', tip: 'Twin barrels pointing forwards' },
  light: { icon: '💡', name: 'Light', tip: 'A blinking light' },
  antenna: { icon: '📡', name: 'Antenna', tip: 'A mast with a beacon' },
  dish: { icon: '🥣', name: 'Dish', tip: 'A sensor dish' },
  grabber: { icon: '🦀', name: 'Grabber', tip: 'A three-pronged claw' },
};

const CATEGORY_LABELS: Record<ShipCategory, string> = { body: 'Body', cockpit: 'Cockpit', wings: 'Wings', power: 'Power', weapons: 'Weapons', details: 'Details' };

const MODES: { mode: ShipMode; label: string }[] = [
  { mode: 'build', label: 'Build' },
  { mode: 'paint', label: 'Paint' },
  { mode: 'fly', label: 'Fly' },
];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

export class ShipPanel {
  private readonly top = el('div', 'cr-top');
  private readonly palette = el('div', 'cr-palette sh-palette');
  private readonly inspector = el('div', 'cr-inspector');
  private readonly hint = el('div', 'cr-hint');
  private readonly modeButtons = new Map<ShipMode, HTMLButtonElement>();
  private readonly paletteButtons = new Map<ShipPartKind, HTMLButtonElement>();
  private readonly tabButtons = new Map<ShipCategory, HTMLButtonElement>();
  private readonly paletteList = el('div', 'sh-parts');
  private category: ShipCategory = 'body';
  private undoBtn!: HTMLButtonElement;
  private redoBtn!: HTMLButtonElement;
  private nameInput!: HTMLInputElement;
  private meter!: HTMLElement;
  private meterFill!: HTMLElement;
  private inspectorKey = '';

  constructor(
    root: HTMLElement,
    private readonly lab: ShipLab,
  ) {
    root.append(this.top, this.palette, this.inspector, this.hint);
    this.buildTop();
    this.buildPalette();
    lab.onChange = () => this.refresh();
    this.refresh();
  }

  private buildTop(): void {
    const title = el('div', 'cr-title');
    title.append(el('span', 'cr-logo', 'Spaceship editor'));
    this.nameInput = el('input', 'cr-name');
    this.nameInput.maxLength = 24;
    this.nameInput.addEventListener('input', () => {
      this.lab.design.name = this.nameInput.value;
    });
    this.nameInput.addEventListener('change', () => this.lab.commit());
    title.append(this.nameInput);
    this.meter = el('div', 'sh-meter');
    this.meter.title = 'Complexity: every copy of every part counts. A full ship takes no more parts.';
    this.meterFill = el('div', 'sh-meter-fill');
    this.meter.append(this.meterFill);
    title.append(this.meter);

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
    this.button(actions, 'Saucer', () => this.lab.setDesign(defaultShip()), "Start again from the game's own saucer");
    this.button(actions, '🎲 Random', () => this.lab.setDesign(randomShip(Date.now() % 100000)), 'A random ship');
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
      'Copy a link to this ship',
    );
    this.top.append(title, modes, actions);
  }

  private buildPalette(): void {
    const tabs = el('div', 'sh-tabs');
    for (const c of SHIP_CATEGORIES) {
      const b = el('button', 'sh-tab', CATEGORY_LABELS[c]);
      b.addEventListener('click', () => {
        this.category = c;
        this.fillPalette();
      });
      this.tabButtons.set(c, b);
      tabs.append(b);
    }
    this.palette.append(tabs, this.paletteList);
    this.fillPalette();
  }

  private fillPalette(): void {
    for (const [c, b] of this.tabButtons) b.classList.toggle('on', c === this.category);
    this.paletteList.replaceChildren();
    this.paletteButtons.clear();
    for (const kind of SHIP_PART_KINDS.filter((k) => SHIP_PARTS[k].category === this.category)) {
      const info = PART_LABELS[kind];
      const b = el('button', 'cr-part');
      b.title = `${info.tip}. Click, then click the ship (Shift: place more), or drag it onto the ship.`;
      b.append(el('span', 'cr-part-icon', info.icon), el('span', 'cr-part-name', info.name));
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (this.lab.placing === kind) this.lab.cancelPlacing();
        else this.lab.startPlacing(kind, true);
      });
      b.addEventListener('pointerup', () => {
        if (this.lab.placing === kind) this.lab.startPlacing(kind, false);
      });
      this.paletteButtons.set(kind, b);
      this.paletteList.append(b);
    }
    this.refresh();
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

  private refresh(): void {
    const lab = this.lab;
    if (!this.undoBtn) return;
    for (const [m, b] of this.modeButtons) b.classList.toggle('on', lab.mode === m);
    for (const [k, b] of this.paletteButtons) b.classList.toggle('on', lab.placing === k);
    this.palette.hidden = lab.mode !== 'build';
    this.undoBtn.disabled = !lab.canUndo;
    this.redoBtn.disabled = !lab.canRedo;
    if (document.activeElement !== this.nameInput) this.nameInput.value = lab.design.name;
    const c = lab.complexity;
    this.meterFill.style.width = `${Math.min(100, (c / MAX_COMPLEXITY) * 100)}%`;
    this.meter.classList.toggle('full', c >= MAX_COMPLEXITY);
    this.meter.dataset.label = `${c} / ${MAX_COMPLEXITY}`;
    const sel = lab.selection;
    const key = `${lab.mode}:${sel ?? '-'}:${lab.design.parts.length}:${lab.placing ?? ''}:${lab.design.parts.filter((p) => p.paint).length}`;
    this.buildInspector(key);
    this.hint.textContent =
      lab.mode === 'build'
        ? lab.placing
          ? `Move over the ship to place the ${PART_LABELS[lab.placing].name.toLowerCase()}; click to stick it on (Shift: keep placing), Esc to cancel.`
          : 'Pick a part on the left and stick it anywhere on the ship. Drag a part to move it, wheel over it to resize (Shift: stretch), Q/E spin, R/F tilt, T/G lean, Alt-drag clones, Delete removes. M mirrors new parts, [ ] copies them round the ship. Drag empty space to turn the view.'
        : lab.mode === 'paint'
          ? 'Click a part to paint it with the bucket (Shift: every part of that kind). The ship colours and hull pattern are on the right.'
          : 'WASD or the arrows steer and bank, Shift boosts. Drag to look around.';
  }

  /** The inspector, rebuilt when what it shows changes, but not under a control being used. */
  private buildInspector(key: string): void {
    const active = document.activeElement;
    if (active instanceof HTMLInputElement && this.inspector.contains(active) && key === this.inspectorKey) return;
    if (key === this.inspectorKey && this.lab.mode !== 'build') return;
    this.inspectorKey = key;
    this.inspector.replaceChildren();
    if (this.lab.mode === 'build') this.buildInspectorBuild();
    else if (this.lab.mode === 'paint') this.buildInspectorPaint();
    else this.buildInspectorFly();
  }

  private section(title: string): HTMLElement {
    const s = el('div', 'cr-section');
    s.append(el('div', 'cr-section-head', title));
    this.inspector.append(s);
    return s;
  }

  private slider(parent: HTMLElement, label: string, min: number, max: number, step: number, get: () => number, set: (v: number) => void, after: () => void = () => this.lab.changed(), digits = 2): void {
    const row = el('label', 'cr-row');
    row.append(el('span', 'cr-label', label));
    const input = el('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(get());
    const out = el('span', 'cr-value', get().toFixed(digits));
    input.addEventListener('input', () => {
      set(Number(input.value));
      out.textContent = Number(input.value).toFixed(digits);
      after();
    });
    input.addEventListener('change', () => this.lab.commit());
    row.append(input, out);
    parent.append(row);
  }

  private color(parent: HTMLElement, label: string, get: () => string, set: (v: string) => void, commit = true): void {
    const row = el('label', 'cr-row');
    row.append(el('span', 'cr-label', label));
    const input = el('input');
    input.type = 'color';
    input.value = get();
    input.addEventListener('input', () => {
      set(input.value);
      if (commit) this.lab.changed();
    });
    input.addEventListener('change', () => {
      if (commit) this.lab.commit();
    });
    row.append(input);
    parent.append(row);
  }

  private check(parent: HTMLElement, label: string, get: () => boolean, set: (v: boolean) => void, after: () => void = () => {
    this.lab.changed();
    this.lab.commit();
  }): void {
    const row = el('label', 'cr-row cr-check');
    const input = el('input');
    input.type = 'checkbox';
    input.checked = get();
    input.addEventListener('change', () => {
      set(input.checked);
      after();
    });
    row.append(input, el('span', 'cr-label', label));
    parent.append(row);
  }

  private select<T extends string>(parent: HTMLElement, label: string, options: readonly T[], get: () => T, set: (v: T) => void, names: (v: T) => string = (v) => v): void {
    const row = el('label', 'cr-row');
    row.append(el('span', 'cr-label', label));
    const s = el('select');
    for (const o of options) {
      const opt = el('option', '', names(o));
      opt.value = o;
      s.append(opt);
    }
    s.value = get();
    s.addEventListener('change', () => {
      set(s.value as T);
      this.lab.changed();
      this.lab.commit();
    });
    row.append(s);
    parent.append(row);
  }

  private buildInspectorBuild(): void {
    const lab = this.lab;
    const d = lab.design;
    const sym = this.section('Symmetry for new parts');
    const symRow = el('div', 'cr-buttons');
    const symButtons: [string, boolean, number, string][] = [
      ['Off', false, 1, 'Single parts'],
      ['Mirror', true, 1, 'Pairs, mirrored across the middle (M)'],
      ['Radial', false, Math.max(3, lab.symmetry.radial), 'Copies round the ship ([ and ])'],
      ['Both', true, Math.max(2, lab.symmetry.radial), 'Mirrored pairs, copied round the ship'],
    ];
    for (const [label, mirror, radial, tip] of symButtons) {
      const on = lab.symmetry.mirror === mirror && (radial > 1) === (lab.symmetry.radial > 1);
      const b = this.button(symRow, label, () => {
        lab.symmetry.mirror = mirror;
        lab.symmetry.radial = radial;
        this.inspectorKey = '';
        this.refresh();
      }, tip);
      b.classList.toggle('on', on);
    }
    sym.append(symRow);
    if (lab.symmetry.radial > 1) this.slider(sym, 'Copies', 2, MAX_RADIAL, 1, () => lab.symmetry.radial, (v) => (lab.symmetry.radial = v), () => {}, 0);

    const sel = lab.selection;
    const p = sel !== null ? d.parts[sel] : undefined;
    if (p && sel !== null) {
      const info = PART_LABELS[p.kind];
      const s = this.section(sel === 0 ? `Core: ${info.name}` : `${info.icon} ${info.name}`);
      if (sel === 0) this.select(s, 'Shape', CORE_KINDS, () => p.kind, (v) => (p.kind = v), (v) => PART_LABELS[v].name);
      this.slider(s, 'Size', 0.15, 4, 0.01, () => p.size, (x) => (p.size = x));
      this.slider(s, 'Stretch', 0.3, 4, 0.01, () => p.stretch, (x) => (p.stretch = x));
      if (sel > 0) {
        this.slider(s, SHIP_PARTS[p.kind].mount === 'axial' ? 'Roll' : 'Spin', -Math.PI, Math.PI, 0.01, () => p.spin, (x) => (p.spin = x));
        const axial = SHIP_PARTS[p.kind].mount === 'axial';
        this.slider(s, axial ? 'Pitch' : 'Tilt', -Math.PI / 2, Math.PI / 2, 0.01, () => p.tilt, (x) => (p.tilt = x));
        this.slider(s, axial ? 'Yaw' : 'Lean', -Math.PI / 2, Math.PI / 2, 0.01, () => p.lean, (x) => (p.lean = x));
        this.check(s, onMiddleLine(p) ? 'Mirrored (on the middle line: single)' : 'Mirrored pair', () => p.mirror, (x) => (p.mirror = x));
        this.slider(s, 'Copies round', 1, MAX_RADIAL, 1, () => p.radial, (x) => (p.radial = x), () => lab.changed(), 0);
        const row = el('div', 'cr-buttons');
        this.button(row, 'Duplicate', () => lab.duplicateSelection(), 'Ctrl+D, or Alt-drag the part');
        this.button(row, 'Remove', () => lab.deleteSelection(), 'Delete: the part and everything on it');
        if (p.paint) this.button(row, 'Clear its paint', () => {
          delete p.paint;
          lab.changed();
          lab.commit();
        });
        s.append(row);
        const turn = el('div', 'cr-buttons');
        this.button(turn, '⟲ Q', () => lab.turnSelection(-1, 0));
        this.button(turn, '⟳ E', () => lab.turnSelection(1, 0));
        this.button(turn, '↥ R', () => lab.turnSelection(0, 1));
        this.button(turn, '↧ F', () => lab.turnSelection(0, -1));
        this.button(turn, '⤺ T', () => lab.turnSelection(0, 0, 1));
        this.button(turn, '⤻ G', () => lab.turnSelection(0, 0, -1));
        s.append(turn);
      } else s.append(el('div', 'cr-note', 'The core: everything is built onto it. Pick its shape and size; parts on it move out or in with its surface as it grows.'));
    } else {
      const s = this.section('Ship');
      s.append(el('div', 'cr-note', `${d.parts.length} parts, drawn as ${lab.complexity} pieces (most ${MAX_COMPLEXITY}).`));
      s.append(el('div', 'cr-note', 'Click a part to select it; click the core to change its shape.'));
    }
    const views = this.section('View');
    const row = el('div', 'cr-buttons');
    for (const v of ['three-quarter', 'side', 'front', 'back', 'top', 'below'] as const) this.button(row, v, () => lab.look(v));
    views.append(row);
  }

  private buildInspectorPaint(): void {
    const lab = this.lab;
    const p = lab.design.paint;
    const scheme = this.section('Ship colours');
    const channels: [keyof ShipPaint, string][] = [
      ['base', 'Hull'],
      ['trim', 'Trim'],
      ['detail', 'Machinery'],
      ['glass', 'Glass'],
      ['glow', 'Lights'],
    ];
    for (const [k, label] of channels) this.color(scheme, label, () => p[k] as string, (v) => ((p[k] as string) = v));
    this.select<HullFinish>(scheme, 'Finish', HULL_FINISHES, () => p.finish, (v) => (p.finish = v));
    this.select<HullPattern>(scheme, 'Hull pattern', HULL_PATTERNS, () => p.pattern, (v) => (p.pattern = v));
    this.slider(scheme, 'Pattern size', 0.3, 3, 0.05, () => p.patternScale, (v) => (p.patternScale = v));
    const rb = el('div', 'cr-buttons');
    this.button(rb, '🎲 Random colours', () => {
      lab.design.paint = randomShip(Date.now() % 100000).paint;
      lab.changed();
      lab.commit();
    });
    scheme.append(rb);

    const bucket = this.section('Paint bucket');
    const b = lab.bucket;
    const slots = el('div', 'cr-buttons');
    for (const slot of ['base', 'trim'] as const) {
      const btn = this.button(slots, slot === 'base' ? 'Hull' : 'Trim', () => {
        b.slot = slot;
        this.inspectorKey = '';
        this.refresh();
      });
      btn.classList.toggle('on', b.slot === slot);
    }
    bucket.append(slots);
    this.color(bucket, 'Colour', () => b.color, (v) => (b.color = v), false);
    const swatches = el('div', 'cr-swatches');
    for (const c of ['#e8505b', '#ffd23f', '#f2f2f2', '#22252e', '#7a3cff', '#3ddc97', '#ff9f1c', '#2ec4f1', '#b9c3cf', '#3d6fb6']) {
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
    bucket.append(swatches);
    const painted = lab.design.parts.filter((x) => x.paint).length;
    bucket.append(el('div', 'cr-note', `${painted} part${painted === 1 ? '' : 's'} with paint of their own.`));
    const cb = el('div', 'cr-buttons');
    this.button(cb, 'Clear part paint', () => {
      for (const x of lab.design.parts) delete x.paint;
      lab.changed();
      lab.commit();
    });
    bucket.append(cb);
  }

  private buildInspectorFly(): void {
    const lab = this.lab;
    const s = this.section('Test flight');
    this.slider(s, 'Throttle', 0, 1, 0.01, () => lab.throttle, (v) => (lab.throttle = v), () => {});
    const counts = new Map<ShipPartKind, number>();
    for (const p of lab.design.parts) counts.set(p.kind, (counts.get(p.kind) ?? 0) + 1);
    const engines = (counts.get('engine') ?? 0) + (counts.get('thruster') ?? 0);
    s.append(el('div', 'cr-note', engines ? 'Engines burn with the throttle; Shift boosts.' : 'No engines: add some in Build (Power) to see them burn.'));
    const views = el('div', 'cr-buttons');
    for (const v of ['chase', 'side', 'front', 'below'] as const) this.button(views, v, () => lab.look(v));
    s.append(views);
  }
}

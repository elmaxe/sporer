import type { Entity } from '../core/Entity';
import type { Game } from '../core/Game';
import type { Level } from '../levels/Level';
import { frozenStats, resetFrozenStats, setViewFrozen, viewFreeze } from '../world/viewFreeze';

const KEY = 'KeyF';

/**
 * The Freeze switch (#graphics-freeze in the menu, or F; see
 * world/viewFreeze.ts): holds what is drawn as the camera saw it then, while
 * the camera moves on. While frozen, a note at the top (#freeze-note) says so
 * and how many objects the frozen frustum left out. Not saved: a new level
 * (another system, low orbit, the galaxy) thaws it. A global entity, so it
 * reads each frame's counts whatever the level.
 */
export class ViewFreezeControl implements Entity {
  private readonly button = document.getElementById('graphics-freeze') as HTMLButtonElement | null;
  private readonly note: HTMLElement;
  private level: Level | null = null;
  private text = '';

  constructor(private readonly game: Game) {
    this.note = document.getElementById('freeze-note') ?? document.body.appendChild(Object.assign(document.createElement('div'), { id: 'freeze-note' }));
    this.button?.addEventListener('click', this.onToggle);
    window.addEventListener('keydown', this.onKey);
    this.render();
  }

  get frozen(): boolean {
    return viewFreeze.enabled;
  }

  set frozen(on: boolean) {
    setViewFrozen(on);
    this.level = this.game.level;
    this.render();
  }

  update(): void {
    if (!viewFreeze.enabled) return;
    if (this.game.level !== this.level) {
      this.frozen = false;
      return;
    }
    // Last frame's counts (this runs before the level draws).
    const { tested, culled } = frozenStats;
    resetFrozenStats();
    const key = this.game.input.touchMode ? 'the menu' : 'F';
    const text = `View frozen (${key} to thaw) · frustum culls ${culled} of ${tested}`;
    if (text !== this.text) this.note.textContent = this.text = text;
  }

  dispose(): void {
    this.frozen = false;
    this.button?.removeEventListener('click', this.onToggle);
    window.removeEventListener('keydown', this.onKey);
    this.note.remove();
  }

  private render(): void {
    const on = viewFreeze.enabled;
    this.note.hidden = !on;
    if (on) this.note.textContent = this.text = 'View frozen';
    if (!this.button) return;
    this.button.textContent = `Freeze view: ${on ? 'on' : 'off'}`;
    this.button.setAttribute('aria-pressed', String(on));
  }

  private onToggle = () => {
    this.frozen = !viewFreeze.enabled;
  };

  private onKey = (e: KeyboardEvent) => {
    if (e.code !== KEY || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
    this.onToggle();
  };
}

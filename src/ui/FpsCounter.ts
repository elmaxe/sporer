import type { Entity } from '../core/Entity';
import { FpsWindow } from './fps';

const STORAGE_KEY = 'spore2.fps';

/**
 * The FPS counter (#fps, top centre; bottom centre on touch, between the
 * stick and the buttons): frames per second and the longest frame, twice a
 * second. Off by default; the menu's Show FPS button (#menu-fps) and the
 * lab's panel turn it on, remembered in localStorage (shared by the game and
 * the lab). A global entity, so it counts every drawn frame whatever the level,
 * paused or not.
 */
export class FpsCounter implements Entity {
  private readonly el: HTMLElement;
  private readonly button = document.getElementById('menu-fps') as HTMLButtonElement | null;
  private readonly meter = new FpsWindow();
  private _shown = load();

  constructor() {
    this.el = document.getElementById('fps') ?? document.body.appendChild(Object.assign(document.createElement('div'), { id: 'fps' }));
    this.button?.addEventListener('click', this.onToggle);
    this.render();
  }

  get shown(): boolean {
    return this._shown;
  }

  set shown(shown: boolean) {
    this._shown = shown;
    save(shown);
    this.render();
  }

  update(): void {
    if (!this._shown || !this.meter.frame(performance.now())) return;
    this.el.textContent = `${Math.round(this.meter.fps)} FPS · longest ${Math.round(this.meter.longestMs)} ms`;
  }

  dispose(): void {
    this.button?.removeEventListener('click', this.onToggle);
    this.el.remove();
  }

  private render(): void {
    this.el.hidden = !this._shown;
    if (this._shown && !this.el.textContent) this.el.textContent = '… FPS';
    if (!this.button) return;
    this.button.textContent = this._shown ? 'Hide FPS' : 'Show FPS';
    this.button.setAttribute('aria-pressed', String(this._shown));
  }

  private onToggle = () => {
    this.shown = !this._shown;
  };
}

function load(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

function save(shown: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, shown ? 'on' : 'off');
  } catch {
    // Storage blocked (private mode etc.): the setting just won't persist.
  }
}

import type { Game } from '../core/Game';
import { bodyLabLink } from '../lab/bodyLink';
import type { SceneManager } from '../levels/SceneManager';
import { Planet } from '../world/Planet';

/**
 * The menu (#menu in index.html): Esc or the menu button (bottom right, the
 * only way in on touch) opens it and pauses the game (time stands still, the
 * view stays drawn). It holds the sound settings (VolumeControl), the graphics
 * settings (GraphicsSettings: weather on or off) and a link
 * to the planet lab, for the planet you're at: in low orbit the one below,
 * in a system the one the autopilot is headed for (else the first planet),
 * from the galaxy an empty lab. Esc, Resume, × or a click beside the panel
 * closes it.
 */
export class GameMenu {
  private readonly root = document.getElementById('menu')!;
  private readonly toggle = document.getElementById('menu-toggle') as HTMLButtonElement;
  private readonly resume = document.getElementById('menu-resume') as HTMLButtonElement;
  private readonly close = document.getElementById('menu-close') as HTMLButtonElement;
  private readonly lab = document.getElementById('menu-lab') as HTMLAnchorElement;

  constructor(
    private readonly game: Game,
    private readonly levels: SceneManager,
  ) {
    this.toggle.addEventListener('click', this.onToggle);
    this.resume.addEventListener('click', this.onClose);
    this.close.addEventListener('click', this.onClose);
    this.root.addEventListener('click', this.onBackdrop);
    window.addEventListener('keydown', this.onKey);
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(): void {
    if (this.isOpen) return;
    const body = this.labBody();
    this.lab.href = body ? bodyLabLink(body) : new URL('lab.html', location.href).href;
    this.lab.textContent = body ? `Open ${body.name} in the planet lab` : 'Open the planet lab';
    this.root.hidden = false;
    this.toggle.setAttribute('aria-expanded', 'true');
    this.game.paused = true;
    this.resume.focus({ preventScroll: true });
  }

  hide(): void {
    if (!this.isOpen) return;
    this.root.hidden = true;
    this.toggle.setAttribute('aria-expanded', 'false');
    this.game.paused = false;
    // Keys pressed in the menu (a focused button) mustn't linger as focus for Space or Enter.
    (document.activeElement as HTMLElement | null)?.blur();
  }

  dispose(): void {
    this.hide();
    this.toggle.removeEventListener('click', this.onToggle);
    this.resume.removeEventListener('click', this.onClose);
    this.close.removeEventListener('click', this.onClose);
    this.root.removeEventListener('click', this.onBackdrop);
    window.removeEventListener('keydown', this.onKey);
  }

  /** The planet or moon the lab link shows, if any. */
  private labBody(): Planet | null {
    const { levels } = this;
    if (levels.mode === 'planet') return levels.planetLevel?.body ?? null;
    if (levels.mode !== 'system') return null;
    const { ship, world } = levels.systemLevel;
    return ship.targetBody instanceof Planet ? ship.targetBody : (world.planets[0] ?? null);
  }

  private onToggle = () => (this.isOpen ? this.hide() : this.open());

  private onClose = () => this.hide();

  private onBackdrop = (e: MouseEvent) => {
    if (e.target === this.root) this.hide();
  };

  private onKey = (e: KeyboardEvent) => {
    if (e.code !== 'Escape' || e.repeat) return;
    e.preventDefault();
    this.onToggle();
  };
}

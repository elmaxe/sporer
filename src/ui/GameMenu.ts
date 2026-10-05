import type { Game } from '../core/Game';
import { DEFAULT_GALAXY_SEED } from '../gen/galaxy';
import { bodyLabLink } from '../lab/bodyLink';
import { starLabLink } from '../starlab/labStars';
import type { SceneManager } from '../levels/SceneManager';
import { Planet } from '../world/Planet';
import { buildInfo, formatBuildInfo } from './buildInfo';
import { RefreshControl } from './RefreshControl';
import { ReleaseNotesDialog } from './ReleaseNotesDialog';
import { VersionPicker } from './VersionPicker';

/**
 * The menu (#menu in index.html): Esc or the menu button (bottom right, the
 * only way in on touch) opens it and pauses the game (time stands still, the
 * view stays drawn). It holds the sound settings (VolumeControl), the Show
 * FPS switch (FpsCounter), the Weather, Plants and Wireframe switches (GraphicsSettings) and the
 * Freeze view and Third-person view switches (ViewFreezeControl, ThirdPersonControl), a link
 * to the planet lab, for the planet you're at: in low orbit the one below,
 * in a system the one the autopilot is headed for (else the first planet),
 * from the galaxy an empty lab, a link to the star lab at the system
 * you're in (or were last, from the galaxy), the Save debug dump button (#menu-dump, run
 * by debug/DebugDump.ts), the Refresh button (RefreshControl.ts: reloads,
 * with the newest version, and says whether the game is saved for offline
 * play), the Version picker (VersionPicker.ts: the release,
 * the preview or a pull request's build), What's new (ReleaseNotesDialog.ts:
 * the latest release and a button for every release's notes), and at the bottom which build is running
 * (branch · build number · commit, see buildInfo.ts). Esc, Resume, × or a
 * click beside the panel closes it.
 */
export class GameMenu {
  private readonly root = document.getElementById('menu')!;
  private readonly toggle = document.getElementById('menu-toggle') as HTMLButtonElement;
  private readonly resume = document.getElementById('menu-resume') as HTMLButtonElement;
  private readonly close = document.getElementById('menu-close') as HTMLButtonElement;
  private readonly lab = document.getElementById('menu-lab') as HTMLAnchorElement;
  private readonly stars = document.getElementById('menu-stars') as HTMLAnchorElement;
  private readonly refresh = new RefreshControl();
  private readonly versions = new VersionPicker();
  private readonly notes = new ReleaseNotesDialog(() => this.open());

  constructor(
    private readonly game: Game,
    private readonly levels: SceneManager,
  ) {
    document.getElementById('menu-build')!.textContent = formatBuildInfo(buildInfo);
    this.toggle.addEventListener('click', this.onToggle);
    this.resume.addEventListener('click', this.onClose);
    this.close.addEventListener('click', this.onClose);
    this.root.addEventListener('click', this.onBackdrop);
    window.addEventListener('keydown', this.onKey);
    void this.versions.refresh();
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(): void {
    if (this.isOpen) return;
    const body = this.labBody();
    this.lab.href = body ? bodyLabLink(body) : new URL('lab.html', location.href).href;
    this.lab.textContent = body ? `Open ${body.name} in the planet lab` : 'Open the planet lab';
    // The star lab at this system's star(s); a rogue planet has none.
    const ref = this.levels.systemLevel.ref;
    const seed = new URLSearchParams(location.search).get('seed') ?? DEFAULT_GALAXY_SEED;
    const hasStar = ref.stars.length > 0;
    this.stars.href = hasStar ? starLabLink(seed, ref.real ? 'sol' : ref.id, location.href) : new URL('stars.html', location.href).href;
    this.stars.textContent = hasStar ? `Open ${ref.name} in the star lab` : 'Open the star lab';
    void this.versions.refresh();
    void this.notes.refresh();
    this.refresh.check();
    this.root.hidden = false;
    this.toggle.setAttribute('aria-expanded', 'true');
    this.game.paused = true;
    this.resume.focus({ preventScroll: true });
  }

  hide(): void {
    if (!this.isOpen) return;
    this.notes.hide();
    this.root.hidden = true;
    this.toggle.setAttribute('aria-expanded', 'false');
    this.game.paused = false;
    // Keys pressed in the menu (a focused button) mustn't linger as focus for Space or Enter.
    (document.activeElement as HTMLElement | null)?.blur();
  }

  dispose(): void {
    this.hide();
    this.notes.dispose();
    this.versions.dispose();
    this.refresh.dispose();
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

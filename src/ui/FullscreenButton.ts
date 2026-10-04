/** How long the "add to home screen" hint stays up, ms. */
const HINT_MS = 6000;

type WebkitDocument = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type WebkitElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

/**
 * Full screen. On phones and tablets that let a page go full screen
 * (Android, iPad) the game is always played full screen: a page may only
 * ask from a tap, so every tap while it isn't (the first one, and after the
 * back gesture or the system left it) asks again, and there's no button.
 * On desktop the full-screen button (#fullscreen-toggle in index.html, next
 * to the menu button) toggles it. iPhone Safari has no full screen for
 * pages, so there the button explains the other way: Add to Home Screen,
 * which launches the game full screen (public/manifest.webmanifest and the
 * apple-mobile-web-app metas). Nothing when already launched that way.
 */
export class FullscreenButton {
  private readonly button = document.getElementById('fullscreen-toggle') as HTMLButtonElement;
  private readonly hint = document.getElementById('fullscreen-hint')!;
  private readonly doc = document as WebkitDocument;
  private hintTimer = 0;
  /** A request is under way (asking again meanwhile is refused). */
  private requesting = false;
  private warned = false;

  constructor() {
    const standalone =
      matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const supported = !!(this.doc.fullscreenEnabled || this.doc.webkitFullscreenEnabled);
    const touch = matchMedia('(pointer: coarse)').matches;
    const forced = supported && touch && !standalone;
    // No full-screen API: only phones and tablets (iOS) have the home-screen route instead.
    this.button.hidden = standalone || forced || (!supported && !touch);
    if (forced) {
      // Capturing, so no handler of the game's can stop it; both end a tap, either lets a page go full screen.
      window.addEventListener('touchend', this.onTap, { capture: true, passive: true });
      window.addEventListener('pointerup', this.onTap, { capture: true, passive: true });
    }
    if (this.button.hidden) return;
    this.button.addEventListener('click', supported ? this.onToggle : this.onHint);
    document.addEventListener('fullscreenchange', this.onChange);
    document.addEventListener('webkitfullscreenchange', this.onChange);
    this.onChange();
  }

  private get isFullscreen(): boolean {
    return !!(this.doc.fullscreenElement || this.doc.webkitFullscreenElement);
  }

  private enter(): Promise<void> | void {
    const el = document.documentElement as WebkitElement;
    return el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen?.();
  }

  private onTap = () => {
    if (this.isFullscreen || this.requesting) return;
    const p = this.enter();
    if (!p) return;
    this.requesting = true;
    p.catch((err: unknown) => {
      // Once: a refusal repeats on every tap.
      if (!this.warned) console.warn('Full screen refused:', err);
      this.warned = true;
    }).finally(() => (this.requesting = false));
  };

  private onToggle = () => {
    const p = this.isFullscreen ? (this.doc.exitFullscreen ? this.doc.exitFullscreen() : this.doc.webkitExitFullscreen?.()) : this.enter();
    if (p) p.catch((err: unknown) => console.warn('Full screen refused:', err));
  };

  private onHint = () => {
    this.hint.hidden = !this.hint.hidden;
    clearTimeout(this.hintTimer);
    if (!this.hint.hidden) this.hintTimer = window.setTimeout(() => (this.hint.hidden = true), HINT_MS);
  };

  private onChange = () => {
    const on = this.isFullscreen;
    this.button.classList.toggle('on', on);
    this.button.setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen');
    this.button.title = on ? 'Exit full screen' : 'Full screen';
  };
}

/** How long the "add to home screen" hint stays up, ms. */
const HINT_MS = 6000;

type WebkitDocument = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type WebkitElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

/**
 * The full-screen button (#fullscreen-toggle in index.html), next to the
 * sound button. Where the browser lets a page go full screen (Android,
 * iPad, desktop) it toggles that. iPhone Safari doesn't, so there it
 * explains the other way: Add to Home Screen, which launches the game full
 * screen (public/manifest.webmanifest and the apple-mobile-web-app metas).
 * Hidden when already launched that way.
 */
export class FullscreenButton {
  private readonly button = document.getElementById('fullscreen-toggle') as HTMLButtonElement;
  private readonly hint = document.getElementById('fullscreen-hint')!;
  private readonly doc = document as WebkitDocument;
  private hintTimer = 0;

  constructor() {
    const standalone =
      matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const supported = !!(this.doc.fullscreenEnabled || this.doc.webkitFullscreenEnabled);
    // No full-screen API: only phones and tablets (iOS) have the home-screen route instead.
    const touch = matchMedia('(pointer: coarse)').matches;
    this.button.hidden = standalone || (!supported && !touch);
    if (this.button.hidden) return;
    this.button.addEventListener('click', supported ? this.onToggle : this.onHint);
    document.addEventListener('fullscreenchange', this.onChange);
    document.addEventListener('webkitfullscreenchange', this.onChange);
    this.onChange();
  }

  private get isFullscreen(): boolean {
    return !!(this.doc.fullscreenElement || this.doc.webkitFullscreenElement);
  }

  private onToggle = () => {
    const run = (p: Promise<void> | void) => {
      if (p) p.catch((err: unknown) => console.warn('Full screen refused:', err));
    };
    if (this.isFullscreen) {
      run(this.doc.exitFullscreen ? this.doc.exitFullscreen() : this.doc.webkitExitFullscreen?.());
    } else {
      const el = document.documentElement as WebkitElement;
      run(el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen?.());
    }
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

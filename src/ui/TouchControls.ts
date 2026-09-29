import type { Entity } from '../core/Entity';
import type { Game } from '../core/Game';
import type { Input } from '../core/Input';
import { stickAxes } from '../core/touch';

/** How far (CSS px) the knob travels from the stick's centre. */
const STICK_RADIUS = 44;

/**
 * On-screen ship controls for touch players (#touch-controls in index.html):
 * a stick standing in for WASD, and hold buttons for keys (boost, up, down),
 * all fed to `Input` as analog key presses so the ships read them like the
 * keyboard. Shown while `input.touchMode`, with the set the active level asks
 * for (`Level.touchControls`), by the `touch` class and `data-ship` attribute
 * on <html> (the stylesheet does the rest, e.g. moves the HUD out of the way).
 */
export class TouchControls implements Entity {
  private readonly html = document.documentElement;
  private readonly container = document.getElementById('touch-controls')!;
  private readonly stick = document.getElementById('touch-stick')!;
  private readonly knob = document.getElementById('touch-knob')!;
  private readonly buttons = [...this.container.querySelectorAll<HTMLElement>('[data-key]')];
  private readonly input: Input;
  private stickPointer: number | null = null;
  private stickX = 0;
  private stickY = 0;
  private readonly axes = { x: 0, y: 0 };
  private shownTouch: boolean | null = null;
  private shownMode: string | null = null;

  constructor(private readonly game: Game) {
    this.input = game.input;
    this.stick.addEventListener('pointerdown', this.onStickDown);
    this.stick.addEventListener('pointermove', this.onStickMove);
    this.stick.addEventListener('lostpointercapture', this.onStickUp);
    for (const b of this.buttons) {
      b.addEventListener('pointerdown', this.onButtonDown);
      b.addEventListener('lostpointercapture', this.onButtonUp);
    }
    this.container.addEventListener('contextmenu', this.onContextMenu);
  }

  update(): void {
    const touch = this.input.touchMode;
    if (touch !== this.shownTouch) {
      this.shownTouch = touch;
      this.html.classList.toggle('touch', touch);
    }
    const mode = this.game.level?.touchControls ?? 'none';
    if (mode !== this.shownMode) {
      this.shownMode = mode;
      this.html.dataset.ship = mode;
    }
  }

  dispose(): void {
    this.releaseStick();
    for (const b of this.buttons) this.release(b);
    this.stick.removeEventListener('pointerdown', this.onStickDown);
    this.stick.removeEventListener('pointermove', this.onStickMove);
    this.stick.removeEventListener('lostpointercapture', this.onStickUp);
    for (const b of this.buttons) {
      b.removeEventListener('pointerdown', this.onButtonDown);
      b.removeEventListener('lostpointercapture', this.onButtonUp);
    }
    this.container.removeEventListener('contextmenu', this.onContextMenu);
    this.html.classList.remove('touch');
    delete this.html.dataset.ship;
  }

  private onStickDown = (e: PointerEvent) => {
    if (this.stickPointer !== null) return;
    e.preventDefault();
    this.stickPointer = e.pointerId;
    // Captured, so moves and the release (lostpointercapture, also on pointerup/cancel) come here.
    this.stick.setPointerCapture(e.pointerId);
    const r = this.stick.getBoundingClientRect();
    this.stickX = r.left + r.width / 2;
    this.stickY = r.top + r.height / 2;
    this.moveStick(e.clientX, e.clientY);
  };

  private onStickMove = (e: PointerEvent) => {
    if (e.pointerId === this.stickPointer) this.moveStick(e.clientX, e.clientY);
  };

  private onStickUp = (e: PointerEvent) => {
    if (e.pointerId === this.stickPointer) this.releaseStick();
  };

  private moveStick(clientX: number, clientY: number): void {
    let dx = clientX - this.stickX;
    let dy = clientY - this.stickY;
    const len = Math.hypot(dx, dy);
    if (len > STICK_RADIUS) {
      dx *= STICK_RADIUS / len;
      dy *= STICK_RADIUS / len;
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const { x, y } = stickAxes(dx, dy, STICK_RADIUS, this.axes);
    this.input.setAnalog('KeyD', Math.max(x, 0));
    this.input.setAnalog('KeyA', Math.max(-x, 0));
    this.input.setAnalog('KeyW', Math.max(y, 0));
    this.input.setAnalog('KeyS', Math.max(-y, 0));
  }

  private releaseStick(): void {
    this.stickPointer = null;
    this.knob.style.transform = '';
    for (const key of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) this.input.setAnalog(key, 0);
  }

  private onButtonDown = (e: PointerEvent) => {
    const b = e.currentTarget as HTMLElement;
    e.preventDefault();
    b.setPointerCapture(e.pointerId);
    b.classList.add('active');
    this.input.setAnalog(b.dataset.key!, 1);
  };

  private onButtonUp = (e: PointerEvent) => {
    this.release(e.currentTarget as HTMLElement);
  };

  private release(b: HTMLElement): void {
    b.classList.remove('active');
    this.input.setAnalog(b.dataset.key!, 0);
  }

  private onContextMenu = (e: Event) => {
    e.preventDefault();
  };
}

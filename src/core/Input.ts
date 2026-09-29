import { TouchGestures } from './touch';

/** A press that moves less than this many pixels before release counts as a click. */
const CLICK_SLOP_PX = 5;
/** Converts line/page wheel deltas to roughly pixel-sized units. */
const WHEEL_LINE_PX = 33;
const WHEEL_PAGE_PX = 600;

export interface PointerState {
  /** Normalised device coordinates: x and y in [-1, 1], +y up. */
  readonly ndcX: number;
  readonly ndcY: number;
  /** CSS pixels relative to the viewport, for positioning DOM overlays. */
  readonly clientX: number;
  readonly clientY: number;
  /** False when the pointer has left the canvas. */
  readonly inside: boolean;
}

/**
 * Polled keyboard + mouse state. Keys use `KeyboardEvent.code` (layout
 * independent, e.g. 'KeyW', 'ShiftLeft').
 *
 * Mouse: a left or right press that moves more than a few pixels is a drag
 * (drained with `consumeDrag`); a left press that doesn't is a click
 * (drained with `consumeClick`). Wheel movement accumulates until
 * `consumeWheel`. While `blocked` (e.g. during a level transition) keys read
 * as released and consumers get nothing; input arriving meanwhile is dropped.
 *
 * Touch makes the same gestures (see `TouchGestures`): one finger drags or
 * taps, two fingers pinch as the wheel, and a finger held still is the
 * hovering pointer. On-screen controls feed keys in as analog values
 * (`setAnalog`), so `isDown` / `axis` read them like the keyboard.
 */
export class Input {
  private readonly keys = new Set<string>();
  /** Analog presses in [0, 1] from on-screen controls, by key code. */
  private readonly analog = new Map<string, number>();
  private readonly buttons = new Set<number>();
  private readonly pointerState = { ndcX: 0, ndcY: 0, clientX: 0, clientY: 0, inside: false };

  private pressX = 0;
  private pressY = 0;
  private dragging = false;
  private dragDx = 0;
  private dragDy = 0;
  private wheel = 0;
  private click: { ndcX: number; ndcY: number } | null = null;
  private readonly delta = { x: 0, y: 0 };
  private _blocked = false;
  private _touchMode = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  private readonly gestures = new TouchGestures({
    drag: (dx, dy) => {
      this.dragDx += dx;
      this.dragDy += dy;
    },
    zoom: (px) => {
      this.wheel += px;
    },
    tap: (x, y) => {
      this.setPointer(x, y);
      this.click = { ndcX: this.pointerState.ndcX, ndcY: this.pointerState.ndcY };
    },
  });

  constructor(private readonly element: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    element.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerCancel);
    // Seen for presses anywhere (the on-screen controls too), to tell touch from mouse.
    window.addEventListener('pointerdown', this.onAnyPointerDown, true);
    element.addEventListener('pointerleave', this.onPointerLeave);
    element.addEventListener('wheel', this.onWheel, { passive: false });
    element.addEventListener('contextmenu', this.onContextMenu);
  }

  get blocked(): boolean {
    return this._blocked;
  }

  set blocked(value: boolean) {
    this._blocked = value;
    this.dragDx = this.dragDy = this.wheel = 0;
    this.click = null;
  }

  /** True while the player last used touch (starts from whether the device's main pointer is coarse). */
  get touchMode(): boolean {
    return this._touchMode;
  }

  isDown(code: string): boolean {
    return !this._blocked && (this.keys.has(code) || (this.analog.get(code) ?? 0) > 0);
  }

  /** In [-1, 1] from a pair of keys: -1, 0 or 1 from the keyboard, anything between from analog presses. */
  axis(negative: string, positive: string): number {
    if (this._blocked) return 0;
    const value = (key: string) => (this.keys.has(key) ? 1 : 0) + (this.analog.get(key) ?? 0);
    return Math.max(-1, Math.min(1, value(positive) - value(negative)));
  }

  /** Presses key `code` by `amount` in [0, 1] (0 releases it), for on-screen controls. */
  setAnalog(code: string, amount: number): void {
    if (amount > 0) this.analog.set(code, Math.min(amount, 1));
    else this.analog.delete(code);
  }

  /** Where the pointer is. The returned object is live and reused. */
  get pointer(): PointerState {
    return this.pointerState;
  }

  /** True while a button is held and the pointer has moved past the click threshold. */
  get isDragging(): boolean {
    return this.dragging || this.gestures.dragging;
  }

  /** Drag movement in pixels since the last call. The returned object is reused. */
  consumeDrag(): { readonly x: number; readonly y: number } {
    this.delta.x = this._blocked ? 0 : this.dragDx;
    this.delta.y = this._blocked ? 0 : this.dragDy;
    this.dragDx = 0;
    this.dragDy = 0;
    return this.delta;
  }

  /** Wheel movement in pixels since the last call; positive = scrolled down (zoom out). */
  consumeWheel(): number {
    const w = this.wheel;
    this.wheel = 0;
    return this._blocked ? 0 : w;
  }

  /** The last left click (in NDC) since the previous call, or null. */
  consumeClick(): { readonly ndcX: number; readonly ndcY: number } | null {
    const c = this.click;
    this.click = null;
    return this._blocked ? null : c;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.element.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerCancel);
    window.removeEventListener('pointerdown', this.onAnyPointerDown, true);
    this.element.removeEventListener('pointerleave', this.onPointerLeave);
    this.element.removeEventListener('wheel', this.onWheel);
    this.element.removeEventListener('contextmenu', this.onContextMenu);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onBlur = () => {
    this.keys.clear();
    this.buttons.clear();
    this.dragging = false;
    this.gestures.reset();
  };

  private onAnyPointerDown = (e: PointerEvent) => {
    this._touchMode = e.pointerType === 'touch';
  };

  private onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'touch') {
      // The first finger is the hovering pointer (hold still on something to see what it is).
      if (this.gestures.count === 0) this.updatePointer(e);
      this.gestures.down(e.pointerId, e.clientX, e.clientY);
      return;
    }
    if (e.button !== 0 && e.button !== 2) return;
    this.updatePointer(e);
    if (this.buttons.size === 0) {
      this.pressX = e.clientX;
      this.pressY = e.clientY;
      this.dragging = false;
    }
    this.buttons.add(e.button);
  };

  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch') {
      if (this.gestures.move(e.pointerId, e.clientX, e.clientY) && this.gestures.count === 1) this.updatePointer(e);
      return;
    }
    this.updatePointer(e);
    if (this.buttons.size === 0) return;
    if (!this.dragging && Math.hypot(e.clientX - this.pressX, e.clientY - this.pressY) >= CLICK_SLOP_PX) {
      this.dragging = true;
    }
    if (this.dragging) {
      this.dragDx += e.movementX;
      this.dragDy += e.movementY;
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerType === 'touch') {
      this.gestures.up(e.pointerId, e.clientX, e.clientY);
      // Nothing hovers once the fingers lift.
      if (this.gestures.count === 0) this.pointerState.inside = false;
      return;
    }
    if (!this.buttons.delete(e.button)) return;
    this.updatePointer(e);
    if (e.button === 0 && !this.dragging) this.click = { ndcX: this.pointerState.ndcX, ndcY: this.pointerState.ndcY };
    if (this.buttons.size === 0) this.dragging = false;
  };

  private onPointerCancel = (e: PointerEvent) => {
    if (e.pointerType === 'touch') {
      this.gestures.up(e.pointerId, e.clientX, e.clientY, true);
      if (this.gestures.count === 0) this.pointerState.inside = false;
    } else if (this.buttons.delete(e.button) && this.buttons.size === 0) {
      this.dragging = false;
    }
  };

  private onPointerLeave = () => {
    this.pointerState.inside = false;
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const scale = e.deltaMode === 1 ? WHEEL_LINE_PX : e.deltaMode === 2 ? WHEEL_PAGE_PX : 1;
    this.wheel += e.deltaY * scale;
  };

  private onContextMenu = (e: Event) => {
    e.preventDefault();
  };

  private updatePointer(e: PointerEvent): void {
    this.setPointer(e.clientX, e.clientY);
  }

  private setPointer(clientX: number, clientY: number): void {
    const rect = this.element.getBoundingClientRect();
    const p = this.pointerState;
    p.clientX = clientX;
    p.clientY = clientY;
    p.ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    p.ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
    p.inside = clientX >= rect.left && clientX < rect.right && clientY >= rect.top && clientY < rect.bottom;
  }
}

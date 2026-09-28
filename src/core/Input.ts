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
 * `consumeWheel`.
 */
export class Input {
  private readonly keys = new Set<string>();
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

  constructor(private readonly element: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    element.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    element.addEventListener('pointerleave', this.onPointerLeave);
    element.addEventListener('wheel', this.onWheel, { passive: false });
    element.addEventListener('contextmenu', this.onContextMenu);
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  /** -1, 0 or 1 from a pair of keys. */
  axis(negative: string, positive: string): number {
    return (this.isDown(positive) ? 1 : 0) - (this.isDown(negative) ? 1 : 0);
  }

  /** Where the pointer is. The returned object is live and reused. */
  get pointer(): PointerState {
    return this.pointerState;
  }

  /** True while a button is held and the pointer has moved past the click threshold. */
  get isDragging(): boolean {
    return this.dragging;
  }

  /** Drag movement in pixels since the last call. The returned object is reused. */
  consumeDrag(): { readonly x: number; readonly y: number } {
    this.delta.x = this.dragDx;
    this.delta.y = this.dragDy;
    this.dragDx = 0;
    this.dragDy = 0;
    return this.delta;
  }

  /** Wheel movement in pixels since the last call; positive = scrolled down (zoom out). */
  consumeWheel(): number {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  /** The last left click (in NDC) since the previous call, or null. */
  consumeClick(): { readonly ndcX: number; readonly ndcY: number } | null {
    const c = this.click;
    this.click = null;
    return c;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.element.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
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
  };

  private onPointerDown = (e: PointerEvent) => {
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
    if (!this.buttons.delete(e.button)) return;
    this.updatePointer(e);
    if (e.button === 0 && !this.dragging) this.click = { ndcX: this.pointerState.ndcX, ndcY: this.pointerState.ndcY };
    if (this.buttons.size === 0) this.dragging = false;
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
    const rect = this.element.getBoundingClientRect();
    const p = this.pointerState;
    p.clientX = e.clientX;
    p.clientY = e.clientY;
    p.ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    p.ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    p.inside = e.clientX >= rect.left && e.clientX < rect.right && e.clientY >= rect.top && e.clientY < rect.bottom;
  }
}

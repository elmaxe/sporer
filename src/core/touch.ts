/** A finger that moves less than this many pixels before lifting counts as a tap (fingers jitter more than a mouse). */
export const TAP_SLOP_PX = 10;
/**
 * Wheel pixels per unit of log pinch ratio. With the cameras' zoom speed
 * (0.0025 per wheel pixel) this makes the view distance follow the fingers:
 * spreading them to twice as far apart halves the distance.
 */
export const PINCH_WHEEL_PX = 400;

/** Where recognised gestures go (Input's drag, wheel and click accumulators). */
export interface GestureSink {
  /** One-finger drag, in pixels. */
  drag(dx: number, dy: number): void;
  /** Pinch as wheel pixels: positive = fingers closing (zoom out). */
  zoom(wheelPx: number): void;
  /** A tap at client coordinates. */
  tap(clientX: number, clientY: number): void;
}

interface Touch {
  x: number;
  y: number;
}

/**
 * Turns raw touch points into the same gestures a mouse makes: one finger
 * drags (rotates the view) or taps (clicks), two fingers pinch (scroll). A
 * tap is only reported if a single finger went down and came up without
 * moving past `TAP_SLOP_PX` and no second finger joined meanwhile. Pure: no
 * DOM, fed by Input's pointer events.
 */
export class TouchGestures {
  private readonly touches = new Map<number, Touch>();
  private startX = 0;
  private startY = 0;
  private tapPossible = false;
  private _dragging = false;
  private spread = 0;

  constructor(private readonly sink: GestureSink) {}

  /** Fingers currently down. */
  get count(): number {
    return this.touches.size;
  }

  /** True once the fingers have moved past the tap threshold, or a second one came down, until all lift. */
  get dragging(): boolean {
    return this._dragging;
  }

  down(id: number, x: number, y: number): void {
    this.touches.set(id, { x, y });
    if (this.touches.size === 1) {
      this.startX = x;
      this.startY = y;
      this.tapPossible = true;
      this._dragging = false;
    } else {
      this.tapPossible = false;
      this._dragging = true;
      this.spread = this.measureSpread();
    }
  }

  /** Returns false for a pointer this isn't tracking (e.g. a finger that went down on a button). */
  move(id: number, x: number, y: number): boolean {
    const t = this.touches.get(id);
    if (!t) return false;
    if (this.touches.size === 1) {
      if (!this._dragging && Math.hypot(x - this.startX, y - this.startY) >= TAP_SLOP_PX) {
        this._dragging = true;
        this.tapPossible = false;
      }
      if (this._dragging) this.sink.drag(x - t.x, y - t.y);
      t.x = x;
      t.y = y;
      return true;
    }
    t.x = x;
    t.y = y;
    const spread = this.measureSpread();
    if (this.spread > 0 && spread > 0) this.sink.zoom(Math.log(this.spread / spread) * PINCH_WHEEL_PX);
    this.spread = spread;
    return true;
  }

  /** A finger lifted (`cancelled`: the browser took it over, never a tap). */
  up(id: number, x: number, y: number, cancelled = false): void {
    if (!this.touches.delete(id)) return;
    if (this.touches.size === 0) {
      if (this.tapPossible && !cancelled) this.sink.tap(x, y);
      this.tapPossible = false;
      this._dragging = false;
    } else if (this.touches.size >= 2) {
      this.spread = this.measureSpread();
    }
    // One finger left after a pinch: it drags on from where it is (its own last position), no jump.
  }

  reset(): void {
    this.touches.clear();
    this.tapPossible = false;
    this._dragging = false;
  }

  /** Distance between the first two fingers down. */
  private measureSpread(): number {
    const it = this.touches.values();
    const a = it.next().value;
    const b = it.next().value;
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }
}

/** Fraction of the stick's travel that reads as centred. */
export const STICK_DEADZONE = 0.15;

/**
 * Virtual joystick: the knob's offset (pixels, +y down) from the centre of a
 * stick with `radius` travel → axes in [-1, 1] (+y up), zero inside the dead
 * zone and rescaled beyond it so the push still starts from 0.
 */
export function stickAxes(dx: number, dy: number, radius: number, out: { x: number; y: number }): { x: number; y: number } {
  const len = Math.hypot(dx, dy);
  const m = Math.min(len / radius, 1);
  if (m <= STICK_DEADZONE || len === 0) {
    out.x = out.y = 0;
    return out;
  }
  const k = (m - STICK_DEADZONE) / (1 - STICK_DEADZONE) / len;
  out.x = dx * k;
  out.y = -dy * k;
  return out;
}

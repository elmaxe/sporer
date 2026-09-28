/**
 * Polled keyboard + mouse state. Keys use `KeyboardEvent.code` (layout
 * independent, e.g. 'KeyW', 'ShiftLeft'). Mouse movement accumulates while
 * pointer lock is active and is drained with `consumeMouseDelta`.
 */
export class Input {
  private readonly keys = new Set<string>();
  private mouseDx = 0;
  private mouseDy = 0;
  private readonly delta = { x: 0, y: 0 };

  constructor(private readonly element: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('mousemove', this.onMouseMove);
    element.addEventListener('click', this.onClick);
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  /** -1, 0 or 1 from a pair of keys. */
  axis(negative: string, positive: string): number {
    return (this.isDown(positive) ? 1 : 0) - (this.isDown(negative) ? 1 : 0);
  }

  get pointerLocked(): boolean {
    return document.pointerLockElement === this.element;
  }

  /** Mouse movement since the last call. The returned object is reused. */
  consumeMouseDelta(): { readonly x: number; readonly y: number } {
    this.delta.x = this.mouseDx;
    this.delta.y = this.mouseDy;
    this.mouseDx = 0;
    this.mouseDy = 0;
    return this.delta;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('mousemove', this.onMouseMove);
    this.element.removeEventListener('click', this.onClick);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onBlur = () => {
    this.keys.clear();
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.pointerLocked) return;
    this.mouseDx += e.movementX;
    this.mouseDy += e.movementY;
  };

  private onClick = () => {
    if (!this.pointerLocked) void this.element.requestPointerLock();
  };
}

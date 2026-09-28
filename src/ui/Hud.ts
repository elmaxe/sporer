import type { Entity } from '../core/Entity';
import type { Ship } from '../player/Ship';

const REFRESH_SECONDS = 0.1;

/** DOM overlay (see #hud in index.html). Throttled to avoid layout churn. */
export class Hud implements Entity {
  private readonly speedEl: HTMLElement;
  private sinceRefresh = REFRESH_SECONDS;

  constructor(private readonly ship: Ship) {
    this.speedEl = document.getElementById('hud-speed')!;
  }

  update(frameDt: number): void {
    this.sinceRefresh += frameDt;
    if (this.sinceRefresh < REFRESH_SECONDS) return;
    this.sinceRefresh = 0;
    this.speedEl.textContent = `${this.ship.speed.toFixed(0)} u/s`;
  }

  dispose(): void {}
}

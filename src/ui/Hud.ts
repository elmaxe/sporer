import type { Entity } from '../core/Entity';
import { describeStar } from '../gen/stars';
import type { SystemData } from '../gen/system';
import type { Ship } from '../player/Ship';

const REFRESH_SECONDS = 0.1;

/** DOM overlay (see #hud in index.html). Throttled to avoid layout churn. */
export class Hud implements Entity {
  private readonly speedEl: HTMLElement;
  private sinceRefresh = REFRESH_SECONDS;

  constructor(
    private readonly ship: Ship,
    system: SystemData,
  ) {
    this.speedEl = document.getElementById('hud-speed')!;
    const stars = system.stars.map(describeStar).join(' + ');
    const planets = system.planets.length === 1 ? '1 planet' : `${system.planets.length} planets`;
    document.getElementById('hud-location')!.textContent =
      `${system.name} · ${system.stars.length > 1 ? 'Binary: ' : ''}${stars} · ${planets}`;
  }

  update(frameDt: number): void {
    this.sinceRefresh += frameDt;
    if (this.sinceRefresh < REFRESH_SECONDS) return;
    this.sinceRefresh = 0;
    this.speedEl.textContent = `${this.ship.speed.toFixed(0)} u/s`;
  }

  dispose(): void {}
}

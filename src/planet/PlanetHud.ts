import type { Entity } from '../core/Entity';
import type { PlanetShip } from './PlanetShip';

const REFRESH_SECONDS = 0.1;
const HELP =
  'Click the surface: fly there · Scroll: zoom (out past orbit for the system) · Drag: rotate view · ' +
  'WASD: nudge · Shift: boost · M: mute';

/** The planet level's DOM overlay (the shared #hud in index.html). Text is throttled. */
export class PlanetHud implements Entity {
  private readonly locationEl = document.getElementById('hud-location')!;
  private readonly speedEl = document.getElementById('hud-speed')!;
  private readonly targetEl = document.getElementById('hud-target')!;
  private readonly helpEl = document.getElementById('hud-help')!;
  private sinceRefresh = REFRESH_SECONDS;

  constructor(
    private readonly ship: PlanetShip,
    /** e.g. "Haikrai III · Terran world · 1 moon". */
    private readonly location: string,
  ) {}

  activate(): void {
    this.locationEl.textContent = `${this.location} · low orbit`;
    this.helpEl.textContent = HELP;
    this.sinceRefresh = REFRESH_SECONDS;
  }

  update(frameDt: number): void {
    this.sinceRefresh += frameDt;
    if (this.sinceRefresh < REFRESH_SECONDS) return;
    this.sinceRefresh = 0;
    this.speedEl.textContent = `${this.ship.speed.toFixed(0)} u/s`;
    this.targetEl.textContent = this.ship.enRoute ? 'Autopilot → surface point' : '';
  }

  dispose(): void {}
}

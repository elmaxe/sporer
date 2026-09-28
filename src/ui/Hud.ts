import type { Entity } from '../core/Entity';
import type { Input } from '../core/Input';
import { describeStars } from '../gen/stars';
import type { SystemData } from '../gen/system';
import type { Picker } from '../player/Picker';
import type { Ship } from '../player/Ship';
import type { Tooltip } from './Tooltip';

const REFRESH_SECONDS = 0.1;
const HELP =
  'Click: fly to a planet, star or point · Scroll: zoom (in at a planet to descend, out past the system for the galaxy) · ' +
  'Drag: rotate view · ' +
  'WASD: nudge · E/Q: up/down · Shift: boost · M: mute';

/**
 * The system level's DOM overlay (see #hud in index.html). The DOM is shared
 * with other levels, so `activate` rewrites everything this HUD owns.
 * Text is throttled to avoid layout churn.
 */
export class Hud implements Entity {
  private readonly locationEl = document.getElementById('hud-location')!;
  private readonly speedEl = document.getElementById('hud-speed')!;
  private readonly targetEl = document.getElementById('hud-target')!;
  private readonly helpEl = document.getElementById('hud-help')!;
  private sinceRefresh = REFRESH_SECONDS;

  constructor(
    private readonly ship: Ship,
    private readonly picker: Picker,
    private readonly input: Input,
    private readonly system: SystemData,
    private readonly tooltip: Tooltip,
  ) {}

  activate(): void {
    const { system } = this;
    const planets = system.planets.length === 1 ? '1 planet' : `${system.planets.length} planets`;
    this.locationEl.textContent = `${system.name} · ${describeStars(system.stars)} · ${planets}`;
    this.helpEl.textContent = HELP;
    this.sinceRefresh = REFRESH_SECONDS;
  }

  deactivate(): void {
    this.tooltip.hide();
  }

  update(frameDt: number): void {
    const body = this.picker.hovered;
    if (body) {
      const { clientX, clientY } = this.input.pointer;
      this.tooltip.show(body, body.name, body.description, clientX, clientY);
    } else {
      this.tooltip.hide();
    }

    this.sinceRefresh += frameDt;
    if (this.sinceRefresh < REFRESH_SECONDS) return;
    this.sinceRefresh = 0;
    this.speedEl.textContent = `${this.ship.speed.toFixed(0)} u/s`;
    const target = this.ship.targetBody;
    this.targetEl.textContent = !this.ship.autopilotActive
      ? ''
      : target
        ? `${this.ship.enRoute ? 'Autopilot → ' : 'Parked at '}${target.name}`
        : 'Autopilot → point in space';
  }

  dispose(): void {
    this.tooltip.hide();
  }
}

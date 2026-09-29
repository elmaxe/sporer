import type { Entity } from '../core/Entity';
import type { Input } from '../core/Input';
import { HelpText } from '../ui/HelpText';
import type { PlanetShip } from './PlanetShip';

const REFRESH_SECONDS = 0.1;
const HELP =
  'Click the surface: fly there · Scroll: zoom (out past orbit for the system) · Drag: rotate view · ' +
  'WASD: nudge · Shift: boost · M: mute';
const TOUCH_HELP =
  'Tap the surface: fly there · Pinch: zoom (out past orbit for the system) · Drag: rotate view · Stick: nudge · Boost';

/** The planet level's DOM overlay (the shared #hud in index.html). Text is throttled. */
export class PlanetHud implements Entity {
  private readonly locationEl = document.getElementById('hud-location')!;
  private readonly speedEl = document.getElementById('hud-speed')!;
  private readonly targetEl = document.getElementById('hud-target')!;
  private readonly help: HelpText;
  private sinceRefresh = REFRESH_SECONDS;
  private active = false;

  constructor(
    private readonly ship: PlanetShip,
    /** e.g. "Haikrai III · Terran world · 1 moon". */
    private readonly location: string,
    input: Input,
  ) {
    this.help = new HelpText(input, HELP, TOUCH_HELP);
  }

  activate(): void {
    this.active = true;
    this.locationEl.textContent = `${this.location} · low orbit`;
    this.help.refresh(true);
    this.sinceRefresh = REFRESH_SECONDS;
  }

  deactivate(): void {
    this.active = false;
  }

  update(frameDt: number): void {
    // Still updated while crossfading out, but the DOM belongs to the level taking over.
    if (!this.active) return;
    this.sinceRefresh += frameDt;
    if (this.sinceRefresh < REFRESH_SECONDS) return;
    this.sinceRefresh = 0;
    this.help.refresh();
    this.speedEl.textContent = `${this.ship.speed.toFixed(0)} u/s`;
    this.targetEl.textContent = this.ship.enRoute ? 'Autopilot → surface point' : '';
  }

  dispose(): void {}
}

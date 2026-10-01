import type { Entity } from '../core/Entity';
import type { Input } from '../core/Input';
import { describeStars } from '../gen/stars';
import type { SystemData } from '../gen/system';
import type { Picker } from '../player/Picker';
import type { Ship } from '../player/Ship';
import { HelpText } from './HelpText';
import type { SystemMap } from './SystemMap';
import type { Tooltip } from './Tooltip';

const REFRESH_SECONDS = 0.1;
const HELP =
  'Click: fly to a planet, moon or star · Scroll: move in or out (in at a planet to descend, out past the system for the galaxy) · ' +
  'Drag: rotate view · Shift: boost · N: map · M: mute · Esc: menu';
const TOUCH_HELP =
  'Tap: fly to a planet, moon or star · Pinch: move in or out (in at a planet to descend, out past the system for the galaxy) · ' +
  'Drag: rotate view · Hold: identify · Boost · Map';

/**
 * The system level's DOM overlay (see #hud in index.html). The DOM is shared
 * with other levels, so `activate` rewrites everything this HUD owns.
 * Text is throttled to avoid layout churn.
 */
export class Hud implements Entity {
  private readonly locationEl = document.getElementById('hud-location')!;
  private readonly speedEl = document.getElementById('hud-speed')!;
  private readonly targetEl = document.getElementById('hud-target')!;
  private readonly help: HelpText;
  private sinceRefresh = REFRESH_SECONDS;
  private active = false;

  constructor(
    private readonly ship: Ship,
    private readonly picker: Picker,
    /** Its hovered body takes over the tooltip, and nothing behind the panel shows one. */
    private readonly map: SystemMap,
    private readonly input: Input,
    private readonly system: SystemData,
    private readonly tooltip: Tooltip,
  ) {
    this.help = new HelpText(input, HELP, TOUCH_HELP);
  }

  activate(): void {
    this.active = true;
    const { system } = this;
    const planets = system.planets.length === 1 ? '1 planet' : `${system.planets.length} planets`;
    const nebula = system.nebula ? ` · in the ${system.nebula.name}` : '';
    this.locationEl.textContent = `${system.name} · ${describeStars(system.stars)} · ${planets}${nebula}`;
    this.help.refresh(true);
    this.sinceRefresh = REFRESH_SECONDS;
  }

  deactivate(): void {
    this.active = false;
    this.tooltip.hide();
  }

  update(frameDt: number): void {
    // Still updated while crossfading out, but the DOM belongs to the level taking over.
    if (!this.active) return;
    const { map } = this;
    const body = map.pointerOver ? map.hovered : this.picker.hovered;
    if (body) {
      const { clientX, clientY } = map.pointerOver ? map.pointer : this.input.pointer;
      this.tooltip.show(body, body.name, body.description, clientX, clientY, body.details, this.input.touchMode);
    } else {
      this.tooltip.hide();
    }

    this.sinceRefresh += frameDt;
    if (this.sinceRefresh < REFRESH_SECONDS) return;
    this.sinceRefresh = 0;
    this.help.refresh();
    this.speedEl.textContent = `${this.ship.speed.toFixed(0)} u/s`;
    const target = this.ship.targetBody;
    this.targetEl.textContent = `${this.ship.enRoute ? 'Autopilot → ' : 'Hovering at '}${target.name}`;
  }

  dispose(): void {
    this.tooltip.hide();
  }
}

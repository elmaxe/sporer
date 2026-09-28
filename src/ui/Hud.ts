import type { Entity } from '../core/Entity';
import type { Input } from '../core/Input';
import { describeStar } from '../gen/stars';
import type { SystemData } from '../gen/system';
import type { Picker } from '../player/Picker';
import type { Ship } from '../player/Ship';
import type { CelestialBody } from '../world/CelestialBody';

const REFRESH_SECONDS = 0.1;
/** Tooltip offset from the pointer, in CSS pixels. */
const TOOLTIP_OFFSET = 16;

/** DOM overlay (see #hud and #tooltip in index.html). Text is throttled to avoid layout churn. */
export class Hud implements Entity {
  private readonly speedEl: HTMLElement;
  private readonly targetEl: HTMLElement;
  private readonly tooltipEl: HTMLElement;
  private readonly tooltipName: HTMLElement;
  private readonly tooltipInfo: HTMLElement;
  private shownBody: CelestialBody | null = null;
  private sinceRefresh = REFRESH_SECONDS;

  constructor(
    private readonly ship: Ship,
    private readonly picker: Picker,
    private readonly input: Input,
    system: SystemData,
  ) {
    this.speedEl = document.getElementById('hud-speed')!;
    this.targetEl = document.getElementById('hud-target')!;
    this.tooltipEl = document.getElementById('tooltip')!;
    this.tooltipName = document.getElementById('tooltip-name')!;
    this.tooltipInfo = document.getElementById('tooltip-info')!;
    const stars = system.stars.map(describeStar).join(' + ');
    const planets = system.planets.length === 1 ? '1 planet' : `${system.planets.length} planets`;
    document.getElementById('hud-location')!.textContent =
      `${system.name} · ${system.stars.length > 1 ? 'Binary: ' : ''}${stars} · ${planets}`;
  }

  update(frameDt: number): void {
    this.updateTooltip();

    this.sinceRefresh += frameDt;
    if (this.sinceRefresh < REFRESH_SECONDS) return;
    this.sinceRefresh = 0;
    this.speedEl.textContent = `${this.ship.speed.toFixed(0)} u/s`;
    const body = this.ship.targetBody;
    this.targetEl.textContent = !this.ship.autopilotActive
      ? ''
      : body
        ? `${this.ship.enRoute ? 'Autopilot → ' : 'Parked at '}${body.name}`
        : 'Autopilot → point in space';
  }

  dispose(): void {
    this.tooltipEl.hidden = true;
  }

  private updateTooltip(): void {
    const body = this.picker.hovered;
    if (body !== this.shownBody) {
      this.shownBody = body;
      this.tooltipEl.hidden = body === null;
      if (body) {
        this.tooltipName.textContent = body.name;
        this.tooltipInfo.textContent = body.description;
      }
    }
    if (body) {
      const { clientX, clientY } = this.input.pointer;
      this.tooltipEl.style.transform = `translate(${clientX + TOOLTIP_OFFSET}px, ${clientY + TOOLTIP_OFFSET}px)`;
    }
  }
}

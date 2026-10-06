import { GASES, celsius, describeAtmosphere, type ClimateData, type Gas } from '../gen/climate';
import type { TerraformMode, TerraformSnapshot } from '../gen/terraform';
import { TERRAFORM_MODE_LABEL } from '../ui/GameplaySettings';
import { boilingLine, chartPoint, cloudDeckBand, describeSettling, freezingX, tierRects, CHART_CELSIUS, CHART_LOG_BAR, type ChartPoint } from './chart';
import { milestoneTitle, type MilestoneEvent } from './milestones';
import { GAS_COLOR, GAS_NAME, type RayChoice } from './rays';

/** What the chart shows: a body's climate now and where it's going. */
export interface ChartData {
  name: string;
  snapshot: Pick<TerraformSnapshot, 'climate' | 'target' | 'settlesIn'>;
  mode: TerraformMode;
  /** Where the selected ray would take it in a few seconds (the arrow), or null. */
  forecast: ClimateData | null;
  /** Bar a second the air is leaking away (0: it isn't). */
  leak: number;
  /** The body's milestones so far, oldest first. */
  milestones: readonly MilestoneEvent[];
  /** Shows a picker: the gas (a gas ray is selected), rain or steam (the water ray), deploy or recall (the mirror), close or open (the sunshade). */
  picker: 'gas' | 'water' | 'mirror' | 'shade' | null;
  /** What stays over the world: its mirrors, shade, starlight and haze ('' for nothing; terraform/light.ts describeInstallations). */
  projects?: string;
}

const WIDTH = 288;
const HEIGHT = 170;
/** Refreshes this often, s. */
export const CHART_REFRESH = 0.15;

/**
 * The climate chart (docs/design/terraforming.md, "The climate chart"): a
 * panel in low orbit (while the item bar's Terraform tab is on show) and in
 * the planet lab. Temperature across, pressure up (log), the tiers as
 * rectangles, water's freezing and boiling lines and the CO₂ cloud deck as
 * tipping points; the world as a dot, a ghost dot where it's settling and
 * how long that takes, an arrow where the selected ray would take it; under
 * it the tier's lamps, a stacked bar of the gases, the water, the leak, the
 * mirrors, shade and haze over it, the last milestones, and the pickers
 * for the air rays' gas, the water ray's way, the mirror's and the shade's. Laid out by terraform/chart.ts. A DOM panel made here.
 */
export class ClimateChart {
  readonly root = document.createElement('div');
  private readonly title = document.createElement('div');
  private readonly canvas = document.createElement('canvas');
  private readonly line = document.createElement('div');
  private readonly lamps = document.createElement('div');
  private readonly gasBar = document.createElement('div');
  private readonly gasLabel = document.createElement('div');
  private readonly water = document.createElement('div');
  private readonly events = document.createElement('div');
  private readonly pickers = document.createElement('div');
  private readonly gasButtons = new Map<Gas, HTMLButtonElement>();
  private readonly waterButtons = new Map<'add' | 'take', HTMLButtonElement>();
  private readonly mirrorButtons = new Map<'deploy' | 'recall', HTMLButtonElement>();
  private readonly shadeButtons = new Map<'close' | 'open', HTMLButtonElement>();
  private readonly projects = document.createElement('div');
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly point: ChartPoint = { x: 0, y: 0, offX: 0, offY: 0 };
  private readonly ghost: ChartPoint = { x: 0, y: 0, offX: 0, offY: 0 };
  private readonly arrow: ChartPoint = { x: 0, y: 0, offX: 0, offY: 0 };
  private shown = false;

  constructor(
    /** The rays' choices, which the pickers change. */
    private readonly choice: RayChoice,
    parent: HTMLElement = document.body,
  ) {
    this.root.id = 'climate-chart';
    this.root.hidden = true;
    this.title.className = 'chart-title';
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = WIDTH * ratio;
    this.canvas.height = HEIGHT * ratio;
    this.canvas.className = 'chart-canvas';
    this.ctx = this.canvas.getContext('2d');
    this.ctx?.scale(ratio, ratio);
    this.line.className = 'chart-line';
    this.lamps.className = 'chart-lamps';
    this.gasBar.className = 'chart-gas-bar';
    this.gasLabel.className = 'chart-gas-label';
    this.water.className = 'chart-water';
    this.events.className = 'chart-events';
    this.pickers.className = 'chart-pickers';
    for (const gas of GASES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = GAS_NAME[gas];
      b.style.setProperty('--gas', GAS_COLOR[gas]);
      b.addEventListener('click', () => {
        this.choice.gas = gas;
        this.showPickers('gas');
      });
      this.gasButtons.set(gas, b);
      this.pickers.append(b);
    }
    for (const [way, label] of [
      ['add', 'Rain'],
      ['take', 'Steam'],
    ] as const) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.addEventListener('click', () => {
        this.choice.water = way;
        this.showPickers('water');
      });
      this.waterButtons.set(way, b);
      this.pickers.append(b);
    }
    for (const [way, label] of [
      ['deploy', 'Deploy'],
      ['recall', 'Recall'],
    ] as const) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.addEventListener('click', () => {
        this.choice.mirror = way;
        this.showPickers('mirror');
      });
      this.mirrorButtons.set(way, b);
      this.pickers.append(b);
    }
    for (const [way, label] of [
      ['close', 'Close'],
      ['open', 'Open'],
    ] as const) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.addEventListener('click', () => {
        this.choice.shade = way;
        this.showPickers('shade');
      });
      this.shadeButtons.set(way, b);
      this.pickers.append(b);
    }
    this.projects.className = 'chart-projects';
    this.root.append(this.title, this.canvas, this.line, this.lamps, this.gasBar, this.gasLabel, this.water, this.projects, this.events, this.pickers);
    // Clicks on the panel are its own, not the world's.
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    parent.append(this.root);
  }

  get visible(): boolean {
    return this.shown;
  }

  hide(): void {
    this.shown = false;
    this.root.hidden = true;
  }

  show(d: ChartData): void {
    this.shown = true;
    this.root.hidden = false;
    const { climate, target, settlesIn } = d.snapshot;
    this.title.textContent = `${d.name} · climate · ${TERRAFORM_MODE_LABEL[d.mode]}`;
    const settling = describeSettling(settlesIn);
    this.line.textContent =
      settlesIn > 0.5 ? `${celsius(climate.temperature)} → ${celsius(target.temperature)} · ${settling}` : `${celsius(climate.temperature)} · ${settling}`;
    const breathable = climate.composition === 'oxygenNitrogen';
    const liquid = climate.waterState === 'liquid';
    this.lamps.innerHTML = `<span class="tier">T${climate.habitability}</span><span class="lamp${breathable ? ' on' : ''}">breathable air</span><span class="lamp${liquid ? ' on' : ''}">liquid water</span>`;
    this.showGases(climate);
    const leak = d.leak > 0 ? ` · air leaking ${formatRate(d.leak)}` : '';
    this.water.textContent = `Water ${Math.round(climate.water * 100)}% · ${climate.waterState === 'none' ? 'none' : climate.waterState}${leak}`;
    this.projects.textContent = d.projects ?? '';
    this.projects.hidden = !d.projects;
    this.events.textContent = d.milestones
      .slice(-3)
      .map((e) => milestoneTitle(e))
      .join(' · ');
    this.events.hidden = d.milestones.length === 0;
    this.showPickers(d.picker);
    this.draw(d);
  }

  private showGases(climate: ClimateData): void {
    const p = climate.pressure;
    const parts = GASES.filter((g) => climate.gases[g] > 0);
    this.gasBar.replaceChildren(
      ...parts.map((g) => {
        const s = document.createElement('span');
        s.style.width = `${(100 * climate.gases[g]) / p}%`;
        s.style.background = GAS_COLOR[g];
        return s;
      }),
    );
    this.gasBar.hidden = parts.length === 0;
    this.gasLabel.textContent =
      parts.length === 0
        ? 'No air'
        : `${describeAtmosphere(climate)}: ` + parts.map((g) => `${GAS_NAME[g]} ${formatBar(climate.gases[g])}`).join(' · ');
  }

  private showPickers(picker: ChartData['picker']): void {
    this.pickers.hidden = picker === null;
    for (const [gas, b] of this.gasButtons) {
      b.hidden = picker !== 'gas';
      b.classList.toggle('on', this.choice.gas === gas);
    }
    for (const [way, b] of this.waterButtons) {
      b.hidden = picker !== 'water';
      b.classList.toggle('on', this.choice.water === way);
    }
    for (const [way, b] of this.mirrorButtons) {
      b.hidden = picker !== 'mirror';
      b.classList.toggle('on', this.choice.mirror === way);
    }
    for (const [way, b] of this.shadeButtons) {
      b.hidden = picker !== 'shade';
      b.classList.toggle('on', this.choice.shade === way);
    }
  }

  private draw(d: ChartData): void {
    const g = this.ctx;
    if (!g) return;
    const W = WIDTH;
    const H = HEIGHT;
    const px = (x: number) => 26 + x * (W - 34);
    const py = (y: number) => H - 18 - y * (H - 26);
    g.clearRect(0, 0, W, H);
    // The grid: a cell is 10 °C by a factor of √10.
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(255,255,255,0.07)';
    for (let c = CHART_CELSIUS.min; c <= CHART_CELSIUS.max; c += 10) {
      const x = px((c - CHART_CELSIUS.min) / (CHART_CELSIUS.max - CHART_CELSIUS.min));
      g.beginPath();
      g.moveTo(x, py(0));
      g.lineTo(x, py(1));
      g.stroke();
    }
    for (let l = CHART_LOG_BAR.min; l <= CHART_LOG_BAR.max; l += 0.5) {
      const y = py((l - CHART_LOG_BAR.min) / (CHART_LOG_BAR.max - CHART_LOG_BAR.min));
      g.beginPath();
      g.moveTo(px(0), y);
      g.lineTo(px(1), y);
      g.stroke();
    }
    // The tiers.
    const { t1, t2 } = tierRects();
    const rect = (r: typeof t1, fill: string, stroke: string) => {
      g.fillStyle = fill;
      g.strokeStyle = stroke;
      g.fillRect(px(r.x0), py(r.y1), px(r.x1) - px(r.x0), py(r.y0) - py(r.y1));
      g.strokeRect(px(r.x0) + 0.5, py(r.y1) + 0.5, px(r.x1) - px(r.x0) - 1, py(r.y0) - py(r.y1) - 1);
    };
    rect(t1, 'rgba(255, 200, 80, 0.08)', 'rgba(255, 200, 80, 0.45)');
    rect(t2, 'rgba(110, 255, 150, 0.12)', 'rgba(110, 255, 150, 0.7)');
    g.font = '10px system-ui, sans-serif';
    g.fillStyle = 'rgba(255, 200, 80, 0.8)';
    g.fillText('T1', px(t1.x0) + 3, py(t1.y1) + 11);
    g.fillStyle = 'rgba(110, 255, 150, 0.95)';
    g.fillText('T2–T3', px(t2.x0) + 3, py(t2.y1) + 11);
    // Tipping points: the cloud deck (CO₂ worlds), water freezing and boiling.
    const c = d.snapshot.climate;
    if (c.gases.co2 > 0.5) {
      const band = cloudDeckBand();
      g.fillStyle = 'rgba(255, 220, 140, 0.1)';
      g.fillRect(px(0), py(band.y1), px(1) - px(0), py(band.y0) - py(band.y1));
      g.fillStyle = 'rgba(255, 220, 140, 0.6)';
      g.fillText('cloud deck', px(0) + 3, py(band.y1) + 11);
    }
    g.setLineDash([3, 3]);
    g.strokeStyle = 'rgba(150, 210, 255, 0.6)';
    g.beginPath();
    g.moveTo(px(freezingX()), py(0));
    g.lineTo(px(freezingX()), py(1));
    g.stroke();
    g.strokeStyle = 'rgba(255, 140, 120, 0.6)';
    g.beginPath();
    boilingLine().forEach(([x, y], i) => {
      if (x > 1) return;
      if (i === 0) g.moveTo(px(x), py(y));
      else g.lineTo(px(x), py(y));
    });
    g.stroke();
    g.setLineDash([]);
    // Axes' labels.
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.fillText('−60', px(0) - 6, H - 5);
    g.fillText('0 °C', px(freezingX()) - 8, H - 5);
    g.fillText('80', px(1) - 10, H - 5);
    g.fillText('100', 2, py(1) + 8);
    g.fillText('1', 14, py(0.6) + 4);
    g.fillText('bar', 2, py(0.6) + 14);
    g.fillText('.001', 2, py(0));
    // The world, where it settles, and where the selected ray would take it.
    chartPoint(c, this.point);
    chartPoint(d.snapshot.target, this.ghost);
    if (d.forecast) {
      chartPoint(d.forecast, this.arrow);
      drawArrow(g, px(this.ghost.x), py(this.ghost.y), px(this.arrow.x), py(this.arrow.y));
    }
    if (Math.hypot(this.ghost.x - this.point.x, this.ghost.y - this.point.y) > 0.004) {
      g.strokeStyle = 'rgba(255,255,255,0.7)';
      g.setLineDash([2, 2]);
      g.beginPath();
      g.moveTo(px(this.point.x), py(this.point.y));
      g.lineTo(px(this.ghost.x), py(this.ghost.y));
      g.stroke();
      g.setLineDash([]);
      g.beginPath();
      g.arc(px(this.ghost.x), py(this.ghost.y), 4, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(px(this.point.x), py(this.point.y), 4.5, 0, Math.PI * 2);
    g.fill();
    // Off the chart: pinned to the edge, with its values.
    if (this.point.offX || this.point.offY) {
      g.fillStyle = '#ffffff';
      const label = `${celsius(c.temperature)}, ${formatBar(c.pressure)}`;
      const w = g.measureText(label).width;
      const x = Math.min(px(1) - w, Math.max(px(0), px(this.point.x) - w / 2));
      const y = this.point.y > 0.5 ? py(this.point.y) + 14 : py(this.point.y) - 7;
      g.fillText(label, x, y);
    }
  }
}

function drawArrow(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len < 2) return;
  g.strokeStyle = g.fillStyle = '#7dffa8';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
  const a = Math.atan2(y1 - y0, x1 - x0);
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x1 - 7 * Math.cos(a - 0.45), y1 - 7 * Math.sin(a - 0.45));
  g.lineTo(x1 - 7 * Math.cos(a + 0.45), y1 - 7 * Math.sin(a + 0.45));
  g.closePath();
  g.fill();
  g.lineWidth = 1;
}

function formatBar(bar: number): string {
  if (bar >= 10) return `${bar.toFixed(0)} bar`;
  if (bar >= 0.1) return `${bar.toFixed(2)} bar`;
  if (bar >= 0.001) return `${(bar * 1000).toFixed(0)} mbar`;
  return bar > 0 ? `${(bar * 1e6).toFixed(0)} µbar` : '0';
}

function formatRate(barPerSecond: number): string {
  return barPerSecond >= 0.001 ? `${(barPerSecond * 1000).toFixed(1)} mbar/s` : `${(barPerSecond * 1e6).toFixed(0)} µbar/s`;
}

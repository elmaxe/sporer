import { HABITABILITY, WATER_TRIPLE_POINT, boilingPoint, type ClimateData } from '../gen/climate';

/*
 * The climate chart's layout (docs/design/terraforming.md, "The climate
 * chart"): temperature across, pressure up on a log scale, the tiers as
 * rectangles from HABITABILITY, and the tipping points as lines. Pure: chart
 * coordinates 0–1 (x right, y up) for terraform/ClimateChart.ts to draw.
 */

/** The temperature axis, °C. */
export const CHART_CELSIUS = { min: -60, max: 80 } as const;
/** The pressure axis, log10 bar: 1 mbar to 100 bar. */
export const CHART_LOG_BAR = { min: -3, max: 2 } as const;
/** One cell of the grid: 10 °C across, a factor of √10 up. */
export const CHART_CELL = { celsius: 10, logBar: 0.5 } as const;

const KELVIN = 273.15;

/** x (0–1) of a temperature in K; outside 0–1 off the chart. */
export function chartX(kelvin: number): number {
  return (kelvin - KELVIN - CHART_CELSIUS.min) / (CHART_CELSIUS.max - CHART_CELSIUS.min);
}

/** y (0–1, up) of a pressure in bar; outside 0–1 off the chart (−Infinity for none). */
export function chartY(bar: number): number {
  return (Math.log10(Math.max(bar, 1e-12)) - CHART_LOG_BAR.min) / (CHART_LOG_BAR.max - CHART_LOG_BAR.min);
}

/** A world on the chart: where it's drawn (pinned inside the edges) and which way it's off the chart (−1, 0 or 1 on each axis). */
export interface ChartPoint {
  x: number;
  y: number;
  offX: -1 | 0 | 1;
  offY: -1 | 0 | 1;
}

function pin(v: number): [number, -1 | 0 | 1] {
  if (v < 0) return [0, -1];
  if (v > 1) return [1, 1];
  return [v, 0];
}

export function chartPoint(c: Pick<ClimateData, 'temperature' | 'pressure'>, out: Partial<ChartPoint> = {}): ChartPoint {
  const [x, offX] = pin(chartX(c.temperature));
  const [y, offY] = pin(chartY(c.pressure));
  return Object.assign(out, { x, y, offX, offY });
}

/** A rectangle in chart coordinates. */
export interface ChartRect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** The tiers' rectangles: T1 at any real pressure (from water's triple point up), T2 (and T3, with its two lamps) at 0.3–5 bar. */
export function tierRects(): { t1: ChartRect; t2: ChartRect } {
  const { survivable: s, comfortable: c } = HABITABILITY;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return {
    t1: { x0: clamp(chartX(s.min)), x1: clamp(chartX(s.max)), y0: clamp(chartY(s.minPressure)), y1: 1 },
    t2: { x0: clamp(chartX(c.min)), x1: clamp(chartX(c.max)), y0: clamp(chartY(c.minPressure)), y1: clamp(chartY(c.maxPressure)) },
  };
}

/** x of water's freezing line (its triple point, 0.01 °C). */
export function freezingX(): number {
  return chartX(WATER_TRIPLE_POINT.temperature);
}

/** Water's boiling line as points (x, y) up the chart: hotter than it, seas boil off. */
export function boilingLine(samples = 24): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= samples; i++) {
    const logBar = CHART_LOG_BAR.min + ((CHART_LOG_BAR.max - CHART_LOG_BAR.min) * i) / samples;
    const bar = 10 ** logBar;
    if (bar < WATER_TRIPLE_POINT.pressure) continue;
    out.push([chartX(boilingPoint(bar)), chartY(bar)]);
  }
  return out;
}

/** The band of CO₂ pressure over which a Venus-like cloud deck forms (gen/climate.ts cloudCover: 3 to 30 bar). */
export function cloudDeckBand(): { y0: number; y1: number } {
  return { y0: chartY(3), y1: Math.min(1, chartY(30)) };
}

/** e.g. "settles in ~40 s", "settles in ~3 min", "settled". */
export function describeSettling(seconds: number): string {
  if (!(seconds > 0.5)) return 'settled';
  if (seconds < 90) return `settles in ~${Math.max(1, Math.round(seconds / (seconds < 20 ? 1 : 5)) * (seconds < 20 ? 1 : 5))} s`;
  if (seconds < 5400) return `settles in ~${Math.round(seconds / 60)} min`;
  return `settles in ~${Math.round(seconds / 3600)} h`;
}

/**
 * Pure maths of the third-person view's overview camera (ui/ThirdPersonControl.ts):
 * it orbits the centre of what it overlooks (a planet, a system, the galaxy),
 * turned by dragging and zoomed by the wheel, framing the whole of it at zoom 1.
 */

/** Where the overview looks from: round the centre by `yaw` and above its plane by `pitch` (radians), `zoom` times its first distance. */
export interface OverviewAim {
  yaw: number;
  pitch: number;
  zoom: number;
}

export const overviewParams = {
  /** Radians turned per pixel dragged. */
  turn: 0.005,
  /** The distance doubles every this many pixels of wheel. */
  zoomPixels: 400,
  /** How far it zooms in and out from framing the whole. */
  minZoom: 0.01,
  maxZoom: 50,
  /** Short of straight above or below (radians), where yaw would spin. */
  maxPitch: 1.55,
  /** How high above the real camera the overview starts (radians), to look down on it. */
  startPitch: 0.35,
  /** Room round the whole at zoom 1. */
  margin: 1.15,
};

/** An aim from the direction (x, y, z) out from the centre, raised by `lift` radians: the overview starts on the real camera's side. */
export function aimFrom(x: number, y: number, z: number, lift = overviewParams.startPitch): OverviewAim {
  const flat = Math.hypot(x, z);
  const yaw = flat > 1e-9 ? Math.atan2(x, z) : 0;
  const pitch = flat > 1e-9 || y !== 0 ? Math.atan2(y, flat) : 0;
  return { yaw, pitch: clampPitch(pitch + lift), zoom: 1 };
}

/** Turns the aim by a drag (pixels; right turns the view right, down tips it down) and zooms by the wheel (pixels, + = out). */
export function steerAim(aim: OverviewAim, dragX: number, dragY: number, wheel: number): void {
  const p = overviewParams;
  aim.yaw -= dragX * p.turn;
  aim.pitch = clampPitch(aim.pitch + dragY * p.turn);
  aim.zoom = Math.min(p.maxZoom, Math.max(p.minZoom, aim.zoom * 2 ** (wheel / p.zoomPixels)));
}

/** How far from the centre the overview sits: at zoom 1 a sphere of `radius` fills a view `fov` degrees tall, never closer than `minDistance`. */
export function overviewDistance(radius: number, fov: number, zoom: number, minDistance: number): number {
  const whole = (radius * overviewParams.margin) / Math.sin(((fov / 2) * Math.PI) / 180);
  return Math.max(whole * zoom, minDistance);
}

/** The offset from the centre for `aim` at `distance`, into `out` (+Y up). */
export function overviewOffset(aim: OverviewAim, distance: number, out: { x: number; y: number; z: number }): void {
  const c = Math.cos(aim.pitch);
  out.x = distance * c * Math.sin(aim.yaw);
  out.y = distance * Math.sin(aim.pitch);
  out.z = distance * c * Math.cos(aim.yaw);
}

function clampPitch(pitch: number): number {
  const m = overviewParams.maxPitch;
  return Math.min(m, Math.max(-m, pitch));
}

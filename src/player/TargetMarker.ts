import type * as THREE from 'three';
import type { Entity } from '../core/Entity';
import { MarkerRing } from './MarkerRing';
import type { Ship } from './Ship';

/** On-screen size of a point marker, as a fraction of its distance from the camera. */
const POINT_MARKER_SIZE = 0.025;

/**
 * Pulsing ring showing where the autopilot is going: flat on the ship's plane
 * for a point in space, or facing the camera around a target body (dimmer
 * once the ship is parked there). Hidden while the autopilot is idle.
 */
export class TargetMarker implements Entity {
  private readonly ring: MarkerRing;

  constructor(
    scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    private readonly ship: Ship,
  ) {
    this.ring = new MarkerRing(scene, '#66ffcc');
  }

  update(frameDt: number): void {
    const { ship } = this;
    // Fades with the UFO while it shrinks away or grows back (level transitions).
    const fade = ship.object.visible ? ship.object.scale.x : 0;
    if (!ship.autopilotActive || fade < 0.01) {
      this.ring.hide();
      return;
    }
    const body = ship.targetBody;
    if (body) {
      // 1.45 radii keeps it clear of the limb and the atmosphere's bright lower part (it's drawn over the haze).
      this.ring.place(body.renderPosition, body.radius * 1.45 + 1, (ship.enRoute ? 0.9 : 0.35) * fade, this.camera, frameDt);
    } else {
      const size = Math.max(1.5, ship.destination.distanceTo(this.camera.position) * POINT_MARKER_SIZE);
      this.ring.place(ship.destination, size, 0.9 * fade, null, frameDt);
    }
  }

  /** Hides the ring until the next update. */
  hide(): void {
    this.ring.hide();
  }

  dispose(): void {
    this.ring.dispose();
  }
}

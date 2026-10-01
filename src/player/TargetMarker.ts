import type * as THREE from 'three';
import type { Entity } from '../core/Entity';
import { MarkerRing } from './MarkerRing';
import type { Ship } from './Ship';

/**
 * Pulsing ring facing the camera around the body the ship is flying to, or
 * (dimmer) the one it's hovering at.
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
    if (fade < 0.01) {
      this.ring.hide();
      return;
    }
    const body = ship.targetBody;
    // 1.45 radii keeps it clear of the limb and the atmosphere's bright lower part (it's drawn over the haze).
    this.ring.place(body.renderPosition, body.radius * 1.45 + 1, (ship.enRoute ? 0.9 : 0.35) * fade, this.camera, frameDt);
  }

  /** Hides the ring until the next update. */
  hide(): void {
    this.ring.hide();
  }

  dispose(): void {
    this.ring.dispose();
  }
}

import * as THREE from 'three';
import type { Entity } from '../core/Entity';
import type { Ship } from './Ship';

/** On-screen size of a point marker, as a fraction of its distance from the camera. */
const POINT_MARKER_SIZE = 0.025;

/**
 * Pulsing ring showing where the autopilot is going: flat on the ship's plane
 * for a point in space, or facing the camera around a target body (dimmer
 * once the ship is parked there). Hidden while the autopilot is idle.
 */
export class TargetMarker implements Entity {
  private readonly mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private readonly flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  private time = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    private readonly ship: Ship,
  ) {
    this.mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1, 64),
      new THREE.MeshBasicMaterial({
        color: '#66ffcc',
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  update(frameDt: number): void {
    const { ship, mesh } = this;
    mesh.visible = ship.autopilotActive;
    if (!mesh.visible) return;

    this.time += frameDt;
    const pulse = 1 + 0.08 * Math.sin(this.time * 5);
    const body = ship.targetBody;
    let size: number;
    if (body) {
      mesh.position.copy(body.renderPosition);
      mesh.lookAt(this.camera.position);
      size = body.radius * 1.45 + 1; // clear of the atmosphere glow (1.2 radii)
      mesh.material.opacity = ship.enRoute ? 0.9 : 0.35;
    } else {
      mesh.position.copy(ship.destination);
      mesh.quaternion.copy(this.flat);
      size = Math.max(1.5, mesh.position.distanceTo(this.camera.position) * POINT_MARKER_SIZE);
      mesh.material.opacity = 0.9;
    }
    mesh.scale.setScalar(size * pulse);
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

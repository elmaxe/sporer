import * as THREE from 'three';

const FLAT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

/**
 * A pulsing, glowing ring used to mark targets and locations. Not an Entity:
 * its owner calls `place` (or `hide`) every frame from its own `update`.
 */
export class MarkerRing {
  private readonly mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private time = 0;

  constructor(
    private readonly scene: THREE.Scene,
    color: THREE.ColorRepresentation,
    /** Pulse amplitude as a fraction of the size; 0 for a steady ring. */
    private readonly pulse = 0.08,
    /** Line width as a fraction of the radius. */
    width = 0.15,
  ) {
    this.mesh = new THREE.Mesh(
      new THREE.RingGeometry(1 - width, 1, 64),
      new THREE.MeshBasicMaterial({
        color,
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

  /**
   * Shows the ring at `position` with outer radius `size`. It faces `camera`
   * (billboard) or, with `camera` null, lies flat in the horizontal plane.
   */
  place(
    position: THREE.Vector3,
    size: number,
    opacity: number,
    camera: THREE.Camera | null,
    frameDt: number,
  ): void {
    const { mesh } = this;
    this.time += frameDt;
    mesh.visible = true;
    mesh.position.copy(position);
    // Face the camera's position, not its view plane, so the ring never cuts through a body.
    if (camera) mesh.lookAt(camera.position);
    else mesh.quaternion.copy(FLAT);
    mesh.scale.setScalar(size * (1 + this.pulse * Math.sin(this.time * 5)));
    mesh.material.opacity = opacity;
  }

  hide(): void {
    this.mesh.visible = false;
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

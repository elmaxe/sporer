import * as THREE from 'three';
import type { Entity } from '../core/Entity';
import type { Input } from '../core/Input';
import { PLANT_KINDS } from '../gen/plants';
import type { Tooltip } from '../ui/Tooltip';
import type { SurfaceEntities } from './SurfaceEntities';

/**
 * Shows the plant under the pointer in the tooltip: it proves `pick` works
 * (see SurfaceEntities) and gives the ground something to read. Added after
 * the camera, so the ray is this frame's. Only while `active` (the planet
 * level's HUD has the DOM while it is the level on screen).
 */
export class PlantTooltip implements Entity {
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private active = false;
  private shown = false;

  constructor(
    private readonly camera: THREE.Camera,
    private readonly input: Input,
    private readonly plants: SurfaceEntities,
    private readonly tooltip: Tooltip,
  ) {}

  activate(): void {
    this.active = true;
  }

  deactivate(): void {
    this.active = false;
    this.hide();
  }

  update(): void {
    if (!this.active) return;
    const { pointer } = this.input;
    const hovering = pointer.inside && !this.input.isDragging && !this.input.blocked;
    if (hovering) {
      this.raycaster.setFromCamera(this.ndc.set(pointer.ndcX, pointer.ndcY), this.camera);
      const hit = this.plants.pick(this.raycaster.ray);
      if (hit) {
        const { species, plant } = hit;
        const height = species.height * plant.scale;
        this.tooltip.show(hit.id, species.name, `${PLANT_KINDS[species.kind].label} · ${height.toFixed(1)} u tall`, pointer.clientX, pointer.clientY, undefined, this.input.touchMode);
        this.shown = true;
        return;
      }
    }
    this.hide();
  }

  private hide(): void {
    if (!this.shown) return;
    this.shown = false;
    this.tooltip.hide();
  }

  dispose(): void {
    this.hide();
  }
}

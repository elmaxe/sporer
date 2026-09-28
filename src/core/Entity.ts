/**
 * Anything that lives in the game. The Game calls these hooks in this order:
 *
 *   per fixed step (60 Hz): fixedUpdate(dt) → physics.step() → afterPhysics()
 *   per rendered frame:     update(frameDt, alpha)  → render
 *
 * `alpha` in [0, 1) is how far the frame is between the last two fixed steps;
 * use it to interpolate visuals so motion is smooth at any refresh rate.
 */
export interface Entity {
  /** Gameplay + forces. Runs at a fixed rate, so it is frame-rate independent. */
  fixedUpdate?(dt: number): void;
  /** Read results of the physics step (e.g. copy body transforms). */
  afterPhysics?(): void;
  /** Visual-only work: interpolation, animation, camera, UI. */
  update?(frameDt: number, alpha: number): void;
  /** Remove meshes from the scene, free geometries/materials/bodies. */
  dispose(): void;
}

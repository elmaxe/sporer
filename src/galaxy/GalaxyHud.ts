import * as THREE from 'three';
import type { Entity } from '../core/Entity';
import type { Input } from '../core/Input';
import type { GalaxyData, StarRef } from '../gen/galaxy';
import { describeStars } from '../gen/stars';
import { MarkerRing } from '../player/MarkerRing';
import { HelpText } from '../ui/HelpText';
import type { Tooltip } from '../ui/Tooltip';
import { galaxyStarSize } from './appearance';
import type { GalaxyMap } from './GalaxyMap';
import type { GalaxyPicker } from './GalaxyPicker';
import type { GalaxyShip } from './GalaxyShip';

const REFRESH_SECONDS = 0.1;
const HELP = 'Click a star: travel there · Scroll in at a star: enter its system · Scroll: zoom · Drag: rotate view · M: mute';
const TOUCH_HELP = 'Tap a star: travel there · Pinch in at a star: enter its system · Pinch: zoom · Drag: rotate view · Hold: identify';

/**
 * The galaxy level's overlay: HUD text, star tooltip, and rings marking the
 * current star, the travel destination and the hovered star.
 */
export class GalaxyHud implements Entity {
  private readonly locationEl = document.getElementById('hud-location')!;
  private readonly speedEl = document.getElementById('hud-speed')!;
  private readonly targetEl = document.getElementById('hud-target')!;
  private readonly help: HelpText;
  private readonly currentRing: MarkerRing;
  private readonly destinationRing: MarkerRing;
  private readonly hoverRing: MarkerRing;
  private readonly at = new THREE.Vector3();
  private sinceRefresh = REFRESH_SECONDS;
  private active = false;
  /** Hides the rings (e.g. while diving into a star). */
  hideMarkers = false;

  constructor(
    scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    private readonly input: Input,
    private readonly galaxy: GalaxyData,
    private readonly ship: GalaxyShip,
    private readonly picker: GalaxyPicker,
    private readonly tooltip: Tooltip,
    private readonly map: GalaxyMap,
    /** The galaxy's rotating root; star positions are in its frame, the rings in the scene's. */
    private readonly root: THREE.Object3D,
  ) {
    this.currentRing = new MarkerRing(scene, '#66ffcc', 0, 0.08);
    this.destinationRing = new MarkerRing(scene, '#66ffcc', 0.08, 0.08);
    this.hoverRing = new MarkerRing(scene, '#cfe3ff', 0, 0.08);
    this.help = new HelpText(input, HELP, TOUCH_HELP);
  }

  activate(): void {
    this.active = true;
    this.help.refresh(true);
    this.speedEl.textContent = '';
    this.sinceRefresh = REFRESH_SECONDS;
  }

  deactivate(): void {
    this.active = false;
    this.tooltip.hide();
  }

  update(frameDt: number): void {
    const { ship } = this;
    const hovered = this.picker.hovered;
    const show = !this.hideMarkers;
    this.mark(this.currentRing, show && !ship.travelling ? ship.current : null, 0.5, frameDt);
    this.mark(this.destinationRing, show ? ship.destination : null, 0.9, frameDt);
    this.mark(this.hoverRing, show && hovered !== ship.current && hovered !== ship.destination ? hovered : null, 0.35, frameDt);
    // Still drawn while crossfading out, but the DOM belongs to the level taking over.
    if (!this.active) return;
    // The star you're at (or heading to) and the one under the pointer shine steadily.
    this.map.holdSteady(ship.destination ?? ship.current, hovered);

    if (hovered) {
      const here = hovered === ship.current && !ship.travelling ? ' · you are here' : '';
      const { clientX, clientY } = this.input.pointer;
      this.tooltip.show(hovered, hovered.name, describeStars(hovered.stars) + here, clientX, clientY, undefined, this.input.touchMode);
    } else {
      this.tooltip.hide();
    }

    this.sinceRefresh += frameDt;
    if (this.sinceRefresh < REFRESH_SECONDS) return;
    this.sinceRefresh = 0;
    this.help.refresh();
    this.locationEl.textContent = ship.travelling
      ? `Galaxy · ${this.galaxy.stars.length} stars · in deep space`
      : `Galaxy · ${this.galaxy.stars.length} stars · at ${ship.current.name}`;
    this.targetEl.textContent = ship.destination ? `Travelling → ${ship.destination.name}` : '';
  }

  dispose(): void {
    this.currentRing.dispose();
    this.destinationRing.dispose();
    this.hoverRing.dispose();
    this.tooltip.hide();
  }

  private mark(ring: MarkerRing, star: StarRef | null, opacity: number, frameDt: number): void {
    if (!star) {
      ring.hide();
      return;
    }
    this.at.set(star.position.x, star.position.y, star.position.z).applyMatrix4(this.root.matrixWorld);
    // At least 2% of the view distance, so rings stay visible when zoomed out.
    const size = Math.max(galaxyStarSize(star) * 1.2 + 0.6, this.at.distanceTo(this.camera.position) * 0.02);
    ring.place(this.at, size, opacity, this.camera, frameDt);
  }
}

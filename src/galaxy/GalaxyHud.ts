import * as THREE from 'three';
import type { Entity } from '../core/Entity';
import type { Input } from '../core/Input';
import type { GalaxyData, StarRef } from '../gen/galaxy';
import { describeNebula } from '../gen/nebulas';
import { describeStars } from '../gen/stars';
import { describeRogue, isRogue } from '../gen/rogues';
import { describeSized, generateSystem } from '../gen/system';
import { MarkerRing } from '../player/MarkerRing';
import { HelpText } from '../ui/HelpText';
import type { Tooltip } from '../ui/Tooltip';
import { galaxyStarSize } from './appearance';
import { CourseLine } from './CourseLine';
import { describeDistance } from './distance';
import type { GalaxyMap } from './GalaxyMap';
import type { GalaxyPicker } from './GalaxyPicker';
import type { GalaxyShip } from './GalaxyShip';
import { summarizeSystem, type SystemSummary } from './systemSummary';
import { renderSystemSummary } from './systemSummaryView';

const REFRESH_SECONDS = 0.1;
/** Systems whose body list is kept for the tooltip (generating one takes under a millisecond). */
const SUMMARY_CACHE = 64;
const HELP =
  'Click a star, rogue planet or nebula: travel there · Scroll in at a star or rogue: enter it · Scroll: zoom · Drag: rotate view · M: mute · Esc: menu';
const TOUCH_HELP =
  'Tap a star, rogue planet or nebula: travel there · Pinch in at a star or rogue: enter it · Pinch: zoom · Drag: rotate view · Hold: identify';

/**
 * The galaxy level's overlay: HUD text, star tooltip (with the distance from
 * the ship), rings marking the current star, the travel destination and the
 * hovered star, and lines from the ship to the destination and the hovered star.
 */
export class GalaxyHud implements Entity {
  private readonly locationEl = document.getElementById('hud-location')!;
  private readonly speedEl = document.getElementById('hud-speed')!;
  private readonly targetEl = document.getElementById('hud-target')!;
  private readonly help: HelpText;
  private readonly currentRing: MarkerRing;
  private readonly destinationRing: MarkerRing;
  private readonly hoverRing: MarkerRing;
  /** The course being flown, ship to destination. */
  private readonly courseLine: CourseLine;
  /** The course a click would set, ship to hovered star. */
  private readonly hoverLine: CourseLine;
  private readonly at = new THREE.Vector3();
  private readonly shipAt = new THREE.Vector3();
  private sinceRefresh = REFRESH_SECONDS;
  private readonly summaries = new Map<number, SystemSummary>();
  /** Rogue planets' tooltip lines, by id. */
  private readonly rogueLines = new Map<number, string>();
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
    this.courseLine = new CourseLine(scene, { color: '#66ffcc', widthFrom: 5, widthTo: 1.5, flow: true });
    this.hoverLine = new CourseLine(scene, { color: '#cfe3ff', widthFrom: 4, widthTo: 1, flow: false });
    this.help = new HelpText(input, HELP, TOUCH_HELP);
  }

  /** The course line to the destination is drawn (automation and tests). */
  get courseShown(): boolean {
    return this.courseLine.shown;
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
    const hoverOther = hovered && hovered !== ship.destination && (ship.travelling || hovered !== ship.current);
    this.mark(this.hoverRing, show && hovered !== ship.current && hovered !== ship.destination ? hovered : null, 0.35, frameDt);
    this.shipAt.copy(ship.object.position).applyMatrix4(this.root.matrixWorld);
    this.line(this.courseLine, show ? ship.destination : null, 0.9, frameDt);
    this.line(this.hoverLine, show && hoverOther ? hovered : null, 0.55, frameDt);
    // Still drawn while crossfading out, but the DOM belongs to the level taking over.
    if (!this.active) return;
    // The star you're at (or heading to) and the one under the pointer shine steadily.
    this.map.holdSteady(ship.destination ?? ship.current, hovered);

    const nebula = this.picker.hoveredNebula;
    const { clientX, clientY } = this.input.pointer;
    if (hovered) {
      const isHere = hovered === ship.current && !ship.travelling;
      const here = isHere ? ' · you are here' : '';
      const inside = hovered.nebula ? ` · in the ${hovered.nebula.name}` : '';
      this.tooltip.show(
        hovered,
        hovered.name,
        this.describe(hovered) + inside + here,
        clientX,
        clientY,
        isHere ? undefined : `${describeDistance(ship.distanceTo(hovered))} away`,
        this.input.touchMode,
        (el) => renderSystemSummary(el, this.summary(hovered)),
      );
    } else if (nebula) {
      this.tooltip.show(nebula, nebula.name, describeNebula(nebula.kind), clientX, clientY, undefined, this.input.touchMode);
    } else {
      this.tooltip.hide();
    }

    this.sinceRefresh += frameDt;
    if (this.sinceRefresh < REFRESH_SECONDS) return;
    this.sinceRefresh = 0;
    this.help.refresh();
    this.locationEl.textContent = ship.travelling
      ? `Galaxy · ${this.galaxy.stars.length} stars · in deep space`
      : `Galaxy · ${this.galaxy.stars.length} stars · at ${ship.current.name}` +
        (isRogue(ship.current) ? ' (rogue planet)' : '') +
        (ship.current.nebula ? ` · in the ${ship.current.nebula.name}` : '');
    this.targetEl.textContent = ship.destination
      ? `Travelling → ${ship.destination.name} · ${describeDistance(ship.distanceTo(ship.destination))} to go`
      : '';
  }

  dispose(): void {
    this.currentRing.dispose();
    this.destinationRing.dispose();
    this.hoverRing.dispose();
    this.courseLine.dispose();
    this.hoverLine.dispose();
    this.tooltip.hide();
  }

  /** "G main sequence star", or for a rogue planet "Rogue planet · ice world · Earth-sized · …". */
  private describe(ref: StarRef): string {
    if (!isRogue(ref)) return describeStars(ref.stars) + (ref.young ? ' · young, in a dusty disc' : '');
    let line = this.rogueLines.get(ref.id);
    if (!line) {
      const planet = generateSystem(ref).planets[0]!;
      line = describeRogue(describeSized(planet.type, planet.size));
      this.rogueLines.set(ref.id, line);
    }
    return line;
  }

  /** The hovered system's bodies, generated on first hover and kept for the next few. */
  private summary(star: StarRef): SystemSummary {
    let summary = this.summaries.get(star.id);
    if (!summary) {
      summary = summarizeSystem(generateSystem(star));
      if (this.summaries.size >= SUMMARY_CACHE) this.summaries.delete(this.summaries.keys().next().value!);
      this.summaries.set(star.id, summary);
    }
    return summary;
  }

  /** Draws `line` from the ship to `star`, or hides it with no star. */
  private line(line: CourseLine, star: StarRef | null, opacity: number, frameDt: number): void {
    if (!star) {
      line.hide();
      return;
    }
    this.at.set(star.position.x, star.position.y, star.position.z).applyMatrix4(this.root.matrixWorld);
    line.place(this.shipAt, this.at, opacity, frameDt);
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

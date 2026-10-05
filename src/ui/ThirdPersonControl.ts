import * as THREE from 'three';
import type { Entity } from '../core/Entity';
import type { Game } from '../core/Game';
import { aimFrom, overviewDistance, overviewOffset, steerAim, type OverviewAim } from '../debug/overview';
import type { Level, Overview } from '../levels/Level';
import { setThirdPerson, thirdPerson } from '../world/thirdPerson';
import { frozenStats, resetFrozenStats, viewFreeze } from '../world/viewFreeze';

const TOGGLE_KEY = 'KeyC';
const STEER_KEY = 'KeyV';

/** The overview's clipping range: near and far as shares of its distance from the centre. */
const NEAR_SHARE = 1e-3;
const FAR_SHARE = 40;

/**
 * The debug third-person view (#graphics-third-person in the menu, or C; see
 * world/thirdPerson.ts): each level is drawn from an overview camera round
 * the whole planet, system or galaxy (`Level.overview`), while the game's own
 * camera goes on choosing and culling what's drawn and shows as a marker.
 * Dragging and the wheel (or a pinch) turn and zoom the overview; V, or the
 * note's button, hands them back to the game's camera and back again, so
 * both can be moved while watching. Either way a click picks what's under
 * the pointer in the overview (a planet to fly to, a spot on the globe), and
 * with the game's camera steering, held tools (the laser, the beam) work
 * too. Each level keeps its own overview, starting on the side the game's
 * camera is. While on, a note at the top
 * (#third-person-note) says so and how many objects the game camera's
 * frustum left out. Not saved. A global entity, before the levels, so it
 * takes the drags before their cameras do.
 */
export class ThirdPersonControl implements Entity {
  private readonly button = document.getElementById('graphics-third-person') as HTMLButtonElement | null;
  private readonly note: HTMLElement;
  private readonly noteText: HTMLElement;
  private readonly steerButton: HTMLButtonElement;
  private readonly view = new THREE.PerspectiveCamera();
  private readonly aims = new WeakMap<Level, OverviewAim>();
  private readonly overview: Overview = { centre: new THREE.Vector3(), radius: 1, minDistance: 0 };
  private readonly offset = new THREE.Vector3();
  /** Whether drags and the wheel turn the overview (else the game's camera, as usual). */
  private steerOverview = true;
  private text = '';

  constructor(private readonly game: Game) {
    this.note =
      document.getElementById('third-person-note') ??
      document.body.appendChild(Object.assign(document.createElement('div'), { id: 'third-person-note', hidden: true }));
    this.noteText = this.note.querySelector('span') ?? this.note.appendChild(document.createElement('span'));
    this.steerButton = this.note.querySelector('button') ?? this.note.appendChild(Object.assign(document.createElement('button'), { type: 'button' }));
    this.view.name = 'Third-person overview';
    this.button?.addEventListener('click', this.onToggle);
    this.steerButton.addEventListener('click', this.onSteer);
    window.addEventListener('keydown', this.onKey);
    this.render();
  }

  get on(): boolean {
    return thirdPerson.view !== null;
  }

  set on(on: boolean) {
    if (on === this.on) return;
    setThirdPerson(on ? this.view : null, this.game.camera);
    this.game.viewCamera = on ? this.cameraFor : null;
    this.steerOverview = true;
    resetFrozenStats();
    this.render();
  }

  /** Whether drags and the wheel turn the overview (true) or the game's camera (false). */
  get steering(): 'overview' | 'game' {
    return this.steerOverview ? 'overview' : 'game';
  }

  set steering(to: 'overview' | 'game') {
    this.steerOverview = to === 'overview';
    this.render();
  }

  /** The current level's overview aim (for automation: turn or zoom it by hand). */
  get aim(): OverviewAim | null {
    const level = this.game.level;
    return level ? (this.aims.get(level) ?? null) : null;
  }

  update(): void {
    if (!this.on) return;
    const input = this.game.input;
    const level = this.game.level;
    if (this.steerOverview && level) {
      const drag = input.consumeDrag();
      const wheel = input.consumeWheel();
      // Clicks go on to the game, picking along the overview's rays (world/thirdPerson.ts pointerCamera); held
      // tools' presses don't, since a tool taking the press would stop the drag turning the overview.
      input.consumePress();
      const aim = this.aims.get(level);
      if (aim) steerAim(aim, drag.x, drag.y, wheel);
    }
    // Last frame's counts (this runs before the level draws); the freeze's note shows them while frozen.
    if (viewFreeze.enabled) return;
    const { tested, culled } = frozenStats;
    resetFrozenStats();
    const text = input.touchMode ? `Third person · culls ${culled} of ${tested}` : `Third-person view (C to leave) · frustum culls ${culled} of ${tested}`;
    if (text !== this.text) this.noteText.textContent = this.text = text;
  }

  dispose(): void {
    this.on = false;
    this.button?.removeEventListener('click', this.onToggle);
    this.steerButton.removeEventListener('click', this.onSteer);
    window.removeEventListener('keydown', this.onKey);
    this.note.remove();
  }

  /** The overview of `level`, posed after the level has moved the game's `camera` (Game.viewCamera). */
  private cameraFor = (level: Level, camera: THREE.PerspectiveCamera): THREE.PerspectiveCamera => {
    // Nothing draws with the game's camera now, which would keep its matrices up to date: what reads them next frame needs them.
    camera.updateMatrixWorld();
    const { centre, radius, minDistance } = level.overview(this.overview);
    let aim = this.aims.get(level);
    if (!aim) {
      this.offset.copy(camera.position).sub(centre);
      this.aims.set(level, (aim = aimFrom(this.offset.x, this.offset.y, this.offset.z)));
    }
    const view = this.view;
    const distance = overviewDistance(radius, camera.fov, aim.zoom, minDistance);
    overviewOffset(aim, distance, this.offset);
    view.position.copy(centre).add(this.offset);
    view.up.set(0, 1, 0);
    view.lookAt(centre);
    const near = distance * NEAR_SHARE;
    const far = Math.max(distance * FAR_SHARE, camera.far);
    if (view.fov !== camera.fov || view.aspect !== camera.aspect || view.near !== near || view.far !== far) {
      view.fov = camera.fov;
      view.aspect = camera.aspect;
      view.near = near;
      view.far = far;
      view.updateProjectionMatrix();
    }
    view.layers.mask = camera.layers.mask;
    view.updateMatrixWorld();
    thirdPerson.centre.copy(centre);
    return view;
  };

  private render(): void {
    const on = this.on;
    this.note.hidden = !on;
    if (on) this.noteText.textContent = this.text = 'Third-person view';
    this.steerButton.textContent = `${this.game.input.touchMode ? '' : 'V: '}steering ${this.steerOverview ? 'the overview' : 'the game camera'}`;
    if (!this.button) return;
    this.button.textContent = `Third-person view: ${on ? 'on' : 'off'}`;
    this.button.setAttribute('aria-pressed', String(on));
  }

  private onToggle = () => {
    this.on = !this.on;
  };

  private onSteer = () => {
    this.steering = this.steerOverview ? 'game' : 'overview';
  };

  private onKey = (e: KeyboardEvent) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
    if (e.code === TOGGLE_KEY) this.onToggle();
    else if (e.code === STEER_KEY && this.on) this.onSteer();
  };
}

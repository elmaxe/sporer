import type { SoundEffects } from '../audio/sfx';
import type { Entity } from '../core/Entity';
import { milestoneTitle, type MilestoneEvent } from './milestones';

/** Seconds each banner stays up (the last of them fading). */
const SHOW_SECONDS = 3.5;
const FADE_SECONDS = 0.6;

/**
 * Terraforming's milestones as they're reached (terraform/milestones.ts): a
 * banner across the top, one at a time ("First rain" over "Haikrai III"),
 * with the `milestone` sound cue. A global entity (milestones are reached
 * wherever the ship is); its element is made here.
 */
export class MilestoneBanner implements Entity {
  private readonly root = document.createElement('div');
  private readonly queue: { title: string; body: string }[] = [];
  private age = Infinity;
  /** Every banner shown, for tests. */
  readonly shownTitles: string[] = [];

  constructor(private readonly sfx: SoundEffects) {
    this.root.id = 'milestone';
    this.root.hidden = true;
    this.root.setAttribute('role', 'status');
    document.body.append(this.root);
  }

  push(body: string, event: MilestoneEvent): void {
    this.queue.push({ title: milestoneTitle(event), body });
  }

  update(frameDt: number): void {
    this.age += frameDt;
    if (this.age >= SHOW_SECONDS) {
      const next = this.queue.shift();
      if (!next) {
        this.root.hidden = true;
        return;
      }
      this.age = 0;
      this.root.replaceChildren(document.createTextNode(next.title));
      const small = document.createElement('small');
      small.textContent = next.body;
      this.root.append(small);
      this.root.hidden = false;
      this.shownTitles.push(next.title);
      this.sfx.play('milestone');
    }
    this.root.style.opacity = String(Math.min(1, (SHOW_SECONDS - this.age) / FADE_SECONDS));
  }

  dispose(): void {
    this.root.remove();
  }
}

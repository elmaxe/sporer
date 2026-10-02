/** Tooltip offset from the pointer, in CSS pixels. */
const OFFSET = 16;
/** Gap between a finger and the tooltip above it: clear of the fingertip. */
const FINGER_OFFSET = 56;
/** Closest the tooltip comes to the window's edges. */
const MARGIN = 8;

/** The hover tooltip (#tooltip in index.html), shared by every level's HUD. */
export class Tooltip {
  private readonly el = document.getElementById('tooltip')!;
  private readonly nameEl = document.getElementById('tooltip-name')!;
  private readonly infoEl = document.getElementById('tooltip-info')!;
  private readonly detailsEl = document.getElementById('tooltip-details')!;
  private readonly extraEl = document.getElementById('tooltip-extra')!;
  /** What is shown now; text is only rewritten (and measured) when this changes. */
  private subject: unknown = null;
  private width = 0;
  private height = 0;
  /** An overlay (the item bar) has the pointer: the levels' `show`/`hide` are ignored until it lets go. */
  private claimed = false;

  /**
   * `show` for an overlay over the game (the item bar): it keeps the tooltip
   * until `release`, so the levels, which hide it every frame nothing of
   * theirs is hovered, don't take it away.
   */
  showClaimed(...args: Parameters<Tooltip['show']>): void {
    this.claimed = false;
    this.show(...args);
    this.claimed = true;
  }

  /** The overlay is done with it: hidden, and the levels' again. */
  release(): void {
    if (!this.claimed) return;
    this.claimed = false;
    this.hide();
  }

  /**
   * Shows `name`/`info` (and an optional `details` line) for `subject` next to
   * the pointer: below right of a mouse, centred above a finger (`above`) so
   * the hand doesn't cover it. Kept inside the window. `extra` fills a block
   * under the text (e.g. the galaxy map's list of a system's bodies); like
   * the text, it only runs when the subject changes.
   */
  show(
    subject: unknown,
    name: string,
    info: string,
    clientX: number,
    clientY: number,
    details?: string,
    above = false,
    extra?: (el: HTMLElement) => void,
  ): void {
    if (this.claimed) return;
    if (subject !== this.subject) {
      this.subject = subject;
      this.nameEl.textContent = name;
      this.infoEl.textContent = info;
      this.detailsEl.textContent = details ?? '';
      this.detailsEl.hidden = !details;
      this.extraEl.replaceChildren();
      extra?.(this.extraEl);
      this.extraEl.hidden = !extra;
      this.el.hidden = false;
      this.width = this.el.offsetWidth;
      this.height = this.el.offsetHeight;
    }
    let x = above ? clientX - this.width / 2 : clientX + OFFSET;
    let y = above ? clientY - FINGER_OFFSET - this.height : clientY + OFFSET;
    x = Math.max(MARGIN, Math.min(x, window.innerWidth - this.width - MARGIN));
    y = Math.max(MARGIN, Math.min(y, window.innerHeight - this.height - MARGIN));
    this.el.style.transform = `translate(${x}px, ${y}px)`;
  }

  hide(): void {
    if (this.claimed || this.subject === null) return;
    this.subject = null;
    this.el.hidden = true;
  }
}

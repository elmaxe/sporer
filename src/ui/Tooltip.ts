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
  /** What is shown now; text is only rewritten (and measured) when this changes. */
  private subject: unknown = null;
  private width = 0;
  private height = 0;

  /**
   * Shows `name`/`info` (and an optional `details` line) for `subject` next to
   * the pointer: below right of a mouse, centred above a finger (`above`) so
   * the hand doesn't cover it. Kept inside the window.
   */
  show(
    subject: unknown,
    name: string,
    info: string,
    clientX: number,
    clientY: number,
    details?: string,
    above = false,
  ): void {
    if (subject !== this.subject) {
      this.subject = subject;
      this.nameEl.textContent = name;
      this.infoEl.textContent = info;
      this.detailsEl.textContent = details ?? '';
      this.detailsEl.hidden = !details;
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
    if (this.subject === null) return;
    this.subject = null;
    this.el.hidden = true;
  }
}

/** Tooltip offset from the pointer, in CSS pixels. */
const OFFSET = 16;

/** The hover tooltip (#tooltip in index.html), shared by every level's HUD. */
export class Tooltip {
  private readonly el = document.getElementById('tooltip')!;
  private readonly nameEl = document.getElementById('tooltip-name')!;
  private readonly infoEl = document.getElementById('tooltip-info')!;
  private readonly detailsEl = document.getElementById('tooltip-details')!;
  /** What is shown now; text is only rewritten when this changes. */
  private subject: unknown = null;

  /** Shows `name`/`info` (and an optional `details` line) for `subject` next to the pointer. */
  show(subject: unknown, name: string, info: string, clientX: number, clientY: number, details?: string): void {
    if (subject !== this.subject) {
      this.subject = subject;
      this.nameEl.textContent = name;
      this.infoEl.textContent = info;
      this.detailsEl.textContent = details ?? '';
      this.detailsEl.hidden = !details;
      this.el.hidden = false;
    }
    this.el.style.transform = `translate(${clientX + OFFSET}px, ${clientY + OFFSET}px)`;
  }

  hide(): void {
    if (this.subject === null) return;
    this.subject = null;
    this.el.hidden = true;
  }
}

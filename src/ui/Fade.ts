/** Full-screen black overlay (#fade in index.html) used to hide level swaps. */
export class Fade {
  private readonly el = document.getElementById('fade')!;
  private current = -1;

  /** 0 = clear, 1 = black. */
  set(opacity: number): void {
    const o = Math.round(Math.min(1, Math.max(0, opacity)) * 100) / 100;
    if (o === this.current) return;
    this.current = o;
    this.el.style.opacity = String(o);
  }
}

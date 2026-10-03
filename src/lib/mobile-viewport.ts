/** Owns keyboard geometry and listeners; React only starts and disposes it. */
export class MobileViewportController {
  private frame?: number;
  private started = false;
  private readonly view: Window;
  private readonly document: Document;

  constructor(view: Window, document: Document) { this.view = view; this.document = document; }

  private update = () => {
    this.frame = undefined;
    const viewport = this.view.visualViewport;
    const root = this.document.documentElement;
    const editable = this.document.activeElement?.matches('textarea, [contenteditable="true"], input:not([type="button"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="color"]):not([type="hidden"])');
    const keyboard = viewport && this.view.matchMedia("(pointer: coarse)").matches && editable
      && Math.abs(viewport.scale - 1) < 0.05
      && Math.max(this.view.innerHeight, root.clientHeight) - viewport.height > 120;
    if (keyboard) {
      root.dataset.keyboard = "open";
      root.style.setProperty("--keyboard-viewport-height", `${Math.round(viewport.height)}px`);
      root.style.setProperty("--keyboard-viewport-top", `${Math.round(viewport.offsetTop)}px`);
    } else {
      delete root.dataset.keyboard;
      root.style.removeProperty("--keyboard-viewport-height");
      root.style.removeProperty("--keyboard-viewport-top");
    }
  };

  private schedule = () => {
    if (this.frame === undefined) this.frame = this.view.requestAnimationFrame(this.update);
  };

  start() {
    if (this.started) return;
    this.started = true;
    this.view.visualViewport?.addEventListener("resize", this.schedule);
    this.view.visualViewport?.addEventListener("scroll", this.schedule);
    this.view.addEventListener("resize", this.schedule);
    this.document.addEventListener("focusin", this.schedule);
    this.document.addEventListener("focusout", this.schedule);
    this.update();
  }

  dispose() {
    this.started = false;
    if (this.frame !== undefined) this.view.cancelAnimationFrame(this.frame);
    this.frame = undefined;
    this.view.visualViewport?.removeEventListener("resize", this.schedule);
    this.view.visualViewport?.removeEventListener("scroll", this.schedule);
    this.view.removeEventListener("resize", this.schedule);
    this.document.removeEventListener("focusin", this.schedule);
    this.document.removeEventListener("focusout", this.schedule);
    delete this.document.documentElement.dataset.keyboard;
    this.document.documentElement.style.removeProperty("--keyboard-viewport-height");
    this.document.documentElement.style.removeProperty("--keyboard-viewport-top");
  }
}

const PROPERTY = "scroll-padding-block-end";

/**
 * Keeps the page's block scroll padding as tall as a bar that stays in view at the end of it, so
 * that the browser scrolls a focused element clear of the bar instead of leaving it behind it
 * (WCAG 2.4.11, Focus Not Obscured). What the page has on that side, in a stylesheet or on the root
 * element, is kept and added to, and given back exactly when the bar goes. It is set through the
 * style object of the root element, which a strict Content-Security-Policy allows; no style
 * attribute is written in markup.
 *
 * A bar that is not sticking to the window (it was laid out in the page's flow, as it is in a
 * short window) covers nothing, so it reserves nothing.
 */
export class ReserveSpace {
  private observer?: ResizeObserver;
  private bar?: HTMLElement;
  private inline = "";

  start(bar: HTMLElement): void {
    this.stop();
    this.bar = bar;
    const style = document.documentElement.style;
    this.inline = style.getPropertyValue(PROPERTY);
    this.apply();
    window.addEventListener("resize", this.apply);
    if (typeof ResizeObserver === "undefined") return;
    this.observer = new ResizeObserver(this.apply);
    this.observer.observe(bar);
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = undefined;
    if (this.bar === undefined) return;
    this.bar = undefined;
    window.removeEventListener("resize", this.apply);
    this.restore();
  }

  // The page's own value is put back before it is read, so what is read is the page's and never
  // the bar's own earlier addition.
  private readonly apply = (): void => {
    const bar = this.bar;
    if (bar === undefined) return;
    this.restore();
    if (getComputedStyle(bar).position === "static") return;
    const size = `${String(Math.ceil(bar.getBoundingClientRect().height))}px`;
    const base = this.base();
    document.documentElement.style.setProperty(
      PROPERTY,
      base === undefined ? size : `calc(${base} + ${size})`,
    );
  };

  private base(): string | undefined {
    const value = getComputedStyle(document.documentElement).getPropertyValue(PROPERTY).trim();
    const base = value === "" ? this.inline : value;
    return base === "" || base === "auto" || base === "0px" ? undefined : base;
  }

  private restore(): void {
    const style = document.documentElement.style;
    if (this.inline === "") style.removeProperty(PROPERTY);
    else style.setProperty(PROPERTY, this.inline);
  }
}

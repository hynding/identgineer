/** Which end of the page the bar sits at. */
export type ReservedSide = "start" | "end";

/**
 * Keeps the page's block scroll padding as tall as a bar that stays in view at one end of it, so
 * that the browser scrolls a focused element clear of the bar instead of leaving it behind it
 * (WCAG 2.4.11, Focus Not Obscured). The page's own padding on that side is kept and added to, and
 * given back when the bar goes. It is set through the style object of the root element, which a
 * strict Content-Security-Policy allows; no style attribute is written in markup.
 */
export class ReserveSpace {
  private observer?: ResizeObserver;
  private property?: string;
  private previous = "";

  start(bar: HTMLElement, side: ReservedSide): void {
    this.stop();
    const property = `scroll-padding-block-${side}`;
    const style = document.documentElement.style;
    this.property = property;
    this.previous = style.getPropertyValue(property);
    const apply = () => {
      const size = `${String(Math.ceil(bar.getBoundingClientRect().height))}px`;
      style.setProperty(property, this.previous === "" ? size : `calc(${this.previous} + ${size})`);
    };
    apply();
    if (typeof ResizeObserver === "undefined") return;
    this.observer = new ResizeObserver(apply);
    this.observer.observe(bar);
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = undefined;
    const property = this.property;
    if (property === undefined) return;
    this.property = undefined;
    const style = document.documentElement.style;
    if (this.previous === "") style.removeProperty(property);
    else style.setProperty(property, this.previous);
  }
}

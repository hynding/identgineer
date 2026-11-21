import { computePosition, type Placement } from "./position";

/** The distance the fallback keeps a surface from the viewport's edges, in pixels. */
const VIEWPORT_PADDING = 8;

/** Whether the browser can tie a surface to its trigger with CSS anchor positioning. */
export function supportsAnchorPositioning(): boolean {
  return (
    typeof CSS !== "undefined" &&
    typeof CSS.supports === "function" &&
    CSS.supports("anchor-name: --idg-trigger") &&
    CSS.supports("position-area: bottom")
  );
}

export interface SurfaceAnchor {
  anchor: Element | undefined;
  placement: Placement;
  offset: number;
}

/**
 * Keeps a top-layer surface beside its anchor where CSS anchor positioning cannot: in a browser
 * without it, or for a trigger outside the overlay that the overlay's stylesheet cannot name. The
 * coordinates go into two custom properties through the CSSOM, which `style-src` does not govern,
 * and the stylesheet places the surface with them. It follows scrolling and resizing while open.
 */
export class SurfacePosition {
  private frame = 0;

  constructor(
    private readonly surface: HTMLElement,
    private readonly read: () => SurfaceAnchor,
  ) {}

  start(): void {
    this.update();
    window.addEventListener("scroll", this.schedule, { capture: true, passive: true });
    window.addEventListener("resize", this.schedule, { passive: true });
  }

  stop(): void {
    window.removeEventListener("scroll", this.schedule, { capture: true });
    window.removeEventListener("resize", this.schedule);
    cancelAnimationFrame(this.frame);
  }

  update = (): void => {
    const { anchor, placement, offset } = this.read();
    if (!anchor) return;
    const root = document.documentElement;
    const surface = this.surface.getBoundingClientRect();
    const position = computePosition({
      anchor: anchor.getBoundingClientRect(),
      floating: { width: surface.width, height: surface.height },
      viewport: { width: root.clientWidth, height: root.clientHeight },
      placement,
      offset,
      padding: VIEWPORT_PADDING,
    });
    this.surface.style.setProperty("--_x", `${String(Math.round(position.x))}px`);
    this.surface.style.setProperty("--_y", `${String(Math.round(position.y))}px`);
    this.surface.dataset.placement = position.placement;
  };

  private schedule = (): void => {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(this.update);
  };
}

/**
 * Shows a popover with its trigger as the source, so Tab from the trigger enters the surface and
 * the trigger counts as the popover's invoker. Browsers that predate the option ignore it.
 */
export function showPopoverFrom(surface: HTMLElement, source: HTMLElement | undefined): void {
  // Stencil compiles with DOM typings that predate the option, hence the widened type.
  const popover: { showPopover(options?: { source: HTMLElement }): void } = surface;
  popover.showPopover(source ? { source } : undefined);
}

/**
 * `hint` where the browser has it: a hint closes other hints but leaves menus and other auto
 * popovers open. Elsewhere `manual`, which the component opens and closes itself.
 */
export function hintPopoverType(): "hint" | "manual" {
  if (typeof document === "undefined") return "manual";
  const probe = document.createElement("div");
  probe.setAttribute("popover", "hint");
  return (probe as HTMLElement & { popover?: string | null }).popover === "hint"
    ? "hint"
    : "manual";
}

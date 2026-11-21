import { Component, Element, h, Prop, State, Watch } from "@stencil/core";
import { oneOf } from "../../utils/choice";
import { parseDuration } from "../../utils/duration";
import { applyDescription } from "../../utils/overlay-trigger";
import { PLACEMENTS, type Placement } from "../../utils/position";
import { resolveTrigger } from "../../utils/resolve-trigger";
import {
  SurfacePosition,
  hintPopoverType,
  showPopoverFrom,
  supportsAnchorPositioning,
} from "../../utils/surface-position";

/** Used when the hover delay token cannot be read. */
const DEFAULT_HOVER_DELAY_MS = 500;

/** How long a pointer may take to cross from the trigger to the tooltip before it hides. */
const HIDE_GRACE_MS = 120;

function isFocusVisible(element: EventTarget | undefined): boolean {
  try {
    return (element as Element).matches(":focus-visible");
  } catch {
    return true;
  }
}

/**
 * A short text hint for a trigger. It shows after the hover delay of the UX mode and at once on
 * keyboard focus, stays while the pointer is over it, and hides on Escape, blur, pointer leave and
 * scroll (WCAG 1.4.13). Touch is ignored, so a long press never covers the control. It holds text
 * only: put anything interactive in an idg-popover.
 *
 * The text is also the trigger's accessible description, given to the trigger itself, so it is
 * read on focus whether or not the hint is showing; the drawn hint is hidden from assistive
 * technology so it is not read twice.
 *
 * @slot - The trigger, usually an idg-button or a button.
 * @part tooltip - The drawn hint.
 */
@Component({
  tag: "idg-tooltip",
  styleUrls: ["../../styles/anchored-surface.css", "tooltip.css"],
  shadow: true,
})
export class IdgTooltip {
  @Element() host!: HTMLElement;

  /** The hint. Set as text, never as markup. */
  @Prop() text?: string;

  /** Where the hint sits against the trigger. It flips to the opposite side when out of room. */
  @Prop({ reflect: true }) placement: Placement = "top";

  /** The gap between the trigger and the hint, in pixels. */
  @Prop() offset = 8;

  /** The id of a trigger elsewhere in the same document or shadow root, in place of the slot. */
  @Prop() for?: string;

  @State() private anchoredByCss = false;

  private surface?: HTMLElement;
  private trigger?: HTMLElement;
  private shown = false;
  private showTimer?: ReturnType<typeof setTimeout>;
  private hideTimer?: ReturnType<typeof setTimeout>;
  private position?: SurfacePosition;
  private readonly popoverType = hintPopoverType();

  connectedCallback(): void {
    if (this.surface) this.attachTrigger();
  }

  componentDidLoad(): void {
    this.surface?.addEventListener("pointerenter", this.handleSurfaceEnter);
    this.surface?.addEventListener("pointerleave", this.handleSurfaceLeave);
    this.attachTrigger();
  }

  disconnectedCallback(): void {
    this.hideNow();
    this.detachTrigger();
  }

  componentDidRender(): void {
    this.surface?.style.setProperty("--_offset", `${String(this.offset)}px`);
  }

  @Watch("for")
  forChanged(): void {
    this.attachTrigger();
  }

  @Watch("text")
  textChanged(): void {
    if (this.trigger) applyDescription(this.trigger, this.description());
    if (this.description() === undefined) this.hideNow();
  }

  private description(): string | undefined {
    return this.text === undefined || this.text.trim() === "" ? undefined : this.text;
  }

  private attachTrigger(): void {
    const next = resolveTrigger(this.host, null, this.for);
    if (next !== this.trigger) {
      this.detachTrigger();
      this.trigger = next;
      if (next) {
        next.addEventListener("pointerenter", this.handlePointerEnter);
        next.addEventListener("pointerleave", this.handlePointerLeave);
        next.addEventListener("focusin", this.handleFocusIn);
        next.addEventListener("focusout", this.handleFocusOut);
      }
    }
    this.anchoredByCss = (this.for ?? "") === "" && supportsAnchorPositioning();
    if (this.trigger) applyDescription(this.trigger, this.description());
  }

  private detachTrigger(): void {
    const trigger = this.trigger;
    if (!trigger) return;
    trigger.removeEventListener("pointerenter", this.handlePointerEnter);
    trigger.removeEventListener("pointerleave", this.handlePointerLeave);
    trigger.removeEventListener("focusin", this.handleFocusIn);
    trigger.removeEventListener("focusout", this.handleFocusOut);
    applyDescription(trigger, undefined);
    this.trigger = undefined;
  }

  private hoverDelay(): number {
    const token = getComputedStyle(this.host).getPropertyValue("--idg-feedback-hover-delay");
    return parseDuration(token) ?? DEFAULT_HOVER_DELAY_MS;
  }

  private clearTimers(): void {
    clearTimeout(this.showTimer);
    clearTimeout(this.hideTimer);
    this.showTimer = undefined;
    this.hideTimer = undefined;
  }

  private showNow(): void {
    this.clearTimers();
    const surface = this.surface;
    if (this.shown || !surface || this.description() === undefined) return;
    showPopoverFrom(surface, this.trigger);
    this.shown = true;
    if (!this.anchoredByCss) {
      this.position ??= new SurfacePosition(surface, () => ({
        anchor: this.trigger,
        placement: oneOf(PLACEMENTS, this.placement, "top"),
        offset: this.offset,
      }));
      this.position.update();
    }
    document.addEventListener("keydown", this.handleDocumentKeydown, { capture: true });
    window.addEventListener("scroll", this.hideNow, { capture: true, passive: true });
  }

  private hideNow = (): void => {
    this.clearTimers();
    if (!this.shown) return;
    this.shown = false;
    this.surface?.hidePopover();
    document.removeEventListener("keydown", this.handleDocumentKeydown, { capture: true });
    window.removeEventListener("scroll", this.hideNow, { capture: true });
  };

  private hideSoon(): void {
    clearTimeout(this.showTimer);
    this.showTimer = undefined;
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(this.hideNow, HIDE_GRACE_MS);
  }

  private isHover(event: globalThis.Event): boolean {
    const type = (event as PointerEvent).pointerType;
    return type === "mouse" || type === "pen";
  }

  private handlePointerEnter = (event: globalThis.Event): void => {
    if (!this.isHover(event)) return;
    clearTimeout(this.hideTimer);
    if (this.shown || this.showTimer !== undefined) return;
    this.showTimer = setTimeout(() => {
      this.showNow();
    }, this.hoverDelay());
  };

  private handlePointerLeave = (event: globalThis.Event): void => {
    if (this.isHover(event)) this.hideSoon();
  };

  private handleSurfaceEnter = (): void => {
    clearTimeout(this.hideTimer);
  };

  private handleSurfaceLeave = (): void => {
    this.hideSoon();
  };

  private handleFocusIn = (event: FocusEvent): void => {
    if (isFocusVisible(event.composedPath()[0] ?? event.target ?? undefined)) this.showNow();
  };

  private handleFocusOut = (): void => {
    this.hideNow();
  };

  // Escape dismisses the hint without moving focus or the pointer, and is taken so that a menu or
  // dialog around the trigger does not close on the same key press.
  private handleDocumentKeydown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || !this.shown) return;
    event.preventDefault();
    event.stopPropagation();
    this.hideNow();
  };

  // A hint popover that the browser closes (another hint opening, a close request) is followed.
  private handleToggle = (event: globalThis.Event): void => {
    if ((event as globalThis.Event & { newState?: string }).newState === "closed") this.hideNow();
  };

  private handleSlotChange = (): void => {
    this.attachTrigger();
  };

  render() {
    const placement = oneOf(PLACEMENTS, this.placement, "top");
    return [
      <slot onSlotchange={this.handleSlotChange} />,
      <div
        ref={(element) => (this.surface = element)}
        class={{
          surface: true,
          tooltip: true,
          anchored: this.anchoredByCss,
          [`placement-${placement}`]: true,
        }}
        part="tooltip"
        popover={this.popoverType}
        aria-hidden="true"
        onToggle={this.handleToggle}
      >
        {this.text}
      </div>,
    ];
  }
}

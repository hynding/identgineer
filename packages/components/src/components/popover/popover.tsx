import {
  Component,
  Element,
  Event,
  h,
  Listen,
  Method,
  Prop,
  State,
  Watch,
  type EventEmitter,
} from "@stencil/core";
import { oneOf } from "../../utils/choice";
import { deepActiveElement, focusInto, isWithin } from "../../utils/focus";
import { applyExpanded } from "../../utils/overlay-trigger";
import { PLACEMENTS, type Placement } from "../../utils/position";
import { resolveTrigger } from "../../utils/resolve-trigger";
import {
  SurfacePosition,
  showPopoverFrom,
  supportsAnchorPositioning,
} from "../../utils/surface-position";

interface ToggleEventLike extends globalThis.Event {
  newState?: string;
}

/**
 * A surface anchored to a trigger, built on the Popover API: it is shown in the top layer, closes
 * on Escape and on a click outside it (light dismiss), and gives focus back to the trigger. The
 * trigger is told it is expanded and what it controls. It is a disclosure, not a dialog: focus is
 * not contained, and Tab moves on from the content.
 *
 * @slot trigger - The element that opens the popover, usually an idg-button or a button.
 * @slot - The content.
 * @part surface - The popover surface.
 */
@Component({
  tag: "idg-popover",
  styleUrls: [
    "../../styles/anchored-surface.css",
    "../../styles/overlay-surface.css",
    "popover.css",
  ],
  shadow: true,
})
export class IdgPopover {
  @Element() host!: HTMLElement;

  /** Where the surface sits against the trigger. It flips to the opposite side when out of room. */
  @Prop({ reflect: true }) placement: Placement = "bottom-start";

  /** The gap between the trigger and the surface, in pixels. */
  @Prop() offset = 8;

  /** Whether the popover is open. */
  @Prop({ mutable: true, reflect: true }) open = false;

  /** The id of a trigger elsewhere in the same document or shadow root, in place of the slot. */
  @Prop() for?: string;

  /** Fires when the popover opens. */
  @Event() idgOpen!: EventEmitter<void>;

  /** Fires when the popover closes, however it was closed. */
  @Event() idgClose!: EventEmitter<void>;

  @State() private anchoredByCss = false;

  private surface?: HTMLElement;
  private trigger?: HTMLElement;
  private shown = false;
  private openAtPress = false;
  private position?: SurfacePosition;
  /** False when the popover was open in the page's markup, which must not move focus. */
  private focusOnOpen = true;

  connectedCallback(): void {
    if (this.surface) this.attachTrigger();
  }

  componentDidLoad(): void {
    this.attachTrigger();
    if (this.open) {
      this.focusOnOpen = false;
      this.showSurface();
    }
  }

  // A browser hides a removed popover without a toggle event, so the closing is done here: the
  // state is reset and idgClose fires. Focus is left where it is.
  disconnectedCallback(): void {
    if (this.shown) {
      this.settleClosed();
      this.idgClose.emit();
    }
    this.position?.stop();
    this.detachTrigger();
  }

  componentDidRender(): void {
    this.surface?.style.setProperty("--_offset", `${String(this.offset)}px`);
  }

  @Watch("for")
  forChanged(): void {
    this.attachTrigger();
  }

  @Watch("open")
  openChanged(open: boolean): void {
    if (open) this.showSurface();
    else this.hideSurface();
  }

  /** Opens the popover. */
  @Method()
  show(): Promise<void> {
    this.showSurface();
    return Promise.resolve();
  }

  /** Closes the popover. */
  @Method()
  hide(): Promise<void> {
    this.hideSurface();
    return Promise.resolve();
  }

  /** Opens the popover when closed and closes it when open. */
  @Method()
  toggle(): Promise<void> {
    if (this.shown) this.hideSurface();
    else this.showSurface();
    return Promise.resolve();
  }

  private attachTrigger(): void {
    const next = resolveTrigger(this.host, "trigger", this.for);
    if (next !== this.trigger) {
      this.detachTrigger();
      this.trigger = next;
      next?.addEventListener("pointerdown", this.handleTriggerPress);
      next?.addEventListener("click", this.handleTriggerClick);
    }
    // Only a slotted trigger can be named as the anchor by this component's stylesheet.
    this.anchoredByCss = (this.for ?? "") === "" && supportsAnchorPositioning();
    this.syncTrigger();
  }

  private detachTrigger(): void {
    const trigger = this.trigger;
    if (!trigger) return;
    trigger.removeEventListener("pointerdown", this.handleTriggerPress);
    trigger.removeEventListener("click", this.handleTriggerClick);
    applyExpanded(trigger, undefined);
    this.trigger = undefined;
  }

  private syncTrigger(): void {
    if (this.trigger) applyExpanded(this.trigger, { expanded: this.shown, controls: this.host });
  }

  private showSurface(): void {
    const surface = this.surface;
    if (!surface || this.shown) return;
    showPopoverFrom(surface, this.trigger);
  }

  private hideSurface(): void {
    if (this.shown) this.surface?.hidePopover();
  }

  private opened(): void {
    this.shown = true;
    this.open = true;
    this.syncTrigger();
    if (!this.anchoredByCss && this.surface) {
      this.position ??= new SurfacePosition(this.surface, () => ({
        anchor: this.trigger,
        placement: oneOf(PLACEMENTS, this.placement, "bottom-start"),
        offset: this.offset,
      }));
      this.position.start();
    }
    if (this.focusOnOpen) {
      const marked = Array.from(this.host.querySelectorAll("[autofocus]"))[0];
      if (!(marked && focusInto(marked))) this.surface?.focus();
    }
    this.focusOnOpen = true;
    this.idgOpen.emit();
  }

  // Focus goes back to the trigger when it was in the popover, or was lost with it. A click on
  // another control has already moved focus there, and it stays.
  private settleClosed(): void {
    this.shown = false;
    this.open = false;
    this.position?.stop();
    this.syncTrigger();
  }

  private closed(): void {
    this.settleClosed();
    const active = deepActiveElement();
    const trigger = this.trigger;
    const lost = active === null || active === document.body;
    const inside =
      active !== null && isWithin(active, this.host) && !(trigger && isWithin(active, trigger));
    if (trigger && (lost || inside)) focusInto(trigger);
    this.idgClose.emit();
  }

  private handleToggle = (event: ToggleEventLike): void => {
    if (event.newState === "open") this.opened();
    else if (event.newState === "closed") this.closed();
  };

  // Light dismiss closes the popover as the press on the trigger begins, so by the time the click
  // arrives it would open again. The state at the press decides instead.
  private handleTriggerPress = (): void => {
    this.openAtPress = this.shown;
  };

  private handleTriggerClick = (): void => {
    const wasOpen = this.openAtPress || this.shown;
    this.openAtPress = false;
    if (wasOpen) this.hideSurface();
    else this.showSurface();
  };

  // Escape from the content closes the popover here, rather than as the browser's close request, so
  // that an enclosing dialog does not take the same key press as its own.
  @Listen("keydown")
  handleKeydown(event: KeyboardEvent): void {
    if (event.key !== "Escape" || !this.shown) return;
    if (!this.surface || !event.composedPath().includes(this.surface)) return;
    event.preventDefault();
    event.stopPropagation();
    this.hideSurface();
  }

  private handleSlotChange = (): void => {
    this.attachTrigger();
  };

  render() {
    const placement = oneOf(PLACEMENTS, this.placement, "bottom-start");
    return [
      <slot name="trigger" onSlotchange={this.handleSlotChange} />,
      <div
        ref={(element) => (this.surface = element)}
        class={{
          surface: true,
          "overlay-surface": true,
          anchored: this.anchoredByCss,
          [`placement-${placement}`]: true,
        }}
        part="surface"
        popover="auto"
        tabindex="-1"
        onToggle={this.handleToggle}
      >
        <slot />
      </div>,
    ];
  }
}

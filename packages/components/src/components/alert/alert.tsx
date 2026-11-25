import { Component, Element, Event, h, Prop, State, type EventEmitter } from "@stencil/core";
import { oneOf } from "../../utils/controls-copies";
import { ALERT_ICONS, ALERT_ROLES, ALERT_VARIANTS, type AlertVariant } from "./alert-options";

/**
 * A message that stays on the page until it is read or dismissed. For a message that appears in
 * response to what the user did, render the alert at that moment: a live region announces what is
 * inserted, not what was already there.
 *
 * @slot title - A short heading.
 * @slot - The message.
 * @part alert - The alert box.
 * @part icon - The variant's icon.
 * @part title - The wrapper around the title slot.
 * @part body - The wrapper around the default slot.
 * @part dismiss - The dismiss button.
 */
@Component({
  tag: "idg-alert",
  styleUrls: ["../../styles/tone.css", "../../styles/focus-ring.css", "alert.css"],
  shadow: true,
})
export class IdgAlert {
  @Element() host!: HTMLElement;

  /** Meaning and urgency. Warning and danger interrupt assistive technology; info and success do not. */
  @Prop({ reflect: true }) variant: AlertVariant = "info";

  /**
   * Leaves out the live role, for a message that changes while it is shown (a countdown, say),
   * which a live role would announce on every change. Announce it some other way.
   */
  @Prop({ reflect: true }) quiet = false;

  /** Adds a button that dismisses the alert. */
  @Prop() dismissible = false;

  /** The dismiss button's accessible name. */
  @Prop({ attribute: "dismiss-label" }) dismissLabel = "Dismiss";

  /**
   * Fires when the dismiss button is activated. The alert then hides itself, unless a listener
   * calls `preventDefault()` to remove or keep it some other way.
   */
  @Event({ cancelable: true }) idgDismiss!: EventEmitter<void>;

  @State() private hasTitle = false;

  componentWillLoad(): void {
    this.readTitle();
  }

  private readTitle(): void {
    this.hasTitle = Array.from(this.host.children).some(
      (child) => child.getAttribute("slot") === "title",
    );
  }

  private titleChanged = (): void => {
    this.readTitle();
  };

  private dismiss = (): void => {
    const event = this.idgDismiss.emit();
    if (!event.defaultPrevented) this.host.setAttribute("hidden", "");
  };

  render() {
    const variant = oneOf(ALERT_VARIANTS, this.variant, "info");
    return (
      <div
        class={{ alert: true, [`variant-${variant}`]: true }}
        part="alert"
        role={this.quiet ? undefined : ALERT_ROLES[variant]}
      >
        <idg-icon
          class="icon"
          part="icon"
          name={ALERT_ICONS[variant]}
          size="lg"
          aria-hidden="true"
        />
        <div class="content">
          {this.hasTitle ? (
            <div class="title" part="title">
              <slot name="title" onSlotchange={this.titleChanged} />
            </div>
          ) : (
            <slot name="title" onSlotchange={this.titleChanged} />
          )}
          <div class="body" part="body">
            <slot />
          </div>
        </div>
        {this.dismissible ? (
          <button
            class="dismiss focusable"
            part="dismiss"
            type="button"
            aria-label={this.dismissLabel}
            onClick={this.dismiss}
          >
            <idg-icon name="close" />
          </button>
        ) : null}
      </div>
    );
  }
}

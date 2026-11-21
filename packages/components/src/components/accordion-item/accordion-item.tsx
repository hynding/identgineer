import { Component, Event, h, Host, Method, Prop, Watch, type EventEmitter } from "@stencil/core";
import { headingLevel } from "../../utils/heading-level";
import {
  DEFAULT_ACCORDION_HEADING_LEVEL,
  type AccordionToggleDetail,
} from "../accordion/accordion-options";

const TRIGGER_ID = "trigger";
const PANEL_ID = "panel";

/**
 * One item of an idg-accordion: a heading holding the button that shows or hides the panel
 * beneath it. The button and the panel share a shadow root, so the button's `aria-controls` and
 * the panel's name are plain id references.
 *
 * @slot - The panel's content.
 * @slot heading - Rich content for the button, in place of `heading`.
 * @part item - The wrapper around the heading and the panel.
 * @part heading - The heading element.
 * @part trigger - The button.
 * @part title - The text beside the chevron.
 * @part chevron - The chevron.
 * @part panel - The panel.
 * @part content - The wrapper around the panel's content.
 */
@Component({
  tag: "idg-accordion-item",
  styleUrls: ["../../styles/focus-ring.css", "accordion-item.css"],
  shadow: true,
})
export class IdgAccordionItem {
  /** The text of the button. Use the heading slot for anything richer. */
  @Prop() heading?: string;

  /** Names the item in `idgToggle`. */
  @Prop({ reflect: true }) value = "";

  /** Whether the panel is showing. */
  @Prop({ mutable: true, reflect: true }) open = false;

  /** Keeps the item where it is but stops the button being used. */
  @Prop({ reflect: true }) disabled = false;

  /** Set by the accordion: the heading's level. */
  @Prop({ attribute: "heading-level" }) headingLevel = DEFAULT_ACCORDION_HEADING_LEVEL;

  /** Set by the accordion: whether the panel is a region landmark. */
  @Prop({ attribute: "has-region" }) hasRegion = true;

  /** Set by the accordion: whether a closed panel can be found by the browser. */
  @Prop({ attribute: "find-in-page" }) findInPage = false;

  /** Fires when the item opens or closes, whether the user did it or a script. */
  @Event() idgToggle!: EventEmitter<AccordionToggleDetail>;

  private trigger?: HTMLButtonElement;
  private panel?: HTMLElement;

  connectedCallback(): void {
    this.panel?.addEventListener("beforematch", this.handleFound);
  }

  componentDidLoad(): void {
    this.panel?.addEventListener("beforematch", this.handleFound);
  }

  disconnectedCallback(): void {
    this.panel?.removeEventListener("beforematch", this.handleFound);
  }

  componentDidRender(): void {
    this.syncHidden();
  }

  // Reported for any change, as the menu and dialog report theirs, so a page that keeps its own
  // record of what is open stays right when a script or the accordion changes an item.
  @Watch("open")
  openChanged(open: boolean): void {
    this.idgToggle.emit({ value: this.value, open });
  }

  /** Focuses the button. */
  @Method()
  setFocus(): Promise<void> {
    this.trigger?.focus();
    return Promise.resolve();
  }

  // `hidden` is written here because the JSX typings know only the boolean form, and the
  // until-found form is what lets the browser's find in page see into a closed panel. A disabled
  // item cannot be opened, so what it holds is kept from being found.
  private syncHidden(): void {
    const panel = this.panel;
    if (!panel) return;
    if (this.open) panel.removeAttribute("hidden");
    else panel.setAttribute("hidden", this.findInPage && !this.disabled ? "until-found" : "");
  }

  // The browser reveals the panel itself after this event, so the item is opened to match.
  private handleFound = (): void => {
    if (!this.open && !this.disabled) this.open = true;
  };

  private handleClick = (): void => {
    if (!this.disabled) this.open = !this.open;
  };

  render() {
    // A closed panel that the browser can still find would be an empty landmark.
    const landmark = this.hasRegion && this.open;
    const Heading = `h${String(headingLevel(this.headingLevel, DEFAULT_ACCORDION_HEADING_LEVEL))}`;
    return (
      <Host>
        <div class={{ item: true, open: this.open, disabled: this.disabled }} part="item">
          <Heading class="heading" part="heading">
            <button
              ref={(element) => (this.trigger = element)}
              id={TRIGGER_ID}
              class="trigger focusable"
              part="trigger"
              type="button"
              aria-expanded={String(this.open)}
              aria-controls={PANEL_ID}
              disabled={this.disabled}
              onClick={this.handleClick}
            >
              <span class="title" part="title">
                <slot name="heading">{this.heading}</slot>
              </span>
              <idg-icon class="chevron" part="chevron" name="chevron-down" aria-hidden="true" />
            </button>
          </Heading>
          <div
            ref={(element) => (this.panel = element)}
            id={PANEL_ID}
            class="panel"
            part="panel"
            role={landmark ? "region" : undefined}
            aria-labelledby={landmark ? TRIGGER_ID : undefined}
          >
            <div class="content" part="content">
              <slot />
            </div>
          </div>
        </div>
      </Host>
    );
  }
}

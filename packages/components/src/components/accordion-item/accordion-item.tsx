import { Component, Event, h, Method, Prop, type EventEmitter } from "@stencil/core";
import type { AccordionToggleDetail } from "../accordion/accordion-options";

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
  @Prop({ attribute: "heading-level" }) headingLevel = 3;

  /** Set by the accordion: whether the panel is a region landmark. */
  @Prop({ attribute: "has-region" }) hasRegion = true;

  /** Set by the accordion: whether a closed panel can be found by the browser. */
  @Prop({ attribute: "find-in-page" }) findInPage = false;

  /** Fires when the item opens or closes, whether the user did it or a script. */
  @Event() idgToggle!: EventEmitter<AccordionToggleDetail>;

  /** Focuses the button. */
  @Method()
  setFocus(): Promise<void> {
    return Promise.resolve();
  }

  render() {
    return <div />;
  }
}

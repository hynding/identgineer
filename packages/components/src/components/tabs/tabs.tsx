import { Component, Element, Event, h, Method, Prop, type EventEmitter } from "@stencil/core";
import type { ValueDetail } from "../../utils/event-details";
import type { TabsActivation, TabsOrientation } from "./tabs-options";

/**
 * Follows the WAI-ARIA tabs pattern. One tab is the tab stop, the arrow keys along the tab list
 * (reversed in right-to-left text), Home and End move between the enabled tabs, and a panel is
 * shown for the selected tab. Tabs and panels are paired by `value`; one without a `value` takes
 * its position among its own kind as its value.
 *
 * @slot - `idg-tab-panel` elements.
 * @slot tab - `idg-tab` elements. They are put here for you.
 * @part tabs - The wrapper around the tab list and the panels.
 * @part list - The tab list.
 * @part panels - The wrapper around the panels.
 */
@Component({
  tag: "idg-tabs",
  shadow: true,
})
export class IdgTabs {
  @Element() host!: HTMLElement;

  /** The value of the selected tab. Without a match the first enabled tab is selected. */
  @Prop({ mutable: true, reflect: true }) value = "";

  /** Which way the tab list runs. */
  @Prop({ reflect: true }) orientation: TabsOrientation = "horizontal";

  /**
   * `automatic` selects a tab as the arrow keys reach it. `manual` only moves focus, and Enter
   * or Space selects, which suits panels that are slow to show.
   */
  @Prop({ reflect: true }) activation: TabsActivation = "automatic";

  /** The tab list's accessible name. */
  @Prop() label?: string;

  /** Fires when the user selects a tab, and not when `value` is set from script. */
  @Event() idgChange!: EventEmitter<ValueDetail>;

  /** Focuses the selected tab. */
  @Method()
  setFocus(): Promise<void> {
    return Promise.resolve();
  }

  render() {
    return <div />;
  }
}

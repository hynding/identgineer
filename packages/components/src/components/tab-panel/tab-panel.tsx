import { Component, h, Prop } from "@stencil/core";

/**
 * The content of one tab of an idg-tabs. The host carries the tabpanel role and is named by its
 * tab. It takes a tab stop of its own only when it holds nothing the keyboard can reach, so a
 * reader can still move into it.
 *
 * @slot - The panel's content.
 * @part panel - The wrapper around the content.
 */
@Component({
  tag: "idg-tab-panel",
  shadow: true,
})
export class IdgTabPanel {
  /** Pairs the panel with the tab of the same value. */
  @Prop({ reflect: true }) value = "";

  /** Set by the tabs: whether this panel's tab is selected. */
  @Prop({ reflect: true }) selected = false;

  render() {
    return <div />;
  }
}

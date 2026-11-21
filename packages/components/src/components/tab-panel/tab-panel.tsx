import { Component, Element, h, Host, Prop } from "@stencil/core";
import { firstFocusable } from "../../utils/focus";

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
  styleUrls: ["../../styles/host-focus-ring.css", "tab-panel.css"],
  shadow: true,
})
export class IdgTabPanel {
  @Element() host!: HTMLElement;

  /** Pairs the panel with the tab of the same value. */
  @Prop({ reflect: true }) value = "";

  /** Set by the tabs: whether this panel's tab is selected. */
  @Prop({ reflect: true }) selected = false;

  private observer?: MutationObserver;

  connectedCallback(): void {
    this.watch();
  }

  disconnectedCallback(): void {
    this.observer?.disconnect();
    this.observer = undefined;
  }

  componentDidRender(): void {
    this.updateTabStop();
  }

  private watch(): void {
    this.observer?.disconnect();
    if (typeof MutationObserver === "undefined") return;
    this.observer = new MutationObserver((records) => {
      // The panel's own tabindex is written below, and would otherwise wake this again.
      if (records.some((record) => record.target !== this.host || record.type !== "attributes")) {
        this.updateTabStop();
      }
    });
    this.observer.observe(this.host, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["disabled", "tabindex", "hidden", "href", "inert"],
    });
  }

  // A panel with something to tab to needs no tab stop of its own, since focus reaches the
  // content from the tab. A panel without would otherwise be unreachable for a keyboard user.
  private updateTabStop(): void {
    const needed = this.selected && firstFocusable(this.host) === undefined;
    const has = this.host.hasAttribute("tabindex");
    if (needed && this.host.getAttribute("tabindex") !== "0")
      this.host.setAttribute("tabindex", "0");
    else if (!needed && has) this.host.removeAttribute("tabindex");
  }

  render() {
    return (
      <Host role="tabpanel" hidden={!this.selected}>
        <div class="panel" part="panel">
          <slot
            onSlotchange={() => {
              this.updateTabStop();
            }}
          />
        </div>
      </Host>
    );
  }
}

import {
  Component,
  Element,
  Event,
  h,
  Listen,
  Method,
  Prop,
  Watch,
  type EventEmitter,
} from "@stencil/core";
import { reflectControls, reflectLabelledBy } from "../../utils/aria-reflection";
import { oneOf } from "../../utils/choice";
import type { ValueDetail } from "../../utils/event-details";
import { rovingMove } from "../../utils/roving";
import { resolveSelection } from "../../utils/selection";
import {
  TABS_ACTIVATIONS,
  TABS_ORIENTATIONS,
  type TabsActivation,
  type TabsOrientation,
} from "./tabs-options";

const TAB_SLOT = "tab";

// A tab or panel without a value is known by its position among its own kind.
function keyOf(item: { value: string }, index: number): string {
  return item.value === "" ? String(index) : item.value;
}

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
  styleUrl: "tabs.css",
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

  private observer?: MutationObserver;
  private selectedIndex = 0;
  private loaded = false;

  connectedCallback(): void {
    this.watch();
    // Tabs may have come or gone while it was out of the page, with nobody watching.
    if (this.loaded) this.refresh();
  }

  disconnectedCallback(): void {
    this.observer?.disconnect();
    this.observer = undefined;
  }

  // Remembers where a value set from script sits, so that if its tab is removed the neighbour
  // can take over.
  @Watch("value")
  valueChanged(): void {
    this.reconcile();
  }

  componentWillLoad(): void {
    this.assignTabSlots();
    this.reconcile();
  }

  componentDidLoad(): void {
    this.loaded = true;
  }

  componentDidRender(): void {
    this.push();
  }

  /** Focuses the selected tab. */
  @Method()
  setFocus(): Promise<void> {
    this.tabs()
      .find((tab) => tab.selected)
      ?.focus();
    return Promise.resolve();
  }

  @Listen("keydown")
  handleKeydown(event: KeyboardEvent): void {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const tabs = this.tabs();
    const current = this.indexOfTab(event.target, tabs);
    if (current === -1) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      this.choose(current);
      return;
    }
    const enabled = tabs.map((tab) => !tab.disabled);
    const orientation = oneOf(TABS_ORIENTATIONS, this.orientation, "horizontal");
    const next = rovingMove(current, event.key, enabled, orientation, this.isRightToLeft());
    if (next === undefined) return;
    event.preventDefault();
    const activation = oneOf(TABS_ACTIVATIONS, this.activation, "automatic");
    if (activation === "automatic") this.choose(next);
    else tabs[next]?.focus();
  }

  @Listen("click")
  handleClick(event: MouseEvent): void {
    const index = this.indexOfTab(event.target, this.tabs());
    if (index !== -1) this.choose(index);
  }

  private tabs(): HTMLIdgTabElement[] {
    return Array.from(this.host.children).filter(
      (child): child is HTMLIdgTabElement => child.localName === "idg-tab",
    );
  }

  private panels(): HTMLIdgTabPanelElement[] {
    return Array.from(this.host.children).filter(
      (child): child is HTMLIdgTabPanelElement => child.localName === "idg-tab-panel",
    );
  }

  // Only this list's own tabs count, so a key pressed in a panel, or in tabs nested in a panel, is
  // not taken for one.
  private indexOfTab(target: EventTarget | null, tabs: readonly HTMLIdgTabElement[]): number {
    const tab = target === null ? null : (target as Element).closest("idg-tab");
    return tab === null ? -1 : tabs.indexOf(tab);
  }

  private isRightToLeft(): boolean {
    return getComputedStyle(this.host).direction === "rtl";
  }

  private watch(): void {
    this.observer?.disconnect();
    if (typeof MutationObserver === "undefined") return;
    // Slotchange reports tabs added, removed and reordered, but not a tab disabled or given a new
    // value, so those attributes are watched too, on the tabs and panels and not on their content.
    this.observer = new MutationObserver((records) => {
      if (records.some((record) => this.concernsTabs(record.target))) this.refresh();
    });
    this.observer.observe(this.host, {
      childList: true,
      attributes: true,
      subtree: true,
      attributeFilter: ["value", "disabled"],
    });
  }

  private concernsTabs(target: Node): boolean {
    return target === this.host || target.parentNode === this.host;
  }

  private refresh(): void {
    this.assignTabSlots();
    this.reconcile();
    this.push();
  }

  // Tabs are drawn in the tab list, which is a slot of its own, and are put there here so that
  // the page's markup does not have to say so.
  private assignTabSlots(): void {
    for (const tab of this.tabs()) {
      if (tab.getAttribute("slot") !== TAB_SLOT) tab.setAttribute("slot", TAB_SLOT);
    }
  }

  // Keeps the value pointing at a tab that exists and is enabled, whether the value was never set,
  // names a tab that is gone, or names one that has since been disabled.
  private reconcile(): void {
    const items = this.tabs().map((tab, index) => ({
      value: keyOf(tab, index),
      disabled: tab.disabled,
    }));
    const next = resolveSelection(items, this.value, this.selectedIndex) ?? "";
    if (next !== this.value) this.value = next;
    this.selectedIndex = Math.max(
      0,
      items.findIndex((item) => item.value === next),
    );
  }

  // The tabs and panels sit in their own shadow roots and cannot see each other, so the state they
  // draw and the relations between them are handed down after every render.
  private push(): void {
    const tabs = this.tabs();
    const panels = this.panels();
    const orientation = oneOf(TABS_ORIENTATIONS, this.orientation, "horizontal");
    const selected = tabs.findIndex((tab, index) => keyOf(tab, index) === this.value);
    const firstEnabled = tabs.findIndex((tab) => !tab.disabled);
    const stop = selected !== -1 && !tabs[selected]?.disabled ? selected : firstEnabled;
    const panelFor = (key: string) => panels.find((panel, index) => keyOf(panel, index) === key);
    tabs.forEach((tab, index) => {
      const panel = panelFor(keyOf(tab, index));
      tab.selected = index === selected;
      tab.tabbable = index === stop;
      tab.orientation = orientation;
      reflectControls(tab, panel ? [panel] : null);
    });
    const tabFor = (key: string) => tabs.find((tab, index) => keyOf(tab, index) === key);
    panels.forEach((panel, index) => {
      const key = keyOf(panel, index);
      const tab = tabFor(key);
      panel.selected = selected !== -1 && key === this.value;
      reflectLabelledBy(panel, tab ? [tab] : null);
    });
  }

  private choose(index: number): void {
    const tabs = this.tabs();
    const tab = tabs[index];
    if (!tab || tab.disabled) return;
    tab.focus();
    const key = keyOf(tab, index);
    if (key === this.value) return;
    this.value = key;
    this.selectedIndex = index;
    this.push();
    this.idgChange.emit({ value: key });
  }

  render() {
    const orientation = oneOf(TABS_ORIENTATIONS, this.orientation, "horizontal");
    return (
      <div class="tabs" part="tabs">
        <div
          class="list"
          part="list"
          role="tablist"
          aria-orientation={orientation}
          aria-label={this.label}
        >
          <slot
            name={TAB_SLOT}
            onSlotchange={() => {
              this.refresh();
            }}
          />
        </div>
        <div class="panels" part="panels">
          <slot
            onSlotchange={() => {
              this.refresh();
            }}
          />
        </div>
      </div>
    );
  }
}

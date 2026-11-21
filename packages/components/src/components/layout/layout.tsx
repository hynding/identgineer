import {
  Component,
  Element,
  Event,
  h,
  Listen,
  Prop,
  State,
  Watch,
  type EventEmitter,
} from "@stencil/core";
import { reflectControls } from "../../utils/aria-reflection";
import { deepActiveElement, firstFocusable, isWithin } from "../../utils/focus";
import { lockScroll, unlockScroll } from "../../utils/scroll-lock";
import { releaseScrollPadding, reserveScrollPadding } from "../../utils/scroll-padding";
import { itemsInSlot, watchItems } from "../../utils/slot-items";
import {
  navigationModeOf,
  type NavigationMode,
  type NavigationToggleDetail,
} from "./layout-options";
import {
  restoreViewport,
  takeViewport,
  watchLayoutAttribute,
  type Viewport,
} from "./layout-switch";

const REGIONS = ["brand", "navigation", "actions", "hero", "aside", "footer"] as const;

type Region = (typeof REGIONS)[number];
type Presence = Readonly<Record<Region, boolean>>;

function readPresence(host: HTMLElement): Presence {
  const has = (name: Region) => itemsInSlot(host, name).length > 0;
  return {
    brand: has("brand"),
    navigation: has("navigation"),
    actions: has("actions"),
    hero: has("hero"),
    aside: has("aside"),
    footer: has("footer"),
  };
}

function isSamePresence(a: Presence, b: Presence): boolean {
  return REGIONS.every((region) => a[region] === b[region]);
}

function isVisible(element: Element): boolean {
  const candidate = element as HTMLElement;
  return (
    element.isConnected &&
    (typeof candidate.checkVisibility !== "function" || candidate.checkVisibility()) &&
    element.closest("[inert]") === null
  );
}

/**
 * The page shell. One page, written once, is housed in the structure the `data-layout` attribute of
 * the root (or of an ancestor) names: the same landmarks in the same reading order in all eight, and
 * only a stylesheet that places them differently. The shell never reorders its own tree, so the
 * order a reader and the Tab key meet things is the order of the markup in every layout.
 *
 * It is a size container, and every layout decides its small, medium and large arrangement from its
 * own width, never the viewport's. Where a layout collapses the navigation behind a toggle, the
 * stylesheet decides that too, and the script only reads what it decided (`--_nav`).
 *
 * @slot brand - The name or logo, which is also the way home.
 * @slot navigation - The navigation items, as direct children laid out in a row or a column.
 * @slot actions - Buttons and links for the whole page, such as signing in.
 * @slot hero - An optional leading section, drawn prominently by some layouts.
 * @slot - The main content.
 * @slot aside - Related content.
 * @slot footer - The page footer.
 * @part shell - The element that arranges every region.
 * @part skip - The skip link.
 * @part header - The banner.
 * @part brand - The wrapper around the brand slot.
 * @part toggle - The button that opens the collapsed navigation.
 * @part drawer - The panel that holds the navigation, in the page or over it.
 * @part close - The button that closes a navigation drawer.
 * @part navigation - The navigation landmark.
 * @part actions - The wrapper around the actions slot.
 * @part hero - The wrapper around the hero slot.
 * @part main - The main landmark.
 * @part aside - The complementary landmark.
 * @part footer - The footer landmark.
 */
@Component({
  tag: "idg-layout",
  styleUrls: ["../../styles/focus-ring.css", "layout.css"],
  shadow: true,
})
export class IdgLayout {
  @Element() host!: HTMLElement;

  /** The accessible name of the navigation landmark. */
  @Prop({ attribute: "navigation-label" }) navigationLabel = "Main navigation";

  /** The accessible name of the aside landmark. */
  @Prop({ attribute: "aside-label" }) asideLabel = "Related content";

  /** The text of the skip link, the first control on the page. */
  @Prop({ attribute: "skip-label" }) skipLabel = "Skip to content";

  /** The text of the button that opens the collapsed navigation. */
  @Prop({ attribute: "menu-label" }) menuLabel = "Menu";

  /** The accessible name of the button that closes the navigation drawer. */
  @Prop({ attribute: "close-label" }) closeLabel = "Close";

  /**
   * Whether the collapsed navigation is open. It can only be open while the layout collapses the
   * navigation: it goes back to false when the container grows and the navigation is drawn inline.
   */
  @Prop({ mutable: true, reflect: true, attribute: "navigation-open" }) navigationOpen = false;

  /**
   * Whether the shell sits inside a page rather than being the page. An embedded shell does not
   * claim the height of the window, which a shell that is the page does.
   */
  @Prop({ reflect: true }) embedded = false;

  /** Fires when the collapsed navigation opens or closes. */
  @Event() idgNavigationToggle!: EventEmitter<NavigationToggleDetail>;

  @State() private presence: Presence = {
    brand: false,
    navigation: false,
    actions: false,
    hero: false,
    aside: false,
    footer: false,
  };

  @State() private modalOpen = false;

  // The hero is taller than the window, which a layout that pins the hero cannot show whole.
  @State() private heroTall = false;

  private shell?: HTMLElement;
  private toggle?: HTMLButtonElement;
  private drawer?: HTMLDialogElement;
  private main?: HTMLElement;
  private navigationElement?: HTMLElement;
  private heroElement?: HTMLElement;
  private mode: NavigationMode = "inline";
  private scrollLocked = false;
  private skipFocusRestore = false;
  private loaded = false;
  private stopWatchingItems?: () => void;
  private stopWatchingLayout?: () => void;
  private resizeObserver?: ResizeObserver;
  private frame?: number;
  private waiting?: Viewport;

  connectedCallback(): void {
    reserveScrollPadding(document);
    this.stopWatchingItems = watchItems(this.host, this.readPresence);
    this.stopWatchingLayout = watchLayoutAttribute(this.host, this.handleLayoutChange);
    if (this.loaded) {
      // Nothing was watching while it was detached.
      this.readPresence();
      this.observeSizes();
      this.readMode();
    }
  }

  disconnectedCallback(): void {
    releaseScrollPadding(document);
    this.stopWatchingItems?.();
    this.stopWatchingLayout?.();
    this.resizeObserver?.disconnect();
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
    this.waiting = undefined;
    // A drawer left open would keep the page inert and locked once it has gone.
    if (this.drawer?.open === true) this.drawer.close();
    this.releaseScroll();
    this.modalOpen = false;
    this.navigationOpen = false;
  }

  componentWillLoad(): void {
    this.presence = readPresence(this.host);
  }

  componentDidLoad(): void {
    this.loaded = true;
    this.readPresence();
    this.observeSizes();
    this.readMode();
    this.readHero();
    // The attribute was in the markup, so nothing changed for the watcher to see.
    if (this.navigationOpen) this.openDrawer();
  }

  componentDidRender(): void {
    if (this.toggle && this.drawer) reflectControls(this.toggle, [this.drawer]);
  }

  @Watch("navigationOpen")
  navigationOpenChanged(open: boolean): void {
    if (open) this.openDrawer();
    else this.closeDrawer();
  }

  @Listen("keydown")
  handleKeyDown(event: KeyboardEvent): void {
    // A modal drawer is closed by the browser's own close request, handled as `cancel`. Escape that
    // something else already used, or that happens elsewhere on the page, is not a request to
    // close the panel.
    if (event.key !== "Escape" || event.defaultPrevented) return;
    if (!this.navigationOpen || this.modalOpen || !this.isInPanel(event)) return;
    this.navigationOpen = false;
  }

  // A link followed inside the drawer ends the visit to it, so it is not left open over the next
  // page, or over the part of this one the link points at.
  @Listen("click")
  handleClick(event: MouseEvent): void {
    if (!this.navigationOpen) return;
    // A click that opens the link somewhere else, or is not the primary button, leaves the page.
    if (event.button > 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
      return;
    }
    const target = event.target as Element | null;
    if (target?.closest('[slot="navigation"]')?.closest("[href]") != null) {
      this.navigationOpen = false;
    }
  }

  // Focus alone does not bring a half-hidden item of a navigation that scrolls into view. Only the
  // navigation is scrolled: scrollIntoView would scroll every ancestor too, and the page with it.
  @Listen("focusin")
  handleFocusIn(event: FocusEvent): void {
    const navigation = this.navigationElement;
    const target = event.target as Element | null;
    if (!navigation || !target || navigation.scrollWidth <= navigation.clientWidth) return;
    if (!itemsInSlot(this.host, "navigation").some((item) => isWithin(target, item))) return;
    if (typeof navigation.scrollBy !== "function") return;
    const style = getComputedStyle(navigation);
    const padding = (side: string) =>
      Number.parseFloat(style.getPropertyValue(`scroll-padding-${side}`)) || 0;
    const item = target.getBoundingClientRect();
    const bar = navigation.getBoundingClientRect();
    const before = item.left - (bar.left + padding("left"));
    const after = item.right - (bar.right - padding("right"));
    // Boxes are physical, so the same arithmetic holds in a right-to-left page.
    if (before < 0) navigation.scrollBy({ left: before });
    else if (after > 0) navigation.scrollBy({ left: after });
  }

  private isInPanel(event: Event): boolean {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    if (path.some((node) => node === this.toggle || node === this.drawer)) return true;
    return this.isInNavigation(event.target as Node | null);
  }

  // The panel is the toggle and the drawer, whose navigation items belong to the page.
  private isInNavigation(node: Node | null): boolean {
    if (!node) return false;
    if (node === this.toggle || (this.drawer && isWithin(node, this.drawer))) return true;
    return itemsInSlot(this.host, "navigation").some((item) => isWithin(node, item));
  }

  private readonly readPresence = (): void => {
    const next = readPresence(this.host);
    if (!isSamePresence(next, this.presence)) this.presence = next;
  };

  // The stylesheet is the one that knows how wide the container is and what the layout does with
  // it, so the script asks it. A change of layout or width changes the size of the toggle or the
  // drawer, which is what the observer watches.
  private observeSizes(): void {
    if (typeof ResizeObserver === "undefined") return;
    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(this.readSizes);
    this.resizeObserver.observe(this.host);
    if (this.toggle) this.resizeObserver.observe(this.toggle);
    if (this.drawer) this.resizeObserver.observe(this.drawer);
    if (this.heroElement) this.resizeObserver.observe(this.heroElement);
  }

  private readonly readSizes = (): void => {
    this.readMode();
    this.readHero();
  };

  // A hero is at least as tall as the window where a layout pins it, so a taller one is the hero's
  // own content, and it stays at that height once it is let go, so the answer does not flip back.
  private readHero(): void {
    const height = this.heroElement?.offsetHeight ?? 0;
    const tall = height > window.innerHeight + 1;
    if (tall !== this.heroTall) this.heroTall = tall;
  }

  private readonly readMode = (): void => {
    if (!this.shell) return;
    const next = navigationModeOf(getComputedStyle(this.shell).getPropertyValue("--_nav"));
    if (next === this.mode) return;
    this.mode = next;
    if (!this.navigationOpen) return;
    if (next === "inline") this.resetOpen();
    else this.reopen();
  };

  private openDrawer(): void {
    const native = this.drawer;
    if (!native || native.open) return;
    this.readMode();
    if (this.mode === "inline") {
      this.navigationOpen = false;
      return;
    }
    this.show(native);
    this.idgNavigationToggle.emit({ open: true });
  }

  private show(native: HTMLDialogElement): void {
    if (this.mode === "drawer") {
      native.showModal();
      this.modalOpen = true;
      lockScroll(document);
      this.scrollLocked = true;
      firstFocusable(native)?.focus();
    } else {
      const before = deepActiveElement();
      native.show();
      this.modalOpen = false;
      // show() moves focus into the panel; a disclosure leaves it on the toggle that opened it.
      if (before && before !== document.body && deepActiveElement() !== before) {
        (before as HTMLElement).focus({ preventScroll: true });
      }
    }
  }

  private closeDrawer(): void {
    const native = this.drawer;
    const wasOpen = native?.open === true;
    // Focus that is inside, or that has been dropped on the page because the dialog closed under
    // it, goes back to the toggle. Focus the page's own code put elsewhere stays there.
    const active = deepActiveElement();
    const hadFocusInside =
      wasOpen && (!active || active === document.body || this.isInNavigation(active));
    if (wasOpen) native.close();
    this.releaseScroll();
    this.modalOpen = false;
    if (!wasOpen) return;
    if (!this.skipFocusRestore && hadFocusInside) this.toggle?.focus();
    this.idgNavigationToggle.emit({ open: false });
  }

  // The container grew, or the layout changed, and the navigation is no longer collapsed. Whatever
  // had focus keeps it when it is still on the page.
  private resetOpen(): void {
    const focused = deepActiveElement();
    this.skipFocusRestore = true;
    this.navigationOpen = false;
    this.skipFocusRestore = false;
    if (focused && isVisible(focused)) {
      if (deepActiveElement() !== focused) (focused as HTMLElement).focus({ preventScroll: true });
      return;
    }
    // What had focus is gone, a Close button for one: the navigation it opened is now on the page.
    if (focused && this.isInNavigation(focused)) this.focusNavigation();
  }

  private focusNavigation(): void {
    const target =
      this.toggle && isVisible(this.toggle)
        ? this.toggle
        : firstFocusable(this.drawer ?? this.host);
    target?.focus({ preventScroll: true });
  }

  // Modal and non-modal are different calls, so a change from one to the other while open closes
  // the panel and opens it again the other way.
  private reopen(): void {
    const native = this.drawer;
    if (!native?.open) return;
    native.close();
    this.releaseScroll();
    this.show(native);
  }

  private releaseScroll(): void {
    if (!this.scrollLocked) return;
    unlockScroll(document);
    this.scrollLocked = false;
  }

  private readonly handleLayoutChange = (): void => {
    this.waiting ??= takeViewport(window);
    if (this.frame !== undefined) return;
    this.frame = requestAnimationFrame(() => {
      const taken = this.waiting;
      this.frame = undefined;
      this.waiting = undefined;
      this.settleLayout(taken);
    });
  };

  // A new layout changes the height of the page and may take away the control that had focus. The
  // scroll goes back where it was and focus stays where it was, or goes to the toggle if the
  // navigation it was in has collapsed. The frame callback runs before the page paints, so none of
  // it is seen.
  private settleLayout(taken: Viewport | undefined): void {
    this.readMode();
    if (!taken) return;
    restoreViewport(window, taken);
    const previous = taken.focused;
    if (!previous) return;
    if (isVisible(previous)) {
      if (deepActiveElement() !== previous)
        (previous as HTMLElement).focus({ preventScroll: true });
      return;
    }
    const inNavigation =
      previous === this.toggle ||
      itemsInSlot(this.host, "navigation").some((item) => item.contains(previous));
    if (!inNavigation) return;
    this.focusNavigation();
  }

  private readonly skip = (event: MouseEvent): void => {
    event.preventDefault();
    this.main?.focus();
  };

  private readonly toggleNavigation = (): void => {
    this.navigationOpen = !this.navigationOpen;
  };

  private readonly closeNavigation = (): void => {
    this.navigationOpen = false;
  };

  // The browser's own Escape. It is taken over so one path closes the drawer, whoever asked.
  private readonly handleCancel = (event: globalThis.Event): void => {
    event.preventDefault();
    this.navigationOpen = false;
  };

  // The browser closes a modal dialog by itself on a second Escape with nothing in between.
  private readonly handleClose = (): void => {
    if (this.navigationOpen && this.drawer?.open !== true) this.navigationOpen = false;
  };

  // A press on the backdrop reaches the dialog itself, outside the box the panel draws.
  private readonly handleDrawerClick = (event: MouseEvent): void => {
    const native = this.drawer;
    if (!native || event.target !== native || !this.modalOpen) return;
    const box = native.getBoundingClientRect();
    const outside =
      event.clientX < box.left ||
      event.clientX > box.right ||
      event.clientY < box.top ||
      event.clientY > box.bottom;
    if (outside) this.navigationOpen = false;
  };

  render() {
    const { presence } = this;
    const hasHeader = presence.brand || presence.navigation || presence.actions;
    return (
      <div
        class={{ shell: true, "no-hero": !presence.hero, "hero-tall": this.heroTall }}
        part="shell"
        ref={(element) => (this.shell = element)}
      >
        <a class="skip focusable" part="skip" href="#main" onClick={this.skip}>
          {this.skipLabel}
        </a>
        <header class="header" part="header" hidden={!hasHeader}>
          <div class="start">
            <div class="brand" part="brand" hidden={!presence.brand}>
              <slot name="brand" onSlotchange={this.readPresence} />
            </div>
            <button
              class="toggle focusable"
              part="toggle"
              type="button"
              hidden={!presence.navigation}
              aria-expanded={this.navigationOpen ? "true" : "false"}
              ref={(element) => (this.toggle = element)}
              onClick={this.toggleNavigation}
            >
              <idg-icon name={this.navigationOpen ? "close" : "menu"} />
              <span class="toggle-label">{this.menuLabel}</span>
            </button>
            <dialog
              class="drawer"
              part="drawer"
              hidden={!presence.navigation}
              // Chrome keeps a dialog's own role under role=none, and axe rejects generic, so a group stands in.
              role={this.modalOpen ? undefined : "group"}
              aria-label={this.modalOpen ? this.menuLabel : undefined}
              ref={(element) => (this.drawer = element)}
              onCancel={this.handleCancel}
              onClose={this.handleClose}
              onClick={this.handleDrawerClick}
            >
              <button
                class="close focusable"
                part="close"
                type="button"
                aria-label={this.closeLabel}
                onClick={this.closeNavigation}
              >
                <idg-icon name="close" />
              </button>
              <nav
                class="navigation"
                part="navigation"
                aria-label={this.navigationLabel}
                ref={(element) => (this.navigationElement = element)}
              >
                <slot name="navigation" onSlotchange={this.readPresence} />
              </nav>
            </dialog>
          </div>
          <div class="actions" part="actions" hidden={!presence.actions}>
            <slot name="actions" onSlotchange={this.readPresence} />
          </div>
        </header>
        <div
          class="hero"
          part="hero"
          hidden={!presence.hero}
          ref={(element) => (this.heroElement = element)}
        >
          <slot name="hero" onSlotchange={this.readPresence} />
        </div>
        <main
          class="main"
          part="main"
          id="main"
          tabindex="-1"
          ref={(element) => (this.main = element)}
        >
          <slot />
        </main>
        <aside class="aside" part="aside" aria-label={this.asideLabel} hidden={!presence.aside}>
          <slot name="aside" onSlotchange={this.readPresence} />
        </aside>
        <footer class="footer" part="footer" hidden={!presence.footer}>
          <slot name="footer" onSlotchange={this.readPresence} />
        </footer>
      </div>
    );
  }
}

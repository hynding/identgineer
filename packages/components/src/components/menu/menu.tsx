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
import { TypeaheadBuffer, typeaheadMatch } from "../../utils/typeahead";
import type { MenuSelectDetail } from "../menu-item/menu-item-options";

type FocusTarget = "first" | "last";

interface ToggleEventLike extends globalThis.Event {
  newState?: string;
}

// Typed explicitly because Stencil's DOM typings allow null here and the editor's do not.
function textOf(node: Node): string {
  const text: string | null = node.textContent;
  return text ?? "";
}

function isPrintable(event: KeyboardEvent): boolean {
  return (
    event.key.length === 1 && event.key !== " " && !event.ctrlKey && !event.metaKey && !event.altKey
  );
}

/**
 * A menu button, following the WAI-ARIA menu button pattern: the trigger opens a menu of
 * idg-menu-item elements in the top layer, the arrow keys, Home, End and typing move focus, Enter
 * and Space choose, Escape closes and returns to the trigger, and Tab closes and moves on.
 *
 * The items sit in their own shadow roots, where `aria-activedescendant` cannot reach them, so
 * focus moves to the items themselves (roving focus). Each item carries its own role and state.
 *
 * @slot trigger - The button that opens the menu, usually an idg-button or a button.
 * @slot - `idg-menu-item`, `idg-menu-group` and `idg-menu-separator` elements.
 * @part surface - The popover surface.
 * @part menu - The element with the menu role.
 */
@Component({
  tag: "idg-menu",
  styleUrls: ["../../styles/anchored-surface.css", "../../styles/overlay-surface.css", "menu.css"],
  shadow: true,
})
export class IdgMenu {
  @Element() host!: HTMLElement;

  /** Where the menu sits against the trigger. It flips to the opposite side when out of room. */
  @Prop({ reflect: true }) placement: Placement = "bottom-start";

  /** The gap between the trigger and the menu, in pixels. */
  @Prop() offset = 4;

  /** Whether the menu is open. */
  @Prop({ mutable: true, reflect: true }) open = false;

  /** The menu's accessible name. Without it the menu is named by its trigger. */
  @Prop() label?: string;

  /** Fires when an item is chosen, with its value and, for a checkable item, its new state. */
  @Event() idgSelect!: EventEmitter<MenuSelectDetail>;

  /** Fires when the menu opens. */
  @Event() idgOpen!: EventEmitter<void>;

  /** Fires when the menu closes. */
  @Event() idgClose!: EventEmitter<void>;

  @State() private anchoredByCss = false;

  private surface?: HTMLElement;
  private menu?: HTMLElement;
  private trigger?: HTMLElement;
  private shown = false;
  private openAtPress = false;
  private focusOnOpen: FocusTarget = "first";
  private position?: SurfacePosition;
  private readonly typeahead = new TypeaheadBuffer();

  connectedCallback(): void {
    if (this.surface) this.attachTrigger();
  }

  componentDidLoad(): void {
    this.attachTrigger();
    if (this.open) this.showSurface("first");
  }

  disconnectedCallback(): void {
    this.position?.stop();
    this.detachTrigger();
  }

  componentDidRender(): void {
    this.surface?.style.setProperty("--_offset", `${String(this.offset)}px`);
    this.nameMenu();
  }

  @Watch("open")
  openChanged(open: boolean): void {
    if (open && !this.shown) this.showSurface("first");
    else if (!open) this.hideSurface();
  }

  /** Opens the menu and focuses its first item. */
  @Method()
  show(): Promise<void> {
    this.showSurface("first");
    return Promise.resolve();
  }

  /** Closes the menu. */
  @Method()
  hide(): Promise<void> {
    this.hideSurface();
    return Promise.resolve();
  }

  @Listen("keydown")
  handleKeydown(event: KeyboardEvent): void {
    if (!this.shown || !this.surface) return;
    const items = this.items();
    const target = (event.target as Element).closest("idg-menu-item");
    const current = target ? items.indexOf(target) : -1;
    if (current === -1 && !event.composedPath().includes(this.surface)) return;
    const move = (index: number) => {
      event.preventDefault();
      void items[index]?.setFocus();
    };
    switch (event.key) {
      case "ArrowDown":
        move((current + 1) % items.length);
        return;
      case "ArrowUp":
        move((current - 1 + items.length) % items.length);
        return;
      case "Home":
        move(0);
        return;
      case "End":
        move(items.length - 1);
        return;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        this.closeToTrigger();
        return;
      case "Tab":
        // Focus is put back on the trigger first, so the browser's own Tab then moves on from it.
        this.closeToTrigger();
        return;
      case "Enter":
      case " ":
        this.handleActivationKey(event, items[current]);
        return;
    }
    if (isPrintable(event)) {
      const query = this.typeahead.push(event.key, event.timeStamp);
      const labels = items.map(textOf);
      const match = typeaheadMatch(labels, current, query);
      if (match !== undefined) move(match);
    }
  }

  @Listen("click")
  handleClick(event: MouseEvent): void {
    const item = (event.target as Element).closest("idg-menu-item");
    if (!this.shown || !item) return;
    if (item.closest("idg-menu") !== this.host) return;
    if (item.disabled) {
      event.preventDefault();
      return;
    }
    this.activate(item, false);
  }

  // A link item follows its link through the anchor's own activation, which fires the click that
  // chooses it. Everything else is chosen here. Space toggles a checkable item and keeps the menu
  // open, so several can be changed in a row.
  private handleActivationKey(
    event: KeyboardEvent,
    item: HTMLIdgMenuItemElement | undefined,
  ): void {
    if (!item) return;
    const isLink = item.href !== undefined && item.href !== "" && !item.disabled;
    if (isLink && event.key === "Enter") return;
    event.preventDefault();
    if (isLink) {
      void item.follow();
      return;
    }
    if (item.disabled) return;
    this.activate(item, event.key === " " && item.type !== "item");
  }

  private activate(item: HTMLIdgMenuItemElement, keepOpen: boolean): void {
    if (item.type === "checkbox") {
      item.checked = !item.checked;
      this.idgSelect.emit({ value: item.value, checked: item.checked });
    } else if (item.type === "radio") {
      for (const other of this.radioGroup(item)) other.checked = other === item;
      this.idgSelect.emit({ value: item.value, checked: true });
    } else {
      this.idgSelect.emit({ value: item.value });
    }
    if (!keepOpen) this.closeToTrigger();
  }

  private radioGroup(item: HTMLIdgMenuItemElement): HTMLIdgMenuItemElement[] {
    const scope = item.closest("idg-menu-group") ?? this.host;
    return this.items().filter(
      (candidate) =>
        candidate.type === "radio" && (candidate.closest("idg-menu-group") ?? this.host) === scope,
    );
  }

  private items(): HTMLIdgMenuItemElement[] {
    return Array.from(this.host.querySelectorAll("idg-menu-item")).filter(
      (item) => !item.hidden && item.closest("idg-menu") === this.host,
    );
  }

  // Without a label the menu is named by its trigger. The reference points out of this shadow
  // root to the light DOM, which element reflection allows and an id reference does not.
  private nameMenu(): void {
    const menu = this.menu as
      (HTMLElement & { ariaLabelledByElements?: Element[] | null }) | undefined;
    if (!menu || !("ariaLabelledByElements" in menu)) return;
    const named = this.label !== undefined && this.label !== "";
    menu.ariaLabelledByElements = !named && this.trigger ? [this.trigger] : null;
  }

  private attachTrigger(): void {
    const next = resolveTrigger(this.host, "trigger", undefined);
    if (next !== this.trigger) {
      this.detachTrigger();
      this.trigger = next;
      next?.addEventListener("pointerdown", this.handleTriggerPress);
      next?.addEventListener("click", this.handleTriggerClick);
      next?.addEventListener("keydown", this.handleTriggerKeydown);
    }
    this.anchoredByCss = supportsAnchorPositioning();
    this.syncTrigger();
    this.nameMenu();
  }

  private detachTrigger(): void {
    const trigger = this.trigger;
    if (!trigger) return;
    trigger.removeEventListener("pointerdown", this.handleTriggerPress);
    trigger.removeEventListener("click", this.handleTriggerClick);
    trigger.removeEventListener("keydown", this.handleTriggerKeydown);
    applyExpanded(trigger, undefined);
    this.trigger = undefined;
  }

  private syncTrigger(): void {
    if (this.trigger) {
      applyExpanded(this.trigger, { expanded: this.shown, popup: "menu", controls: this.host });
    }
  }

  private showSurface(focus: FocusTarget): void {
    const surface = this.surface;
    if (!surface) return;
    this.focusOnOpen = focus;
    if (this.shown) {
      this.focusItem(focus);
      return;
    }
    showPopoverFrom(surface, this.trigger);
  }

  private hideSurface(): void {
    if (this.shown) this.surface?.hidePopover();
  }

  private closeToTrigger(): void {
    this.hideSurface();
    if (this.trigger) focusInto(this.trigger);
  }

  private focusItem(focus: FocusTarget): void {
    const items = this.items();
    void items[focus === "first" ? 0 : items.length - 1]?.setFocus();
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
    this.focusItem(this.focusOnOpen);
    this.idgOpen.emit();
  }

  private closed(): void {
    this.shown = false;
    this.open = false;
    this.position?.stop();
    this.syncTrigger();
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

  private handleTriggerPress = (): void => {
    this.openAtPress = this.shown;
  };

  private handleTriggerClick = (): void => {
    const wasOpen = this.openAtPress || this.shown;
    this.openAtPress = false;
    if (wasOpen) this.hideSurface();
    else this.showSurface("first");
  };

  private handleTriggerKeydown = (event: KeyboardEvent): void => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    this.showSurface(event.key === "ArrowDown" ? "first" : "last");
  };

  private handleSlotChange = (): void => {
    this.attachTrigger();
  };

  render() {
    const placement = oneOf(PLACEMENTS, this.placement, "bottom-start");
    const named = this.label !== undefined && this.label !== "";
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
        onToggle={this.handleToggle}
      >
        <div
          ref={(element) => (this.menu = element)}
          class="menu"
          part="menu"
          role="menu"
          aria-label={named ? this.label : undefined}
        >
          <slot />
        </div>
      </div>,
    ];
  }
}

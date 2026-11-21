import { Component, h, Method, Prop } from "@stencil/core";
import { oneOf } from "../../utils/choice";
import { linkRel } from "../../utils/link-rel";
import { safeUrl } from "../../utils/safe-url";
import type { IconName } from "../icon/icon-paths";
import { MENU_ITEM_ROLES, MENU_ITEM_TYPES, type MenuItemType } from "./menu-item-options";

/**
 * One choice in an idg-menu, which owns the keyboard, the focus and activation. Each item lives in
 * its own shadow root, so its role and state are set on the focusable element inside it, and the
 * host is a plain wrapper that assistive technology passes through.
 *
 * @slot - The label. It also names the item and drives typeahead.
 * @part item - The focusable element: a link with `href`, otherwise a plain element.
 * @part icon - The leading icon.
 * @part check - The mark of a checkable item.
 * @part label - The wrapper around the default slot.
 * @part shortcut - The shortcut hint.
 */
@Component({
  tag: "idg-menu-item",
  styleUrls: ["../../styles/focus-ring.css", "menu-item.css"],
  shadow: { delegatesFocus: true },
})
export class IdgMenuItem {
  /** What `idgSelect` reports when this item is chosen. */
  @Prop({ reflect: true }) value = "";

  /** `item` does something, `checkbox` toggles, `radio` picks one of its group. */
  @Prop({ reflect: true }) type: MenuItemType = "item";

  /** Whether a checkbox or radio item is on. The menu changes it when the item is chosen. */
  @Prop({ mutable: true, reflect: true }) checked = false;

  /** Keeps the item in the menu, where it can be found, but stops it being chosen. */
  @Prop({ reflect: true }) disabled = false;

  /** Makes the item a link. Only http, https, mailto, tel and relative urls are kept. */
  @Prop() href?: string;

  /** Where a link opens. Anything but `_self` adds `rel="noopener noreferrer"`. */
  @Prop() target?: string;

  /** Link relationship. */
  @Prop() rel?: string;

  /** A hint such as `Ctrl+E`, shown when the UX mode turns shortcuts on. Nothing binds the key. */
  @Prop() shortcut?: string;

  /** A leading icon, drawn as decoration. */
  @Prop() icon?: IconName;

  private element?: HTMLElement;

  /** Focuses the item. */
  @Method()
  setFocus(): Promise<void> {
    this.element?.focus();
    return Promise.resolve();
  }

  /** Follows the item's link, as a click on it would. */
  @Method()
  follow(): Promise<void> {
    if (this.element?.localName === "a") this.element.click();
    return Promise.resolve();
  }

  render() {
    const type = oneOf(MENU_ITEM_TYPES, this.type, "item");
    const checkable = type !== "item";
    const href = this.disabled ? undefined : safeUrl(this.href);
    const Tag = href === undefined ? "div" : "a";
    const shortcut = this.shortcut === "" ? undefined : this.shortcut;
    return (
      <Tag
        ref={(element?: HTMLElement) => (this.element = element)}
        class={{ item: true, focusable: true, [`type-${type}`]: true, checked: this.checked }}
        part="item"
        role={MENU_ITEM_ROLES[type]}
        tabindex="-1"
        href={href}
        target={href === undefined ? undefined : this.target}
        rel={href === undefined ? undefined : linkRel(this.target, this.rel)}
        aria-checked={checkable ? String(this.checked) : undefined}
        aria-disabled={this.disabled ? "true" : undefined}
        aria-keyshortcuts={shortcut}
      >
        {checkable ? (
          <span class="check" part="check" aria-hidden="true">
            {type === "checkbox" ? <idg-icon name="check" size="sm" /> : <span class="dot" />}
          </span>
        ) : null}
        {this.icon ? (
          <idg-icon class="icon" part="icon" name={this.icon} aria-hidden="true" />
        ) : null}
        <span class="label" part="label">
          <slot />
        </span>
        {shortcut ? (
          <kbd class="shortcut" part="shortcut" aria-hidden="true">
            {shortcut}
          </kbd>
        ) : null}
      </Tag>
    );
  }
}

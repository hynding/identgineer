export const MENU_ITEM_TYPES = ["item", "checkbox", "radio"] as const;

export type MenuItemType = (typeof MENU_ITEM_TYPES)[number];

export const MENU_ITEM_ROLES: Readonly<Record<MenuItemType, string>> = {
  item: "menuitem",
  checkbox: "menuitemcheckbox",
  radio: "menuitemradio",
};

/** Detail of `idgSelect`: the chosen item's value, and its new state for a checkable item. */
export interface MenuSelectDetail {
  value: string;
  checked?: boolean;
}

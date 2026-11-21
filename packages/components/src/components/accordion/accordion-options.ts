/** Detail of `idgToggle`: the item that opened or closed, and whether it is now open. */
export interface AccordionToggleDetail {
  value: string;
  open: boolean;
}

export const DEFAULT_ACCORDION_HEADING_LEVEL = 3;

/** The most items that are each given the region role, beyond which landmarks would crowd the page. */
export const MAX_REGION_ITEMS = 6;

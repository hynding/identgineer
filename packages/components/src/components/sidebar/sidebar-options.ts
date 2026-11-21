export const SIDEBAR_SIDES = ["start", "end"] as const;

export type SidebarSide = (typeof SIDEBAR_SIDES)[number];

export const BREADCRUMB_SEPARATORS = ["chevron", "slash"] as const;

export type BreadcrumbSeparator = (typeof BREADCRUMB_SEPARATORS)[number];

/**
 * How the shell draws its navigation, which the stylesheet decides from the layout and the width of
 * the container and leaves in the `--_nav` custom property for the script to read.
 *
 * - `inline`: always in the page, no toggle.
 * - `disclosure`: collapsed behind a toggle, and opened as a panel in the flow of the page.
 * - `drawer`: collapsed behind a toggle, and opened as a modal panel over the page.
 */
export const NAVIGATION_MODES = ["inline", "disclosure", "drawer"] as const;

export type NavigationMode = (typeof NAVIGATION_MODES)[number];

/** Reads the custom property as the browser reports it. Anything unknown hides nothing. */
export function navigationModeOf(value: string): NavigationMode {
  const text = value.trim();
  return NAVIGATION_MODES.find((mode) => mode === text) ?? "inline";
}

export interface NavigationToggleDetail {
  open: boolean;
}

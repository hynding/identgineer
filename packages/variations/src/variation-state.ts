import type { DesignId, LayoutId, Scheme, ThemeId, UxModeId } from "@identgineer/tokens";

/** The four independent variation axes. Each is an attribute on the root element. */
export type VariationAxis = "theme" | "design" | "layout" | "ux";

/** `system` is the absence of `data-scheme`: the theme follows the system preference. */
export type SchemeChoice = Scheme | "system";

export interface VariationState {
  readonly theme: ThemeId;
  readonly design: DesignId;
  readonly layout: LayoutId;
  readonly ux: UxModeId;
  readonly scheme: SchemeChoice;
}

export type StateKey = keyof VariationState;

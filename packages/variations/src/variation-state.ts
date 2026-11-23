import type { REGISTRY_DATA } from "./generated/registry-data.ts";

type Data = typeof REGISTRY_DATA;

// Derived from the generated data rather than imported from the tokens package, which would drag
// the token pipeline into the browser bundle.
export type ThemeId = Data["theme"]["variations"][number]["id"];
export type DesignId = Data["design"]["variations"][number]["id"];
export type LayoutId = Data["layout"]["variations"][number]["id"];
export type UxModeId = Data["ux"]["variations"][number]["id"];
export type SchemeChoice = Data["scheme"]["ids"][number];
export type Scheme = Exclude<SchemeChoice, "system">;

/** The four independent variation axes. Each is an attribute on the root element. */
export type VariationAxis = "theme" | "design" | "layout" | "ux";

/** `system` is the absence of `data-scheme`: the theme follows the system preference. */

export interface VariationState {
  readonly theme: ThemeId;
  readonly design: DesignId;
  readonly layout: LayoutId;
  readonly ux: UxModeId;
  readonly scheme: SchemeChoice;
}

export type StateKey = keyof VariationState;

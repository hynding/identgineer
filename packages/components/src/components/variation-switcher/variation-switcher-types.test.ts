import { describe, expect, it } from "vitest";
import type { StateKey, VariationState, VariationsChange } from "@identgineer/variations";
import type * as Local from "./variation-switcher-types";

// The public types are declared in this package, because the variations package is TypeScript
// source with `.ts` import specifiers that a consumer's compiler cannot read through our
// declarations. These assertions are compile-time: `pnpm typecheck` fails the moment a local type
// stops being identical to the variations package's.
/* eslint-disable @typescript-eslint/no-unnecessary-type-parameters -- the standard identity check */
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/* eslint-enable @typescript-eslint/no-unnecessary-type-parameters */

const identical: {
  theme: Equal<Local.ThemeId, VariationState["theme"]>;
  design: Equal<Local.DesignId, VariationState["design"]>;
  layout: Equal<Local.LayoutId, VariationState["layout"]>;
  ux: Equal<Local.UxModeId, VariationState["ux"]>;
  scheme: Equal<Local.SchemeChoice, VariationState["scheme"]>;
  key: Equal<Local.StateKey, StateKey>;
  state: Equal<Local.VariationState, VariationState>;
  detail: Equal<Local.VariationsChangeDetail, VariationsChange>;
} = {
  theme: true,
  design: true,
  layout: true,
  ux: true,
  scheme: true,
  key: true,
  state: true,
  detail: true,
};

describe("the local copies of the variations types", () => {
  it("are identical to the variations package's, which the compiler checks", () => {
    expect(Object.values(identical).every(Boolean)).toBe(true);
  });
});

import { THEME_IDS } from "@identgineer/tokens";

export const BRAND_ID_MIN_LENGTH = 2;
export const BRAND_ID_MAX_LENGTH = 32;

// Lower-case ASCII words joined by single hyphens, starting with a letter: safe as an attribute
// value, a file name and a URL parameter without any escaping.
const BRAND_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** Words a brand id may not take besides the built-in theme ids: CSS keywords and scheme words. */
export const RESERVED_BRAND_IDS: readonly string[] = Object.freeze([
  "inherit",
  "initial",
  "unset",
  "revert",
  "revert-layer",
  "default",
  "none",
  "auto",
  "system",
  "light",
  "dark",
  "brand",
  "theme",
  "custom",
]);

export type BrandIdProblem =
  | { readonly code: "too-short" | "too-long" | "invalid-id"; readonly message: string }
  | { readonly code: "reserved-id"; readonly message: string };

export function findBrandIdProblem(id: string): BrandIdProblem | undefined {
  if (id.length < BRAND_ID_MIN_LENGTH) {
    return {
      code: "too-short",
      message: `id needs at least ${String(BRAND_ID_MIN_LENGTH)} characters`,
    };
  }
  if (id.length > BRAND_ID_MAX_LENGTH) {
    return {
      code: "too-long",
      message: `id takes at most ${String(BRAND_ID_MAX_LENGTH)} characters`,
    };
  }
  if (!BRAND_ID.test(id)) {
    return {
      code: "invalid-id",
      message:
        "id must be lower-case letters and digits in words joined by single hyphens, starting with a letter",
    };
  }
  if (THEME_IDS.some((builtIn) => builtIn === id)) {
    return { code: "reserved-id", message: "id names a built-in theme" };
  }
  if (RESERVED_BRAND_IDS.includes(id)) {
    return { code: "reserved-id", message: "id is a reserved word" };
  }
  return undefined;
}

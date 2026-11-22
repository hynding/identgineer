import { DESIGN_IDS } from "./design-ids.ts";
import { LAYOUT_IDS } from "./layout-ids.ts";
import { THEME_IDS } from "./theme-ids.ts";
import { UX_MODE_IDS } from "./ux-ids.ts";

const MIN_LENGTH = 2;
const MAX_LENGTH = 32;
// Lower-case ASCII words joined by single hyphens, starting with a letter: safe as an attribute
// value, a file name and a URL parameter without any escaping.
const PATTERN = "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$";

/**
 * Ids a theme added beside the built-in ones (one generated from a brand kit) may not take: every
 * built-in id of every axis, CSS-wide keywords, scheme and default words, and the two prototype
 * names that fit the pattern.
 */
export const RESERVED_THEME_IDS: readonly string[] = Object.freeze([
  ...THEME_IDS,
  ...DESIGN_IDS,
  ...LAYOUT_IDS,
  ...UX_MODE_IDS,
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
  "constructor",
  "prototype",
]);

/**
 * The rule as plain data, so a package whose browser bundle may not import this one (variations)
 * can embed it at build time and apply exactly the same rule.
 */
export const ADDED_THEME_ID_RULE = Object.freeze({
  pattern: PATTERN,
  minLength: MIN_LENGTH,
  maxLength: MAX_LENGTH,
  reserved: Object.freeze([...RESERVED_THEME_IDS].sort()),
});

export type AddedThemeIdProblem = "too-short" | "too-long" | "invalid-id" | "reserved-id";

const ID = new RegExp(PATTERN);

export function findAddedThemeIdProblem(
  id: string,
): { readonly code: AddedThemeIdProblem } | undefined {
  if (id.length < MIN_LENGTH) return { code: "too-short" };
  if (id.length > MAX_LENGTH) return { code: "too-long" };
  if (!ID.test(id)) return { code: "invalid-id" };
  if (RESERVED_THEME_IDS.includes(id)) return { code: "reserved-id" };
  return undefined;
}

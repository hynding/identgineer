import {
  ADDED_THEME_ID_RULE,
  findAddedThemeIdProblem,
  RESERVED_THEME_IDS,
} from "@identgineer/tokens";

export const BRAND_ID_MIN_LENGTH = ADDED_THEME_ID_RULE.minLength;
export const BRAND_ID_MAX_LENGTH = ADDED_THEME_ID_RULE.maxLength;

/**
 * Words a brand id may not take: the tokens package's reserved ids for added themes (every built-in
 * id of every axis, CSS-wide keywords, scheme words and the prototype names that fit the rule).
 */
export const RESERVED_BRAND_IDS: readonly string[] = RESERVED_THEME_IDS;

export interface BrandIdProblem {
  readonly code: "too-short" | "too-long" | "invalid-id" | "reserved-id";
  readonly message: string;
}

const MESSAGES: Readonly<Record<BrandIdProblem["code"], string>> = {
  "too-short": `a brand id needs at least ${String(BRAND_ID_MIN_LENGTH)} characters`,
  "too-long": `a brand id takes at most ${String(BRAND_ID_MAX_LENGTH)} characters`,
  "invalid-id":
    "a brand id must be lower-case letters and digits in words joined by single hyphens, starting with a letter",
  "reserved-id": "a brand id may not be a built-in id of any axis or a reserved word",
};

export function findBrandIdProblem(id: string): BrandIdProblem | undefined {
  const problem = findAddedThemeIdProblem(id);
  return problem && { code: problem.code, message: MESSAGES[problem.code] };
}

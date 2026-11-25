export type Artefact = "css" | "tokens" | "snippet";

/** The longest file name stem: enough for any brand name, short enough for any file system. */
export const FILE_SLUG_MAX_LENGTH = 40;
export const FALLBACK_SLUG = "brand";

// Names a Windows file system reserves for devices, with or without an extension.
const DEVICE_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/;

/**
 * A file name stem from a brand's name: lower case ASCII letters and digits in words joined by
 * single hyphens, at most `FILE_SLUG_MAX_LENGTH` long, never starting or ending with a hyphen. An
 * accented letter loses its accent; anything else, a dot, a slash, a colon, white space, a control
 * character, a script with no ASCII letter, becomes a hyphen or nothing. So there is never a path
 * separator or a dot in it, and a name that leaves nothing (or a device name) is `brand`.
 */
export function fileSlug(name: unknown): string {
  if (typeof name !== "string") return FALLBACK_SLUG;
  const words = name
    .normalize("NFKD")
    .replaceAll(/\p{M}/gu, "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
  const slug = words.slice(0, FILE_SLUG_MAX_LENGTH).replace(/-+$/, "");
  return slug === "" || DEVICE_NAME.test(slug) ? FALLBACK_SLUG : slug;
}

/** The file a downloaded artefact is saved as, and the explicit type its blob has. */
export function artefactFile(
  artefact: "css" | "tokens",
  slug: string,
): { readonly name: string; readonly type: string } {
  return artefact === "css"
    ? { name: `${slug}.css`, type: "text/css" }
    : { name: `${slug}.json`, type: "application/json" };
}

// The tokens package's added-theme id rule, 2 to 32 lower case letters and digits in words joined
// by single hyphens, starting with a letter. It does not know the reserved words, which the brand
// package has already refused in any theme it generated.
const THEME_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const THEME_ID_MIN_LENGTH = 2;
const THEME_ID_MAX_LENGTH = 32;

/** The theme id, when it is exactly what the brand package allows as one; otherwise nothing. */
export function themeIdOf(value: unknown): string | undefined {
  return typeof value === "string" &&
    value.length >= THEME_ID_MIN_LENGTH &&
    value.length <= THEME_ID_MAX_LENGTH &&
    THEME_ID.test(value)
    ? value
    : undefined;
}

/**
 * The lines that put a theme on a page: the stylesheets, and the attribute that selects it. Built
 * from a theme id and a file stem that have both passed their checks, so it holds nothing else.
 */
export function usageSnippet(id: string, slug: string): string {
  return [
    '<link rel="stylesheet" href="/tokens/index.css" />',
    `<link rel="stylesheet" href="/themes/${slug}.css" />`,
    "",
    `<html data-theme="${id}">`,
  ].join("\n");
}

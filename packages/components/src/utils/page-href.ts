import { safeUrl } from "./safe-url";

const PLACEHOLDER = "{page}";

/**
 * The url of one page, from a template such as `/items?page={page}`. The number is the only thing
 * put into the template and the result goes through `safeUrl`, so a template cannot produce a
 * script url. A template with no placeholder would give every page the same url, which is a
 * mistake in the page rather than a link, so it gives none.
 */
export function pageHref(template: string | undefined, page: number): string | undefined {
  if (!template?.includes(PLACEHOLDER)) return undefined;
  if (!Number.isInteger(page) || page < 1) return undefined;
  return safeUrl(template.split(PLACEHOLDER).join(String(page)));
}

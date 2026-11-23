import { truncateText } from "./truncate-text.ts";
import { MAX_PATH_LENGTH, REFERRER_PATTERN } from "./wire-format.ts";

const MAX_PATH_SEGMENT_LENGTH = 512;

export interface PathOptions {
  readonly allowedQueryParameters: ReadonlySet<string>;
  /** The longest value kept for an allowed query parameter, in UTF-16 units. */
  readonly maxValueLength: number;
}

const parseWebUrl = (input: string, base: string | undefined): URL | undefined => {
  try {
    const url = new URL(input, base);
    return url.protocol === "http:" || url.protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
};

const cutPath = (pathname: string): string =>
  pathname.length <= MAX_PATH_SEGMENT_LENGTH
    ? pathname
    : pathname.slice(0, MAX_PATH_SEGMENT_LENGTH).replace(/%[0-9A-Fa-f]?$/, "");

// Parameters are added while the whole still fits the wire format's path length.
const withAllowedQuery = (path: string, url: URL, options: PathOptions): string => {
  const kept = new URLSearchParams();
  for (const [name, value] of url.searchParams) {
    if (!options.allowedQueryParameters.has(name)) continue;
    kept.append(name, truncateText(value, options.maxValueLength));
    if (path.length + 1 + kept.toString().length > MAX_PATH_LENGTH) {
      kept.delete(name, truncateText(value, options.maxValueLength));
      break;
    }
  }
  const query = kept.toString();
  return query === "" ? path : `${path}?${query}`;
};

/**
 * A URL, or a reference resolved against `base`, reduced to its origin-relative path. The host,
 * credentials, fragment and every query parameter the page did not allow are gone. Anything that
 * is not an http(s) URL (`javascript:`, `data:`, `file:`) gives `undefined`.
 */
export const minimisePath = (
  input: string,
  base: string | undefined,
  options: PathOptions,
): string | undefined => {
  if (input.trim() === "") return undefined;
  const url = parseWebUrl(input.trim(), base);
  return url === undefined ? undefined : withAllowedQuery(cutPath(url.pathname), url, options);
};

/** The referrer's origin and nothing else; none when it is the page's own origin or not a web URL. */
export const minimiseReferrer = (
  referrer: string,
  pageUrl: string | undefined,
): string | undefined => {
  if (referrer === "") return undefined;
  const origin = parseWebUrl(referrer, undefined)?.origin;
  if (origin === undefined || !REFERRER_PATTERN.test(origin)) return undefined;
  const own = pageUrl === undefined ? undefined : parseWebUrl(pageUrl, undefined)?.origin;
  return origin === own ? undefined : origin;
};

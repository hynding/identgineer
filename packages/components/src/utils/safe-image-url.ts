// Only the avatar, which is in the controls bundle, loads images: its copy of safeUrl keeps that
// bundle from importing a chunk of its own (see controls-copies.ts).
import { safeUrl } from "./controls-copies";

const NOT_FOR_IMAGES: ReadonlySet<string> = new Set(["mailto", "tel"]);
const SCHEME = /^([^:/?#]*):/;

/**
 * Returns the url when it is safe to load as an image, otherwise `undefined`. Only http, https and
 * relative urls pass: `data:` and `blob:` would let a prop carry its own content, and a `mailto:`
 * or `tel:` is not an image.
 */
export function safeImageUrl(url: string | null | undefined): string | undefined {
  const safe = safeUrl(url);
  if (safe === undefined) return undefined;
  const scheme = SCHEME.exec(safe)?.[1]?.toLowerCase();
  return scheme !== undefined && NOT_FOR_IMAGES.has(scheme) ? undefined : safe;
}

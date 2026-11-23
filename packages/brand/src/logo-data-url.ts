import { isSanitisedSvgLogo } from "./is-sanitised-svg-logo.ts";
import type { SanitisedSvg } from "./sanitised-svg.ts";

// Kept as they are: letters, digits and a few characters that mean nothing in a URL's data, an
// HTML attribute or a CSS string. Everything else is percent-encoded, `#` and `%` included (a
// bare `#` would end the data and start a fragment).
const KEPT = /^[A-Za-z0-9\-._~/:=,]$/;

function percentEncode(text: string): string {
  const encoder = new TextEncoder();
  let output = "";
  for (const character of text) {
    if (KEPT.test(character)) {
      output += character;
      continue;
    }
    for (const byte of encoder.encode(character)) {
      output += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
    }
  }
  return output;
}

/**
 * A `data:image/svg+xml` URL for a sanitised logo, for the `src` of an `<img>` (or a CSS
 * `background-image`), never for inlining. Percent-encoded UTF-8: smaller than base64 for SVG's
 * mostly ASCII text, the same everywhere, and free of quotes, angle brackets, ampersands, white
 * space and `#`, so it is safe in any attribute. A page's Content-Security-Policy must allow
 * `img-src data:` for it to load. Throws a TypeError for anything `sanitiseSvgLogo` did not return,
 * since the type alone cannot stop a JavaScript caller.
 */
export function logoDataUrl(svg: SanitisedSvg): string {
  if (!isSanitisedSvgLogo(svg)) {
    throw new TypeError("logoDataUrl takes only an SVG that sanitiseSvgLogo returned");
  }
  return `data:image/svg+xml;charset=utf-8,${percentEncode(svg)}`;
}

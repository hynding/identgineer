import { acceptedLogo } from "./is-sanitised-svg-logo.ts";
import { encodeLogoDataUrl } from "./logo-data-url.ts";

/** What an `<img>` needs to draw a logo. */
export interface LogoImage {
  /** The logo's `data:image/svg+xml` url, as `logoDataUrl` gives it. */
  readonly url: string;
  /**
   * The size the image draws at, in CSS pixels: the root's width and height, which are the image's
   * natural size and may be another shape than the view box (the view box is fitted inside).
   */
  readonly width: number;
  readonly height: number;
}

/**
 * The image of a logo, or `undefined` for anything but the sanitiser's own output. The logo is read
 * once (twice for a logo made with a custom id prefix, which is read with the default one first),
 * where `isSanitisedSvgLogo` followed by `logoDataUrl` reads it twice, and the size is the
 * one the sanitiser settled, units converted to pixels.
 */
export function logoImage(value: unknown): LogoImage | undefined {
  const accepted = acceptedLogo(value);
  return accepted === undefined
    ? undefined
    : { url: encodeLogoDataUrl(accepted.svg), width: accepted.width, height: accepted.height };
}

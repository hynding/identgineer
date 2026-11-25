import { logoImage } from "@identgineer/brand/logo";

/** What an `<img>` needs to draw a logo: where to load it from and the frame to reserve for it. */
export interface BrandLogoSource {
  /** A `data:image/svg+xml` url: nothing is fetched. */
  readonly url: string;
  /** The frame, as whole numbers in the shape of the size the logo draws at. */
  readonly width: number;
  readonly height: number;
}

// The browser reads an image's width and height attributes as whole numbers, so a fraction would be
// cut (1.5 by 1 to 1 by 1, 0.5 by 0.25 to nothing) and the box would reserve another shape than the
// image then draws. Scaled so the shorter side is this long, rounding changes the shape by under a
// thousandth.
const SHORTER_SIDE = 1000;
// Far below the largest number an attribute holds, for a frame of hundreds of thousands to one.
const LONGEST_SIDE = 1_000_000_000;

/** A frame as whole numbers that keep its shape, for the image's `width` and `height`. */
export function integerFrame(width: number, height: number): { width: number; height: number } {
  let scale = SHORTER_SIDE / Math.min(width, height);
  scale = Math.min(scale, LONGEST_SIDE / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * The image source for a brand's logo, or `undefined` when the text is anything but the logo
 * sanitiser's own output. That check is the whole defence: the text is read again by the sanitiser
 * and must come back unchanged, so a script, a handler, an external reference or any markup around
 * the logo never gets as far as a `src`. The frame is the size the sanitiser settled for the root,
 * which is the image's natural size, and not the view box, which may be another shape.
 */
export function brandLogoSource(logo: unknown): BrandLogoSource | undefined {
  const image = logoImage(logo);
  return image === undefined
    ? undefined
    : { url: image.url, ...integerFrame(image.width, image.height) };
}

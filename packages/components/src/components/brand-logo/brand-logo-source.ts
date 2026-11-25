import { isSanitisedSvgLogo, logoDataUrl } from "@identgineer/brand/logo";

/** What an `<img>` needs to draw a logo: where to load it from and the size of its frame. */
export interface BrandLogoSource {
  /** A `data:image/svg+xml` url: nothing is fetched. */
  readonly url: string;
  /** The logo's frame in the units of its view box, for the image's width and height. */
  readonly width: number;
  readonly height: number;
}

// The sanitiser writes the root as `<svg xmlns="…" viewBox="…" …>`, with escaped attribute values,
// so the first start tag ends at the first `>`.
const ROOT_VIEW_BOX = /^<svg\s[^>]*?\sviewBox="([^"]*)"/;

/** The size of a sanitised logo's frame, from the view box of its root element. */
export function logoFrame(svg: string): Pick<BrandLogoSource, "width" | "height"> | undefined {
  const numbers = ROOT_VIEW_BOX.exec(svg)?.[1]
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  if (numbers?.length !== 4) return undefined;
  const [, , width, height] = numbers;
  if (width === undefined || height === undefined) return undefined;
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
    ? { width, height }
    : undefined;
}

/**
 * The image source for a brand's logo, or `undefined` when the text is anything but the logo
 * sanitiser's own output. That check is the whole defence: the text is read again by the sanitiser
 * and must come back unchanged, so a script, a handler, an external reference or any markup around
 * the logo never gets as far as a `src`. `logoDataUrl` takes only text that passed it.
 */
export function brandLogoSource(logo: unknown): BrandLogoSource | undefined {
  if (!isSanitisedSvgLogo(logo)) return undefined;
  const frame = logoFrame(logo);
  return frame === undefined ? undefined : { url: logoDataUrl(logo), ...frame };
}

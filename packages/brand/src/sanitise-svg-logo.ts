import { decodeSvgInput } from "./decode-svg-input.ts";
import { filterSvgTree, type CleanElement } from "./filter-svg-tree.ts";
import { parseSvgXml } from "./parse-svg-xml.ts";
import { resolveSvgNamespaces } from "./resolve-svg-namespaces.ts";
import type { SanitisedSvg } from "./sanitised-svg.ts";
import { serialiseSvg } from "./serialise-svg.ts";
import { settleSvgReferences } from "./settle-svg-references.ts";
import { findDisallowedCharacter } from "./svg-characters.ts";
import { SVG_LOGO_LIMITS, type SvgLogoLimits } from "./svg-logo-limits.ts";
import type { SvgLogoError, SvgLogoResult } from "./svg-logo-result.ts";
import { SvgLogoRejection } from "./svg-logo-rejection.ts";
import { normaliseNumber } from "./svg-number.ts";
import { Removals, TextLocator } from "./svg-removals.ts";

export interface SvgLogoOptions {
  /**
   * Every id kept is renamed to this prefix and a number, in document order: 2 to 24 characters,
   * lower-case letters, digits and hyphens, starting with a letter and ending with a hyphen.
   * Defaults to `logo-`. Give two logos inlined into one page different prefixes.
   */
  readonly idPrefix?: string;
}

export const DEFAULT_ID_PREFIX = "logo-";
export const ID_PREFIX_PATTERN = /^[a-z][a-z0-9-]{0,22}-$/;

function readIdPrefix(options: unknown): string {
  if (options === undefined) return DEFAULT_ID_PREFIX;
  if (typeof options !== "object" || options === null) {
    throw new SvgLogoRejection("invalid-option", "options must be an object");
  }
  const prefix: unknown = "idPrefix" in options ? options.idPrefix : undefined;
  if (prefix === undefined) return DEFAULT_ID_PREFIX;
  if (typeof prefix !== "string" || !ID_PREFIX_PATTERN.test(prefix)) {
    throw new SvgLogoRejection(
      "invalid-option",
      "idPrefix takes 2 to 24 lower-case letters, digits and hyphens, starting with a letter and ending with a hyphen",
    );
  }
  return prefix;
}

interface Size {
  readonly width: number;
  readonly height: number;
  readonly viewBox: readonly [number, number, number, number];
}

function textOf(root: CleanElement, name: string): string | undefined {
  const value = root.attributes.get(name);
  return value !== undefined && "text" in value ? value.text : undefined;
}

/**
 * Gives the root an explicit view box, width and height: each one written is kept, a missing view
 * box is `0 0 width height`, and a missing width or height follows from the view box's proportions.
 * A root with neither a view box nor both a width and height has no size and is refused.
 */
function settleSize(root: CleanElement, limits: SvgLogoLimits): Size {
  let width = textOf(root, "width");
  let height = textOf(root, "height");
  let viewBox = textOf(root, "viewBox");
  if (viewBox === undefined) {
    if (width === undefined || height === undefined) {
      throw new SvgLogoRejection(
        "missing-size",
        "needs a viewBox, or a width and a height in absolute units",
      );
    }
    viewBox = `0 0 ${width} ${height}`;
  }
  const parts = viewBox.split(" ");
  const [minX = 0, minY = 0, boxWidth = 1, boxHeight = 1] = parts.map(Number);
  const scaled = (value: number): string | undefined =>
    normaliseNumber(value.toFixed(limits.fractionDigits), limits);
  if (width === undefined && height === undefined) {
    width = parts[2];
    height = parts[3];
  } else if (width === undefined && height !== undefined) {
    width = scaled((Number(height) * boxWidth) / boxHeight);
  } else if (height === undefined && width !== undefined) {
    height = scaled((Number(width) * boxHeight) / boxWidth);
  }
  if (width === undefined || height === undefined || Number(width) <= 0 || Number(height) <= 0) {
    throw new SvgLogoRejection("missing-size", "has no usable width and height");
  }
  root.attributes.set("viewBox", { text: viewBox });
  root.attributes.set("width", { text: width });
  root.attributes.set("height", { text: height });
  return {
    width: Number(width),
    height: Number(height),
    viewBox: [minX, minY, boxWidth, boxHeight],
  };
}

function toError(rejection: SvgLogoRejection, locator: TextLocator | undefined): SvgLogoError {
  const message = `the SVG ${rejection.message}`;
  if (rejection.offset === undefined || locator === undefined) {
    return { code: rejection.code, message };
  }
  return { code: rejection.code, message, ...locator.locate(rejection.offset) };
}

/**
 * The sanitiser with its limits as a parameter, so tests can measure the reader on inputs larger
 * than the public limits allow. Never throws.
 */
export function sanitiseSvgLogoWithLimits(
  input: unknown,
  options: unknown,
  limits: SvgLogoLimits,
): SvgLogoResult {
  let locator: TextLocator | undefined;
  try {
    const idPrefix = readIdPrefix(options);
    const text = decodeSvgInput(input, limits.inputBytes);
    locator = new TextLocator(text);
    const disallowed = findDisallowedCharacter(text);
    if (disallowed !== -1) {
      throw new SvgLogoRejection(
        "invalid-character",
        "holds a control, format or unpaired surrogate character",
        disallowed,
      );
    }
    const removals = new Removals(locator);
    const document = parseSvgXml(text, limits);
    if (document.doctype !== undefined) {
      removals.add({ element: "!DOCTYPE" }, "document-type", document.doctype);
    }
    const root = filterSvgTree(resolveSvgNamespaces(document.root), limits, removals);
    const size = settleSize(root, limits);
    const { renamed, drawingCost } = settleSvgReferences(root, limits, idPrefix, removals);
    return {
      ok: true,
      svg: serialiseSvg(root, renamed) as SanitisedSvg,
      ...size,
      drawingCost,
      removed: removals.list,
      removedCount: removals.count,
    };
  } catch (error) {
    if (error instanceof SvgLogoRejection) return { ok: false, errors: [toError(error, locator)] };
    // Only a defect in the sanitiser gets here (stack exhaustion included); it still refuses.
    return {
      ok: false,
      errors: [{ code: "internal-error", message: "the SVG could not be read" }],
    };
  }
}

/**
 * Reads an untrusted SVG logo (a string, or bytes that must be UTF-8) with a strict XML reader,
 * keeps only allowlisted SVG elements and attributes with values that pass their grammars, and
 * writes the result from scratch. Returns the canonical, inert SVG with its size and everything
 * removed, or the reason the document was refused. Never throws; the same input always gives the
 * same output, and sanitising the output again gives it back unchanged.
 */
export function sanitiseSvgLogo(
  input: string | Uint8Array,
  options?: SvgLogoOptions,
): SvgLogoResult {
  return sanitiseSvgLogoWithLimits(input, options, SVG_LOGO_LIMITS);
}

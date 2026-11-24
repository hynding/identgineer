import { decodeSvgInput } from "./decode-svg-input.ts";
import { filterSvgTree, type CleanElement } from "./filter-svg-tree.ts";
import { freshIds } from "./fresh-ids.ts";
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
import { aspectRatio, SVG_GRAMMARS, type SvgValue } from "./svg-values.ts";

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
  root.attributes.set("width", { text: width });
  root.attributes.set("height", { text: height });
  const size = { width: Number(width), height: Number(height) };
  const box = [minX, minY, boxWidth, boxHeight] as const;
  const shown = root.droppedAspect === undefined ? box : showAsDrawn(root, size, box, limits);
  root.attributes.set("viewBox", canonical("viewBox", shown.join(" "), limits));
  return { ...size, viewBox: shown };
}

function canonical(name: string, text: string, limits: SvgLogoLimits): SvgValue {
  const value = SVG_GRAMMARS[name]?.(text, limits);
  if (value === undefined) {
    throw new SvgLogoRejection(
      "number-out-of-range",
      "has a preserveAspectRatio whose view box cannot be written within the number limits",
    );
  }
  return value;
}

type ViewBox = readonly [number, number, number, number];

/**
 * Makes the view box show, drawn to fit, what the dropped `preserveAspectRatio` showed and nothing
 * more. A crop (`slice`) shows part of the view box: the view box becomes that part. A stretch
 * (`none`) shows the whole view box, distorted: the view box stays and its content is clipped to
 * it, since drawn to fit it leaves space round it where content beyond it would otherwise show.
 */
function showAsDrawn(
  root: CleanElement,
  size: { readonly width: number; readonly height: number },
  [minX, minY, boxWidth, boxHeight]: ViewBox,
  limits: SvgLogoLimits,
): ViewBox {
  const aspect = aspectRatio(root.droppedAspect ?? "");
  const digits = (value: number): number => Number(value.toFixed(limits.fractionDigits));
  if (aspect?.align === "none") {
    if (boxWidth * size.height !== boxHeight * size.width)
      clipToViewBox(root, [minX, minY, boxWidth, boxHeight], limits);
    return [minX, minY, boxWidth, boxHeight];
  }
  const scale = Math.max(size.width / boxWidth, size.height / boxHeight);
  const [width, height] = [size.width / scale, size.height / scale];
  const align = aspect?.align ?? "xMidYMid";
  const share = (part: string): number => (part === "Min" ? 0 : part === "Mid" ? 0.5 : 1);
  return [
    digits(minX + (boxWidth - width) * share(align.slice(1, 4))),
    digits(minY + (boxHeight - height) * share(align.slice(5, 8))),
    digits(width),
    digits(height),
  ];
}

/** Moves everything drawn into a group clipped to the view box; a title or description stays. */
function clipToViewBox(root: CleanElement, box: ViewBox, limits: SvgLogoLimits): void {
  const [minX, minY, width, height] = box.map(String);
  const id = freshIds(root)();
  const rect = new Map<string, SvgValue>();
  if (minX !== "0") rect.set("x", canonical("x", minX ?? "0", limits));
  if (minY !== "0") rect.set("y", canonical("y", minY ?? "0", limits));
  rect.set("width", canonical("width", width ?? "1", limits));
  rect.set("height", canonical("height", height ?? "1", limits));
  const at = root.offset;
  const element = (
    name: CleanElement["name"],
    attributes: Map<string, SvgValue>,
    children: CleanElement[],
  ): CleanElement => ({ name, qualified: name, attributes, children, text: "", offset: at });
  const descriptive = root.children.filter(({ name }) => name === "title" || name === "desc");
  const drawn = root.children.filter(({ name }) => name !== "title" && name !== "desc");
  root.children = [
    ...descriptive,
    element("clipPath", new Map([["id", { text: id }]]), [element("rect", rect, [])]),
    element("g", new Map([["clip-path", { reference: id, form: "url" }]]), drawn),
  ];
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
    const { renamed, drawingCost, overdraw } = settleSvgReferences(
      root,
      limits,
      idPrefix,
      removals,
    );
    const reported = [size.width, size.height, ...size.viewBox, drawingCost, overdraw];
    if (!reported.every(Number.isFinite)) throw new Error("a reported number is not finite");
    const svg = serialiseSvg(root, renamed);
    // Writing clip paths as masks adds a little; whatever it adds, the output is never larger than an
    // input may be, so it can always be sanitised again.
    if (new TextEncoder().encode(svg).length > limits.inputBytes) {
      throw new SvgLogoRejection(
        "too-large",
        `would be written in more than ${String(limits.inputBytes)} bytes`,
      );
    }
    return {
      ok: true,
      svg: svg as SanitisedSvg,
      ...size,
      drawingCost,
      overdraw,
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

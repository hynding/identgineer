import { decodeSvgInput } from "./decode-svg-input.ts";
import { filterSvgTree, type CleanElement } from "./filter-svg-tree.ts";
import { freshIds } from "./fresh-ids.ts";
import { movesMoreThanHalfAPixel, proportionsDifferByMoreThanHalfAPixel } from "./half-pixel.ts";
import { findViewBoxPercentage } from "./view-box-percentages.ts";
import { isLocalPathValue, parseSvgXml } from "./parse-svg-xml.ts";
import { resolveSvgNamespaces } from "./resolve-svg-namespaces.ts";
import type { SanitisedSvg } from "./sanitised-svg.ts";
import { serialiseSvg } from "./serialise-svg.ts";
import { isSettledOutput } from "./settled-output.ts";
import {
  dropDanglingReferences,
  pruneDefinitions,
  settleSvgReferences,
} from "./settle-svg-references.ts";
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
  /** A stretched view box, which the content must be clipped to once references are settled. */
  readonly clipTo: ViewBox | undefined;
  /**
   * Whether the view box became the part a crop showed, which percentages of it must not see; a
   * slice that showed the whole view box, to within half a pixel, keeps it and crops nothing.
   */
  readonly cropped: boolean;
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
  const aspect = aspectRatio(root.droppedAspect ?? "");
  const stretched =
    aspect?.align === "none" &&
    proportionsDifferByMoreThanHalfAPixel({ width: boxWidth, height: boxHeight }, size);
  const shown =
    aspect === undefined || aspect.align === "none"
      ? box
      : cropped(size, box, aspect.align, limits);
  root.attributes.set("viewBox", canonical("viewBox", shown.join(" "), limits));
  return { ...size, viewBox: shown, clipTo: stretched ? box : undefined, cropped: shown !== box };
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
 * The part of the view box a crop (`slice`) showed, which becomes the view box: drawn to fit, it
 * shows what the crop showed and nothing more. Refused where six decimals cannot hold that part to
 * half a pixel at the largest size measured: an edge moved further, or proportions the fitted
 * drawing would letterbox by more.
 */
function cropped(
  size: { readonly width: number; readonly height: number },
  box: ViewBox,
  align: string,
  limits: SvgLogoLimits,
): ViewBox {
  const [minX, minY, boxWidth, boxHeight] = box;
  const scale = Math.max(size.width / boxWidth, size.height / boxHeight);
  const [width, height] = [size.width / scale, size.height / scale];
  const share = (part: string): number => (part === "Min" ? 0 : part === "Mid" ? 0.5 : 1);
  const exact = [
    minX + (boxWidth - width) * share(align.slice(1, 4)),
    minY + (boxHeight - height) * share(align.slice(5, 8)),
    width,
    height,
  ] as const;
  // A slice whose frame has the view box's proportions, to within half a pixel, crops nothing:
  // fitted instead, the view box is letterboxed by no more than that.
  if (!proportionsDifferByMoreThanHalfAPixel({ width: boxWidth, height: boxHeight }, size)) {
    return box;
  }
  const span = Math.max(width, height);
  const written = exact.map((value) => Number(value.toFixed(limits.fractionDigits)));
  const [, , writtenWidth = 1, writtenHeight = 1] = written;
  if (
    exact.some((value, index) => movesMoreThanHalfAPixel(value, written[index] ?? NaN, span)) ||
    proportionsDifferByMoreThanHalfAPixel({ width: writtenWidth, height: writtenHeight }, size)
  ) {
    throw new SvgLogoRejection(
      "unsupported-feature",
      "has a preserveAspectRatio slice that crops a part of its view box too small to write to six decimals; crop the view box itself instead",
    );
  }
  const [x = 0, y = 0, w = 1, h = 1] = written;
  return [x, y, w, h];
}

/**
 * Refuses a crop beside a length given as a percentage of the view box: the crop makes the part it
 * showed the view box, which every such percentage would then be taken of.
 */
function refuseViewBoxPercentages(root: CleanElement): void {
  const found = findViewBoxPercentage(root);
  if (found !== undefined) {
    throw new SvgLogoRejection(
      "unsupported-feature",
      "has a preserveAspectRatio slice beside a length given as a percentage of the view box, which cropping would change; give the length in user units, or crop the view box itself",
      found.offset,
    );
  }
}

/**
 * Moves everything drawn into a group clipped to the view box; a title or description stays. A
 * stretch (`none`) showed the whole view box, distorted; drawn to fit, the view box leaves space
 * round it where content beyond it would otherwise show. The root's own clip path or mask works in
 * the space around the root, which drawing to fit moves under the content, so with either the
 * logo is refused.
 */
function clipToViewBox(root: CleanElement, box: ViewBox, limits: SvgLogoLimits): void {
  if (root.attributes.has("clip-path") || root.attributes.has("mask")) {
    throw new SvgLogoRejection(
      "unsupported-feature",
      "has preserveAspectRatio none beside a clip-path or mask on the root, which would then cut another part of the drawing; stretch the drawing itself, or move the clip path or mask onto a group inside the root",
      root.offset,
    );
  }
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

/**
 * Refuses a tree with more elements, or nested deeper, than an input may have: what the sanitiser
 * adds (a clip to the view box, a group taking a mask) could otherwise give an output the reader
 * refuses, which could not be sanitised again.
 */
function checkWrittenTree(root: CleanElement, limits: SvgLogoLimits): void {
  let count = 0;
  const stack: (readonly [CleanElement, number])[] = [[root, 1]];
  for (let entry = stack.pop(); entry !== undefined; entry = stack.pop()) {
    const [element, depth] = entry;
    count += 1;
    if (depth > limits.depth) {
      throw new SvgLogoRejection(
        "too-deep",
        `would be written with elements nested deeper than ${String(limits.depth)}`,
        element.offset,
      );
    }
    for (const child of element.children) stack.push([child, depth + 1]);
  }
  if (count > limits.elements) {
    throw new SvgLogoRejection(
      "too-many-elements",
      `would be written with more than ${String(limits.elements)} elements`,
    );
  }
}

/**
 * Refuses an output with an attribute value longer than an input's may be: numbers are written out
 * in full (`1e-6` as `0.000001`), so a value can grow past the limit the reader holds it to.
 */
function checkWrittenValues(svg: string, limits: SvgLogoLimits): void {
  for (const [, name = "", value = ""] of svg.matchAll(/ ([\w:-]+)="([^"]*)"/g)) {
    const max = isLocalPathValue(name) ? limits.pathDataLength : limits.attributeValueLength;
    if (value.length > max) {
      throw new SvgLogoRejection(
        "too-long",
        `would be written with an attribute value longer than ${String(max)}`,
      );
    }
  }
}

function toError(rejection: SvgLogoRejection, locator: TextLocator | undefined): SvgLogoError {
  const message = `the SVG ${rejection.message}`;
  if (rejection.offset === undefined || locator === undefined) {
    return { code: rejection.code, message };
  }
  return { code: rejection.code, message, ...locator.locate(rejection.offset) };
}

const UNSETTLED: SvgLogoResult = {
  ok: false,
  errors: [{ code: "internal-error", message: "the SVG could not be read" }],
};

/**
 * The sanitiser with its limits as a parameter, so tests can measure the reader on inputs larger
 * than the public limits allow. Never throws. Every output is checked before it is returned (see
 * `isSettledOutput`): one that is not settled, which only a defect in the sanitiser could give, is
 * refused as `internal-error`.
 */
export function sanitiseSvgLogoWithLimits(
  input: unknown,
  options: unknown,
  limits: SvgLogoLimits,
): SvgLogoResult {
  const result = sanitiseOnce(input, options, limits);
  if (!result.ok) return result;
  const again = (svg: string): string | undefined => {
    const second = sanitiseOnce(svg, options, limits);
    return second.ok ? second.svg : undefined;
  };
  return isSettledOutput(result.svg, again) ? result : UNSETTLED;
}

function sanitiseOnce(input: unknown, options: unknown, limits: SvgLogoLimits): SvgLogoResult {
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
    dropDanglingReferences(root, limits, removals);
    if (size.clipTo !== undefined) clipToViewBox(root, size.clipTo, limits);
    if (size.cropped) {
      // Over what is drawn: a definition nothing uses changes nothing a crop could move.
      pruneDefinitions(root, limits);
      refuseViewBoxPercentages(root);
    }
    const { renamed, drawingCost, overdraw } = settleSvgReferences(
      root,
      limits,
      idPrefix,
      removals,
    );
    checkWrittenTree(root, limits);
    const reported = [size.width, size.height, ...size.viewBox, drawingCost, overdraw];
    if (!reported.every(Number.isFinite)) throw new Error("a reported number is not finite");
    const svg = serialiseSvg(root, renamed);
    checkWrittenValues(svg, limits);
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
      width: size.width,
      height: size.height,
      viewBox: size.viewBox,
      drawingCost,
      overdraw,
      removed: removals.list,
      removedCount: removals.count,
    };
  } catch (error) {
    if (error instanceof SvgLogoRejection) return { ok: false, errors: [toError(error, locator)] };
    // Only a defect in the sanitiser gets here (stack exhaustion included); it still refuses.
    return UNSETTLED;
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

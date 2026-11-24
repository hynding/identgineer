import { decodeSvgInput } from "./decode-svg-input.ts";
import { filterSvgTree, type CleanElement } from "./filter-svg-tree.ts";
import { freshIds } from "./fresh-ids.ts";
import { showsTheSameToHalfAPixel } from "./half-pixel.ts";
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
  // Read once, and whatever reading it does (a getter that throws, a revoked proxy) is the option's
  // fault, not the sanitiser's.
  let prefix: unknown;
  try {
    prefix = Reflect.get(options, "idPrefix");
  } catch {
    throw new SvgLogoRejection("invalid-option", "has options that could not be read");
  }
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
 * A root with neither a view box nor both a width and height has no size and is refused, and so is
 * one given a size under a pixel, and one whose output, its view box fitted into its frame as
 * written, would show other than what the original showed by more than half a device pixel.
 */
function settleSize(root: CleanElement, limits: SvgLogoLimits): Size {
  const givenWidth = textOf(root, "width");
  const givenHeight = textOf(root, "height");
  const exactWidth =
    givenWidth === undefined ? undefined : (root.exactSize?.width ?? Number(givenWidth));
  const exactHeight =
    givenHeight === undefined ? undefined : (root.exactSize?.height ?? Number(givenHeight));
  // No logo has a natural size under a pixel, where six decimals are a large share of it.
  if ((exactWidth ?? 1) < 1 || (exactHeight ?? 1) < 1) {
    throw new SvgLogoRejection(
      "unsupported-feature",
      "has a width or height under one pixel; give the logo a size of at least one pixel, or leave the size out",
    );
  }
  let [width, height] = [givenWidth, givenHeight];
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
  const box = [minX, minY, boxWidth, boxHeight] as const;
  // The frame a browser draws the original in: exactly as given, a missing side in proportion.
  const frame =
    exactWidth === undefined && exactHeight === undefined
      ? { width: boxWidth, height: boxHeight }
      : {
          width: exactWidth ?? ((exactHeight ?? 0) * boxWidth) / boxHeight,
          height: exactHeight ?? ((exactWidth ?? 0) * boxHeight) / boxWidth,
        };
  const scaled = (value: number): string | undefined =>
    normaliseNumber(value.toFixed(limits.fractionDigits), limits);
  if (width === undefined && height === undefined) {
    width = parts[2];
    height = parts[3];
  } else {
    width ??= scaled(frame.width);
    height ??= scaled(frame.height);
  }
  if (width === undefined || height === undefined || Number(width) <= 0 || Number(height) <= 0) {
    throw new SvgLogoRejection("missing-size", "has no usable width and height");
  }
  const size = { width: Number(width), height: Number(height) };
  if (size.width < 1 || size.height < 1) {
    throw new SvgLogoRejection(
      "unsupported-feature",
      "comes to a width or height under one pixel from its view box; give the logo a width and a height of at least one pixel",
    );
  }
  root.attributes.set("width", { text: width });
  root.attributes.set("height", { text: height });
  // Kept only when it fits the view box in (`meet`); a stretch or crop is drawn to fit, centred.
  const fit = textOf(root, "preserveAspectRatio") ?? "xMidYMid";
  const aspect = aspectRatio(root.droppedAspect ?? "");
  const sliced = aspect !== undefined && aspect.align !== "none";
  const stretching = aspect?.align === "none";
  const original = sliced
    ? sliceRegion(frame, box, aspect.align)
    : stretching
      ? box
      : fittedRegion(box, frame, fit);
  // One rule decides: the first that shows what the original showed, to half a pixel, is written.
  // The view box kept whole, unclipped; else, stretched, clipped to itself, or cropped, the part a
  // slice showed, to six decimals.
  const candidates: readonly { readonly shown: ViewBox; readonly clipped: boolean }[] = [
    { shown: box, clipped: false },
    ...(stretching ? [{ shown: box, clipped: true }] : []),
    ...(sliced ? [{ shown: sixDecimals(original, limits), clipped: false }] : []),
  ];
  const chosen = candidates.find(({ shown, clipped }) => {
    const fitted = fittedRegion(shown, size, fit);
    return showsTheSameToHalfAPixel(original, clipped ? within(fitted, box) : fitted);
  });
  if (chosen === undefined) {
    throw new SvgLogoRejection(
      "unsupported-feature",
      sliced
        ? "has a preserveAspectRatio slice that crops a part of its view box too small to write to six decimals; crop the view box itself instead"
        : "has a width or height that six decimals cannot write in the view box's proportions; give both, or the view box in larger numbers",
    );
  }
  const { shown, clipped } = chosen;
  root.attributes.set("viewBox", canonical("viewBox", shown.join(" "), limits));
  return { ...size, viewBox: shown, clipTo: clipped ? box : undefined, cropped: shown !== box };
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
 * The part of the view box a crop (`slice`) shows in a frame: drawn to fit, it shows what the crop
 * showed and nothing more.
 */
function sliceRegion(
  frame: { readonly width: number; readonly height: number },
  [minX, minY, boxWidth, boxHeight]: ViewBox,
  align: string,
): ViewBox {
  const scale = Math.max(frame.width / boxWidth, frame.height / boxHeight);
  const [width, height] = [frame.width / scale, frame.height / scale];
  return [
    minX + (boxWidth - width) * share(align.slice(1, 4)),
    minY + (boxHeight - height) * share(align.slice(5, 8)),
    width,
    height,
  ];
}

/** The part of user space a view box fitted into a frame (`meet`) shows, letterbox included. */
function fittedRegion(
  [minX, minY, boxWidth, boxHeight]: ViewBox,
  frame: { readonly width: number; readonly height: number },
  align: string,
): ViewBox {
  const scale = Math.min(frame.width / boxWidth, frame.height / boxHeight);
  const [width, height] = [frame.width / scale, frame.height / scale];
  return [
    minX - (width - boxWidth) * share(align.slice(1, 4)),
    minY - (height - boxHeight) * share(align.slice(5, 8)),
    width,
    height,
  ];
}

function sixDecimals(region: ViewBox, limits: SvgLogoLimits): ViewBox {
  const [x = 0, y = 0, width = 1, height = 1] = region.map((value) =>
    Number(value.toFixed(limits.fractionDigits)),
  );
  return [x, y, width, height];
}

/** What of `region` lies inside `box`: a stretched view box is clipped to itself. */
function within(
  [x, y, width, height]: ViewBox,
  [minX, minY, boxWidth, boxHeight]: ViewBox,
): ViewBox {
  const [left, top] = [Math.max(x, minX), Math.max(y, minY)];
  const right = Math.min(x + width, minX + boxWidth);
  const bottom = Math.min(y + height, minY + boxHeight);
  return [left, top, right - left, bottom - top];
}

function share(part: string): number {
  return part === "Min" ? 0 : part === "Mid" ? 0.5 : 1;
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
  let idPrefix: string;
  try {
    idPrefix = readIdPrefix(options);
  } catch (error) {
    if (error instanceof SvgLogoRejection)
      return { ok: false, errors: [toError(error, undefined)] };
    return UNSETTLED;
  }
  const result = sanitiseOnce(input, idPrefix, limits);
  if (!result.ok) return result;
  const again = (svg: string): string | undefined => {
    const second = sanitiseOnce(svg, idPrefix, limits);
    return second.ok ? second.svg : undefined;
  };
  return isSettledOutput(result.svg, again) ? result : UNSETTLED;
}

function sanitiseOnce(input: unknown, idPrefix: string, limits: SvgLogoLimits): SvgLogoResult {
  let locator: TextLocator | undefined;
  try {
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

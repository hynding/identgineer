import type { SvgLogoRemovalReason } from "./svg-logo-result.ts";

/**
 * Presentation attributes every drawing element and container takes, in output order. `transform`
 * is not among them: it is an attribute only, since CSS spells transforms differently.
 */
const PRESENTATION = [
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-dasharray",
  "stroke-dashoffset",
  "paint-order",
  "opacity",
  "color",
  "clip-path",
  "clip-rule",
  "mask",
  "display",
  "visibility",
  "shape-rendering",
] as const;

/** Properties a `style` attribute may set; each becomes the presentation attribute of its name. */
export const STYLE_PROPERTIES: ReadonlySet<string> = new Set([
  ...PRESENTATION,
  "stop-color",
  "stop-opacity",
  "mask-type",
]);

// Style properties Chromium reads as a transform of any element it transforms (checked in the
// browser tests): the sanitiser keeps a transform only as an attribute.
const TRANSFORMING = [
  "transform",
  "-webkit-transform",
  "translate",
  "rotate",
  "scale",
  "offset",
  "offset-path",
  "offset-distance",
  "offset-position",
  "offset-anchor",
  "offset-rotate",
] as const;

// A rectangle's width and height, by their logical names too.
const SIZING = [
  "width",
  "height",
  "inline-size",
  "block-size",
  "-webkit-logical-width",
  "-webkit-logical-height",
] as const;

// Margins and paddings of each side, logical and prefixed: on the root, they move what it draws.
const ROOT_BOX = [
  "margin",
  "padding",
  ...["margin", "padding"].flatMap((box) => [
    ...["top", "left", "right", "bottom"].map((side) => `${box}-${side}`),
    ...["block", "inline"].flatMap((axis) => [
      `${box}-${axis}`,
      `${box}-${axis}-start`,
      `${box}-${axis}-end`,
    ]),
    ...["before", "after", "start", "end"].map((side) => `-webkit-${box}-${side}`),
  ]),
];

/**
 * Style properties Chromium reads as the geometry of an element, or as hiding it, which the
 * sanitiser keeps only as attributes or not at all: the browser tests set every property Chromium
 * has on each element and hold the sanitiser to this. Where one is set, dropping it alone would
 * draw the element other than either way, so the element goes with it (the root or a clip path,
 * which nothing could stand in for, is refused).
 */
export const GEOMETRY_IN_STYLE: Readonly<Partial<Record<SvgElementName, ReadonlySet<string>>>> = {
  svg: new Set(["width", "height", ...TRANSFORMING, ...ROOT_BOX]),
  g: new Set(TRANSFORMING),
  path: new Set(["d", ...TRANSFORMING]),
  rect: new Set(["x", "y", ...SIZING, "rx", "ry", ...TRANSFORMING]),
  circle: new Set(["cx", "cy", "r", ...TRANSFORMING]),
  ellipse: new Set(["cx", "cy", "rx", "ry", ...TRANSFORMING]),
  line: new Set(TRANSFORMING),
  polyline: new Set(TRANSFORMING),
  polygon: new Set(TRANSFORMING),
  use: new Set(["x", "y", "content-visibility", ...TRANSFORMING]),
  linearGradient: new Set(["display", "content-visibility", ...TRANSFORMING]),
  radialGradient: new Set(["display", "content-visibility", ...TRANSFORMING]),
  clipPath: new Set(["content-visibility", ...TRANSFORMING]),
  mask: new Set(["content-visibility"]),
};

/**
 * Style properties that change a transform only where the element has one, and the attributes
 * that give it one: Chromium moves a gradient's transform by its origin, not by its box.
 */
export const TRANSFORM_PLACING: Readonly<Record<string, readonly string[]>> = {
  "transform-origin": ["transform", "gradientTransform"],
  "-webkit-transform-origin": ["transform", "gradientTransform"],
  "-webkit-transform-origin-x": ["transform", "gradientTransform"],
  "-webkit-transform-origin-y": ["transform", "gradientTransform"],
  "-webkit-transform-origin-z": ["transform", "gradientTransform"],
  "transform-box": ["transform"],
};

/**
 * Whether a declaration of a geometry property sets what the element has anyway: the property's
 * initial value, which draws the same picture. A transform of none does so only where there is no
 * transform attribute for it to undo.
 */
export function drawsAsInitial(
  property: string,
  value: string,
  attributes: ReadonlySet<string>,
): boolean {
  const written = value.trim().toLowerCase();
  if (property === "transform" || property === "-webkit-transform") {
    return (
      written === "none" && !attributes.has("transform") && !attributes.has("gradientTransform")
    );
  }
  if (["translate", "rotate", "scale", "offset", "offset-path"].includes(property)) {
    return written === "none";
  }
  if (property === "content-visibility") return written === "visible";
  if (property === "display") return written === "inline";
  if (property.includes("margin") || property.includes("padding")) {
    return /^(?:[+-]?(?:0+\.?0*|\.0+)(?:[a-z]+|%)?\s*)+$/.test(written);
  }
  return false;
}

/**
 * The property a style property stands for, as Chromium cascades it: a prefixed alias, or a part
 * of the mask shorthand the `mask` attribute sets (all but `mask-type`, its own property).
 */
export function cascadedAs(property: string): string {
  if (property === "-webkit-clip-path") return "clip-path";
  if (property.startsWith("-webkit-mask")) return "mask";
  if (property.startsWith("mask-") && property !== "mask-type") return "mask";
  return property;
}

const GRADIENT_CHILDREN = ["stop"] as const;
const DESCRIPTIVE = ["title", "desc"] as const;
/**
 * What a clip path may hold: shapes, and uses of them. Browsers leave anything else (a group, say)
 * out of the clip, so it is dropped as misplaced.
 */
const CLIP_CHILDREN = [
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "use",
  ...DESCRIPTIVE,
] as const;
const DRAWING_CHILDREN = [
  "g",
  "defs",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "use",
  "linearGradient",
  "radialGradient",
  "clipPath",
  "mask",
  ...DESCRIPTIVE,
] as const;

export type SvgElementName =
  "svg" | (typeof DRAWING_CHILDREN)[number] | (typeof GRADIENT_CHILDREN)[number];

export interface SvgElementRule {
  /** Every attribute kept, in the order it is written out. */
  readonly attributes: readonly string[];
  /** Elements allowed as children; any other allowed element there is dropped as misplaced. */
  readonly children: readonly SvgElementName[];
  /** Whether its character data is kept (escaped), as for `title` and `desc`. */
  readonly text: boolean;
}

const shape = (...geometry: string[]): SvgElementRule => ({
  attributes: ["id", ...geometry, "transform", ...PRESENTATION],
  children: DESCRIPTIVE,
  text: false,
});

const container = (...own: string[]): SvgElementRule => ({
  attributes: ["id", ...own, "transform", ...PRESENTATION],
  children: DRAWING_CHILDREN,
  text: false,
});

const gradient = (...geometry: string[]): SvgElementRule => ({
  attributes: ["id", "href", ...geometry, "gradientUnits", "gradientTransform", "spreadMethod"],
  children: GRADIENT_CHILDREN,
  text: false,
});

const descriptive: SvgElementRule = { attributes: [], children: [], text: true };

/**
 * The SVG elements a logo may use (static vector art, nothing that runs, loads, animates or draws
 * text) and the attributes each keeps. Everything here is in the SVG namespace; the root is the
 * only `svg`. `transform` on the root is SVG 2 only and is left out.
 */
export const SVG_ELEMENT_RULES: Readonly<Record<SvgElementName, SvgElementRule>> = {
  svg: {
    attributes: ["id", "viewBox", "width", "height", "preserveAspectRatio", ...PRESENTATION],
    children: DRAWING_CHILDREN,
    text: false,
  },
  g: container(),
  defs: container(),
  clipPath: { ...container("clipPathUnits"), children: CLIP_CHILDREN },
  // Browsers apply no transform, clip path or mask set on a mask itself.
  mask: {
    attributes: [
      "id",
      "x",
      "y",
      "width",
      "height",
      "maskUnits",
      "maskContentUnits",
      "mask-type",
      ...PRESENTATION.filter((name) => name !== "clip-path" && name !== "mask"),
    ],
    children: DRAWING_CHILDREN,
    text: false,
  },
  path: shape("d"),
  rect: shape("x", "y", "width", "height", "rx", "ry"),
  circle: shape("cx", "cy", "r"),
  ellipse: shape("cx", "cy", "rx", "ry"),
  line: shape("x1", "y1", "x2", "y2"),
  polyline: shape("points"),
  polygon: shape("points"),
  use: shape("href", "x", "y", "width", "height"),
  linearGradient: gradient("x1", "y1", "x2", "y2"),
  radialGradient: gradient("cx", "cy", "r", "fx", "fy", "fr"),
  stop: { attributes: ["id", "offset", "stop-color", "stop-opacity"], children: [], text: false },
  title: descriptive,
  desc: descriptive,
};

export function isAllowedSvgElement(name: string): name is SvgElementName {
  return Object.hasOwn(SVG_ELEMENT_RULES, name);
}

export const GRADIENTS: ReadonlySet<string> = new Set(["linearGradient", "radialGradient"]);
/** What `use` may draw: never the root (a cycle), a definition container or a paint server. */
export const USABLE: ReadonlySet<string> = new Set([
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "use",
]);

// Compared in lower case, so `<SCRIPT>` is reported for what it tries to be. Any element not on
// the allowlist is dropped whatever it is called; these only choose the reason given.
const ACTIVE_ELEMENTS = new Set([
  "script",
  "foreignobject",
  "iframe",
  "image",
  "feimage",
  "a",
  "animate",
  "animatecolor",
  "animatemotion",
  "animatetransform",
  "set",
  "discard",
  "handler",
  "listener",
  "video",
  "audio",
  "object",
  "embed",
  "canvas",
  "cursor",
  "font-face-uri",
]);
const TEXT_ELEMENTS = new Set(["text", "tspan", "textpath", "tref", "altglyph"]);

/** Why an SVG element outside the allowlist is dropped. */
export function droppedElementReason(local: string): SvgLogoRemovalReason {
  const lower = local.toLowerCase();
  if (ACTIVE_ELEMENTS.has(lower)) return "active-content";
  if (lower === "style") return "styling";
  if (lower === "metadata") return "editor-metadata";
  if (TEXT_ELEMENTS.has(lower)) return "text";
  if (lower === "filter" || lower.startsWith("fe")) return "filter";
  return "unsupported-element";
}

/** Namespaces of editor bookkeeping (Inkscape, Sodipodi, RDF metadata, Adobe, Sketch, Serif). */
export const EDITOR_NAMESPACES: ReadonlySet<string> = new Set([
  "http://www.inkscape.org/namespaces/inkscape",
  "http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd",
  "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  "http://creativecommons.org/ns#",
  "http://purl.org/dc/elements/1.1/",
  "http://web.resource.org/cc/",
  "http://ns.adobe.com/AdobeIllustrator/10.0/",
  "http://ns.adobe.com/Extensibility/1.0/",
  "http://ns.adobe.com/Graphs/1.0/",
  "http://ns.adobe.com/AdobeSVGViewerExtensions/3.0/",
  "http://ns.adobe.com/SaveForWeb/1.0/",
  "http://ns.adobe.com/Variables/1.0/",
  "http://ns.adobe.com/ImageReplacement/1.0/",
  "http://ns.adobe.com/GenericCustomNamespace/1.0/",
  "http://ns.adobe.com/XPath/1.0/",
  "http://www.bohemiancoding.com/sketch/ns",
  "http://www.serif.com/",
]);

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
  "opacity",
  "color",
  "clip-path",
  "clip-rule",
  "mask",
  "display",
  "visibility",
  "vector-effect",
  "shape-rendering",
] as const;

/** Properties a `style` attribute may set; each becomes the presentation attribute of its name. */
export const STYLE_PROPERTIES: ReadonlySet<string> = new Set([
  ...PRESENTATION,
  "stop-color",
  "stop-opacity",
]);

const GRADIENT_CHILDREN = ["stop"] as const;
const DESCRIPTIVE = ["title", "desc"] as const;
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
  clipPath: container("clipPathUnits"),
  mask: container("x", "y", "width", "height", "maskUnits", "maskContentUnits"),
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

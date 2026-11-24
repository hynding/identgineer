import type { XmlText } from "./parse-svg-xml.ts";
import {
  droppedElementReason,
  EDITOR_NAMESPACES,
  GRADIENTS,
  isAllowedSvgElement,
  STYLE_PROPERTIES,
  SVG_ELEMENT_RULES,
  type SvgElementName,
  type SvgElementRule,
} from "./svg-allowlist.ts";
import {
  codePointLength,
  isXmlWhitespaceOnly,
  trimXmlWhitespace,
  XML_WHITESPACE,
} from "./svg-characters.ts";
import type { SvgLogoLimits } from "./svg-logo-limits.ts";
import type { SvgLogoRemovalReason } from "./svg-logo-result.ts";
import { SvgLogoRejection } from "./svg-logo-rejection.ts";
import { splitDeclarationList } from "./css-declaration-list.ts";
import type { Removals } from "./svg-removals.ts";
import {
  absolutePixels,
  rootSizeProblem,
  stretchesOrCrops,
  SVG_GRAMMARS,
  type SvgValue,
} from "./svg-values.ts";
import {
  SVG_NAMESPACE,
  XLINK_NAMESPACE,
  XML_NAMESPACE,
  type ResolvedAttribute,
  type ResolvedElement,
} from "./resolve-svg-namespaces.ts";

/** An allowed element with only allowed, parsed values left: what the serialiser writes. */
export interface CleanElement {
  readonly name: SvgElementName;
  /** As written, for reporting. */
  readonly qualified: string;
  readonly attributes: Map<string, SvgValue>;
  children: CleanElement[];
  readonly text: string;
  readonly offset: number;
  /**
   * On the root only: the `preserveAspectRatio` dropped because it stretches or crops the view box,
   * so the size can be settled to show what it showed.
   */
  readonly droppedAspect?: string;
  /** On the root only: its width and height in CSS pixels exactly, before six decimals round them. */
  readonly exactSize?: { readonly width?: number; readonly height?: number };
}

const PROPERTY_NAME = /^-?[a-z][a-z0-9-]{0,63}$/;
// What a kept style value may not hold: CSS reads a comment, string, escape or bracket in ways the
// grammars do not, so a value holding one is dropped rather than read past it.
const UNREAD_IN_A_VALUE = /\/\*|['"\\[\]{}]/;

/** The attributes and properties whose value may refer to something (`href` is read apart). */
const REFERENCE_TAKING: ReadonlySet<string> = new Set(["fill", "stroke", "clip-path", "mask"]);
const SCHEME = /^[a-z][a-z0-9+.-]*:/;

/**
 * A mask on a clip path, or on a shape inside one: browsers ignore it (Chromium does not draw it),
 * so dropping it changes nothing. A clip path there is kept and written as a mask later on.
 */
const IGNORED_WHEN_CLIPPING: ReadonlySet<string> = new Set(["mask"]);

/**
 * Why a value that failed its grammar was dropped: what it was trying to do, where that shows. A
 * `url(` or a scheme is an external reference only where the attribute could have taken one; in
 * path data, say, it is just not a valid value.
 */
function invalidValueReason(name: string, value: string): SvgLogoRemovalReason {
  const lower = trimXmlWhitespace(value).toLowerCase();
  if (lower.includes("expression(")) return "active-content";
  if (name === "preserveAspectRatio" && stretchesOrCrops(value)) return "render-cost";
  if (REFERENCE_TAKING.has(name) && (lower.includes("url(") || SCHEME.test(lower))) {
    return "external-reference";
  }
  return "invalid-value";
}

// A `url(` to anything but a fragment of this document. The white space after a quote is matched
// only after one, so no two runs of it can split one run between them (which takes quadratic time).
const EXTERNAL_URL = new RegExp(
  `url\\(${XML_WHITESPACE}*(?:['"]${XML_WHITESPACE}*)?[^#'"\\s]`,
  "i",
);

/** Why a whole style was dropped: what the worst of it was trying to do. */
function droppedStyleReason(style: string): SvgLogoRemovalReason {
  const reason = invalidValueReason("style", style);
  return reason === "invalid-value" && EXTERNAL_URL.test(style) ? "external-reference" : reason;
}

/**
 * A paint whose reference was dropped paints nothing: dropping the attribute alone would paint the
 * shape black, a colour nobody chose.
 */
function paintNothingFor(
  kept: Map<string, SvgValue>,
  name: string,
  reason: SvgLogoRemovalReason,
): void {
  if (reason === "external-reference" && (name === "fill" || name === "stroke")) {
    kept.set(name, { text: "none" });
  }
}

function attributeReason(attribute: ResolvedAttribute): SvgLogoRemovalReason {
  const { namespace, local } = attribute;
  if (namespace === null) {
    if (/^on/i.test(local)) return "event-handler";
    if (local === "class") return "styling";
    return "unsupported-attribute";
  }
  if (namespace === XML_NAMESPACE)
    return local === "base" ? "external-reference" : "unsupported-attribute";
  if (namespace === XLINK_NAMESPACE) return "unsupported-attribute";
  return EDITOR_NAMESPACES.has(namespace) ? "editor-metadata" : "foreign-namespace";
}

function propertyReason(property: string): SvgLogoRemovalReason {
  if (property.startsWith("-inkscape") || property.startsWith("-sodipodi"))
    return "editor-metadata";
  if (property.includes("binding") || property.includes("behavior")) return "active-content";
  return "unsupported-attribute";
}

class TreeFilter {
  private readonly limits: SvgLogoLimits;
  private readonly removals: Removals;
  private droppedAspect: string | undefined;
  private readonly exactSize: { width?: number; height?: number } = {};

  constructor(limits: SvgLogoLimits, removals: Removals) {
    this.limits = limits;
    this.removals = removals;
  }

  root(source: ResolvedElement): CleanElement {
    if (source.namespace !== SVG_NAMESPACE || source.local !== "svg") {
      throw new SvgLogoRejection("not-svg", "must have an svg root element", source.offset);
    }
    const root = { ...this.element(source, "svg", true), exactSize: this.exactSize };
    return this.droppedAspect === undefined ? root : { ...root, droppedAspect: this.droppedAspect };
  }

  /** `clipping`: the element is a clip path, or stands inside one. */
  private element(
    source: ResolvedElement,
    name: SvgElementName,
    isRoot: boolean,
    clipping = false,
  ): CleanElement {
    const rule = SVG_ELEMENT_RULES[name];
    const attributes = this.attributes(source, rule, isRoot, clipping || name === "clipPath");
    const children: CleanElement[] = [];
    let text = "";
    let reportedText = false;
    for (const child of source.children) {
      if (child.kind === "text") {
        if (rule.text) text += child.text;
        else if (!reportedText && !isXmlWhitespaceOnly(child.text)) {
          reportedText = true;
          this.removals.add({ element: source.qualified }, "character-data", child.offset);
        }
        continue;
      }
      const kept = this.child(child, rule, name === "clipPath");
      if (kept !== undefined) children.push(kept);
    }
    if (codePointLength(text) > this.limits.textLength) {
      throw new SvgLogoRejection(
        "too-long",
        "has a title or description that is too long",
        source.offset,
      );
    }
    if (GRADIENTS.has(name) && children.length > this.limits.gradientStops) {
      throw new SvgLogoRejection(
        "too-many-stops",
        `has a gradient with more than ${String(this.limits.gradientStops)} stops`,
        source.offset,
      );
    }
    return { name, qualified: source.qualified, attributes, children, text, offset: source.offset };
  }

  private child(
    source: ResolvedElement | XmlText,
    parent: SvgElementRule,
    clipping: boolean,
  ): CleanElement | undefined {
    if (source.kind === "text") return undefined;
    let reason: SvgLogoRemovalReason | undefined;
    if (source.namespace !== SVG_NAMESPACE) {
      reason =
        source.namespace !== null && EDITOR_NAMESPACES.has(source.namespace)
          ? "editor-metadata"
          : "foreign-namespace";
    } else if (!isAllowedSvgElement(source.local)) {
      reason = droppedElementReason(source.local);
    } else if (!parent.children.includes(source.local)) {
      reason = "misplaced";
    } else {
      return this.element(source, source.local, false, clipping);
    }
    this.removals.add({ element: source.qualified }, reason, source.offset);
    return undefined;
  }

  private attributes(
    source: ResolvedElement,
    rule: SvgElementRule,
    isRoot: boolean,
    clipping: boolean,
  ): Map<string, SvgValue> {
    const kept = new Map<string, SvgValue>();
    let style: ResolvedAttribute | undefined;
    let href: ResolvedAttribute | undefined;
    for (const attribute of source.attributes) {
      const { namespace, local } = attribute;
      const isHref = local === "href" && (namespace === null || namespace === XLINK_NAMESPACE);
      if (isHref && rule.attributes.includes("href")) {
        // SVG 2 prefers href over xlink:href; a document with both is ambiguous, so it is refused.
        if (href !== undefined) {
          throw new SvgLogoRejection(
            "duplicate-attribute",
            "has both href and xlink:href",
            attribute.offset,
          );
        }
        href = attribute;
        this.keep(kept, source, attribute, "href");
        continue;
      }
      if (namespace === null && local === "style") {
        style = attribute;
        continue;
      }
      if (namespace === null && clipping && IGNORED_WHEN_CLIPPING.has(local)) {
        this.removals.add(
          { element: source.qualified, attribute: attribute.qualified },
          "render-cost",
          attribute.offset,
        );
        continue;
      }
      if (namespace === null && local !== "href" && rule.attributes.includes(local)) {
        this.keep(
          kept,
          source,
          attribute,
          local,
          isRoot && (local === "width" || local === "height"),
        );
        continue;
      }
      this.removals.add(
        { element: source.qualified, attribute: attribute.qualified },
        isHref ? "external-reference" : attributeReason(attribute),
        attribute.offset,
      );
    }
    if (style !== undefined) this.style(kept, source, rule, style, clipping);
    return kept;
  }

  private keep(
    kept: Map<string, SvgValue>,
    source: ResolvedElement,
    attribute: ResolvedAttribute,
    name: string,
    absolute = false,
  ): void {
    const parsed = absolute
      ? this.pixels(name, attribute.value)
      : this.parse(name, attribute.value);
    if (parsed !== undefined) {
      kept.set(name, parsed);
      return;
    }
    const reason =
      name === "href" && !trimXmlWhitespace(attribute.value).startsWith("#")
        ? "external-reference"
        : invalidValueReason(name, attribute.value);
    if (name === "preserveAspectRatio" && reason === "render-cost") {
      this.droppedAspect = attribute.value;
    }
    this.removals.add(
      { element: source.qualified, attribute: attribute.qualified },
      reason,
      attribute.offset,
    );
    paintNothingFor(kept, name, reason);
  }

  private pixels(name: string, value: string): SvgValue | undefined {
    const pixels = absolutePixels(value, this.limits);
    // Chromium draws a root of no width or height, a negative one, or one in a unit of the
    // viewport, at no size at all.
    const problem = pixels === undefined ? rootSizeProblem(value, this.limits) : undefined;
    if (problem === "no-size") {
      throw new SvgLogoRejection(
        "missing-size",
        "has a width or height of zero or less, which draws nothing; give it a positive size",
      );
    }
    if (problem === "viewport") {
      throw new SvgLogoRejection(
        "unsupported-feature",
        "has a width or height in a unit of the viewport, which an image has none of; give it in pixels or an absolute unit",
      );
    }
    if (pixels === undefined) return undefined;
    if (name === "width" || name === "height") this.exactSize[name] = pixels.exact;
    return { text: pixels.text };
  }

  private parse(name: string, value: string): SvgValue | undefined {
    const grammar = Object.hasOwn(SVG_GRAMMARS, name) ? SVG_GRAMMARS[name] : undefined;
    return grammar?.(value, this.limits);
  }

  /**
   * A `style` attribute is read as a list of declarations, split as CSS splits it, each held to the
   * property allowlist and to the same grammar as the attribute of its name, and written out as
   * that attribute (taking precedence over it, as CSS does). Among declarations of one property the
   * last important one wins, else the last. Where any of them fails its grammar, CSS may or may not
   * take it, so which one wins, and whether the attribute does, is unknown: none of them is kept.
   * A list CSS would split only by its error recovery is dropped whole. The output never holds CSS.
   */
  private style(
    kept: Map<string, SvgValue>,
    source: ResolvedElement,
    rule: SvgElementRule,
    attribute: ResolvedAttribute,
    clipping: boolean,
  ): void {
    const names = { element: source.qualified, attribute: attribute.qualified };
    const declarations = splitDeclarationList(attribute.value);
    if (declarations === undefined) {
      this.removals.add(names, droppedStyleReason(attribute.value), attribute.offset);
      return;
    }
    const read = new Map<string, { value: SvgValue; important: boolean }[]>();
    const unread = new Map<string, SvgLogoRemovalReason>();
    for (const { property, value, important } of declarations) {
      if (!PROPERTY_NAME.test(property)) {
        this.removals.add(names, "invalid-value", attribute.offset);
        continue;
      }
      if (clipping && IGNORED_WHEN_CLIPPING.has(property)) {
        this.removals.add({ ...names, property }, "render-cost", attribute.offset);
        continue;
      }
      if (!STYLE_PROPERTIES.has(property) || !rule.attributes.includes(property)) {
        this.removals.add({ ...names, property }, propertyReason(property), attribute.offset);
        continue;
      }
      const parsed = UNREAD_IN_A_VALUE.test(value) ? undefined : this.parse(property, value);
      if (parsed === undefined) {
        const reason = invalidValueReason(property, value);
        this.removals.add({ ...names, property }, reason, attribute.offset);
        if (unread.get(property) !== "external-reference") unread.set(property, reason);
        continue;
      }
      const values = read.get(property) ?? [];
      values.push({ value: parsed, important });
      read.set(property, values);
    }
    for (const [property, reason] of unread) this.dropProperty(kept, source, property, reason);
    for (const [property, values] of read) {
      if (unread.has(property)) continue;
      const important = values.filter((declaration) => declaration.important);
      const winner = (important.length > 0 ? important : values).at(-1);
      if (winner !== undefined) kept.set(property, winner.value);
    }
  }

  /** Drops a presentation attribute a style declaration the sanitiser cannot read would outweigh. */
  private dropProperty(
    kept: Map<string, SvgValue>,
    source: ResolvedElement,
    property: string,
    reason: SvgLogoRemovalReason,
  ): void {
    if (kept.delete(property)) {
      const written = source.attributes.find(
        ({ namespace, local }) => namespace === null && local === property,
      );
      this.removals.add(
        { element: source.qualified, attribute: written?.qualified ?? property },
        reason,
        written?.offset ?? source.offset,
      );
    }
    paintNothingFor(kept, property, reason);
  }
}

/**
 * Keeps the allowed SVG elements and attributes of a resolved tree, parsed into canonical values,
 * and records everything else in `removals`. An element that is dropped takes its whole subtree:
 * children are never lifted out of a dropped parent. The root must be `svg` in the SVG namespace.
 */
export function filterSvgTree(
  root: ResolvedElement,
  limits: SvgLogoLimits,
  removals: Removals,
): CleanElement {
  return new TreeFilter(limits, removals).root(root);
}

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
import { isXmlWhitespaceOnly, trimXmlWhitespace } from "./svg-characters.ts";
import type { SvgLogoLimits } from "./svg-logo-limits.ts";
import type { SvgLogoRemovalReason } from "./svg-logo-result.ts";
import { SvgLogoRejection } from "./svg-logo-rejection.ts";
import type { Removals } from "./svg-removals.ts";
import { absolutePixels, stretchesOrCrops, SVG_GRAMMARS, type SvgValue } from "./svg-values.ts";
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
}

const PROPERTY_NAME = /^-?[a-z][a-z0-9-]{0,63}$/;

/** The attributes and properties whose value may refer to something (`href` is read apart). */
const REFERENCE_TAKING: ReadonlySet<string> = new Set(["fill", "stroke", "clip-path", "mask"]);
const SCHEME = /^[a-z][a-z0-9+.-]*:/;

/**
 * A clip path or mask on a clip path, or on a shape inside one: a browser can no longer clip with
 * the shapes' outlines and draws the clip path into a mask layer each time it is applied instead,
 * so it is dropped (a mask there is not even drawn by Chromium).
 */
const CLIPPED_AS_MASK: ReadonlySet<string> = new Set(["clip-path", "mask"]);

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

  constructor(limits: SvgLogoLimits, removals: Removals) {
    this.limits = limits;
    this.removals = removals;
  }

  root(source: ResolvedElement): CleanElement {
    if (source.namespace !== SVG_NAMESPACE || source.local !== "svg") {
      throw new SvgLogoRejection("not-svg", "must have an svg root element", source.offset);
    }
    return this.element(source, "svg", true);
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
    if (text.length > this.limits.textLength) {
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
      if (namespace === null && clipping && CLIPPED_AS_MASK.has(local)) {
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
    const parsed = absolute ? this.pixels(attribute.value) : this.parse(name, attribute.value);
    if (parsed !== undefined) {
      kept.set(name, parsed);
      return;
    }
    const reason =
      name === "href" && !trimXmlWhitespace(attribute.value).startsWith("#")
        ? "external-reference"
        : invalidValueReason(name, attribute.value);
    this.removals.add(
      { element: source.qualified, attribute: attribute.qualified },
      reason,
      attribute.offset,
    );
    paintNothingFor(kept, name, reason);
  }

  private pixels(value: string): SvgValue | undefined {
    const pixels = absolutePixels(value, this.limits);
    return pixels === undefined ? undefined : { text: pixels };
  }

  private parse(name: string, value: string): SvgValue | undefined {
    const grammar = Object.hasOwn(SVG_GRAMMARS, name) ? SVG_GRAMMARS[name] : undefined;
    return grammar?.(value, this.limits);
  }

  /**
   * A `style` attribute is read as a list of declarations, each held to the property allowlist and
   * to the same grammar as the attribute of its name, and written out as that attribute (taking
   * precedence over it, as CSS does). The output never holds CSS: no style attribute, no element.
   */
  private style(
    kept: Map<string, SvgValue>,
    source: ResolvedElement,
    rule: SvgElementRule,
    attribute: ResolvedAttribute,
    clipping: boolean,
  ): void {
    for (const declaration of attribute.value.split(";")) {
      if (isXmlWhitespaceOnly(declaration)) continue;
      const colon = declaration.indexOf(":");
      const property =
        colon === -1 ? "" : trimXmlWhitespace(declaration.slice(0, colon)).toLowerCase();
      const names = { element: source.qualified, attribute: attribute.qualified };
      if (!PROPERTY_NAME.test(property)) {
        this.removals.add(names, "invalid-value", attribute.offset);
        continue;
      }
      if (clipping && CLIPPED_AS_MASK.has(property)) {
        this.removals.add({ ...names, property }, "render-cost", attribute.offset);
        continue;
      }
      if (!STYLE_PROPERTIES.has(property) || !rule.attributes.includes(property)) {
        this.removals.add({ ...names, property }, propertyReason(property), attribute.offset);
        continue;
      }
      const value = declaration.slice(colon + 1);
      const parsed = this.parse(property, value);
      if (parsed === undefined) {
        const reason = invalidValueReason(property, value);
        this.removals.add({ ...names, property }, reason, attribute.offset);
        paintNothingFor(kept, property, reason);
        continue;
      }
      kept.set(property, parsed);
    }
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

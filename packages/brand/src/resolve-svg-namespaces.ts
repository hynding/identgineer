import type { XmlElement, XmlText } from "./parse-svg-xml.ts";
import { SvgLogoRejection } from "./svg-logo-rejection.ts";

export const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
export const XLINK_NAMESPACE = "http://www.w3.org/1999/xlink";
export const XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";
const XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/";

export interface ResolvedAttribute {
  readonly namespace: string | null;
  readonly local: string;
  /** As written, for reporting. */
  readonly qualified: string;
  readonly value: string;
  readonly offset: number;
}

export interface ResolvedElement {
  readonly kind: "element";
  readonly namespace: string | null;
  readonly local: string;
  readonly qualified: string;
  /** Namespace declarations are consumed here and never appear. */
  readonly attributes: readonly ResolvedAttribute[];
  readonly children: readonly (ResolvedElement | XmlText)[];
  readonly offset: number;
}

interface Scope {
  readonly defaultNamespace: string | null;
  readonly prefixes: ReadonlyMap<string, string>;
}

function split(name: string): { prefix: string | undefined; local: string } {
  const colon = name.indexOf(":");
  return colon === -1
    ? { prefix: undefined, local: name }
    : { prefix: name.slice(0, colon), local: name.slice(colon + 1) };
}

function refuse(message: string, offset: number): never {
  throw new SvgLogoRejection("invalid-namespace", message, offset);
}

function declare(element: XmlElement, outer: Scope): Scope {
  let defaultNamespace = outer.defaultNamespace;
  let prefixes: Map<string, string> | undefined;
  for (const attribute of element.attributes) {
    const { prefix, local } = split(attribute.name);
    if (prefix === undefined && local === "xmlns") {
      if (attribute.value === XML_NAMESPACE || attribute.value === XMLNS_NAMESPACE) {
        refuse("binds a reserved namespace as the default", attribute.offset);
      }
      defaultNamespace = attribute.value === "" ? null : attribute.value;
      continue;
    }
    if (prefix !== "xmlns") continue;
    const reservedXml = local === "xml" && attribute.value === XML_NAMESPACE;
    if (
      local === "xmlns" ||
      attribute.value === "" ||
      attribute.value === XMLNS_NAMESPACE ||
      (local === "xml") !== (attribute.value === XML_NAMESPACE)
    ) {
      refuse("has a namespace declaration XML does not allow", attribute.offset);
    }
    if (reservedXml) continue;
    prefixes ??= new Map(outer.prefixes);
    prefixes.set(local, attribute.value);
  }
  return { defaultNamespace, prefixes: prefixes ?? outer.prefixes };
}

function resolveAttributes(element: XmlElement, scope: Scope): ResolvedAttribute[] {
  const resolved: ResolvedAttribute[] = [];
  const seen = new Set<string>();
  for (const attribute of element.attributes) {
    const { prefix, local } = split(attribute.name);
    if (prefix === "xmlns" || (prefix === undefined && local === "xmlns")) continue;
    let namespace: string | null = null;
    if (prefix === "xml") namespace = XML_NAMESPACE;
    else if (prefix !== undefined) {
      namespace =
        scope.prefixes.get(prefix) ?? refuse("uses an undeclared prefix", attribute.offset);
    }
    // Two prefixes bound to one namespace can name the same attribute twice.
    const key = `${namespace ?? ""} ${local}`;
    if (seen.has(key)) {
      throw new SvgLogoRejection("duplicate-attribute", "repeats an attribute", attribute.offset);
    }
    seen.add(key);
    resolved.push({
      namespace,
      local,
      qualified: attribute.name,
      value: attribute.value,
      offset: attribute.offset,
    });
  }
  return resolved;
}

function resolveElement(element: XmlElement, outer: Scope): ResolvedElement {
  const scope = declare(element, outer);
  const { prefix, local } = split(element.name);
  if (prefix === "xmlns" || prefix === "xml") refuse("uses a reserved prefix", element.offset);
  const namespace =
    prefix === undefined
      ? scope.defaultNamespace
      : (scope.prefixes.get(prefix) ?? refuse("uses an undeclared prefix", element.offset));
  return {
    kind: "element",
    namespace,
    local,
    qualified: element.name,
    attributes: resolveAttributes(element, scope),
    children: element.children.map((child) =>
      child.kind === "text" ? child : resolveElement(child, scope),
    ),
    offset: element.offset,
  };
}

/**
 * Gives every element and attribute its namespace, by the rules of Namespaces in XML. A document
 * that declares no default namespace is read as SVG, as a browser reads SVG written inline in HTML;
 * a child that changes the default, or a prefix bound elsewhere, puts its elements outside SVG.
 * Reserved prefixes and namespaces are refused, as is an undeclared prefix.
 */
export function resolveSvgNamespaces(root: XmlElement): ResolvedElement {
  return resolveElement(root, { defaultNamespace: SVG_NAMESPACE, prefixes: new Map() });
}

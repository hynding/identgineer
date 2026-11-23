import type { CleanElement } from "./filter-svg-tree.ts";
import { SVG_ELEMENT_RULES } from "./svg-allowlist.ts";
import { SVG_NAMESPACE } from "./resolve-svg-namespaces.ts";
import type { SvgValue } from "./svg-values.ts";

/**
 * Text and attribute values are escaped alike. A carriage return would be read back as a line
 * feed, so it is written as a reference; a quote is escaped in text too, so ` id="` only ever
 * occurs in a tag.
 */
function escapeMarkup(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("\r", "&#13;");
}

function written(value: SvgValue, renamed: ReadonlyMap<string, string>): string | undefined {
  if ("text" in value) return value.text;
  const id = renamed.get(value.reference);
  if (id === undefined) return undefined;
  return value.form === "url" ? `url(#${id})` : `#${id}`;
}

function element(
  node: CleanElement,
  renamed: ReadonlyMap<string, string>,
  isRoot: boolean,
): string {
  let output = `<${node.name}`;
  if (isRoot) output += ` xmlns="${SVG_NAMESPACE}"`;
  for (const name of SVG_ELEMENT_RULES[node.name].attributes) {
    const value = node.attributes.get(name);
    if (value === undefined) continue;
    const text =
      name === "id" && "text" in value ? renamed.get(value.text) : written(value, renamed);
    if (text !== undefined) output += ` ${name}="${escapeMarkup(text)}"`;
  }
  if (node.children.length === 0 && node.text === "") return `${output}/>`;
  output += `>${escapeMarkup(node.text)}`;
  for (const child of node.children) output += element(child, renamed, false);
  return `${output}</${node.name}>`;
}

/**
 * Writes the tree as SVG from scratch: the namespace on the root only, attributes in the
 * allowlist's order, no white space between elements, no comments, no declaration, and every
 * character of text escaped. Nothing from the input reaches the output but parsed values and the
 * text of titles and descriptions.
 */
export function serialiseSvg(root: CleanElement, renamed: ReadonlyMap<string, string>): string {
  return element(root, renamed, true);
}

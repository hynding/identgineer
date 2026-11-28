/** A value an attribute takes: text, or `true` for one that is written bare. */
export type ExampleAttribute = string | true;

/**
 * An element of an example, as data: one description both draws the live element and writes the
 * usage snippet beside it, so the two cannot differ. It holds no markup, only names and text.
 */
export interface ExampleElement {
  readonly tag: string;
  readonly attributes?: Readonly<Record<string, ExampleAttribute>>;
  /**
   * JavaScript properties, for what an attribute cannot carry: the client a component is given to
   * ask its questions of. They draw the example and are not part of its HTML, so the usage snippet
   * leaves them out.
   */
  readonly properties?: Readonly<Record<string, unknown>>;
  readonly children?: readonly ExampleNode[];
}

export type ExampleNode = string | ExampleElement;

/** A live example of one component, drawn from the project's own element and nothing else. */
export interface ComponentExample {
  /** What the example shows, under it. */
  readonly caption: string;
  readonly nodes: readonly ExampleNode[];
  /**
   * Draws the example inert: it can be looked at, not used. For a component that needs a service
   * to work (the sign-in form) or that is a page's frame (the shell), which would otherwise add a
   * second page's landmarks.
   */
  readonly inert?: true;
  /**
   * A button drawn before the example, with scripting only, that opens the dialog of the example
   * as the page's own script would. A dialog is closed until something opens it, so the example
   * alone would show nothing. The snippet does not hold the button: it is the dialog's markup.
   */
  readonly opener?: { readonly label: string; readonly method: "show" | "showModal" };
}

export function el(
  tag: string,
  attributes: Readonly<Record<string, ExampleAttribute>> = {},
  ...children: ExampleNode[]
): ExampleElement {
  return { tag, attributes, children };
}

/** The element with JavaScript properties it is drawn with, which its HTML does not hold. */
export function having(
  element: ExampleElement,
  properties: Readonly<Record<string, unknown>>,
): ExampleElement {
  return { ...element, properties };
}

/** Every element of the nodes, outermost first. */
export function exampleElements(nodes: readonly ExampleNode[]): readonly ExampleElement[] {
  return nodes.flatMap((node) =>
    typeof node === "string" ? [] : [node, ...exampleElements(node.children ?? [])],
  );
}

const TEXT_ESCAPES: Readonly<Record<string, string>> = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };

function escapeText(text: string): string {
  return text.replace(/[&<>]/g, (character) => TEXT_ESCAPES[character] ?? character);
}

function escapeAttribute(value: string): string {
  return value.replace(/[&"]/g, (character) => (character === "&" ? "&amp;" : "&quot;"));
}

function openingTag(element: ExampleElement): string {
  const attributes = Object.entries(element.attributes ?? {}).map(([name, value]) =>
    value === true ? ` ${name}` : ` ${name}="${escapeAttribute(value)}"`,
  );
  return `<${element.tag}${attributes.join("")}>`;
}

function lines(node: ExampleNode, indent: string): string[] {
  if (typeof node === "string") return [`${indent}${escapeText(node.trim())}`];
  const children = node.children ?? [];
  const open = openingTag(node);
  const close = `</${node.tag}>`;
  if (children.every((child) => typeof child === "string")) {
    const text = escapeText(children.join("").trim());
    return [`${indent}${open}${text}${close}`];
  }
  return [
    `${indent}${open}`,
    ...children.flatMap((child) => lines(child, `${indent}  `)),
    `${indent}${close}`,
  ];
}

/** The HTML that draws the nodes, one element to a line, indented by two spaces for each level. */
export function usageSnippet(nodes: readonly ExampleNode[]): string {
  return nodes.flatMap((node) => lines(node, "")).join("\n");
}

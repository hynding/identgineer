import {
  CONTENT_LIMITS,
  type Block,
  type ContentPage,
  type ExampleName,
  type Inline,
  type InlineContent,
  type TableBlock,
} from "../content/content-page.ts";
import { COMPONENT_EXAMPLES } from "../examples/component-examples.ts";
import type { ComponentExample } from "../examples/component-example.ts";
import { COMPONENTS_PATH, componentPath, type ContentRoute } from "../routes.ts";
import type { ComponentDoc } from "./component-docs.ts";
import { groupComponents, type Bundle, type ComponentGroup } from "./component-groups.ts";

type Examples = Readonly<Record<string, ComponentExample>>;

/** A component's page and where it is: what the prerenderer needs to write it. */
export interface ComponentReferencePage {
  readonly route: ContentRoute;
  readonly page: ContentPage;
}

export interface Reference {
  readonly index: ContentPage;
  readonly components: readonly ComponentReferencePage[];
}

const text = (value: string): Inline => ({ type: "text", text: value });
const code = (value: string): Inline => ({ type: "text", text: value, code: true });

/** The text of a cell when the package says nothing, which a cell may not leave empty. */
const NOT_DOCUMENTED = "Not documented";
const NONE = "None";

function clip(value: string, limit: number): string {
  if (value.length <= limit) return value;
  let end = limit - 1;
  const last = value.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return `${value.slice(0, end)}…`;
}

/**
 * Text with each pair of backticks read as code, and nothing else read as anything: a doc comment
 * is written in Markdown's habit of code spans, and every other character is shown as it is. A text
 * with more spans than a cell may hold is shown whole as plain text.
 */
function runs(value: string): InlineContent {
  const parts = value.split(/`([^`]+)`/);
  const result = parts.flatMap((part, index): Inline[] => {
    if (part === "") return [];
    return index % 2 === 1 ? [code(part)] : [text(part)];
  });
  if (result.length === 0) return [text(NOT_DOCUMENTED)];
  return result.length > CONTENT_LIMITS.runs ? [text(value)] : result;
}

function cell(value: string, fallback: string): InlineContent {
  return value === "" ? [text(fallback)] : runs(value);
}

function codeCell(value: string, fallback: string): InlineContent {
  return value === "" ? [text(fallback)] : [code(value)];
}

/** Tables of at most as many rows as the content format takes, the later ones saying which rows. */
function tables(
  caption: string,
  columns: readonly string[],
  rows: readonly (readonly InlineContent[])[],
): Block[] {
  const size = CONTENT_LIMITS.rows;
  if (rows.length <= size) return [{ type: "table", caption, columns, rows }];
  const chunks: Block[] = [];
  for (let start = 0; start < rows.length; start += size) {
    const end = Math.min(start + size, rows.length);
    const part: TableBlock = {
      type: "table",
      caption: `${caption}, ${String(start + 1)} to ${String(end)}`,
      columns,
      rows: rows.slice(start, end),
    };
    chunks.push(part);
  }
  return chunks;
}

function section(
  heading: string,
  caption: string,
  columns: readonly string[],
  rows: readonly (readonly InlineContent[])[],
): Block[] {
  if (rows.length === 0) return [];
  return [{ type: "heading", level: 2, text: heading }, ...tables(caption, columns, rows)];
}

function withoutBackticks(value: string): string {
  return value.replaceAll("`", "");
}

/** The lede: the first paragraph, whole if the page's lede may hold it, else cut short. */
function lede(doc: ComponentDoc): { readonly summary: string; readonly whole: boolean } {
  const first = withoutBackticks(doc.summary[0] ?? "");
  if (first === "") return { summary: `The ${doc.tag} web component.`, whole: true };
  const summary = clip(first, CONTENT_LIMITS.summary);
  return { summary, whole: summary === first };
}

function introduction(doc: ComponentDoc, whole: boolean): Block[] {
  const paragraphs = whole ? doc.summary.slice(1) : doc.summary;
  return paragraphs.map((paragraph): Block => ({ type: "paragraph", content: runs(paragraph) }));
}

function exampleBlock(doc: ComponentDoc, examples: Examples): Block[] {
  const example = examples[doc.tag];
  if (example === undefined) return [];
  return [
    { type: "heading", level: 2, text: "Example" },
    { type: "example", name: doc.tag as ExampleName, caption: example.caption },
  ];
}

/**
 * One component's page, in the body format the reading pages use: its description, its live
 * example when the registry has one, and a table for each of what it documents, left out when it
 * documents none. Everything is text or code, never markup.
 */
export function componentPage(
  doc: ComponentDoc,
  examples: Examples = COMPONENT_EXAMPLES,
): ContentPage {
  const { summary, whole } = lede(doc);
  const named = (what: string) => `${what} of ${doc.tag}`;
  return {
    slug: doc.tag,
    title: doc.tag,
    summary,
    seo: {},
    body: [
      ...introduction(doc, whole),
      ...exampleBlock(doc, examples),
      ...section(
        "Properties",
        named("Properties"),
        ["Property", "Attribute", "Type", "Default", "Description"],
        doc.properties.map((property) => [
          [code(property.name)],
          codeCell(property.attribute ?? "", NONE),
          codeCell(property.type, "Unknown"),
          codeCell(property.default ?? "", NONE),
          cell(property.description, NOT_DOCUMENTED),
        ]),
      ),
      ...section(
        "Events",
        named("Events"),
        ["Event", "Detail", "Cancelable", "Description"],
        doc.events.map((event) => [
          [code(event.name)],
          codeCell(event.detail, "Unknown"),
          [text(event.cancelable ? "Yes" : "No")],
          cell(event.description, NOT_DOCUMENTED),
        ]),
      ),
      ...section(
        "Methods",
        named("Methods"),
        ["Method", "Returns", "Description"],
        doc.methods.map((method) => [
          codeCell(method.signature, "Unknown"),
          codeCell(method.returns, "Unknown"),
          cell(method.description, NOT_DOCUMENTED),
        ]),
      ),
      ...section(
        "Slots",
        named("Slots"),
        ["Slot", "Description"],
        doc.slots.map((slot) => [
          slot.name === "" ? [text("Default")] : [code(slot.name)],
          cell(slot.description, NOT_DOCUMENTED),
        ]),
      ),
      ...section(
        "CSS parts",
        named("CSS parts"),
        ["Part", "Description"],
        doc.parts.map((part) => [[code(part.name)], cell(part.description, NOT_DOCUMENTED)]),
      ),
      ...section(
        "CSS custom properties",
        named("CSS custom properties"),
        ["Name", "Description"],
        doc.cssProperties.map((property) => [
          [code(property.name)],
          cell(property.description, NOT_DOCUMENTED),
        ]),
      ),
    ],
  };
}

const DESCRIPTION_LIMIT = 160;

/** The route of a component's page: under the components' index, found by the component's tag. */
export function componentRoute(doc: ComponentDoc): ContentRoute {
  return {
    path: componentPath(doc.tag),
    parent: COMPONENTS_PATH,
    label: doc.tag,
    title: doc.tag,
    description: clip(`${doc.tag}: ${lede(doc).summary}`, DESCRIPTION_LIMIT),
    status: "live",
    component: "site-content-page",
    content: doc.tag,
  };
}

const INDEX_SUMMARY_LIMIT = 140;

/** The first sentence of the description, for a line of the index. */
function firstSentence(doc: ComponentDoc): string {
  const first = withoutBackticks(doc.summary[0] ?? "");
  if (first === "") return NOT_DOCUMENTED;
  const end = first.search(/[.!?](?:\s|$)/);
  return clip(end < 0 ? first : first.slice(0, end + 1), INDEX_SUMMARY_LIMIT);
}

function counted(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? "" : "s"}`;
}

/** The index: every group of components as a table of links to their pages. */
export function componentIndexPage(groups: readonly ComponentGroup[]): ContentPage {
  const total = groups.reduce((sum, group) => sum + group.components.length, 0);
  return {
    slug: "components",
    title: "Components",
    summary:
      "Every idg- web component, with its properties, events, slots and parts and a live example of each, generated from the component library.",
    seo: {},
    body: [
      {
        type: "paragraph",
        content: [
          text(
            `${counted(total, "component")} in ${counted(groups.length, "group")}, as the library loads them. Every page is generated from the library's own documentation, so a component added to it appears here.`,
          ),
        ],
      },
      ...groups.flatMap((group): Block[] => [
        { type: "heading", level: 2, text: group.title },
        ...(group.description === undefined
          ? []
          : [{ type: "paragraph", content: [text(group.description)] } as const]),
        ...tables(
          group.title,
          ["Component", "Summary"],
          group.components.map((doc) => [
            [{ type: "link", href: componentPath(doc.tag), text: doc.tag }],
            [text(firstSentence(doc))],
          ]),
        ),
      ]),
    ],
  };
}

/** The index and a page for each documented component, from the package's docs and bundles. */
export function referencePages(
  docs: readonly ComponentDoc[],
  bundles: readonly Bundle[],
  examples: Examples = COMPONENT_EXAMPLES,
): Reference {
  return {
    index: componentIndexPage(groupComponents(docs, bundles)),
    components: docs.map((doc) => ({
      route: componentRoute(doc),
      page: componentPage(doc, examples),
    })),
  };
}

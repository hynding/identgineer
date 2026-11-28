import {
  COMPONENT_EXAMPLE_NAMES,
  type ComponentExampleName,
} from "../examples/component-examples.ts";

/**
 * A reading page of the site, as data: the same fields as the CMS's `Page` type, with a body that
 * is an ordered list of blocks, never HTML. The renderer draws each block as elements and text, so
 * nothing a page holds can become markup, a script, a style or a request.
 */
export interface ContentPage {
  /** The page's key, matched to a route of the route table and to the CMS record of that slug. */
  readonly slug: string;
  /** The page's one top-level heading. */
  readonly title: string;
  /** The lede under the heading. */
  readonly summary: string;
  readonly body: readonly Block[];
  readonly seo: Seo;
}

/** What a page may set about how it is found; the route table's title and description otherwise. */
export interface Seo {
  readonly metaTitle?: string;
  readonly metaDescription?: string;
  /** Asks search engines not to index the page, and leaves it out of the sitemap. */
  readonly noIndex?: boolean;
}

/** A run of text, with any of three kinds of emphasis. */
export interface TextRun {
  readonly type: "text";
  readonly text: string;
  readonly strong?: boolean;
  readonly emphasis?: boolean;
  readonly code?: boolean;
}

/** A link: a path of the site, a heading of this page (`#id`) or an `https:` address. */
export interface LinkRun {
  readonly type: "link";
  readonly href: string;
  readonly text: string;
}

export type Inline = TextRun | LinkRun;

export type InlineContent = readonly Inline[];

export interface HeadingBlock {
  readonly type: "heading";
  /** The page title is the one level 1 heading, so the body starts at 2. */
  readonly level: 2 | 3 | 4;
  readonly text: string;
}

export interface ParagraphBlock {
  readonly type: "paragraph";
  readonly content: InlineContent;
}

export interface ListBlock {
  readonly type: "list";
  readonly style: "bulleted" | "numbered";
  readonly items: readonly InlineContent[];
}

export const CODE_LANGUAGES = ["html", "css", "ts", "js", "json", "sh", "text"] as const;

export type CodeLanguage = (typeof CODE_LANGUAGES)[number];

/** A code sample: plain text, shown as it is, with the language named above it. */
export interface CodeBlock {
  readonly type: "code";
  readonly language: CodeLanguage;
  readonly code: string;
  readonly caption?: string;
}

export interface CalloutBlock {
  readonly type: "callout";
  readonly tone: "note" | "warning";
  readonly title?: string;
  readonly content: InlineContent;
}

export interface TableBlock {
  readonly type: "table";
  readonly caption: string;
  readonly columns: readonly string[];
  /** Each row has one cell per column. */
  readonly rows: readonly (readonly InlineContent[])[];
}

/** The demos of the home page, which a reading page can place as well. */
export const SHOWCASE_EXAMPLE_NAMES = ["sign-in", "dashboard-figures", "theme-tiles"] as const;

/**
 * The live examples a page can place by name: the home page's demos, and the example of each
 * component by its tag. Each is drawn by the renderer from a fixed registry, so content chooses a
 * demo without carrying any of its markup.
 */
export const EXAMPLE_NAMES: readonly ExampleName[] = [
  ...SHOWCASE_EXAMPLE_NAMES,
  ...COMPONENT_EXAMPLE_NAMES,
];

export type ExampleName = (typeof SHOWCASE_EXAMPLE_NAMES)[number] | ComponentExampleName;

export interface ExampleBlock {
  readonly type: "example";
  readonly name: ExampleName;
  readonly caption?: string;
}

export type Block =
  HeadingBlock | ParagraphBlock | ListBlock | CodeBlock | CalloutBlock | TableBlock | ExampleBlock;

export type BlockType = Block["type"];

/** The bounds a page is held to, so a record from anywhere stays a page's worth of reading. */
export const CONTENT_LIMITS = {
  slug: 120,
  title: 120,
  summary: 300,
  metaTitle: 60,
  metaDescription: 160,
  blocks: 200,
  heading: 120,
  run: 2_000,
  runs: 60,
  listItems: 50,
  code: 8_000,
  codeLines: 200,
  caption: 200,
  columns: 6,
  rows: 60,
  href: 2_048,
  /** Every character of the body together: a long guide is about a fifth of this. */
  bodyText: 100_000,
} as const;

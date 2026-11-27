import type {
  CalloutBlock,
  CodeBlock,
  CodeLanguage,
  ContentPage,
  ExampleBlock,
  ExampleName,
  HeadingBlock,
  Inline,
  InlineContent,
  LinkRun,
  ListBlock,
  ParagraphBlock,
  TableBlock,
  TextRun,
} from "./content-page";

/**
 * Shorthands for writing the repository's pages: each returns the plain data of the body format,
 * and a string stands for a run of plain text. They add nothing a CMS record could not hold.
 */
export type Piece = string | Inline;

function runs(pieces: readonly Piece[]): InlineContent {
  return pieces.map((piece) => (typeof piece === "string" ? { type: "text", text: piece } : piece));
}

export function strong(text: string): TextRun {
  return { type: "text", text, strong: true };
}

export function em(text: string): TextRun {
  return { type: "text", text, emphasis: true };
}

export function code(text: string): TextRun {
  return { type: "text", text, code: true };
}

export function link(href: string, text: string): LinkRun {
  return { type: "link", href, text };
}

export function p(...pieces: Piece[]): ParagraphBlock {
  return { type: "paragraph", content: runs(pieces) };
}

export function h2(text: string): HeadingBlock {
  return { type: "heading", level: 2, text };
}

export function h3(text: string): HeadingBlock {
  return { type: "heading", level: 3, text };
}

/** A list item is one piece, or several pieces in a row. */
type Item = Piece | readonly Piece[];

function items(list: readonly Item[]): readonly InlineContent[] {
  return list.map((item) =>
    runs(typeof item === "string" || !Array.isArray(item) ? [item as Piece] : item),
  );
}

export function bullets(...list: Item[]): ListBlock {
  return { type: "list", style: "bulleted", items: items(list) };
}

export function steps(...list: Item[]): ListBlock {
  return { type: "list", style: "numbered", items: items(list) };
}

export function sample(language: CodeLanguage, text: string, caption?: string): CodeBlock {
  const block = {
    type: "code",
    language,
    code: text.replace(/^\n/, "").replace(/\n\s*$/, ""),
  } as const;
  return caption === undefined ? block : { ...block, caption };
}

export function note(title: string, ...pieces: Piece[]): CalloutBlock {
  return { type: "callout", tone: "note", title, content: runs(pieces) };
}

export function warning(title: string, ...pieces: Piece[]): CalloutBlock {
  return { type: "callout", tone: "warning", title, content: runs(pieces) };
}

export function table(
  caption: string,
  columns: readonly string[],
  rows: readonly (readonly Item[])[],
): TableBlock {
  return { type: "table", caption, columns, rows: rows.map(items) };
}

export function example(name: ExampleName, caption: string): ExampleBlock {
  return { type: "example", name, caption };
}

export function page(fields: Omit<ContentPage, "seo">): ContentPage {
  return { ...fields, seo: {} };
}

/** A file of the repository on GitHub, for the guides the site does not carry yet. */
export function repository(path: string): string {
  return `https://github.com/hynding/identgineer/blob/main/${path}`;
}

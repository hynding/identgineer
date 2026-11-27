import type { Block, HeadingBlock } from "./content-page";

/**
 * The ids the page around the body already uses, which a heading's address must not take: two
 * elements with one id would send a link, or a label, to the wrong one.
 */
export const RESERVED_IDS: ReadonlySet<string> = new Set([
  "page-title",
  "contents",
  "contents-title",
  "docs-pages",
  "docs-pages-title",
  "pager",
  "appearance",
  "main",
]);

/**
 * A heading's address on its page: its words in lower-case ASCII joined by hyphens, so "Theme ids
 * & the switcher" is `#theme-ids-the-switcher`. Letters with accents keep the letter.
 */
export function headingId(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** One entry of a page's table of contents: a level 2 heading and the level 3 ones under it. */
export interface ContentsEntry {
  readonly id: string;
  readonly text: string;
  readonly children: readonly { readonly id: string; readonly text: string }[];
}

function isHeading(block: Block): block is HeadingBlock {
  return block.type === "heading";
}

/** The table of contents of a body: its level 2 headings, each with its level 3 ones. */
export function tableOfContents(body: readonly Block[]): readonly ContentsEntry[] {
  const entries: { id: string; text: string; children: { id: string; text: string }[] }[] = [];
  for (const heading of body.filter(isHeading)) {
    const entry = { id: headingId(heading.text), text: heading.text };
    if (heading.level === 2) entries.push({ ...entry, children: [] });
    else if (heading.level === 3) entries.at(-1)?.children.push(entry);
  }
  return entries;
}

/** A level 2 heading and the blocks under it, up to the next one. */
export interface BodySection {
  readonly heading: HeadingBlock | undefined;
  readonly blocks: readonly Block[];
}

/**
 * The body cut at each level 2 heading: what comes before the first is an introduction with no
 * heading, and each section after it is drawn as a `section` labelled by its heading.
 */
export function sectionsOf(body: readonly Block[]): readonly BodySection[] {
  const sections: { heading: HeadingBlock | undefined; blocks: Block[] }[] = [];
  for (const block of body) {
    if (block.type === "heading" && block.level === 2) {
      sections.push({ heading: block, blocks: [] });
      continue;
    }
    const last = sections.at(-1);
    if (last) last.blocks.push(block);
    else sections.push({ heading: undefined, blocks: [block] });
  }
  return sections;
}

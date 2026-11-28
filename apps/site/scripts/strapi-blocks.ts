import { CODE_LANGUAGES, type CodeLanguage } from "../src/content/content-page.ts";
import { printable } from "../src/content/validate-content-page.ts";

/**
 * A page body in the shape the content validator reads, made from the CMS's `blocks` field: Strapi's
 * rich text (paragraphs, headings, lists, quotes, code and images, holding text and links), which
 * both targets check on every write. What it holds maps onto the body format, a quote becoming a
 * note; an image does not, since the site loads nothing from another origin. Tables and live
 * examples have no blocks of their own, so a page from the CMS has none.
 *
 * Nothing is checked here beyond the shape: the result goes through the content validator, which
 * checks every link, character and bound as it does for the repository's pages.
 */
export class StrapiBlocksError extends Error {
  readonly block: number;
  readonly type: string | undefined;

  constructor(block: number, type: string | undefined, reason: string) {
    super(
      block === 0
        ? `body: ${reason}`
        : `block ${String(block)}${type === undefined ? "" : ` (${printable(type, 20)})`}: ${reason}`,
    );
    this.block = block;
    this.type = type;
  }
}

type Node = Record<string, unknown>;

function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function childrenOf(node: Node): unknown[] {
  return Array.isArray(node.children) ? node.children : [];
}

/** A text node's string; anything else in its place is no text at all. */
function textOf(node: Node): string {
  return typeof node.text === "string" ? node.text : "";
}

/** What a type is called in a message: printable and short, whatever was sent. */
function named(type: unknown): string {
  return typeof type === "string" ? `"${printable(type, 40)}"` : "a type that is not text";
}

/** A heading's level clamped to the page's levels (2 to 4), with nothing skipped on the way down. */
function headingLevel(level: unknown, previous: number): unknown {
  if (typeof level !== "number" || !Number.isInteger(level)) return level;
  const wanted = Math.min(Math.max(level, 2), 4);
  return previous === 0 ? 2 : Math.min(wanted, previous + 1);
}

class Converter {
  block = 0;
  type: string | undefined;
  private lastHeading = 0;

  fail(reason: string): never {
    throw new StrapiBlocksError(this.block, this.type, reason);
  }

  /**
   * The text of some inlines. A link's own children are read here too, and a link inside one is
   * refused (Strapi's editor makes none), so this goes one level down at most, however deep an
   * answer nests them.
   */
  plainText(children: unknown[], insideLink = false): string {
    return children
      .map((child) => {
        if (!isNode(child)) return this.fail("an inline must be an object");
        if (child.type !== "link") return textOf(child);
        if (insideLink) return this.fail("a link inside a link is not drawn");
        return this.plainText(childrenOf(child), true);
      })
      .join("");
  }

  inlines(children: unknown[]): Record<string, unknown>[] {
    return children.map((child) => {
      if (!isNode(child)) return this.fail("an inline must be an object");
      if (child.type === "link") {
        return { type: "link", href: child.url, text: this.plainText(childrenOf(child), true) };
      }
      if (child.type !== "text") return this.fail(`${named(child.type)} is not text or a link`);
      // Underline and strikethrough have no place in the body format; the text is kept.
      return {
        type: "text",
        text: textOf(child),
        ...(child.bold === true ? { strong: true } : {}),
        ...(child.italic === true ? { emphasis: true } : {}),
        ...(child.code === true ? { code: true } : {}),
      };
    });
  }

  listItems(children: unknown[]): Record<string, unknown>[][] {
    return children.map((child) => {
      if (!isNode(child)) return this.fail("a list item must be an object");
      if (child.type === "list") return this.fail("a list inside a list is not drawn");
      return this.inlines(childrenOf(child));
    });
  }

  convert(node: unknown): Record<string, unknown> {
    if (!isNode(node)) return this.fail("must be an object");
    switch (node.type) {
      case "paragraph":
        return { type: "paragraph", content: this.inlines(childrenOf(node)) };
      case "heading": {
        // The page's title is its one level 1 heading, and the body has levels 2 to 4: Strapi's
        // levels are brought into that range, in order, rather than the page refused.
        const level = headingLevel(node.level, this.lastHeading);
        if (typeof level === "number") this.lastHeading = level;
        return { type: "heading", level, text: this.plainText(childrenOf(node)) };
      }
      case "list":
        return {
          type: "list",
          style: node.format === "ordered" ? "numbered" : "bulleted",
          items: this.listItems(childrenOf(node)),
        };
      case "quote":
        return { type: "callout", tone: "note", content: this.inlines(childrenOf(node)) };
      case "code": {
        const language = (CODE_LANGUAGES as readonly unknown[]).includes(node.language)
          ? (node.language as CodeLanguage)
          : "text";
        return { type: "code", language, code: this.plainText(childrenOf(node)) };
      }
      case "image":
        return this.fail("images are not drawn: the site loads nothing from another origin");
      default:
        this.type = undefined;
        return this.fail(`${named(node.type)} is not a block of Strapi's rich text`);
    }
  }
}

export function bodyFromStrapiBlocks(blocks: unknown): Record<string, unknown>[] {
  if (!Array.isArray(blocks)) throw new StrapiBlocksError(0, undefined, "must be a list of blocks");
  const converter = new Converter();
  return blocks.map((block, index) => {
    converter.block = index + 1;
    converter.type = isNode(block) && typeof block.type === "string" ? block.type : undefined;
    return converter.convert(block);
  });
}

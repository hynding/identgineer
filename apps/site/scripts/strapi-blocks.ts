import { CODE_LANGUAGES, type CodeLanguage } from "../src/content/content-page.ts";

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
        : `block ${String(block)}${type === undefined ? "" : ` (${type})`}: ${reason}`,
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

class Converter {
  block = 0;
  type: string | undefined;

  fail(reason: string): never {
    throw new StrapiBlocksError(this.block, this.type, reason);
  }

  plainText(children: unknown[]): string {
    return children
      .map((child) => {
        if (!isNode(child)) return this.fail("an inline must be an object");
        return child.type === "link" ? this.plainText(childrenOf(child)) : textOf(child);
      })
      .join("");
  }

  inlines(children: unknown[]): Record<string, unknown>[] {
    return children.map((child) => {
      if (!isNode(child)) return this.fail("an inline must be an object");
      if (child.type === "link") {
        return { type: "link", href: child.url, text: this.plainText(childrenOf(child)) };
      }
      if (child.type !== "text")
        return this.fail(`${JSON.stringify(child.type)} is not text or a link`);
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
      case "heading":
        return { type: "heading", level: node.level, text: this.plainText(childrenOf(node)) };
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
        return this.fail(`${JSON.stringify(node.type)} is not a block of Strapi's rich text`);
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

import { describe, expect, it } from "vitest";
import { StrapiBlocksError, bodyFromStrapiBlocks } from "./strapi-blocks.ts";

const text = (value: string, marks: Record<string, boolean> = {}) => ({
  type: "text",
  text: value,
  ...marks,
});

describe("Strapi's blocks rich text, as a page body", () => {
  it("keeps paragraphs, their emphasis, code and links", () => {
    const body = bodyFromStrapiBlocks([
      {
        type: "paragraph",
        children: [
          text("Plain "),
          text("bold", { bold: true }),
          text("italic", { italic: true }),
          text("x()", { code: true }),
          text("under", { underline: true, strikethrough: true }),
          { type: "link", url: "/docs/", children: [text("the "), text("docs", { bold: true })] },
        ],
      },
    ]);
    expect(body).toEqual([
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Plain " },
          { type: "text", text: "bold", strong: true },
          { type: "text", text: "italic", emphasis: true },
          { type: "text", text: "x()", code: true },
          { type: "text", text: "under" },
          { type: "link", href: "/docs/", text: "the docs" },
        ],
      },
    ]);
  });

  it("keeps headings as plain text, at the level they have", () => {
    expect(
      bodyFromStrapiBlocks([
        { type: "heading", level: 3, children: [text("A "), text("b", { bold: true })] },
      ]),
    ).toEqual([{ type: "heading", level: 3, text: "A b" }]);
  });

  it("keeps lists, bulleted and numbered", () => {
    const list = (format: string) => ({
      type: "list",
      format,
      children: [{ type: "list-item", children: [text("One")] }],
    });
    expect(bodyFromStrapiBlocks([list("unordered"), list("ordered")])).toEqual([
      { type: "list", style: "bulleted", items: [[{ type: "text", text: "One" }]] },
      { type: "list", style: "numbered", items: [[{ type: "text", text: "One" }]] },
    ]);
  });

  it("makes a code block a code sample, in its language or as text", () => {
    expect(
      bodyFromStrapiBlocks([
        { type: "code", language: "css", children: [text("a {}")] },
        { type: "code", language: "cobol", children: [text("x")] },
        { type: "code", children: [text("y")] },
      ]),
    ).toEqual([
      { type: "code", language: "css", code: "a {}" },
      { type: "code", language: "text", code: "x" },
      { type: "code", language: "text", code: "y" },
    ]);
  });

  it("makes a quote a note", () => {
    expect(bodyFromStrapiBlocks([{ type: "quote", children: [text("Mind this")] }])).toEqual([
      { type: "callout", tone: "note", content: [{ type: "text", text: "Mind this" }] },
    ]);
  });

  it("refuses an image, which would be a request to another origin, naming where it is", () => {
    expect(() =>
      bodyFromStrapiBlocks([
        { type: "paragraph", children: [text("x")] },
        { type: "image", image: { url: "https://cdn.example/x.png" }, children: [] },
      ]),
    ).toThrow(
      new StrapiBlocksError(
        2,
        "image",
        "images are not drawn: the site loads nothing from another origin",
      ),
    );
  });

  it("refuses a block type it does not know, a nested list and a body that is not a list", () => {
    expect(() => bodyFromStrapiBlocks([{ type: "html", children: [] }])).toThrow(
      /block 1: "html" is not a block of Strapi's rich text/,
    );
    expect(() =>
      bodyFromStrapiBlocks([
        {
          type: "list",
          format: "unordered",
          children: [{ type: "list", format: "ordered", children: [] }],
        },
      ]),
    ).toThrow(/block 1 \(list\): a list inside a list is not drawn/);
    expect(() => bodyFromStrapiBlocks("<p>hi</p>")).toThrow(/body: must be a list of blocks/);
    expect(() => bodyFromStrapiBlocks(null)).toThrow(/body: must be a list of blocks/);
  });

  it("refuses an inline that is neither text nor a link", () => {
    expect(() =>
      bodyFromStrapiBlocks([{ type: "paragraph", children: [{ type: "mention", id: 1 }] }]),
    ).toThrow(/block 1 \(paragraph\): "mention" is not text or a link/);
  });

  it("refuses a link inside a link, however deep, without running out of stack", () => {
    let link: Record<string, unknown> = { type: "text", text: "x" };
    for (let depth = 0; depth < 5000; depth += 1) {
      link = { type: "link", url: "/docs/", children: [link] };
    }
    for (const block of [
      { type: "paragraph", children: [link] },
      { type: "heading", level: 2, children: [link] },
      { type: "code", language: "ts", children: [link] },
      { type: "list", format: "unordered", children: [{ type: "list-item", children: [link] }] },
      { type: "quote", children: [link] },
    ]) {
      expect(() => bodyFromStrapiBlocks([block])).toThrow(StrapiBlocksError);
      expect(() => bodyFromStrapiBlocks([block])).toThrow(/a link inside a link is not drawn/);
    }
  });

  it("names a type it does not know without echoing it unbounded or raw", () => {
    const type = `x\u009b31m${"y".repeat(10_000)}`;
    let message = "";
    try {
      bodyFromStrapiBlocks([{ type, children: [] }]);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message.length).toBeLessThan(200);
    expect(message).toMatch(/^[\x20-\x7e]+$/);
    expect(message).toContain("\\u009b");
  });
});

import { describe, expect, it } from "vitest";
import { CONTENT_LIMITS } from "./content-page";
import {
  describeContentError,
  parseContentPage,
  type ContentResult,
} from "./validate-content-page";

const CONTEXT = { paths: new Set(["/", "/docs/", "/identity/"]) };

/** A page with one of every block, every kind of inline and every kind of link. */
function samplePage(): Record<string, unknown> {
  return {
    slug: "sample",
    title: "A sample page",
    summary: "Every block the body format has, once.",
    seo: { metaTitle: "Sample", metaDescription: "A page used by the tests.", noIndex: false },
    body: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Plain, " },
          { type: "text", text: "strong", strong: true },
          { type: "text", text: ", emphasis", emphasis: true },
          { type: "text", text: "code()", code: true },
          { type: "link", href: "/docs/", text: "the docs" },
          { type: "link", href: "#setup", text: "below" },
          { type: "link", href: "https://example.org/a?b=c#d", text: "elsewhere" },
        ],
      },
      { type: "heading", level: 2, text: "Setup" },
      { type: "list", style: "bulleted", items: [[{ type: "text", text: "One" }]] },
      { type: "heading", level: 3, text: "In detail" },
      { type: "code", language: "html", code: '<p class="x">\n  Hello\n</p>', caption: "Markup" },
      { type: "heading", level: 4, text: "Deeper still" },
      { type: "heading", level: 2, text: "Notes" },
      {
        type: "callout",
        tone: "warning",
        title: "Careful",
        content: [{ type: "text", text: "Hm" }],
      },
      {
        type: "table",
        caption: "Two columns",
        columns: ["Name", "Meaning"],
        rows: [[[{ type: "text", text: "a" }], [{ type: "text", text: "b", code: true }]]],
      },
      { type: "example", name: "sign-in", caption: "The form" },
    ],
  };
}

function without(page: Record<string, unknown>, key: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(page).filter(([name]) => name !== key));
}

function withBlock(block: unknown): Record<string, unknown> {
  return { ...samplePage(), body: [block] };
}

function withLink(href: string): Record<string, unknown> {
  return withBlock({ type: "paragraph", content: [{ type: "link", href, text: "x" }] });
}

function errorOf(result: ContentResult): string {
  expect(result.ok).toBe(false);
  return result.ok ? "" : describeContentError(result.error);
}

describe("a content page", () => {
  it("is accepted with every block, inline and kind of link", () => {
    const result = parseContentPage(samplePage(), CONTEXT);
    expect(result.ok).toBe(true);
    expect(result.ok && result.page.body).toHaveLength(10);
  });

  it("comes back as a copy, not the object it was given", () => {
    const input = samplePage();
    const result = parseContentPage(input, CONTEXT);
    expect(result.ok && result.page).not.toBe(input);
    expect(result.ok && result.page).toEqual(input);
  });

  it("may leave out the SEO fields and the optional captions and titles", () => {
    const page = {
      ...samplePage(),
      seo: {},
      body: [
        { type: "code", language: "text", code: "x" },
        { type: "callout", tone: "note", content: [{ type: "text", text: "y" }] },
        { type: "example", name: "theme-tiles" },
      ],
    };
    expect(parseContentPage(page, CONTEXT).ok).toBe(true);
  });
});

describe("a content page is refused", () => {
  it.each([
    ["a string", "not a page"],
    ["null", null],
    ["an array", []],
    ["a Map", new Map()],
  ])("when it is %s", (_, input) => {
    expect(errorOf(parseContentPage(input, CONTEXT))).toMatch(/must be an object/);
  });

  it("with a field the format does not have, __proto__ included", () => {
    expect(errorOf(parseContentPage({ ...samplePage(), html: "<b>" }, CONTEXT))).toMatch(
      /page "sample": html: is not a field/,
    );
    const proto = JSON.parse('{"__proto__": {"x": 1}}') as object;
    expect(errorOf(parseContentPage({ ...samplePage(), ...proto }, CONTEXT))).toMatch(
      /__proto__: is not a field/,
    );
  });

  it("without a summary, or with a slug that is not a slug", () => {
    expect(errorOf(parseContentPage(without(samplePage(), "summary"), CONTEXT))).toMatch(
      /summary: is required/,
    );
    expect(errorOf(parseContentPage({ ...samplePage(), slug: "../etc" }, CONTEXT))).toMatch(
      /slug: must be lower-case words joined by hyphens/,
    );
  });

  it("with an empty body", () => {
    expect(errorOf(parseContentPage({ ...samplePage(), body: [] }, CONTEXT))).toMatch(
      /body: must hold at least one block/,
    );
  });

  it("with a block of a type the format does not have, naming where it is", () => {
    const page = samplePage();
    const body = [...(page.body as unknown[])];
    body.splice(2, 0, { type: "html", html: "<script>alert(1)</script>" });
    expect(errorOf(parseContentPage({ ...page, body }, CONTEXT))).toBe(
      'page "sample", block 3: type: "html" is not a block type (heading, paragraph, list, code, callout, table, example)',
    );
  });

  it("with an inline of a type the format does not have", () => {
    const page = withBlock({ type: "paragraph", content: [{ type: "image", src: "x.png" }] });
    expect(errorOf(parseContentPage(page, CONTEXT))).toMatch(
      /block 1 \(paragraph\): content\[0\]\.type: "image" is not an inline type/,
    );
  });

  it("with a live example the registry does not have", () => {
    expect(errorOf(parseContentPage(withBlock({ type: "example", name: "iframe" }), CONTEXT))).toBe(
      'page "sample", block 1 (example): name: "iframe" is not a live example (sign-in, dashboard-figures, theme-tiles)',
    );
  });

  it("with a code sample in a language it does not name", () => {
    const page = withBlock({ type: "code", language: "php", code: "<?php" });
    expect(errorOf(parseContentPage(page, CONTEXT))).toMatch(
      /block 1 \(code\): language: "php" is not one of html, css/,
    );
  });

  describe("with a link", () => {
    it.each([
      ["javascript:alert(1)"],
      ["JavaScript:alert(1)"],
      [" javascript:alert(1)"],
      ["data:text/html,<script>alert(1)</script>"],
      ["vbscript:msgbox"],
      ["http://example.org/"],
      ["//evil.example/"],
      ["/\\evil.example/"],
      ["https://user:pass@example.org/"],
      ["https:example.org"],
      ["mailto:someone@example.org"],
      ["https://exa mple.org/"],
    ])("to %s", (href) => {
      expect(errorOf(parseContentPage(withLink(href), CONTEXT))).toMatch(
        /block 1 \(paragraph\): content\[0\]\.href: .* is not a path of the site, a heading of this page or an https: address/,
      );
    });

    it("to a path the route table does not have, or one with a query or a fragment", () => {
      for (const href of ["/no-such-page/", "/docs", "/docs/?x=1", "/docs/#top", "/docs/../"]) {
        expect(errorOf(parseContentPage(withLink(href), CONTEXT)), href).toMatch(
          /is not a path of the site/,
        );
      }
    });

    it("to a heading this page does not have", () => {
      expect(errorOf(parseContentPage(withLink("#nowhere"), CONTEXT))).toMatch(
        /"#nowhere" is not a heading of this page/,
      );
    });

    it("longer than a URL may be", () => {
      const href = `https://example.org/${"a".repeat(CONTENT_LIMITS.href)}`;
      expect(errorOf(parseContentPage(withLink(href), CONTEXT))).toMatch(/at most 2048 characters/);
    });
  });

  describe("with headings out of order", () => {
    it("starting below level 2", () => {
      const page = withBlock({ type: "heading", level: 3, text: "Too deep" });
      expect(errorOf(parseContentPage(page, CONTEXT))).toBe(
        'page "sample", block 1 (heading): level: the first heading must be level 2, not 3',
      );
    });

    it("jumping a level", () => {
      const page = {
        ...samplePage(),
        body: [
          { type: "heading", level: 2, text: "One" },
          { type: "heading", level: 4, text: "Three" },
        ],
      };
      expect(errorOf(parseContentPage(page, CONTEXT))).toBe(
        'page "sample", block 2 (heading): level: a level 4 heading cannot follow a level 2 one',
      );
    });

    it("at level 1, which is the page title's", () => {
      const page = withBlock({ type: "heading", level: 1, text: "A second title" });
      expect(errorOf(parseContentPage(page, CONTEXT))).toMatch(/level: must be 2, 3 or 4/);
    });

    it("twice with the same text, which would give two sections one address", () => {
      const page = {
        ...samplePage(),
        body: [
          { type: "heading", level: 2, text: "Setup" },
          { type: "heading", level: 2, text: "setup!" },
        ],
      };
      expect(errorOf(parseContentPage(page, CONTEXT))).toMatch(
        /block 2 \(heading\): text: its address "#setup" is taken by block 1/,
      );
    });
  });

  describe("with characters that do not belong in text", () => {
    it.each([
      ["a NUL", "a\u0000b"],
      ["an escape", "a\u001bb"],
      ["a C1 control", "a\u0085b"],
      ["a delete", "a\u007fb"],
      ["a right-to-left override", "a\u202eb"],
      ["a line separator", "a\u2028b"],
      ["a lone surrogate", "a\ud800b"],
      ["a newline outside code", "a\nb"],
      ["a tab outside code", "a\tb"],
    ])("such as %s", (_, text) => {
      const page = withBlock({ type: "paragraph", content: [{ type: "text", text }] });
      expect(errorOf(parseContentPage(page, CONTEXT))).toMatch(
        /block 1 \(paragraph\): content\[0\]\.text: holds a control or formatting character \(U\+[0-9A-F]{4}\)/,
      );
    });

    it("in the title as well", () => {
      expect(errorOf(parseContentPage({ ...samplePage(), title: "A\u0007" }, CONTEXT))).toMatch(
        /title: holds a control or formatting character \(U\+0007\)/,
      );
    });

    it("but code may hold newlines and tabs", () => {
      const page = withBlock({ type: "code", language: "text", code: "a\n\tb" });
      expect(parseContentPage(page, CONTEXT).ok).toBe(true);
    });
  });

  describe("when it is too large", () => {
    it("with more blocks than a page holds", () => {
      const body = Array.from({ length: CONTENT_LIMITS.blocks + 1 }, () => ({
        type: "paragraph",
        content: [{ type: "text", text: "x" }],
      }));
      expect(errorOf(parseContentPage({ ...samplePage(), body }, CONTEXT))).toMatch(
        /body: must hold at most 200 blocks/,
      );
    });

    it("with more text than a page holds, each run within its own bound", () => {
      const body = Array.from({ length: 60 }, () => ({
        type: "paragraph",
        content: [{ type: "text", text: "x".repeat(CONTENT_LIMITS.run) }],
      }));
      expect(errorOf(parseContentPage({ ...samplePage(), body }, CONTEXT))).toMatch(
        /block 51 \(paragraph\): holds more than 100000 characters of text, with the blocks before it/,
      );
    });

    it("with a run longer than its bound", () => {
      const text = "x".repeat(CONTENT_LIMITS.run + 1);
      const page = withBlock({ type: "paragraph", content: [{ type: "text", text }] });
      expect(errorOf(parseContentPage(page, CONTEXT))).toMatch(/at most 2000 characters/);
    });

    it("with a code sample of too many lines", () => {
      const code = "x\n".repeat(CONTENT_LIMITS.codeLines + 1);
      const page = withBlock({ type: "code", language: "text", code });
      expect(errorOf(parseContentPage(page, CONTEXT))).toMatch(/code: must be at most 200 lines/);
    });
  });

  it("with a table row that does not have one cell per column", () => {
    const page = withBlock({
      type: "table",
      caption: "x",
      columns: ["A", "B"],
      rows: [[[{ type: "text", text: "only one" }]]],
    });
    expect(errorOf(parseContentPage(page, CONTEXT))).toMatch(
      /block 1 \(table\): rows\[0\]: must have 2 cells, one per column, not 1/,
    );
  });

  it("with an empty paragraph or list item", () => {
    expect(
      errorOf(parseContentPage(withBlock({ type: "paragraph", content: [] }), CONTEXT)),
    ).toMatch(/content: must hold at least one inline/);
    const page = withBlock({ type: "list", style: "numbered", items: [[]] });
    expect(errorOf(parseContentPage(page, CONTEXT))).toMatch(/items\[0\]: must hold at least one/);
  });

  it("with text that is only white space", () => {
    expect(errorOf(parseContentPage({ ...samplePage(), title: "   " }, CONTEXT))).toMatch(
      /title: must not be empty/,
    );
  });

  it("naming no page when it has no slug to name it by", () => {
    expect(errorOf(parseContentPage(without(samplePage(), "slug"), CONTEXT))).toMatch(
      /^page \(no slug\): slug: is required/,
    );
  });
});

import { describe, expect, it } from "vitest";
import type { Block } from "./content-page.ts";
import { headingId, sectionsOf, tableOfContents } from "./headings.ts";

function heading(level: 2 | 3 | 4, text: string): Block {
  return { type: "heading", level, text };
}

const PARAGRAPH: Block = { type: "paragraph", content: [{ type: "text", text: "x" }] };

describe("a heading's address", () => {
  it.each([
    ["Getting started", "getting-started"],
    ["Theme ids & the switcher", "theme-ids-the-switcher"],
    ["  What's inside?  ", "what-s-inside"],
    ["Café crème", "cafe-creme"],
    ["CSP", "csp"],
    ["!!!", ""],
  ])("of %j is %j", (text, id) => {
    expect(headingId(text)).toBe(id);
  });
});

describe("the table of contents", () => {
  it("lists the level 2 headings, each with its level 3 ones, and leaves out level 4", () => {
    const body = [
      PARAGRAPH,
      heading(2, "Install"),
      heading(3, "With pnpm"),
      heading(4, "Offline"),
      heading(3, "By hand"),
      heading(2, "Use"),
    ];
    expect(tableOfContents(body)).toEqual([
      {
        id: "install",
        text: "Install",
        children: [
          { id: "with-pnpm", text: "With pnpm" },
          { id: "by-hand", text: "By hand" },
        ],
      },
      { id: "use", text: "Use", children: [] },
    ]);
  });

  it("is empty for a body without headings", () => {
    expect(tableOfContents([PARAGRAPH])).toEqual([]);
  });
});

describe("the sections of a body", () => {
  it("start at each level 2 heading, after an introduction without one", () => {
    const install = heading(2, "Install");
    const deeper = heading(3, "Deeper");
    const use = heading(2, "Use");
    expect(sectionsOf([PARAGRAPH, install, deeper, PARAGRAPH, use])).toEqual([
      { heading: undefined, blocks: [PARAGRAPH] },
      { heading: install, blocks: [deeper, PARAGRAPH] },
      { heading: use, blocks: [] },
    ]);
  });

  it("have no introduction when the body starts with a heading", () => {
    const install = heading(2, "Install");
    expect(sectionsOf([install, PARAGRAPH])).toEqual([{ heading: install, blocks: [PARAGRAPH] }]);
  });
});

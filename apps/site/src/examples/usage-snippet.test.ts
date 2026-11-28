import { describe, expect, it } from "vitest";
import { el, usageSnippet } from "./component-example.ts";

describe("the usage snippet of an example", () => {
  it("writes an element with text on one line, attributes in the order given", () => {
    expect(usageSnippet([el("idg-button", { variant: "primary", size: "sm" }, "Save")])).toBe(
      '<idg-button variant="primary" size="sm">Save</idg-button>',
    );
  });

  it("writes a true attribute bare, and an element with nothing in it with a closing tag", () => {
    expect(usageSnippet([el("idg-switch", { checked: true })])).toBe(
      "<idg-switch checked></idg-switch>",
    );
  });

  it("puts each child element on a line of its own, indented by two spaces for each level", () => {
    expect(
      usageSnippet([
        el(
          "idg-card",
          { heading: "Plan" },
          el("p", {}, "Text ", el("strong", {}, "bold")),
          el("idg-button", { slot: "footer" }, "Choose"),
        ),
      ]),
    ).toBe(
      [
        '<idg-card heading="Plan">',
        "  <p>",
        "    Text",
        "    <strong>bold</strong>",
        "  </p>",
        '  <idg-button slot="footer">Choose</idg-button>',
        "</idg-card>",
      ].join("\n"),
    );
  });

  it("separates several elements of the root by a line", () => {
    expect(usageSnippet([el("idg-badge", {}, "A"), el("idg-badge", {}, "B")])).toBe(
      "<idg-badge>A</idg-badge>\n<idg-badge>B</idg-badge>",
    );
  });

  it("escapes text and attribute values, so the snippet is what the element is", () => {
    expect(usageSnippet([el("idg-alert", { variant: 'a"&b' }, "1 < 2 & 3 > 2")])).toBe(
      '<idg-alert variant="a&quot;&amp;b">1 &lt; 2 &amp; 3 &gt; 2</idg-alert>',
    );
  });
});

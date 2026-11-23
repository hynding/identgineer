import { describe, expect, it } from "vitest";
import { sanitiseSvgLogo } from "./sanitise-svg-logo.ts";
import { findSanitisedSvgProblems } from "./svg-output-check.ts";

const result = sanitiseSvgLogo(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><linearGradient id="g"><stop offset="0" stop-color="red"/></linearGradient></defs><g id="x" transform="scale(2)"><path d="M0 0L1 1" fill="url(#g)"/></g><use href="#x"/><title>A &amp; B</title></svg>',
);
if (!result.ok) throw new Error("expected a logo");
const svg: string = result.svg;

// The checker is what proves the hostile corpus inert, so it must itself refuse anything outside
// the rules, whatever the sanitiser does.
describe("findSanitisedSvgProblems", () => {
  it("passes real output", () => {
    expect(findSanitisedSvgProblems(svg)).toEqual([]);
  });

  it.each([
    [
      "a script element",
      (text: string) => text.replace("<title>", "<script>alert(1)</script><title>"),
    ],
    ["a foreignObject", (text: string) => text.replace("<title>", "<foreignObject/><title>")],
    ["an event handler", (text: string) => text.replace("<path ", '<path onload="alert(1)" ')],
    ["an upper-case event handler", (text: string) => text.replace("<path ", '<path ONLOAD="x" ')],
    ["a style attribute", (text: string) => text.replace("<path ", '<path style="fill:red" ')],
    [
      "an attribute off the element's list",
      (text: string) => text.replace("<path ", '<path r="1" '),
    ],
    [
      "a namespaced attribute",
      (text: string) => text.replace("<use ", '<use xlink:href="#logo-0" '),
    ],
    [
      "an external href",
      (text: string) => text.replace('href="#logo-1"', 'href="https://x.invalid/#a"'),
    ],
    [
      "a javascript href",
      (text: string) => text.replace('href="#logo-1"', 'href="javascript:alert(1)"'),
    ],
    ["a data URL", (text: string) => text.replace('href="#logo-1"', 'href="data:x"')],
    ["a url() to another document", (text: string) => text.replace("url(#logo-0)", "url(x.svg#a)")],
    ["a url() with a scheme", (text: string) => text.replace("url(#logo-0)", "url(javascript:x)")],
    [
      "an expression()",
      (text: string) => text.replace('fill="url(#logo-0)"', 'fill="expression(x)"'),
    ],
    [
      "a reference to a missing id",
      (text: string) => text.replace('href="#logo-1"', 'href="#logo-9"'),
    ],
    ["a duplicate id", (text: string) => text.replace('<g id="logo-1"', '<g id="logo-0"')],
    ["a comment", (text: string) => text.replace("<title>", "<!-- x --><title>")],
    ["a CDATA section", (text: string) => text.replace("A &amp; B", "<![CDATA[x]]>")],
    ["a processing instruction", (text: string) => text.replace("<title>", "<?x y?><title>")],
    ["a named entity", (text: string) => text.replace("&amp;", "&nbsp;")],
    ["a bare ampersand", (text: string) => text.replace("&amp;", "&")],
    [
      "an ampersand in an attribute",
      (text: string) => text.replace('stop-color="red"', 'stop-color="&#x72;ed"'),
    ],
    ["text outside a title", (text: string) => text.replace("<use ", "x<use ")],
    ["markup inside a title", (text: string) => text.replace("A &amp; B", "<g/>")],
    ["a raw > in text", (text: string) => text.replace("A &amp; B", "A > B")],
    ["a nested svg", (text: string) => text.replace("<title>", '<svg viewBox="0 0 1 1"/><title>')],
    [
      "a second root",
      (text: string) => `${text}<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>`,
    ],
    [
      "another namespace",
      (text: string) => text.replace("http://www.w3.org/2000/svg", "http://www.w3.org/1999/xhtml"),
    ],
    ["a root without a view box", (text: string) => text.replace(/ viewBox="[^"]*"/, "")],
    ["an unclosed element", (text: string) => text.replace("</g>", "")],
    ["a mismatched end tag", (text: string) => text.replace("</g>", "</G>")],
    ["a single-quoted attribute", (text: string) => text.replace('d="M0 0L1 1"', "d='M0 0L1 1'")],
  ])("refuses %s", (_label, change) => {
    const altered = change(svg);
    expect(altered).not.toBe(svg);
    expect(findSanitisedSvgProblems(altered)).not.toEqual([]);
  });
});

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
    // Where each element may stand.
    [
      "a stop outside a gradient",
      (text: string) => text.replace("<title>", '<stop offset="0"/><title>'),
    ],
    [
      "a shape inside a gradient",
      (text: string) =>
        text.replace('stop-color="red"/>', 'stop-color="red"/><rect width="1" height="1"/>'),
    ],
    [
      "a group inside a shape",
      (text: string) => text.replace('fill="url(#logo-0)"/>', 'fill="url(#logo-0)"><g/></path>'),
    ],
    [
      "a title inside a stop",
      (text: string) =>
        text.replace('stop-color="red"/>', 'stop-color="red"><title>x</title></stop>'),
    ],
    // What each value may be.
    ["path data one number short", (text: string) => text.replace('d="M0 0L1 1"', 'd="M0 0L1"')],
    [
      "path data that starts with a line",
      (text: string) => text.replace('d="M0 0L1 1"', 'd="L1 1"'),
    ],
    ["an arc flag of 2", (text: string) => text.replace('d="M0 0L1 1"', 'd="M0 0A1 1 0 2 1 1 1"')],
    [
      "a number with a trailing zero",
      (text: string) => text.replace('d="M0 0L1 1"', 'd="M0 0L1.50 1"'),
    ],
    ["a number with an exponent", (text: string) => text.replace('d="M0 0L1 1"', 'd="M0 0L1e1 1"')],
    [
      "a colour as rgb()",
      (text: string) => text.replace('stop-color="red"', 'stop-color="rgb(1,2,3)"'),
    ],
    ["a short hex colour", (text: string) => text.replace('stop-color="red"', 'stop-color="#fff"')],
    [
      "an upper-case hex colour",
      (text: string) => text.replace('stop-color="red"', 'stop-color="#FFFFFF"'),
    ],
    ["an opacity over one", (text: string) => text.replace("<path ", '<path opacity="1.5" ')],
    ["a negative width", (text: string) => text.replace('width="10"', 'width="-10"')],
    [
      "a view box with no area",
      (text: string) => text.replace('viewBox="0 0 10 10"', 'viewBox="0 0 0 10"'),
    ],
    ["a rotation in degrees", (text: string) => text.replace("scale(2)", "rotate(45deg)")],
    ["a scale of three numbers", (text: string) => text.replace("scale(2)", "scale(1 2 3)")],
    [
      "an unknown keyword",
      (text: string) => text.replace("<path ", '<path stroke-linecap="pointy" '),
    ],
    ["a dash in percent", (text: string) => text.replace("<path ", '<path stroke-dasharray="1%" ')],
    ["a length in em", (text: string) => text.replace("<use ", '<use x="1em" ')],
    ["a stop offset over one", (text: string) => text.replace('offset="0"', 'offset="2"')],
    [
      "a mask type that is not one",
      (text: string) => text.replace("<title>", '<mask id="m" mask-type="both"/><title>'),
    ],
    [
      "an href that is a url()",
      (text: string) => text.replace('href="#logo-1"', 'href="url(#logo-1)"'),
    ],
    [
      "a paint reference by fragment",
      (text: string) => text.replace('fill="url(#logo-0)"', 'fill="#logo-0"'),
    ],
  ])("refuses %s", (_label, change) => {
    const altered = change(svg);
    expect(altered).not.toBe(svg);
    expect(findSanitisedSvgProblems(altered)).not.toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { sanitiseSvgLogo } from "./sanitise-svg-logo.ts";
import { SVG_LOGO_LIMITS } from "./svg-logo-limits.ts";
import {
  MAX_REPORTED_REMOVALS,
  type SvgLogoAccepted,
  type SvgLogoError,
  type SvgLogoRemoval,
} from "./svg-logo-result.ts";
import { findSanitisedSvgProblems } from "./svg-output-check.ts";

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const ROOT = `<svg ${NS} viewBox="0 0 10 10" width="10" height="10">`;
const EMPTY = `<svg ${NS} viewBox="0 0 10 10" width="10" height="10"/>`;

function svg(body: string, rootAttributes = 'viewBox="0 0 10 10"'): string {
  return `<svg ${NS} ${rootAttributes}>${body}</svg>`;
}

function accepted(input: string | Uint8Array, options?: { idPrefix: string }): SvgLogoAccepted {
  const result = sanitiseSvgLogo(input, options);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  expect(findSanitisedSvgProblems(result.svg)).toEqual([]);
  return result;
}

function output(body: string): string {
  return accepted(svg(body)).svg;
}

function refused(input: unknown): SvgLogoError {
  // Deliberately untyped input: the sanitiser is called from JavaScript too.
  const result = sanitiseSvgLogo(input as string);
  if (result.ok) throw new Error(`expected a refusal, got ${result.svg}`);
  expect(result.errors).toHaveLength(1);
  const [error] = result.errors;
  if (error === undefined) throw new Error("no error");
  return error;
}

function removals(body: string): readonly SvgLogoRemoval[] {
  return accepted(svg(body)).removed;
}

describe("sanitiseSvgLogo, output", () => {
  it("rebuilds a logo canonically: namespace, view box, size, normalised values", () => {
    expect(
      output(
        '<rect  x = "1.50"\n y="+2" width="3e0" height=\'4.000\' fill="#ABC" stroke="RED" stroke-width="0.5px"/>',
      ),
    ).toBe(
      `${ROOT}<rect x="1.5" y="2" width="3" height="4" fill="#aabbcc" stroke="red" stroke-width="0.5"/></svg>`,
    );
  });

  it("writes attributes in the allowlist's order, whatever order they came in", () => {
    expect(output('<circle fill="red" r="2" cy="1" cx="3" id="c"/>')).toBe(
      `${ROOT}<circle cx="3" cy="1" r="2" fill="red"/></svg>`,
    );
  });

  it("writes path data and transforms canonically", () => {
    expect(
      output(
        '<path d="M1,2L3-4.5e1zm.5.5 1 1a1 1 0 00 2 2" transform=" translate( 1 , 2 )scale(2) rotate(45 1 1)"/>',
      ),
    ).toBe(
      `${ROOT}<path d="M1 2L3 -45zm0.5 0.5 1 1a1 1 0 0 0 2 2" transform="translate(1 2) scale(2) rotate(45 1 1)"/></svg>`,
    );
  });

  it("rounds numbers to six decimals, half away from zero, exactly", () => {
    expect(output('<path d="M0.1234565 -0.1234565L999999.9999994 0.0000005"/>')).toBe(
      `${ROOT}<path d="M0.123457 -0.123457L999999.999999 0.000001"/></svg>`,
    );
  });

  it("reads colours as hex, rgb() and names, and writes them in one form", () => {
    expect(
      output(
        '<rect width="1" height="1" fill="rgb(255, 0, 128)" stroke="rgb(100%,50%,0%)" color="CurrentColor"/><stop/>',
      ),
    ).toContain('fill="#ff0080" stroke="#ff8000" color="currentColor"');
  });

  it("reads a style attribute's declarations into presentation attributes, which win over the attributes", () => {
    const result = accepted(
      svg(
        '<rect width="1" height="1" fill="blue" style="fill: #F00 ; stroke-width:2;font-family:Evil"/>',
      ),
    );
    expect(result.svg).toContain('<rect width="1" height="1" fill="#ff0000" stroke-width="2"/>');
    expect(result.removed).toEqual([
      expect.objectContaining({
        element: "rect",
        attribute: "style",
        property: "font-family",
        reason: "unsupported-attribute",
      }),
    ]);
  });

  it("escapes the text of titles and descriptions and keeps nothing else as text", () => {
    expect(output('<title>A &amp; B &lt;i&gt; "q"</title><g>stray text</g>')).toBe(
      `${ROOT}<title>A &amp; B &lt;i&gt; &quot;q&quot;</title><g/></svg>`,
    );
  });

  it("keeps a carriage return given as a reference, so the output reads back the same", () => {
    const first = output("<title>a&#13;b</title>");
    expect(first).toContain("<title>a&#13;b</title>");
    expect(accepted(first).svg).toBe(first);
  });

  it("renames referenced ids in document order and drops the rest", () => {
    expect(
      output(
        '<defs><linearGradient id="b"/><linearGradient id="unused"/><linearGradient id="a" href="#b"/></defs><rect id="r" width="1" height="1" fill="url(#a)"/>',
      ),
    ).toBe(
      `${ROOT}<defs><linearGradient id="logo-0"/><linearGradient/><linearGradient id="logo-1" href="#logo-0"/></defs><rect width="1" height="1" fill="url(#logo-1)"/></svg>`,
    );
  });

  it("takes an id prefix, so two logos in one page cannot collide", () => {
    const result = accepted(svg('<g id="g"/><use href="#g"/>'), { idPrefix: "mark-" });
    expect(result.svg).toContain('<g id="mark-0"/><use href="#mark-0"/>');
  });

  it.each(["", "Logo-", "logo", "-x-", "a", "x".repeat(24) + "-", "a b-", "a_b-"])(
    "refuses the id prefix %j",
    (idPrefix) => {
      const result = sanitiseSvgLogo(svg(""), { idPrefix });
      expect(result.ok || result.errors[0]?.code).toBe("invalid-option");
    },
  );

  it("writes xlink:href as href, and accepts any prefix bound to XLink", () => {
    expect(
      output('<g id="g"/><use xmlns:q="http://www.w3.org/1999/xlink" q:href="#g"/>'),
    ).toContain('<use href="#logo-0"/>');
  });

  it("reads an element without a namespace declaration as SVG, as inline SVG in HTML is read", () => {
    expect(accepted('<svg viewBox="0 0 1 1"><rect width="1" height="1"/></svg>').svg).toBe(
      `<svg ${NS} viewBox="0 0 1 1" width="1" height="1"><rect width="1" height="1"/></svg>`,
    );
  });

  it("reads prefixed SVG elements as SVG and writes them unprefixed", () => {
    expect(
      accepted(
        '<s:svg xmlns:s="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><s:path d="M0 0H1"/></s:svg>',
      ).svg,
    ).toBe(`<svg ${NS} viewBox="0 0 1 1" width="1" height="1"><path d="M0 0H1"/></svg>`);
  });

  it("is deterministic and a fixed point", () => {
    const input = svg('<g fill="red" id="x"><path d="M0 0 1 1"/></g><use href="#x" x="1"/>');
    const first = accepted(input);
    expect(accepted(input).svg).toBe(first.svg);
    const second = accepted(first.svg);
    expect(second.svg).toBe(first.svg);
    expect(second.removedCount).toBe(0);
  });

  it("accepts bytes as UTF-8, and a single leading byte order mark", () => {
    const bytes = new TextEncoder().encode(`\uFEFF${svg("<title>Café</title>")}`);
    expect(accepted(bytes).svg).toContain("<title>Café</title>");
    expect(accepted(`\uFEFF${svg("")}`).svg).toBe(EMPTY);
  });
});

describe("sanitiseSvgLogo, size", () => {
  it.each([
    ['viewBox="0 0 20 10"', 'viewBox="0 0 20 10" width="20" height="10"', [0, 0, 20, 10], 20, 10],
    [
      'width="40" height="20"',
      'viewBox="0 0 40 20" width="40" height="20"',
      [0, 0, 40, 20],
      40,
      20,
    ],
    [
      'viewBox="-5 -5 20 10" width="40"',
      'viewBox="-5 -5 20 10" width="40" height="20"',
      [-5, -5, 20, 10],
      40,
      20,
    ],
    [
      'viewBox="0 0 20 10" height="5"',
      'viewBox="0 0 20 10" width="10" height="5"',
      [0, 0, 20, 10],
      10,
      5,
    ],
    [
      'width="1in" height="72pt"',
      'viewBox="0 0 96 96" width="96" height="96"',
      [0, 0, 96, 96],
      96,
      96,
    ],
    [
      'viewBox="0 0 3 1" width="100%" height="1em"',
      'viewBox="0 0 3 1" width="3" height="1"',
      [0, 0, 3, 1],
      3,
      1,
    ],
  ] as const)("reads %s as %s", (root, written, viewBox, width, height) => {
    const result = accepted(svg("", root));
    expect(result.svg).toBe(`<svg ${NS} ${written}/>`);
    expect(result.viewBox).toEqual(viewBox);
    expect(result.width).toBe(width);
    expect(result.height).toBe(height);
  });

  it.each([
    ["no size at all", ""],
    ["only a width", 'width="10"'],
    ["relative units only", 'width="50%" height="2em"'],
    ["a view box with no area", 'viewBox="0 0 0 10"'],
    ["a negative view box", 'viewBox="0 0 -1 10"'],
  ])("refuses a root with %s", (_label, root) => {
    expect(refused(svg("", root)).code).toBe("missing-size");
  });
});

describe("sanitiseSvgLogo, what is dropped and why", () => {
  it.each([
    ["<script>alert(1)</script>", "script", "active-content"],
    ["<foreignObject/>", "foreignObject", "active-content"],
    ["<image href='x.png'/>", "image", "active-content"],
    ["<a href='https://example.com'/>", "a", "active-content"],
    ["<animate/>", "animate", "active-content"],
    ["<set attributeName='onload'/>", "set", "active-content"],
    ["<style>rect{}</style>", "style", "styling"],
    ["<metadata/>", "metadata", "editor-metadata"],
    ["<text>Acme</text>", "text", "text"],
    ["<filter/>", "filter", "filter"],
    ["<feImage/>", "feImage", "active-content"],
    ["<feGaussianBlur/>", "feGaussianBlur", "filter"],
    ["<pattern/>", "pattern", "unsupported-element"],
    ["<symbol/>", "symbol", "unsupported-element"],
    ["<svg viewBox='0 0 1 1'/>", "svg", "misplaced"],
    ["<g><stop/></g>", "stop", "misplaced"],
    ["<linearGradient><rect/></linearGradient>", "rect", "misplaced"],
    ["<html:p xmlns:html='http://www.w3.org/1999/xhtml'/>", "html:p", "foreign-namespace"],
    ["<i:pgf xmlns:i='http://ns.adobe.com/AdobeIllustrator/10.0/'/>", "i:pgf", "editor-metadata"],
  ])("drops %s", (body, element, reason) => {
    expect(removals(body)).toEqual([expect.objectContaining({ element, reason })]);
  });

  it.each([
    ['onload="alert(1)"', "onload", "event-handler"],
    ['ONCLICK="alert(1)"', "ONCLICK", "event-handler"],
    ['class="c"', "class", "styling"],
    ['filter="url(#f)"', "filter", "unsupported-attribute"],
    ['data-x="1"', "data-x", "unsupported-attribute"],
    ['xml:space="preserve"', "xml:space", "unsupported-attribute"],
    ['xml:base="https://example.com/"', "xml:base", "external-reference"],
    ['fill="url(https://example.com/#g)"', "fill", "external-reference"],
    ['fill="javascript:alert(1)"', "fill", "external-reference"],
    ['fill="expression(alert(1))"', "fill", "active-content"],
    ['fill="#12345"', "fill", "invalid-value"],
    ['fill="hsl(0 0% 0%)"', "fill", "invalid-value"],
    ['transform="rotate(45deg)"', "transform", "invalid-value"],
    ['width="-1"', "width", "invalid-value"],
    ['id="1abc"', "id", "invalid-value"],
  ])("drops the attribute %s", (attribute, name, reason) => {
    expect(removals(`<rect height="1" ${attribute}/>`)).toEqual([
      expect.objectContaining({ element: "rect", attribute: name, reason }),
    ]);
  });

  it.each([
    ['href="https://example.com/a.svg#x"', "external-reference"],
    ['href="data:image/svg+xml,x"', "external-reference"],
    ['href="#missing"', "dangling-reference"],
  ])("drops a use whose %s", (attribute, reason) => {
    const dropped = removals(`<use ${attribute}/>`);
    expect(dropped.at(-1)).toEqual(
      expect.objectContaining({ element: "use", reason: "dangling-reference" }),
    );
    expect(dropped[0]).toEqual(expect.objectContaining({ reason }));
  });

  it("paints nothing for a paint reference that cannot be found, rather than black", () => {
    expect(
      output('<rect width="1" height="1" fill="url(#nowhere)" stroke="url(#nowhere)"/>'),
    ).toContain('fill="none" stroke="none"');
  });

  it("drops a whole subtree with its element, never lifting children out", () => {
    expect(output('<a href="#x"><rect width="1" height="1"/></a><foo><circle r="1"/></foo>')).toBe(
      EMPTY,
    );
  });

  it("locates each removal in the input", () => {
    expect(removals('\n  <rect height="1"\n    onload="x"/>')).toEqual([
      { element: "rect", attribute: "onload", reason: "event-handler", line: 3, column: 5 },
    ]);
  });

  it(`reports the first ${String(MAX_REPORTED_REMOVALS)} removals and counts them all`, () => {
    const result = accepted(svg("<script/>".repeat(250)));
    expect(result.removed).toHaveLength(MAX_REPORTED_REMOVALS);
    expect(result.removedCount).toBe(250);
  });

  it("never repeats a value in a removal, only names", () => {
    const result = accepted(svg('<rect height="1" fill="&lt;script&gt;alert(1)"/>'));
    expect(JSON.stringify(result.removed)).not.toContain("alert");
  });
});

describe("sanitiseSvgLogo, refusals", () => {
  it.each([
    ["a number", 42],
    ["null", null],
    ["an object", { svg: "<svg/>" }],
    ["an array of bytes", [60, 115]],
  ])("refuses %s as the wrong type", (_label, input) => {
    expect(refused(input).code).toBe("wrong-type");
  });

  it("refuses an input over the byte limit before reading it", () => {
    const big = svg(`<title>${"a".repeat(SVG_LOGO_LIMITS.inputBytes)}</title>`);
    expect(refused(big)).toEqual({ code: "too-large", message: expect.any(String) as string });
    expect(refused(new Uint8Array(SVG_LOGO_LIMITS.inputBytes + 1)).code).toBe("too-large");
  });

  it("counts the limit in UTF-8 bytes, not UTF-16 units", () => {
    const filler = "é".repeat(Math.ceil(SVG_LOGO_LIMITS.inputBytes / 2));
    expect(refused(svg(`<title>${filler}</title>`)).code).toBe("too-large");
  });

  it("locates a refusal by line and column", () => {
    expect(refused(`${svg("")}\n\n   <x/>`)).toEqual({
      code: "malformed",
      message: "the SVG has content after the root element",
      line: 3,
      column: 4,
    });
  });

  it("never repeats the input in a message", () => {
    for (const input of [
      svg("<title>&evil;</title>"),
      svg("<rect onload=alert(1)/>"),
      `<!DOCTYPE x [<!ENTITY e "alert(1)">]>${svg("")}`,
    ]) {
      const error = refused(input);
      expect(error.message).not.toContain("alert");
      expect(error.message).not.toContain("evil");
    }
  });

  it.each([
    ["an unpaired high surrogate", svg(`<title>\uD800</title>`)],
    ["an unpaired low surrogate", svg(`<title>\uDC00</title>`)],
    ["a NUL", svg("<title>\0</title>")],
    ["a vertical tab", svg("<title>\v</title>")],
    ["DEL", svg("<title>\u007f</title>")],
    ["a C1 control", svg("<title>\u0085</title>")],
    ["a right-to-left override", svg("<title>\u202E</title>")],
    ["a first-strong isolate", svg("<title>⁨</title>")],
    ["a byte order mark inside", svg("<title>\uFEFF</title>")],
    ["U+FFFE", svg("<title>￾</title>")],
  ])("refuses %s anywhere", (_label, input) => {
    expect(refused(input).code).toBe("invalid-character");
  });

  it.each([
    ['<?xml version="1.0" encoding="UTF-8"?>', true],
    ["<?xml version='1.0' encoding='utf-8' standalone='yes'?>", true],
    ['<?xml version="1.0"?>', true],
    ['<?xml version="1.0" standalone="no" encoding="UTF-8"?>', false],
    ['<?xml encoding="UTF-8"?>', false],
    ['<?xml version="1.0" version="1.0"?>', false],
    ['<?xml version="1.0" foo="bar"?>', false],
    ['<?xml version="1.0" encoding="UTF-16"?>', false],
    ['<?xml version="1.0"encoding="UTF-8"?>', false],
    ["<?xml ?>", false],
  ])("reads the declaration %s: %s", (declaration, ok) => {
    expect(sanitiseSvgLogo(`${declaration}\n${svg("")}`).ok).toBe(ok);
  });

  it.each([
    [
      "an element",
      svg("<g>".repeat(SVG_LOGO_LIMITS.depth) + "</g>".repeat(SVG_LOGO_LIMITS.depth)),
      "too-deep",
    ],
    ["elements", svg("<g/>".repeat(SVG_LOGO_LIMITS.elements)), "too-many-elements"],
    [
      "attributes",
      svg(
        `<g ${Array.from({ length: SVG_LOGO_LIMITS.attributesPerElement + 1 }, (_, index) => `a${String(index)}="1"`).join(" ")}/>`,
      ),
      "too-many-attributes",
    ],
    [
      "an attribute value",
      svg(`<g fill="${"a".repeat(SVG_LOGO_LIMITS.attributeValueLength + 1)}"/>`),
      "too-long",
    ],
    [
      "path data",
      svg(`<path d="M0 0${" 1 1".repeat(SVG_LOGO_LIMITS.pathDataLength / 4)}"/>`),
      "too-long",
    ],
    ["text", svg(`<title>${"a".repeat(SVG_LOGO_LIMITS.textLength + 1)}</title>`), "too-long"],
    [
      "title text split across CDATA",
      svg(`<title>${"a".repeat(SVG_LOGO_LIMITS.textLength)}<![CDATA[b]]></title>`),
      "too-long",
    ],
    ["a name", svg(`<${"g".repeat(SVG_LOGO_LIMITS.nameLength + 1)}/>`), "too-long"],
    [
      "a number",
      svg(`<rect width="1${"0".repeat(SVG_LOGO_LIMITS.integerDigits)}" height="1"/>`),
      "number-out-of-range",
    ],
    [
      "a number's length",
      svg(`<rect width="0.${"1".repeat(SVG_LOGO_LIMITS.numberLength)}" height="1"/>`),
      "number-out-of-range",
    ],
    [
      "stops",
      svg(
        `<linearGradient>${"<stop/>".repeat(SVG_LOGO_LIMITS.gradientStops + 1)}</linearGradient>`,
      ),
      "too-many-stops",
    ],
    [
      "ids",
      svg(
        Array.from(
          { length: SVG_LOGO_LIMITS.ids + 1 },
          (_, index) => `<g id="g${String(index)}"/>`,
        ).join(""),
      ),
      "too-many-ids",
    ],
  ])("refuses a document over the limit on %s", (_label, input, code) => {
    expect(refused(input).code).toBe(code);
  });

  it("accepts a document at each limit", () => {
    for (const input of [
      svg("<g>".repeat(SVG_LOGO_LIMITS.depth - 1) + "</g>".repeat(SVG_LOGO_LIMITS.depth - 1)),
      svg("<g/>".repeat(SVG_LOGO_LIMITS.elements - 1)),
      svg(`<title>${"a".repeat(SVG_LOGO_LIMITS.textLength)}</title>`),
      svg(`<rect width="999999.999999" height="1"/>`),
      svg(`<linearGradient>${"<stop/>".repeat(SVG_LOGO_LIMITS.gradientStops)}</linearGradient>`),
    ]) {
      accepted(input);
    }
  });

  it("counts every drawn copy, so use cannot multiply the work past the limit", () => {
    const copies = (count: number): string =>
      svg(
        `<defs><g id="p">${'<path d="M0 0H1"/>'.repeat(9)}</g></defs>${'<use href="#p"/>'.repeat(count)}`,
      );
    // Each use draws itself and the group of ten; the root, defs and group draw twelve.
    const fits = Math.floor((SVG_LOGO_LIMITS.renderedElements - 12) / 11);
    accepted(copies(fits));
    expect(refused(copies(fits + 1)).code).toBe("expansion-too-large");
  });

  it("follows a chain of references up to the depth limit", () => {
    const chain = (length: number): string =>
      svg(
        Array.from(
          { length },
          (_, index) => `<use id="u${String(index)}" href="#u${String(index + 1)}"/>`,
        ).join("") + `<rect id="u${String(length)}" width="1" height="1"/>`,
      );
    accepted(chain(SVG_LOGO_LIMITS.referenceDepth));
    expect(refused(chain(SVG_LOGO_LIMITS.referenceDepth + 1)).code).toBe("reference-too-deep");
  });
});

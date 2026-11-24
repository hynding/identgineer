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

  it.each([
    ["a length", '<rect width="5." height="5"/>', "width"],
    ["a length with an exponent", '<rect width="5.e0" height="5"/>', "width"],
    ["a plain number", '<rect width="5" height="5" opacity="1."/>', "opacity"],
    ["a transform", '<rect width="5" height="5" transform="translate(5.)"/>', "transform"],
    ["path data", '<path d="M0 0H5.V5H0Z"/>', "d"],
    ["points", '<polygon points="0,0 5.,0 5,5"/>', "points"],
    [
      "a dash array",
      '<path d="M0 0H5" stroke="#000" stroke-dasharray="1. 2"/>',
      "stroke-dasharray",
    ],
  ])("drops a number ending in a point, which Chromium does not take, in %s", (_, body, name) => {
    const result = accepted(svg(body));
    expect(result.removed).toEqual([
      expect.objectContaining({ attribute: name, reason: "invalid-value" }),
    ]);
  });

  it("drops a number ending in a point in a view box", () => {
    const result = accepted(
      svg('<rect width="5" height="5"/>', 'viewBox="0. 0 10 10" width="10" height="10"'),
    );
    expect(result.removed).toEqual([
      expect.objectContaining({ attribute: "viewBox", reason: "invalid-value" }),
    ]);
  });

  it("refuses a root width of a number ending in a point, which Chromium reads as CSS", () => {
    expect(
      refused(svg('<rect width="5" height="5"/>', 'viewBox="0 0 10 10" width="5." height="10"'))
        .code,
    ).toBe("unsupported-feature");
  });

  it.each([
    ["a comma before a command's first number", "M,0 0L5 5"],
    ["two commas between numbers", "M0,,0L5 5"],
  ])("drops path data with %s, which Chromium does not take", (_, d) => {
    expect(accepted(svg(`<path d="${d}"/>`)).removed).toEqual([
      expect.objectContaining({ attribute: "d", reason: "invalid-value" }),
    ]);
  });

  it("keeps path data with a comma before a command, which Chromium takes", () => {
    expect(output('<path d="M0 0,L5 5,5 0, Z"/>')).toBe(`${ROOT}<path d="M0 0L5 5 5 0Z"/></svg>`);
  });

  it.each([",1 2", "1,,2", "1 2,"])(
    "drops a dash array of %j, which Chromium does not take",
    (dashes) => {
      expect(
        accepted(svg(`<path d="M0 0H5" stroke="#000" stroke-dasharray="${dashes}"/>`)).removed,
      ).toEqual([
        expect.objectContaining({ attribute: "stroke-dasharray", reason: "invalid-value" }),
      ]);
    },
  );

  it.each([
    ["zero", 'width="0" height="10"'],
    ["minus zero", 'width="10" height="-0"'],
    ["a negative width", 'width="-5" height="10"'],
    ["a negative length in millimetres", 'width="-1mm" height="10"'],
  ])("refuses a root whose size is %s, which Chromium draws at no size", (_, size) => {
    expect(refused(svg('<rect width="5" height="5"/>', `viewBox="0 0 10 10" ${size}`)).code).toBe(
      "missing-size",
    );
  });

  it("keeps a width of one pixel written in millimetres, to the floating point", () => {
    expect(accepted(svg("", 'viewBox="0 0 1 1" width="0.264583333333mm"')).width).toBe(1);
  });

  it("refuses a view box under a pixel with no size, advising a larger one", () => {
    expect(refused(svg("", 'viewBox="0 0 0.5 0.5"')).message).toContain("larger view box");
  });

  // Spellings Chromium rejects or reads otherwise, each able to show what the original hid: each is
  // dropped and reported, never read leniently into a valid value.
  it.each([
    [
      "a leading comma in a transform",
      '<rect width="9" height="9" transform=",translate(-1000)"/>',
      "transform",
    ],
    [
      "a trailing comma in a transform",
      '<rect width="9" height="9" transform="translate(-1000),"/>',
      "transform",
    ],
    [
      "two commas in a transform",
      '<rect width="9" height="9" transform="scale(1),,translate(-1000)"/>',
      "transform",
    ],
    [
      "a space in a gradient's units",
      '<linearGradient gradientUnits=" userSpaceOnUse"/>',
      "gradientUnits",
    ],
    ["a space in a spread method", '<linearGradient spreadMethod="repeat "/>', "spreadMethod"],
    [
      "a space in a clip path's units",
      '<clipPath clipPathUnits=" objectBoundingBox"><rect width="1" height="1"/></clipPath>',
      "clipPathUnits",
    ],
    ["a space in a mask's units", '<mask maskUnits="userSpaceOnUse "/>', "maskUnits"],
    [
      "a space in a mask's content units",
      '<mask maskContentUnits="objectBoundingBox "/>',
      "maskContentUnits",
    ],
    ["zero with a large exponent in path data", '<path d="M0 0H9V9H0e39Z"/>', "d"],
    ["zero with a large exponent in points", '<polygon points="0 0 9 0 9 9 0e39 9"/>', "points"],
    [
      "zero with a large exponent in a transform",
      '<rect width="9" height="9" transform="translate(-1000 0e39)"/>',
      "transform",
    ],
    ["zero with a large exponent in a length", '<rect width="9" height="0.0e100"/>', "height"],
    [
      "an rgb colour separated by commas and spaces",
      '<rect width="9" height="9" fill="rgb(255,0 0)"/>',
      "fill",
    ],
    [
      "a use reference after white space",
      '<defs><rect id="a" width="9" height="9"/></defs><use href=" #a"/>',
      "href",
    ],
    [
      "a gradient reference after white space",
      '<linearGradient id="a"/><linearGradient id="b" href="#a "/>',
      "href",
    ],
  ])("drops %s, and reports it", (_, body, name) => {
    const result = accepted(svg(body));
    expect(result.removed).toContainEqual(
      expect.objectContaining({ attribute: name, reason: "invalid-value" }),
    );
  });

  // A declaration list is split as CSS splits it: a `;` inside a comment, string or bracket ends
  // nothing. A declaration holding any of those is dropped on its own, and the rest is kept.
  it.each([
    ["a comment", "opacity:0.5/*;display:inline;*/", "opacity"],
    ["a string", "font-family:';display:inline;'", "font-family"],
    ["a double-quoted string", "font-family:&quot;;display:inline;&quot;", "font-family"],
    ["square brackets", "foo:[;display:inline;]", "foo"],
    ["parentheses", "foo:(;display:inline;)", "foo"],
    ["a function", "foo:y(;display:inline;)", "foo"],
    ["an unquoted url", "foo:url(a;display:inline;)", "foo"],
    ["braces inside brackets", "foo:({;display:inline;});", "foo"],
  ])("drops only the declaration that holds %s, and reports it", (_, style, property) => {
    const result = accepted(svg(`<rect width="9" height="9" display="none" style="${style}"/>`));
    expect(result.svg).toBe(`${ROOT}<rect width="9" height="9" display="none"/></svg>`);
    expect(result.removed).toEqual([expect.objectContaining({ attribute: "style", property })]);
  });

  it.each([
    ["a comment before a name", "/* brand */fill:red", "red"],
    ["a comment between declarations", "fill:blue;/* stroke:#000; */fill:red", "red"],
    ["a comment before the colon", "fill /**/ :red", "red"],
    ["a quoted font before it", "font-family:'A;B', Arial;fill:red", "red"],
    ["a bracket before it", "-x-y:(a;[b;{c}]);fill:red", "red"],
    ["a less-than sign before it", "foo:&lt;;fill:red", "red"],
  ])("keeps a declaration after %s", (_, style, fill) => {
    const result = accepted(svg(`<rect width="9" height="9" style="${style}"/>`));
    expect(result.svg).toBe(`${ROOT}<rect width="9" height="9" fill="${fill}"/></svg>`);
  });

  it.each([
    ["a comment inside the value", "fill:/**/red"],
    ["a comment after the value", "fill:red/**/"],
    ["a quoted value", "fill:'red'"],
  ])("drops a declaration with %s, which is not normalised", (_, style) => {
    const result = accepted(svg(`<rect width="9" height="9" style="${style}"/>`));
    expect(result.svg).toBe(`${ROOT}<rect width="9" height="9"/></svg>`);
    expect(result.removed).toEqual([
      expect.objectContaining({ attribute: "style", property: "fill" }),
    ]);
  });

  // Where CSS error recovery decides what follows, the split is not certain: the whole style goes,
  // reported, and nothing is put in its place.
  it.each([
    ["an unclosed comment", "opacity:1/*;display:inline"],
    ["an unclosed string", "font-family:'a;display:inline"],
    ["an unclosed bracket", "x:(;display:inline"],
    ["a string across a line", "font-family:'a&#10;b';display:inline"],
    ["an escaped semicolon", String.raw`opacity:1\;display:inline`],
    ["an escape anywhere", String.raw`fill:red;x:\31`],
    ["a stray closing bracket", "x:a);display:inline"],
    ["a mismatched bracket", "x:(];display:inline"],
    ["braces", "x:{;display:inline;}"],
    ["a block after a name", "x{a:b}display:inline"],
    ["an at-sign", "@x;display:inline"],
    ["an unquoted url holding a bracket", "x:url(#a(b);display:inline)"],
    ["an unquoted url holding a space", "x:url(#a b;display:inline)"],
    ["a declaration without a colon", "display;opacity:1"],
    ["a name that is not one word", "display inline:x;opacity:1"],
  ])("drops a whole style holding %s, and reports it, putting nothing in its place", (_, style) => {
    const result = accepted(svg(`<rect width="9" height="9" style="${style}"/>`));
    expect(result.svg).toBe(`${ROOT}<rect width="9" height="9"/></svg>`);
    expect(result.removed).toEqual([
      expect.objectContaining({ attribute: "style", reason: "invalid-value" }),
    ]);
  });

  it.each([
    ["the root", svg('<rect width="9" height="9"/>', 'viewBox="0 0 10 10" style="opacity:0/*"')],
    [
      "a clip path",
      svg('<clipPath id="c" style="clip-rule:evenodd/*"><rect width="9" height="9"/></clipPath>'),
    ],
    ["a mask", svg('<mask id="m" style="mask-type:alpha/*"><rect width="9" height="9"/></mask>')],
  ])("drops such a style on %s, and keeps the logo", (_, input) => {
    expect(accepted(input).removed).toEqual([
      expect.objectContaining({ attribute: "style", reason: "invalid-value" }),
    ]);
  });

  // Among the declarations of one property, the last marked important wins, else the last.
  it.each([
    ["the last of two", "fill:red;fill:blue", "blue"],
    ["an important one before a plain one", "fill:red !important;fill:blue", "red"],
    ["the last of two important ones", "fill:red!important;fill:blue ! IMPORTANT", "blue"],
    ["the style over the attribute", "fill:blue", "blue"],
    ["an important one alone", "fill:blue !important", "blue"],
    ["a plain one after a dropped plain one", "fill:/**/red;fill:blue", "blue"],
    ["an important one before a dropped plain one", "fill:blue !important;fill:reddish", "blue"],
    [
      "an important one after a dropped important one",
      "fill:hsl(0,1%,1%)!important;fill:blue!important",
      "blue",
    ],
  ])("keeps %s", (_, style, fill) => {
    expect(output(`<rect width="9" height="9" fill="green" style="${style}"/>`)).toBe(
      `${ROOT}<rect width="9" height="9" fill="${fill}"/></svg>`,
    );
  });

  // Chromium reads these style properties as the geometry of the element (checked in the browser
  // tests), which the sanitiser keeps only as attributes: the element goes with the declaration.
  it.each([
    ["width on a rectangle", '<rect x="2" width="6" height="6" style="width:0"/>', "rect", "width"],
    ["x on a rectangle", '<rect width="6" height="6" style="x:-1000px"/>', "rect", "x"],
    ["rx on a rectangle", '<rect width="6" height="6" style="rx:3px"/>', "rect", "rx"],
    ["r on a circle", '<circle cx="5" cy="5" r="3" style="r:0"/>', "circle", "r"],
    ["cy on an ellipse", '<ellipse rx="3" ry="2" style="cy:5px"/>', "ellipse", "cy"],
    ["d on a path", '<path d="M0 0H9V9Z" style="d:path(&quot;M0 0&quot;)"/>', "path", "d"],
    [
      "y on a use",
      '<defs><rect id="r" width="2" height="2"/></defs><use href="#r" style="y:5px"/>',
      "use",
      "y",
    ],
    [
      "a transform on a group",
      '<g style="transform:scale(0)"><rect width="9" height="9"/></g>',
      "g",
      "transform",
    ],
    ["a rotation on a line", '<line x2="9" stroke="#000" style="rotate:45deg"/>', "line", "rotate"],
    ["a scale on a polygon", '<polygon points="0 0 9 0 9 9" style="scale:2"/>', "polygon", "scale"],
    ["a translation on a path", '<path d="M0 0H9V9Z" style="translate:5px"/>', "path", "translate"],
    [
      "an offset on a rectangle",
      '<rect width="6" height="6" style="offset-distance:5px"/>',
      "rect",
      "offset-distance",
    ],
    [
      "a transform origin beside a transform",
      '<rect width="6" height="6" transform="rotate(20)" style="transform-origin:center"/>',
      "rect",
      "transform-origin",
    ],
    [
      "a prefixed transform",
      '<rect width="6" height="6" style="-webkit-transform:translate(0px,5px)"/>',
      "rect",
      "-webkit-transform",
    ],
    [
      "a prefixed transform origin beside a transform",
      '<rect width="6" height="6" transform="rotate(180)" style="-webkit-transform-origin:5px 5px"/>',
      "rect",
      "-webkit-transform-origin",
    ],
    [
      "one axis of a prefixed transform origin",
      '<g transform="rotate(20)" style="-webkit-transform-origin-x:5px"><rect width="6" height="6"/></g>',
      "g",
      "-webkit-transform-origin-x",
    ],
    [
      "the offset shorthand",
      '<rect width="6" height="6" style="offset:path(&quot;M0 5h1&quot;) 0%"/>',
      "rect",
      "offset",
    ],
    [
      "a logical width",
      '<rect width="6" height="6" style="inline-size:1px"/>',
      "rect",
      "inline-size",
    ],
    [
      "a prefixed logical height",
      '<rect width="6" height="6" style="-webkit-logical-height:1px"/>',
      "rect",
      "-webkit-logical-height",
    ],
    [
      "content visibility on a use",
      '<rect id="r" width="2" height="2"/><use href="#r" style="content-visibility:hidden"/>',
      "use",
      "content-visibility",
    ],
    [
      "a transform of none over a transform",
      '<rect width="6" height="6" transform="rotate(20)" style="transform:none"/>',
      "rect",
      "transform",
    ],
  ])("drops an element whose style sets %s, and reports both", (_, body, element, property) => {
    const result = accepted(svg(`${body}<rect width="1" height="1"/>`));
    expect(result.svg).toBe(`${ROOT}<rect width="1" height="1"/></svg>`);
    expect(result.removed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ element, attribute: "style", property }),
        { element, reason: "unsupported-attribute", line: 1, column: expect.any(Number) as number },
      ]),
    );
  });

  it.each([["display:none"], ["content-visibility:hidden"], ["-webkit-transform:rotate(90deg)"]])(
    "drops a gradient whose style sets %s, so what it painted paints nothing",
    (style) => {
      expect(
        output(
          `<linearGradient id="g" style="${style}"><stop offset="0"/></linearGradient><rect width="9" height="9" fill="url(#g)"/>`,
        ),
      ).toBe(`${ROOT}<rect width="9" height="9" fill="none"/></svg>`);
    },
  );

  it("keeps a root whose style sets a margin of nothing", () => {
    expect(
      accepted(svg('<rect width="9" height="9"/>', 'viewBox="0 0 10 10" style="margin:0"')).svg,
    ).toBe(`${ROOT}<rect width="9" height="9"/></svg>`);
  });

  it("drops a gradient whose style sets a transform, so what it painted paints nothing", () => {
    expect(
      output(
        '<linearGradient id="g" style="transform:rotate(90deg)"><stop offset="0"/></linearGradient><rect width="9" height="9" fill="url(#g)"/>',
      ),
    ).toBe(`${ROOT}<rect width="9" height="9" fill="none"/></svg>`);
  });

  it.each([
    [
      "a transform origin with no transform",
      '<rect width="6" height="6" style="transform-origin:center"/>',
    ],
    ["a width on a circle", '<circle cx="5" cy="5" r="3" style="width:0"/>'],
    [
      "a transform of none, with no transform to undo",
      '<rect width="6" height="6" style="transform:none"/>',
    ],
    ["a translation of none", '<rect width="6" height="6" style="translate:none"/>'],
    ["an x on a group", '<g style="x:5px"><rect width="6" height="6"/></g>'],
  ])(
    "keeps an element whose style sets %s, which Chromium does not read as its geometry",
    (_, body) => {
      const result = accepted(svg(body));
      expect(result.removed).toHaveLength(1);
      expect(result.svg).not.toBe(EMPTY);
    },
  );

  it.each([
    [
      "a root sized in its style",
      svg('<rect width="9" height="9"/>', 'viewBox="0 0 10 10" style="width:2px"'),
    ],
    [
      "a root transformed in its style",
      svg('<rect width="9" height="9"/>', 'viewBox="0 0 10 10" style="rotate:5deg"'),
    ],
    [
      "a root moved by a prefixed transform",
      svg(
        '<rect width="9" height="9"/>',
        'viewBox="0 0 10 10" style="-webkit-transform:translate(5px,0px)"',
      ),
    ],
    [
      "a root moved by its margin",
      svg('<rect width="9" height="9"/>', 'viewBox="0 0 10 10" style="margin-left:5px"'),
    ],
    [
      "a root moved by a prefixed logical padding",
      svg('<rect width="9" height="9"/>', 'viewBox="0 0 10 10" style="-webkit-padding-start:5px"'),
    ],
    [
      "a clip path moved by a prefixed transform",
      svg(
        '<clipPath id="c" style="-webkit-transform:translate(0px,5px)"><rect width="5" height="5"/></clipPath><rect width="9" height="9" clip-path="url(#c)"/>',
      ),
    ],
    [
      "a clip path clipped by a shape in its style",
      svg(
        '<clipPath id="c" style="clip-path:circle(1px)"><rect width="5" height="5"/></clipPath><rect width="9" height="9" clip-path="url(#c)"/>',
      ),
    ],
    [
      "a clip path transformed in its style",
      svg(
        '<clipPath id="c" style="transform:scale(2)"><rect width="5" height="5"/></clipPath><rect width="9" height="9" clip-path="url(#c)"/>',
      ),
    ],
  ])("refuses %s, which dropping would show unclipped or at another size", (_, input) => {
    expect(refused(input).code).toBe("unsupported-feature");
  });

  it.each([
    ["-webkit-clip-path", "clip-path", 'clip-path="url(#c)"'],
    ["-webkit-mask", "mask", 'mask="url(#m)"'],
    ["-webkit-mask-image", "mask", 'mask="url(#m)"'],
    ["mask-image", "mask", 'mask="url(#m)"'],
    ["mask-mode", "mask", 'mask="url(#m)"'],
  ])(
    "takes %s for %s, which it stands for, and drops that attribute with it",
    (alias, name, attribute) => {
      const result = accepted(
        svg(
          `<clipPath id="c"><rect width="5" height="5"/></clipPath><mask id="m"><rect width="5" height="5" fill="#fff"/></mask>` +
            `<rect width="9" height="9" ${attribute} style="${alias}:none"/>`,
        ),
      );
      expect(result.svg).toBe(`${ROOT}<rect width="9" height="9"/></svg>`);
      expect(result.removed).toEqual([
        expect.objectContaining({ attribute: "style", property: alias }),
        expect.objectContaining({ attribute: name }),
      ]);
    },
  );

  // Whether CSS takes a value the sanitiser cannot read decides which declaration wins, and
  // whether the attribute does: so none of them is kept.
  it.each([
    ["a colour CSS reads and the sanitiser does not", "fill:hsl(0, 100%, 50%)"],
    ["a value CSS does not read", "fill:reddish"],
    ["a dropped value after a kept one", "fill:red;fill:hsl(0, 100%, 50%)"],
    ["a dropped important value", "fill:red;fill:reddish !important"],
  ])("drops the property, attribute and all, for %s, and reports both", (_, style) => {
    const result = accepted(svg(`<rect width="9" height="9" fill="green" style="${style}"/>`));
    expect(result.svg).toBe(`${ROOT}<rect width="9" height="9"/></svg>`);
    expect(result.removed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ attribute: "style", property: "fill" }),
        expect.objectContaining({ attribute: "fill" }),
      ]),
    );
  });

  it("drops a view box whose zero has a large exponent, and reports it", () => {
    const result = accepted(
      svg('<rect width="9" height="9"/>', 'viewBox="0e39 0 10 10" width="10" height="10"'),
    );
    expect(result.removed).toContainEqual(
      expect.objectContaining({ attribute: "viewBox", reason: "invalid-value" }),
    );
  });

  it.each([
    ["zero ems", 'width="0em"'],
    ["minus one em", 'width="-1em"'],
    ["zero quarter-millimetres", 'width="0Q"'],
    ["zero viewport widths", 'width="0vw"'],
    ["zero with a large exponent", 'width="0e39"'],
    ["a number too small for Chromium", 'width="1e-39"'],
    ["zero with a large negative exponent", 'width="0e-39"'],
    ["minus zero", 'width="-0"'],
  ])("refuses a root whose size is %s, which Chromium draws at no size", (_, size) => {
    expect(
      refused(svg('<rect width="5" height="5"/>', `viewBox="0 0 10 10" ${size} height="10"`)).code,
    ).toBe("missing-size");
  });

  it.each([
    ["in a unit of the viewport", 'width="1vw"'],
    ["in ems", 'width="2em"'],
    ["in quarter-millimetres", 'width="4Q"'],
    ["a calculation", 'width="calc(0px)"'],
    ["a calculation of no size", 'height="max(0px,0px)"'],
    ["a variable", 'width="var(--x)"'],
    ["an environment value", 'width="env(x)"'],
    ["an attribute value", 'width="attr(x)"'],
    ["auto", 'width="auto"'],
    ["a keyword of CSS", 'width="inherit"'],
    ["a number and a unit apart", 'width="10 px"'],
  ])("refuses a root sized %s, which Chromium reads as CSS the sanitiser does not", (_, size) => {
    const others = size.startsWith("height") ? 'width="10"' : 'height="10"';
    expect(
      refused(svg('<rect width="5" height="5"/>', `viewBox="0 0 10 10" ${size} ${others}`)).code,
    ).toBe("unsupported-feature");
  });

  it.each([
    ["100", "100"],
    ["100px", "100"],
    [" 100 ", "100"],
    ["1e2", "100"],
    ["10mm", "37.795276"],
  ])("keeps a root width of %j", (width, written) => {
    expect(
      accepted(svg('<rect width="5" height="5"/>', `viewBox="0 0 10 10" width="${width}"`)).svg,
    ).toContain(`width="${written}"`);
  });

  it("drops a root size in percent, which an image reads as no size given, and reports it", () => {
    const result = accepted(
      svg('<rect width="5" height="5"/>', 'viewBox="0 0 10 10" width="100%" height="10"'),
    );
    expect(result.removed).toContainEqual(expect.objectContaining({ attribute: "width" }));
  });

  // An arc's radii, when too small for the arc, are scaled up to fit it, keeping their ratio: a
  // radius rounded to zero draws a line instead.
  it("drops path data with an arc whose radius rounds to zero", () => {
    expect(removals('<path d="M0 0A0.0000003 7 0 0 1 100 0A0.0000003 7 0 0 1 0 0Z"/>')).toEqual([
      expect.objectContaining({ attribute: "d", reason: "invalid-value" }),
    ]);
  });

  // The scaling magnifies a change of the ratio up to the arc's size: by how much is measured.
  it("refuses an arc whose scaled-up radii rounding moves past half a device pixel", () => {
    const result = sanitiseSvgLogo(`${ROOT}<path d="M0 0A0.0000006 7 0 0 1 100 0Z"/></svg>`);
    expect(result.ok ? "accept" : result.errors[0]?.code).toBe("unsupported-feature");
  });

  it.each([
    [
      "a circle as two arcs",
      "M0 0A0.26458333 0.26458333 0 0 1 0.52916666 0A0.26458333 0.26458333 0 0 1 0 0Z",
    ],
    ["a half ellipse, radii in millimetres", "m0 0a0.26458333 0.52916667 0 0 1 0.52916666 0z"],
    ["an arc large enough for its radii", "M0 0A100.0000004 50.0000003 30.0000004 0 1 20 0"],
    ["a ratio rounding keeps", "M0 0A0.0000006 0.0000006 0 0 1 9 9"],
    [
      "a ratio changed by a millionth or two, scaled up by far less",
      "M0 0A0.1 0.2000004 0 0 1 100 0Z",
    ],
    [
      "a relative arc after other commands",
      "M1 1h2v2c1 1 2 2 3 3s1 1 2 2q1 1 2 2t1 1l1 1a0.1234567 0.1234567 0 1 0 3 3z",
    ],
  ])("keeps path data with %s", (_, d) => {
    expect(removals(`<path d="${d}"/>`)).toEqual([]);
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

  it.each([
    ['mask-type="alpha"', 'mask-type="alpha"'],
    ['mask-type=" luminance "', 'mask-type="luminance"'],
    ['style="mask-type: alpha"', 'mask-type="alpha"'],
    ['mask-type="luminance" style="mask-type:alpha"', 'mask-type="alpha"'],
  ])("keeps a mask's type, given as %s", (attribute, written) => {
    expect(output(`<mask id="m" ${attribute}/><rect height="1" mask="url(#m)"/>`)).toContain(
      `<mask id="logo-0" ${written}/>`,
    );
  });

  it("drops a mask type that is not one, or not on a mask", () => {
    expect(
      removals(
        '<mask mask-type="Alpha"/><rect height="1" mask-type="alpha" style="mask-type:alpha"/>',
      ),
    ).toEqual([
      expect.objectContaining({ element: "mask", attribute: "mask-type", reason: "invalid-value" }),
      expect.objectContaining({ element: "rect", attribute: "mask-type" }),
      expect.objectContaining({ element: "rect", property: "mask-type" }),
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

  it("renames referenced ids in document order, drops the rest and what nothing refers to", () => {
    expect(
      output(
        '<defs><linearGradient id="b"/><linearGradient id="unused"/><linearGradient id="a" href="#b"/></defs><rect id="r" width="1" height="1" fill="url(#a)"/>',
      ),
    ).toBe(
      `${ROOT}<defs><linearGradient id="logo-0"/><linearGradient id="logo-1" href="#logo-0"/></defs><rect width="1" height="1" fill="url(#logo-1)"/></svg>`,
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
      'viewBox="0 0 3 1" width="100%" height="50%"',
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
    ["percentages only", 'width="50%" height="100%"'],
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
    ['d="M0 0 L url(#a)"', "d", "invalid-value"],
    ['transform="url(#a)"', "transform", "invalid-value"],
    ['stroke-width="url(https://example.com/)"', "stroke-width", "invalid-value"],
    ['d="javascript:alert(1)"', "d", "invalid-value"],
    ['mask="url(https://example.com/#m)"', "mask", "external-reference"],
    ['clip-path="https://example.com/#c"', "clip-path", "external-reference"],
    ['stroke="url(data:image/svg+xml,x)"', "stroke", "external-reference"],
  ])(
    "calls %s an external reference only where the attribute takes a reference",
    (attribute, name, reason) => {
      expect(removals(`<path ${attribute}/>`)).toEqual([
        expect.objectContaining({ element: "path", attribute: name, reason }),
      ]);
    },
  );

  it("calls a style declaration an external reference only where the property takes a reference", () => {
    expect(
      removals(
        '<path style="stroke-width:url(https://example.com/);fill:url(https://example.com/)"/>',
      ),
    ).toEqual([
      expect.objectContaining({ property: "stroke-width", reason: "invalid-value" }),
      expect.objectContaining({ property: "fill", reason: "external-reference" }),
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

  // XML's white space is space, tab, line feed and carriage return; a no-break space or a line
  // separator is not white space to an SVG reader, so a value that leans on one is not valid.
  it.each([
    ["a no-break space", " "],
    ["a line separator", " "],
  ])("drops a value with %s where white space would go", (_label, space) => {
    const values = [
      `stroke-dasharray="1${space}2"`,
      `fill="rgb(1,${space}2, 3)"`,
      `stroke="rgb(1%${space}2% 3%)"`,
      `clip-path="url(${space}#c)"`,
    ];
    const dropped = removals(
      `<clipPath id="c"/><rect height="1" ${values.join(" ")}/>` +
        `<rect height="1" stroke-dasharray="1,${space}2"/>`,
    );
    expect(dropped.map((removal) => removal.attribute)).toEqual([
      "stroke-dasharray",
      "fill",
      "stroke",
      "clip-path",
      "stroke-dasharray",
    ]);
    const root = accepted(
      `<svg ${NS} viewBox="0 0 10 10" preserveAspectRatio="xMidYMid${space}meet"/>`,
    );
    expect(root.removed).toEqual([
      expect.objectContaining({ element: "svg", attribute: "preserveAspectRatio" }),
    ]);
  });

  it("still reads XML white space inside those values", () => {
    expect(
      output(
        '<clipPath id="c"/><rect height="1" stroke-dasharray="1\t,\n2" fill="rgb(1,\t2 ,3)" clip-path="url( #c )"/>',
      ),
    ).toContain('fill="#010203" stroke-dasharray="1 2" clip-path="url(#logo-0)"');
  });

  it.each(["0.001em", "1ex", "1%", "1rem", "1vw", "1vh", "1ch", "1q", "1zz", "1 0.001em"])(
    "drops a dash array of %s, a unit a dash may not take",
    (value) => {
      const result = accepted(svg(`<path d="M0 0H9" stroke="red" stroke-dasharray="${value}"/>`));
      expect(result.svg).not.toContain("stroke-dasharray");
      expect(result.removed).toEqual([
        expect.objectContaining({ attribute: "stroke-dasharray", reason: "invalid-value" }),
      ]);
    },
  );

  it("refuses a form feed anywhere, inside a value included", () => {
    expect(refused(svg('<rect height="1" stroke-dasharray="1\f2"/>')).code).toBe(
      "invalid-character",
    );
  });

  const CLIPPED_TO_THE_VIEW_BOX =
    '<clipPath id="logo-0"><rect width="1000" height="1"/></clipPath><g clip-path="url(#logo-0)"/></svg>';
  it.each([
    ["none", `viewBox="0 0 1000 1" width="600" height="600">${CLIPPED_TO_THE_VIEW_BOX}`],
    ["xMinYMin slice", 'viewBox="0 0 1 1" width="600" height="600"/>'],
    ["xMidYMid  slice", 'viewBox="499.5 0 1 1" width="600" height="600"/>'],
    ["none meet", `viewBox="0 0 1000 1" width="600" height="600">${CLIPPED_TO_THE_VIEW_BOX}`],
  ])(
    "drops preserveAspectRatio %s, drawing the logo to fit what showed, and nothing more",
    (value, kept) => {
      const result = accepted(
        `<svg ${NS} viewBox="0 0 1000 1" width="600" height="600" preserveAspectRatio="${value}"/>`,
      );
      expect(result.svg).not.toContain("preserveAspectRatio");
      // Cropped, the view box becomes what showed; stretched, it is clipped to the view box, which
      // the space fitting it leaves round it would otherwise show beyond.
      expect(result.svg).toBe(`<svg ${NS} ${kept}`);
      expect(result.removed).toEqual([
        {
          element: "svg",
          attribute: "preserveAspectRatio",
          reason: "render-cost",
          line: 1,
          column: 87,
        },
      ]);
    },
  );

  it.each([
    ["clip-path", '<clipPath id="c"><rect y="180" width="100" height="40"/></clipPath>'],
    ["mask", '<mask id="c"><rect y="180" width="100" height="40" fill="#fff"/></mask>'],
  ])(
    "refuses preserveAspectRatio none beside a %s on the root, which works around the root and would cut another part",
    (attribute, definition) => {
      const logo = (height: number): string =>
        `<svg ${NS} viewBox="0 0 100 100" width="100" height="${String(height)}" preserveAspectRatio="none" ${attribute}="url(#c)">` +
        `${definition}<rect width="100" height="100" fill="red"/></svg>`;
      const refused = sanitiseSvgLogo(logo(400));
      expect(refused.ok || refused.errors[0]?.code).toBe("unsupported-feature");
      // Where the frame has the view box's proportions, nothing is stretched or moved.
      expect(sanitiseSvgLogo(logo(100)).ok).toBe(true);
    },
  );

  it("refuses preserveAspectRatio slice where six decimals cannot hold the part that showed to half a pixel", () => {
    const refused = sanitiseSvgLogo(
      `<svg ${NS} viewBox="0 0 0.00001 0.00001" width="100" height="300" preserveAspectRatio="xMidYMid slice"><rect width="0.00001" height="0.00001"/></svg>`,
    );
    expect(refused.ok || refused.errors[0]?.code).toBe("unsupported-feature");
    expect(
      sanitiseSvgLogo(
        `<svg ${NS} viewBox="0 0 0.00001 0.00001" width="100" height="200" preserveAspectRatio="xMinYMid slice"><rect width="0.00001" height="0.00001"/></svg>`,
      ).ok,
    ).toBe(true);
  });

  it.each([
    ["greater-than signs", ">"],
    ["quotation marks", '"'],
    ["ampersands", "&amp;"],
  ])(
    "keeps a title of %s at the length limit, measured in characters however they are written",
    (_, character) => {
      const title = `<title>${character.repeat(SVG_LOGO_LIMITS.textLength)}</title>`;
      expect(accepted(svg(title)).svg).toContain("<title>");
    },
  );

  const SLICE = (body: string, box = "0 0 200 100"): string =>
    `<svg ${NS} viewBox="${box}" width="100" height="100" preserveAspectRatio="xMinYMin slice">${body}</svg>`;
  it.each([
    ["a shape's position or size", '<rect width="50%" height="10"/>'],
    ["a circle's radius", '<circle cx="10" cy="10" r="25%"/>'],
    ["a stroke width", '<path d="M0 0H9" stroke="#000" stroke-width="30%"/>'],
    [
      "a dash offset",
      '<path d="M0 0H9" stroke="#000" stroke-dasharray="1 1" stroke-dashoffset="5%"/>',
    ],
    [
      "a use's position",
      '<defs><rect id="r" width="9" height="9"/></defs><use href="#r" x="50%"/>',
    ],
    [
      "a mask region in user space",
      '<mask id="m" maskUnits="userSpaceOnUse" x="50%"><rect width="9" height="9" fill="#fff"/></mask><rect width="9" height="9" mask="url(#m)"/>',
    ],
    [
      "a gradient in user space",
      '<linearGradient id="g" gradientUnits="userSpaceOnUse" x2="50%"/><rect width="9" height="9" fill="url(#g)"/>',
    ],
    [
      "a gradient in user space by the one it takes its stops from",
      '<linearGradient id="a" gradientUnits="userSpaceOnUse"/><linearGradient id="g" href="#a" x2="50%"/><rect width="9" height="9" fill="url(#g)"/>',
    ],
    [
      "a shape in a clip path in the box of what it clips, whose percentages Chromium takes of the view box",
      '<clipPath id="c" clipPathUnits="objectBoundingBox"><rect width="50%" height="1"/></clipPath><rect width="9" height="9" clip-path="url(#c)"/>',
    ],
    [
      "a linear gradient in user space by its default end, 100%",
      '<linearGradient id="g" gradientUnits="userSpaceOnUse"/><rect width="9" height="9" fill="url(#g)"/>',
    ],
    [
      "a radial gradient in user space by its default centre and radius, 50%",
      '<radialGradient id="g" gradientUnits="userSpaceOnUse" cx="5" cy="5"/><rect width="9" height="9" fill="url(#g)"/>',
    ],
    [
      "a radial gradient's focus, taken from the one it takes its stops from",
      '<radialGradient id="a" fx="10%"/><radialGradient id="g" href="#a" gradientUnits="userSpaceOnUse" cx="5" cy="5" r="5"/><rect width="9" height="9" fill="url(#g)"/>',
    ],
    [
      "a gradient in user space taking a percentage from one in the box of what it paints",
      '<linearGradient id="a" x2="50%" gradientUnits="objectBoundingBox"/><linearGradient id="g" href="#a" gradientUnits="userSpaceOnUse"/><rect width="9" height="9" fill="url(#g)"/>',
    ],
    [
      "a radial gradient in user space taking its percentages from one in that box",
      '<radialGradient id="a" cx="0%" cy="50%" r="50%"/><radialGradient id="g" href="#a" gradientUnits="userSpaceOnUse"/><rect width="9" height="9" fill="url(#g)"/>',
    ],
    [
      "a linear gradient taking its end through a radial one, as Chromium does",
      '<linearGradient id="a" x2="50%"/><radialGradient id="b" href="#a" gradientUnits="userSpaceOnUse"/><linearGradient id="g" href="#b" x1="1" y1="1" y2="1"/><rect width="9" height="9" fill="url(#g)"/>',
    ],
    [
      "a mask region in user space left to its default, -10% and 120%",
      '<mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="9"><rect width="9" height="9" fill="#fff"/></mask><rect width="9" height="9" mask="url(#m)"/>',
    ],
  ])(
    "refuses preserveAspectRatio slice beside a percentage of the view box in %s, which the crop would change",
    (_, body) => {
      const refused = sanitiseSvgLogo(SLICE(body));
      expect(refused.ok || refused.errors[0]?.code).toBe("unsupported-feature");
    },
  );

  it.each([
    [
      "a mask region in the box of what it masks",
      '<mask id="m" x="-10%" width="120%"><rect width="9" height="9" fill="#fff"/></mask><rect width="9" height="9" mask="url(#m)"/>',
    ],
    [
      "a gradient in the box of what it paints",
      '<linearGradient id="g" x2="50%"/><rect width="9" height="9" fill="url(#g)"/>',
    ],
    [
      "a radial gradient's radius",
      '<radialGradient id="g" r="50%"/><rect width="9" height="9" fill="url(#g)"/>',
    ],
    [
      "a gradient in that box despite one in user space it does not take from",
      '<linearGradient id="a" gradientUnits="userSpaceOnUse"/><linearGradient id="g" x2="50%"/><rect width="9" height="9" fill="url(#g)"/>',
    ],
    [
      "a stop's offset",
      '<linearGradient id="g"><stop offset="50%"/></linearGradient><rect width="9" height="9" fill="url(#g)"/>',
    ],
    [
      "a linear gradient in user space whose defaults left are 0%, which is 0 of anything",
      '<linearGradient id="g" gradientUnits="userSpaceOnUse" x2="9"/><rect width="9" height="9" fill="url(#g)"/>',
    ],
    [
      "a radial gradient in user space whose focus follows a centre in user units",
      '<radialGradient id="g" gradientUnits="userSpaceOnUse" cx="5" cy="5" r="5"/><rect width="9" height="9" fill="url(#g)"/>',
    ],
    [
      "a linear gradient in user space taking its stops from a radial one, whose centre it does not share",
      '<radialGradient id="a" gradientUnits="userSpaceOnUse"><stop offset="0"/></radialGradient><linearGradient id="g" href="#a" x2="9"/><rect width="9" height="9" fill="url(#g)"/>',
    ],
    [
      "a gradient in user space only ever drawn through one in a box",
      '<linearGradient id="a" gradientUnits="userSpaceOnUse"><stop offset="0"/></linearGradient><linearGradient id="g" href="#a" gradientUnits="objectBoundingBox"/><rect width="9" height="9" fill="url(#g)"/>',
    ],
    [
      "a mask region in user space written whole",
      '<mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="9" height="9"><rect width="9" height="9" fill="#fff"/></mask><rect width="9" height="9" mask="url(#m)"/>',
    ],
    ["a length of 0%", '<rect width="0%" height="9"/><rect width="9" height="9"/>'],
    [
      "a percentage only in a definition nothing draws",
      '<defs><linearGradient id="u" x2="100%" gradientUnits="userSpaceOnUse"/></defs><rect width="9" height="9"/>',
    ],
  ])("keeps the crop beside a percentage of a box, not of the view box: %s", (_, body) => {
    expect(sanitiseSvgLogo(SLICE(body)).ok).toBe(true);
  });

  it.each([
    ["no size", ""],
    ["the view box's size", ' width="200" height="100"'],
    ["a size within half a device pixel of its proportions", ' width="2000" height="1000.0001"'],
  ])(
    "drops a slice that crops nothing, with %s, and keeps percentages of the view box",
    (_, size) => {
      const result = accepted(
        `<svg ${NS} viewBox="0 0 200 100"${size} preserveAspectRatio="xMidYMid slice"><rect width="100%" height="100%" fill="#fff"/></svg>`,
      );
      expect(result.svg).toContain('viewBox="0 0 200 100"');
      expect(result.svg).toContain('width="100%"');
      expect(result.removed).toEqual([
        expect.objectContaining({ attribute: "preserveAspectRatio", reason: "render-cost" }),
      ]);
    },
  );

  it.each([
    ["a wordmark of 20 to 1", "0 0 1000 50", ' width="1000" height="49.88"', "0 0.06 1000 49.88"],
    [
      "a sliver 1000 wide and 1 tall",
      "0 0 1000 1",
      ' width="8000" height="7"',
      "0 0.0625 1000 0.875",
    ],
    [
      "a sliver 1 wide and 1000 tall",
      "0 0 1 1000",
      ' width="7" height="8000"',
      "0.0625 0 0.875 1000",
    ],
  ])(
    "crops %s by a share of a pixel along its short side, which dropping the slice would letterbox along its long side",
    (_, box, size, shown) => {
      const result = accepted(
        `<svg ${NS} viewBox="${box}"${size} preserveAspectRatio="xMidYMid slice"><rect width="1000" height="1000"/></svg>`,
      );
      expect(result.viewBox.join(" ")).toBe(shown);
    },
  );

  it.each([
    [
      "a crop whose far edges each take two roundings, together almost a device pixel",
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0.003788 -0.000902 0.002966 0.002165" width="0.002966" height="0.002166" preserveAspectRatio="xMidYMin slice"><rect x="0.003788" y="-0.000902" width="0.002966" height="0.002165"/></svg>',
    ],
    [
      "a height worked out from the width, which six decimals would take off its proportions",
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1" width="0.3333"><rect width="1000" height="1"/></svg>',
    ],
  ])(
    "refuses %s, where what the output shows would pass what the original showed by more than half a device pixel",
    (_, input) => {
      const refused = sanitiseSvgLogo(input);
      expect(refused.ok || refused.errors[0]?.code).toBe("unsupported-feature");
    },
  );

  it.each([
    ["millimetres", 'width="0.003mm" height="0.001286mm"'],
    ["pixels written to ten decimals", 'width="0.0113385827" height="0.0048605"'],
    ["one side", 'width="0.5"'],
  ])("refuses a logo whose width or height is under one pixel, in %s", (_, size) => {
    const refused = sanitiseSvgLogo(
      `<svg ${NS} viewBox="0 0 7 3" ${size} preserveAspectRatio="xMaxYMax slice"><rect width="7" height="3"/></svg>`,
    );
    expect(refused.ok || refused.errors[0]).toEqual(
      expect.objectContaining({
        code: "unsupported-feature",
        message: expect.stringContaining("at least one pixel") as unknown,
      }),
    );
  });

  it("keeps a crop that shows what the original showed, even where its proportions are a share of a pixel off", () => {
    // Off by less than half a device pixel in proportions, but aligned to one end, the view box kept
    // whole would pass the far edge of what was shown; the crop to six decimals does not.
    const result = accepted(
      `<svg ${NS} viewBox="0 0 70.03 159.48" width="34.69" height="78.99" preserveAspectRatio="xMaxYMax slice"><rect width="70.03" height="159.48"/></svg>`,
    );
    expect(result.viewBox[3]).toBeLessThan(159.48);
  });

  it("refuses a crop whose part written to six decimals would be letterboxed along its long side", () => {
    // The part shown is 1000 by 0.000285714…, written 0.000286: 0.1% taller, 4 device pixels at 4000.
    const refused = sanitiseSvgLogo(
      `<svg ${NS} viewBox="0 0 1000 1" width="7" height="0.000002" preserveAspectRatio="xMidYMid slice"><rect width="1000" height="1"/></svg>`,
    );
    expect(refused.ok || refused.errors[0]?.code).toBe("unsupported-feature");
  });

  it.each([
    ["a title", "😀"],
    ["a title by character references", "&#x1F600;"],
    ["a title of CDATA sections", "<![CDATA[😀]]>"],
  ])("measures %s in code points, so an astral character counts once", (_, written) => {
    const at = SVG_LOGO_LIMITS.textLength;
    expect(accepted(svg(`<title>${written.repeat(at)}</title>`)).svg).toContain("<title>");
    const over = sanitiseSvgLogo(svg(`<title>${written.repeat(at)}a</title>`));
    expect(over.ok || over.errors[0]?.code).toBe("too-long");
  });

  it("measures a crop at 2000 CSS pixels twice as dense: 4000 device pixels", () => {
    // Rounding moves this crop by 0.0000005 of 0.002: a quarter of a pixel at 2000, half at 4000.
    const crop = (box: string): string =>
      `<svg ${NS} viewBox="${box}" width="2000" height="2000" preserveAspectRatio="xMidYMid slice"><rect width="1" height="1"/></svg>`;
    const refused = sanitiseSvgLogo(crop("0 0 0.003001 0.002"));
    expect(refused.ok || refused.errors[0]?.code).toBe("unsupported-feature");
  });

  it("takes a size worked out to six decimals as the view box's proportions, not as a stretch", () => {
    // The width follows from the height, 128.571429 for 128.5714…, which is no stretch at all.
    const result = sanitiseSvgLogo(
      `<svg ${NS} viewBox="0 0 100 70" height="90" preserveAspectRatio="none" clip-path="url(#c)"><clipPath id="c"><circle cx="50" cy="35" r="30"/></clipPath><rect width="100" height="70"/></svg>`,
    );
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(result.svg).not.toContain("<g");
    const stretched = sanitiseSvgLogo(
      `<svg ${NS} viewBox="0 0 100 70" width="129" height="90" preserveAspectRatio="none" clip-path="url(#c)"><clipPath id="c"><circle cx="50" cy="35" r="30"/></clipPath><rect width="100" height="70"/></svg>`,
    );
    expect(stretched.ok || stretched.errors[0]?.code).toBe("unsupported-feature");
  });

  it.each([
    [
      "more elements",
      `<svg ${NS} viewBox="0 0 100 50" width="100" height="100" preserveAspectRatio="none">${'<rect width="1" height="1"/>'.repeat(4094)}</svg>`,
      "too-many-elements",
    ],
    [
      "deeper nesting",
      `<svg ${NS} viewBox="0 0 100 50" width="100" height="100" preserveAspectRatio="none">${"<g>".repeat(30)}<rect width="1" height="1"/>${"</g>".repeat(30)}</svg>`,
      "too-deep",
    ],
    [
      "deeper nesting, by a group taking a mask",
      `<svg ${NS} viewBox="0 0 100 100"><mask id="m"><rect width="9" height="9" fill="#fff"/></mask><clipPath id="c"><circle r="5"/><circle cx="9" r="5"/></clipPath>` +
        `${"<g>".repeat(30)}<rect width="1" height="1" mask="url(#m)" clip-path="url(#c)"/>${"</g>".repeat(30)}</svg>`,
      "too-deep",
    ],
  ])(
    "refuses an output with %s than an input may have, which could not be read again",
    (_, input, code) => {
      const result = sanitiseSvgLogo(input);
      expect(result.ok || result.errors[0]?.code).toBe(code);
    },
  );

  it("refuses an output with path data longer than an input may have, as numbers are written out in full", () => {
    // `1e-6` is written `0.000001`: 120 KB of path data comes to more than the 128 KB limit.
    const result = sanitiseSvgLogo(
      `<svg ${NS} viewBox="0 0 1 1"><path d="M0 0${"l1e-6 1e-6".repeat(12000)}"/></svg>`,
    );
    expect(result.ok || result.errors[0]?.code).toBe("too-long");
  });

  it("reports a reference to a name the sanitiser gives what it adds as dangling, never resolved to what it adds", () => {
    const result = accepted(
      `<svg ${NS} viewBox="0 0 100 100" width="200" height="100" preserveAspectRatio="none"><rect width="100" height="100" fill="red" clip-path="url(#_0)"/></svg>`,
    );
    expect(result.svg).toBe(
      `<svg ${NS} viewBox="0 0 100 100" width="200" height="100"><clipPath id="logo-0"><rect width="100" height="100"/></clipPath><g clip-path="url(#logo-0)"><rect width="100" height="100" fill="red"/></g></svg>`,
    );
    expect(result.removed.map(({ attribute, reason }) => [attribute, reason])).toEqual([
      ["preserveAspectRatio", "render-cost"],
      ["clip-path", "dangling-reference"],
    ]);
  });

  it.each([
    ["stroke", "stroke"],
    ["normal", "normal"],
    ["  markers   stroke ", "markers stroke"],
    ["stroke fill markers", "stroke fill markers"],
  ])("keeps paint-order %j, written %j", (value, written) => {
    const result = accepted(
      svg(`<rect width="9" height="9" stroke="#000" paint-order="${value}"/>`),
    );
    expect(result.svg).toContain(`paint-order="${written}"`);
    expect(
      accepted(svg(`<rect width="9" height="9" style="paint-order:${value}"/>`)).svg,
    ).toContain(`paint-order="${written}"`);
  });

  it.each([
    "fill fill",
    "stroke normal",
    "normal stroke",
    "stroke markers fill normal",
    "",
    "inherit",
  ])("drops paint-order %j, outside its grammar", (value) => {
    const result = accepted(svg(`<rect width="9" height="9" paint-order="${value}"/>`));
    expect(result.svg).not.toContain("paint-order");
    expect(result.removed).toEqual([
      expect.objectContaining({ attribute: "paint-order", reason: "invalid-value" }),
    ]);
  });

  it.each(["xMinYMin", "xMidYMid meet", "xMaxYMax meet"])(
    "keeps preserveAspectRatio %s, which fits the view box inside the image",
    (value) => {
      expect(
        accepted(`<svg ${NS} viewBox="0 0 1000 1" preserveAspectRatio="${value}"/>`).svg,
      ).toContain(`preserveAspectRatio="${value}"`);
    },
  );

  it("still drops a preserveAspectRatio that is not valid as an invalid value", () => {
    expect(
      accepted(`<svg ${NS} viewBox="0 0 1 1" preserveAspectRatio="xMidYMid fit"/>`).removed,
    ).toEqual([
      expect.objectContaining({ attribute: "preserveAspectRatio", reason: "invalid-value" }),
    ]);
  });

  it("drops a mask on a clip path or on what it holds, which browsers ignore, and keeps a clip path there", () => {
    const dropped = removals(
      '<clipPath id="k"><rect width="5" height="5"/></clipPath><mask id="m"><rect width="5" height="5" fill="#fff"/></mask>' +
        '<clipPath id="c" clip-path="url(#k)" style="mask:url(#m)">' +
        '<rect width="9" height="9" clip-path="url(#k)" mask="url(#m)"/>' +
        '<use href="#r" style="clip-path:url(#k)"/></clipPath>' +
        '<rect id="r" width="1" height="1" clip-path="url(#k)"/><rect width="9" height="9" clip-path="url(#c)"/>',
    );
    expect(
      dropped.map(({ element, attribute, property, reason }) => ({
        element,
        attribute,
        property,
        reason,
      })),
    ).toEqual([
      { element: "clipPath", attribute: "style", property: "mask", reason: "render-cost" },
      { element: "rect", attribute: "mask", property: undefined, reason: "render-cost" },
      { element: "clipPath", attribute: undefined, property: undefined, reason: "rewritten" },
    ]);
  });

  it.each([
    ["on a shape in a clip path", '<rect width="9" height="9" clip-path="none"/>', "", "attribute"],
    [
      "in a style on a shape in one",
      '<rect width="9" height="9" style="clip-path:none"/>',
      "",
      "property",
    ],
    [
      "in a style on the clip path",
      '<rect width="9" height="9"/>',
      ' style="clip-path:none"',
      "property",
    ],
    ["on the clip path", '<rect width="9" height="9"/>', ' clip-path="none"', "attribute"],
  ])("drops a clip path of none %s, which is what no clip path is", (_, content, own, form) => {
    const result = accepted(
      svg(
        `<clipPath id="a"${own}>${content}</clipPath><rect width="9" height="9" clip-path="url(#a)"/>`,
      ),
    );
    expect(result.removed[0]).toEqual(
      expect.objectContaining(
        form === "attribute"
          ? { attribute: "clip-path", reason: "render-cost" }
          : { attribute: "style", property: "clip-path", reason: "render-cost" },
      ),
    );
  });

  it("drops a clip path a style of none outweighs on a shape in a clip path, with the style", () => {
    const dropped = removals(
      '<clipPath id="k"><rect width="5" height="5"/></clipPath><clipPath id="a">' +
        '<rect width="9" height="9" clip-path="url(#k)" style="clip-path:none"/></clipPath>' +
        '<rect width="9" height="9" clip-path="url(#a)"/>',
    );
    expect(dropped.slice(0, 2)).toEqual([
      expect.objectContaining({ property: "clip-path", reason: "render-cost" }),
      expect.objectContaining({ attribute: "clip-path", reason: "render-cost" }),
    ]);
  });

  it("drops a group inside a clip path, which browsers leave out of the clip", () => {
    expect(
      removals(
        '<clipPath id="c"><g><rect width="5" height="5"/></g><rect width="9" height="9"/></clipPath><rect width="9" height="9" clip-path="url(#c)"/>',
      ),
    ).toEqual([expect.objectContaining({ element: "g", reason: "misplaced" })]);
  });

  it("drops a transform, clip path or mask on a mask, which browsers do not apply", () => {
    const dropped = removals(
      '<clipPath id="k"><rect width="5" height="5"/></clipPath><mask id="n"><rect width="5" height="5" fill="#fff"/></mask>' +
        '<mask id="m" transform="scale(2)" clip-path="url(#k)" mask="url(#n)"><rect width="5" height="5" fill="#fff"/></mask>' +
        '<rect width="9" height="9" mask="url(#m)"/>',
    );
    expect(dropped.map(({ attribute, reason }) => [attribute, reason])).toEqual([
      ["transform", "unsupported-attribute"],
      ["clip-path", "unsupported-attribute"],
      ["mask", "unsupported-attribute"],
    ]);
  });

  it("paints nothing for a paint reference that cannot be found, rather than black", () => {
    expect(
      output('<rect width="1" height="1" fill="url(#nowhere)" stroke="url(#nowhere)"/>'),
    ).toContain('fill="none" stroke="none"');
  });

  it.each([
    ["attributes", 'fill="url(http://x/y)" stroke="url(data:image/svg+xml,x)"'],
    ["style declarations", 'style="fill:url(http://x/y);stroke:javascript:x"'],
  ])("paints nothing for an external paint reference in %s, rather than black", (_l, paint) => {
    const result = accepted(svg(`<rect width="1" height="1" ${paint}/>`));
    expect(result.svg).toContain('fill="none" stroke="none"');
    expect(result.removed.map(({ reason }) => reason)).toEqual([
      "external-reference",
      "external-reference",
    ]);
  });

  it("paints nothing for an external paint reference in a style over a fill attribute", () => {
    const result = accepted(
      svg('<rect width="1" height="1" fill="red" style="fill:url(http://x/y)"/>'),
    );
    expect(result.svg).toContain('fill="none"');
    expect(result.removed.map(({ reason }) => reason)).toEqual([
      "external-reference",
      "external-reference",
    ]);
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

const SVG_11 =
  '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">';

describe("sanitiseSvgLogo, document type declarations", () => {
  it.each([
    ["the public SVG 1.1 one", SVG_11],
    ["a name alone", "<!DOCTYPE svg>"],
    ["a name and white space", "<!DOCTYPE\n  svg\t>"],
    ["a system identifier", '<!DOCTYPE svg SYSTEM "svg11.dtd">'],
    ["single quotes", "<!DOCTYPE svg PUBLIC '-//W3C//DTD SVG 1.1//EN' 'svg11.dtd'>"],
    ["a prefixed name", "<!DOCTYPE s:svg>"],
  ])("skips one without an internal subset: %s", (_label, doctype) => {
    const result = accepted(`<?xml version="1.0"?>\n<!-- a -->\n${doctype}\n<!-- b -->\n${EMPTY}`);
    expect(result.svg).toBe(EMPTY);
    expect(result.removed).toEqual([
      { element: "!DOCTYPE", reason: "document-type", line: 3, column: 1 },
    ]);
  });

  it("honours no entity a skipped document type would declare", () => {
    const xhtml =
      '<!DOCTYPE svg PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">';
    expect(refused(`${xhtml}${svg("<title>a&nbsp;b</title>")}`).code).toBe("invalid-entity");
    expect(refused(`${SVG_11}${svg("<title>&svg;</title>")}`).code).toBe("invalid-entity");
  });

  it.each([
    ["an empty internal subset", "<!DOCTYPE svg []>"],
    ["an internal subset after the identifiers", `${SVG_11.slice(0, -1)} [<!ENTITY a "b">]>`],
    ["nested brackets", "<!DOCTYPE svg [ <!ELEMENT a [ ]> ]>"],
    ["a > inside a literal", '<!DOCTYPE svg SYSTEM "a>b">'],
    ["a [ inside a literal", '<!DOCTYPE svg PUBLIC "-//A//EN" "x[y">'],
    ["a ] inside a literal", "<!DOCTYPE svg SYSTEM 'x]y'>"],
    ["a < inside a literal", '<!DOCTYPE svg SYSTEM "a<b">'],
    [
      "a public identifier with no system identifier",
      '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN">',
    ],
    [
      "a character a public identifier may not hold",
      '<!DOCTYPE svg PUBLIC "-//W3C//DTD{SVG//EN" "a">',
    ],
    ["an unquoted identifier", "<!DOCTYPE svg SYSTEM svg11.dtd>"],
    ["an unclosed literal", '<!DOCTYPE svg SYSTEM "svg11.dtd>'],
    ["a keyword in lower case", '<!DOCTYPE svg system "a">'],
    ["the declaration in lower case", "<!doctype svg>"],
    ["no name", "<!DOCTYPE>"],
    ["no space before the name", "<!DOCTYPEsvg>"],
    ["no space between the identifiers", `<!DOCTYPE svg PUBLIC "-//A//EN""a">`],
    ["something after the identifiers", '<!DOCTYPE svg SYSTEM "a" junk>'],
    ["a comment inside", "<!DOCTYPE svg <!-- x -->>"],
    ["no closing >", '<!DOCTYPE svg SYSTEM "a"'],
    ["two of them", "<!DOCTYPE svg><!DOCTYPE svg>"],
  ])("refuses one with %s", (_label, doctype) => {
    expect(refused(`${doctype}${EMPTY}`).code).toBe("doctype");
  });

  it("holds its name to the name length limit", () => {
    const longest = "s".repeat(SVG_LOGO_LIMITS.nameLength);
    expect(accepted(`<!DOCTYPE ${longest}>${EMPTY}`).svg).toBe(EMPTY);
    expect(refused(`<!DOCTYPE ${longest}s>${EMPTY}`).code).toBe("doctype");
  });

  it("refuses one after the root or inside it, and one before the XML declaration", () => {
    expect(refused(`${EMPTY}<!DOCTYPE svg>`).code).toBe("doctype");
    expect(refused(svg("<!DOCTYPE svg>")).code).toBe("doctype");
    expect(refused(`<!DOCTYPE svg><?xml version="1.0"?>${EMPTY}`).code).toBe(
      "processing-instruction",
    );
  });

  it("refuses one that never ends, at the declaration", () => {
    expect(refused(`\n<!DOCTYPE svg PUBLIC "-//A//EN" "a" ${EMPTY}`)).toEqual(
      expect.objectContaining({ code: "doctype", line: 2, column: 1 }),
    );
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

  it("measures bytes by their own length, not by a length a subclass reports", () => {
    class ShortLength extends Uint8Array {
      override get length(): number {
        return 10;
      }
    }
    const bytes = new TextEncoder().encode(svg(`<!--${"x".repeat(SVG_LOGO_LIMITS.inputBytes)}-->`));
    const lying = new ShortLength(bytes.length);
    lying.set(bytes);
    expect(refused(lying).code).toBe("too-large");
  });

  it("reads bytes without calling anything a subclass overrides", () => {
    class ThrowingLength extends Uint8Array {
      override get length(): number {
        throw new Error("length");
      }
    }
    const bytes = new TextEncoder().encode(svg('<rect width="1" height="1"/>'));
    const throwing = new ThrowingLength(bytes.length);
    throwing.set(bytes);
    expect(sanitiseSvgLogo(throwing).ok).toBe(true);
  });

  it("refuses a revoked proxy as the wrong type, and as options as an invalid option", () => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    expect(refused(proxy).code).toBe("wrong-type");
    const withOptions = sanitiseSvgLogo(svg(""), proxy);
    expect(withOptions.ok || withOptions.errors[0]?.code).toBe("invalid-option");
  });

  it("refuses options whose idPrefix throws as an invalid option, and reads it once", () => {
    const throwing = sanitiseSvgLogo(svg(""), {
      get idPrefix(): string {
        throw new Error("idPrefix");
      },
    });
    expect(throwing.ok || throwing.errors[0]?.code).toBe("invalid-option");
    let reads = 0;
    const counted = sanitiseSvgLogo(svg('<rect id="a" width="1" height="1"/><use href="#a"/>'), {
      get idPrefix(): string {
        reads += 1;
        return reads === 1 ? "brand-" : "<x>-";
      },
    });
    expect(counted.ok && counted.svg).toContain('id="brand-0"');
    expect(reads).toBe(1);
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
      "text written with references",
      svg(`<title>${"&#x41;".repeat(SVG_LOGO_LIMITS.textLength + 1)}</title>`),
      "too-long",
    ],
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
    // Empty groups, which cost next to nothing to draw, so the element count is what refuses.
    const copies = (count: number): string =>
      svg(`<defs><g id="p">${"<g/>".repeat(9)}</g></defs>${'<use href="#p"/>'.repeat(count)}`);
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

import { readFileSync } from "node:fs";
import { logoDataUrl, parseBrandKit, sanitiseSvgLogo, type SanitisedSvg } from "@identgineer/brand";
import { describe, expect, it } from "vitest";
import { brandLogoSource, integerFrame } from "./brand-logo-source";

const FIXTURES = new URL("../../../../brand/src/__fixtures__/", import.meta.url);

function kitLogos(file: string): { logo: SanitisedSvg; mark: SanitisedSvg } {
  const result = parseBrandKit(JSON.parse(readFileSync(new URL(file, FIXTURES), "utf8")));
  if (!result.ok || result.kit.logo === undefined || result.kit.mark === undefined) {
    throw new Error(`${file} has no logo and mark`);
  }
  return { logo: result.kit.logo, mark: result.kit.mark };
}

const { logo: LOGO, mark: MARK } = kitLogos("harbour-lights.kit.json");

describe("brandLogoSource", () => {
  it("gives the data url of the logo and the size of its frame", () => {
    expect(brandLogoSource(LOGO)).toEqual({
      url: logoDataUrl(LOGO),
      width: 3000,
      height: 1000,
    });
    expect(brandLogoSource(MARK)).toEqual({
      url: logoDataUrl(MARK),
      width: 1000,
      height: 1000,
    });
  });

  it("gives a url that is a percent-encoded image and holds the logo unchanged", () => {
    const source = brandLogoSource(LOGO);
    const prefix = "data:image/svg+xml;charset=utf-8,";
    expect(source?.url.startsWith(prefix)).toBe(true);
    expect(decodeURIComponent(source?.url.slice(prefix.length) ?? "")).toBe(LOGO);
    expect(source?.url).not.toMatch(/[<>"'\s#]/);
  });

  it("accepts a logo written with another id prefix, as the sanitiser allows", () => {
    const result = sanitiseSvgLogo(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 5"><defs><linearGradient id="a"><stop offset="0" stop-color="#000"/></linearGradient></defs><rect width="10" height="5" fill="url(#a)"/></svg>',
      { idPrefix: "mark-" },
    );
    if (!result.ok) throw new Error("expected a logo");
    expect(brandLogoSource(result.svg)).toMatchObject({ width: 2000, height: 1000 });
  });

  // Each is what an upload or a hand-built kit might hold: none is the sanitiser's own output, so
  // none may reach an image, whatever a browser would make of it.
  it.each([
    ["an empty string", ""],
    ["text that is not an svg", "Acme"],
    [
      "a script element",
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><script>alert(1)</script></svg>',
    ],
    [
      "an event handler",
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" onload="alert(1)"/>',
    ],
    [
      "an external image",
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><image href="https://example.com/x.png"/></svg>',
    ],
    [
      "a javascript url",
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><a href="javascript:alert(1)"><rect width="1" height="1"/></a></svg>',
    ],
    [
      "a foreignObject",
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><foreignObject><div>hi</div></foreignObject></svg>',
    ],
    [
      "an animation",
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"><set attributeName="onclick" to="alert(1)"/></rect></svg>',
    ],
    [
      "an editor's file with a declaration",
      '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>',
    ],
    [
      "a doctype with entities",
      '<!DOCTYPE svg [<!ENTITY a "b">]><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>',
    ],
    [
      "a style element",
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><style>@import url(https://example.com/x.css)</style></svg>',
    ],
    [
      "a data url image",
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><image href="data:image/svg+xml,&lt;svg/&gt;"/></svg>',
    ],
  ])("shows nothing for %s", (_name, text) => {
    expect(brandLogoSource(text)).toBeUndefined();
  });

  it("shows nothing for an svg the sanitiser would still change", () => {
    expect(brandLogoSource(LOGO.replace("</svg>", " </svg>"))).toBeUndefined();
    expect(brandLogoSource(LOGO.replace("<path", '<path onclick="x"'))).toBeUndefined();
  });

  it("shows nothing for a logo that was edited after the sanitiser to load something", () => {
    expect(
      brandLogoSource(LOGO.replace('fill="#1b2a4a"', 'fill="url(https://example.com/x)"')),
    ).toBeUndefined();
  });

  it.each([
    ["a number", 1],
    ["null", null],
    ["undefined", undefined],
    ["an object", { toString: () => LOGO }],
    ["an array", [LOGO]],
    ["a String object", new String(LOGO)],
  ])("shows nothing for %s", (_name, value) => {
    expect(brandLogoSource(value)).toBeUndefined();
  });

  it("does not throw for a logo with a hostile getter or a revoked proxy", () => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    expect(brandLogoSource(proxy)).toBeUndefined();
    expect(
      brandLogoSource({
        get length(): number {
          throw new Error("no");
        },
      }),
    ).toBeUndefined();
  });
});

function sanitisedWith(attributes: string): string {
  const result = sanitiseSvgLogo(
    `<svg xmlns="http://www.w3.org/2000/svg" ${attributes}><rect width="1" height="1"/></svg>`,
  );
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.svg;
}

// The image's natural size is the root's width and height, whatever the view box says, and it goes
// to the image as whole numbers, since the browser takes no fraction of an attribute.
describe("the frame brandLogoSource gives", () => {
  it.each([
    [
      "the shape of the width and height, not of the view box",
      'viewBox="0 0 120 40" width="200" height="40"',
      5,
    ],
    [
      "the stretched shape of a preserveAspectRatio none",
      'viewBox="0 0 120 40" width="300" height="40" preserveAspectRatio="none"',
      7.5,
    ],
    ["a width and height in millimetres", 'viewBox="0 0 100 20" width="100mm" height="20mm"', 5],
    [
      "a width and height in inches that differ from the view box",
      'viewBox="0 0 100 20" width="3in" height="1in"',
      3,
    ],
    ["a fractional view box", 'viewBox="0 0 1.5 1" width="150" height="100"', 1.5],
    ["a view box under one unit", 'viewBox="0 0 0.5 0.25" width="100" height="50"', 2],
    ["a fractional size", 'width="210.5" height="80.25"', 210.5 / 80.25],
    ["a view box alone", 'viewBox="0 0 24 12"', 2],
  ])("keeps %s", (_name, attributes, ratio) => {
    const frame = brandLogoSource(sanitisedWith(attributes));
    expect(Number.isInteger(frame?.width)).toBe(true);
    expect(Number.isInteger(frame?.height)).toBe(true);
    expect(Math.min(frame?.width ?? 0, frame?.height ?? 0)).toBeGreaterThanOrEqual(1000);
    expect((frame?.width ?? 0) / (frame?.height ?? 1)).toBeCloseTo(ratio, 2);
  });
});

describe("integerFrame", () => {
  it.each([
    [120, 40, 3000, 1000],
    [40, 120, 1000, 3000],
    [100, 100, 1000, 1000],
    [0.5, 0.25, 2000, 1000],
    [1.5, 1, 1500, 1000],
    [1, 1, 1000, 1000],
    [2000, 2000, 1000, 1000],
  ])("gives %s by %s as %s by %s", (width, height, expectedWidth, expectedHeight) => {
    expect(integerFrame(width, height)).toEqual({ width: expectedWidth, height: expectedHeight });
  });

  it("keeps the shape within a thousandth even where the numbers are awkward", () => {
    const { width, height } = integerFrame(210.5, 80.25);
    expect(width / height).toBeCloseTo(210.5 / 80.25, 3);
  });

  it("stays within what an image attribute can hold for a very long thin frame", () => {
    for (const [wide, high] of [
      [999999, 1],
      [1, 999999],
    ] as const) {
      const frame = integerFrame(wide, high);
      expect(Math.max(frame.width, frame.height)).toBeLessThanOrEqual(1_000_000_000);
      expect(Number.isInteger(frame.width) && Number.isInteger(frame.height)).toBe(true);
      expect(Math.min(frame.width, frame.height)).toBeGreaterThanOrEqual(1);
      expect(frame.width / frame.height).toBeCloseTo(wide / high, 0);
    }
  });
});

import { readFileSync } from "node:fs";
import { logoDataUrl, parseBrandKit, sanitiseSvgLogo } from "@identgineer/brand";
import { describe, expect, it } from "vitest";
import { brandLogoSource, logoFrame } from "./brand-logo-source";

const FIXTURES = new URL("../../../../brand/src/__fixtures__/", import.meta.url);

function kitLogos(file: string): { logo: string; mark: string } {
  const result = parseBrandKit(JSON.parse(readFileSync(new URL(file, FIXTURES), "utf8")));
  if (!result.ok || result.kit.logo === undefined || result.kit.mark === undefined) {
    throw new Error(`${file} has no logo and mark`);
  }
  return { logo: result.kit.logo, mark: result.kit.mark };
}

function sanitised(svg: string): string {
  const result = sanitiseSvgLogo(svg);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.svg;
}

const { logo: LOGO, mark: MARK } = kitLogos("harbour-lights.kit.json");

describe("brandLogoSource", () => {
  it("gives the data url of the logo and the size of its frame", () => {
    expect(brandLogoSource(LOGO)).toEqual({
      url: logoDataUrl(sanitised(LOGO)),
      width: 120,
      height: 40,
    });
    expect(brandLogoSource(MARK)).toEqual({
      url: logoDataUrl(sanitised(MARK)),
      width: 40,
      height: 40,
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
    expect(brandLogoSource(result.svg)?.width).toBe(10);
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
    expect(brandLogoSource(`${LOGO.replace("</svg>", " </svg>")}`)).toBeUndefined();
    expect(brandLogoSource(LOGO.replace('width="120"', 'width="120.0"'))).toBeUndefined();
    expect(brandLogoSource(LOGO.replace("<path", '<path onclick="x"'))).toBeUndefined();
  });

  it("shows nothing for a logo that was edited after the sanitiser, even slightly", () => {
    expect(brandLogoSource(LOGO.replace('fill="#1b2a4a"', 'fill="#1b2a4b"'))).toBeDefined();
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

describe("logoFrame", () => {
  it.each([
    ['viewBox="0 0 120 40" width="120" height="40"', { width: 120, height: 40 }],
    ['viewBox="0 0 2.5 1.25"', { width: 2.5, height: 1.25 }],
    ['viewBox="-10 -5 1e2 50"', { width: 100, height: 50 }],
    ['viewBox="0,0,24,24"', { width: 24, height: 24 }],
    ['width="10mm" viewBox="0 0 37.795276 37.795276"', { width: 37.795276, height: 37.795276 }],
  ])("reads the view box of %s", (attributes, frame) => {
    expect(logoFrame(`<svg xmlns="http://www.w3.org/2000/svg" ${attributes}></svg>`)).toEqual(
      frame,
    );
  });

  it.each([
    ["no view box", 'width="10" height="10"'],
    ["a view box of four numbers short", 'viewBox="0 0 10"'],
    ["a zero width", 'viewBox="0 0 0 10"'],
    ["a negative height", 'viewBox="0 0 10 -10"'],
    ["a number too large to be one", 'viewBox="0 0 1e999 10"'],
    ["words", 'viewBox="a b c d"'],
  ])("has no frame for %s", (_name, attributes) => {
    expect(
      logoFrame(`<svg xmlns="http://www.w3.org/2000/svg" ${attributes}></svg>`),
    ).toBeUndefined();
  });

  it("reads the root element's view box, not one deeper in the document", () => {
    expect(
      logoFrame('<svg xmlns="http://www.w3.org/2000/svg"><svg viewBox="0 0 5 5"/></svg>'),
    ).toBeUndefined();
  });
});

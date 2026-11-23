import { describe, expect, it } from "vitest";
import { isSanitisedSvgLogo } from "./is-sanitised-svg-logo.ts";
import { logoDataUrl } from "./logo-data-url.ts";
import { sanitiseSvgLogo } from "./sanitise-svg-logo.ts";
import type { SanitisedSvg } from "./sanitised-svg.ts";

function sanitised(body: string, idPrefix?: string): SanitisedSvg {
  const result = sanitiseSvgLogo(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${body}</svg>`,
    idPrefix === undefined ? undefined : { idPrefix },
  );
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.svg;
}

const LOGO = sanitised(
  '<g id="g"><path d="M0 0H10V10Z" fill="#4f46e5"/></g><use href="#g" x="1"/><title>Café &amp; "Co" #1 100%</title>',
);

describe("isSanitisedSvgLogo", () => {
  it("accepts what the sanitiser returns, with any id prefix", () => {
    expect(isSanitisedSvgLogo(LOGO)).toBe(true);
    expect(isSanitisedSvgLogo(sanitised('<g id="g"/><use href="#g"/>', "mark-"))).toBe(true);
    expect(isSanitisedSvgLogo(sanitised('<g id="g"/><use href="#g"/>', "a1-b-"))).toBe(true);
  });

  it.each([
    [
      "an editor's file",
      '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>',
    ],
    ["an output with an attribute added", LOGO.replace("<path ", '<path onload="alert(1)" ')],
    ["an output with white space added", LOGO.replace("><path", ">\n<path")],
    ["an output with its ids renamed", LOGO.replaceAll("logo-0", "logo-7")],
    ["an output with a comment", LOGO.replace("<title>", "<!-- x --><title>")],
    ["an empty string", ""],
  ])("refuses %s", (_label, value) => {
    expect(isSanitisedSvgLogo(value)).toBe(false);
  });

  it.each([[undefined], [null], [42], [{}], [["<svg/>"]], [new String(LOGO)]])(
    "refuses the non-string %s",
    (value) => {
      expect(isSanitisedSvgLogo(value)).toBe(false);
    },
  );
});

describe("logoDataUrl", () => {
  it("percent-encodes the logo as a data URL for an image", () => {
    const url = logoDataUrl(LOGO);
    expect(url.startsWith("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns=")).toBe(true);
    expect(decodeURIComponent(url.slice(url.indexOf(",") + 1))).toBe(LOGO);
  });

  it("holds nothing that could end an attribute, a CSS string or the URL's data", () => {
    const data = logoDataUrl(LOGO).slice("data:image/svg+xml;charset=utf-8,".length);
    expect(data).toMatch(/^[A-Za-z0-9\-._~/:=,%]+$/);
    expect(data).toContain("%23");
    expect(data).toContain("Caf%C3%A9");
  });

  it("is the same every time", () => {
    expect(logoDataUrl(LOGO)).toBe(logoDataUrl(LOGO));
  });

  it("throws for a string the sanitiser did not return, however it is typed", () => {
    const forged = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" onload="alert(1)"/>';
    expect(() => logoDataUrl(forged as SanitisedSvg)).toThrow(TypeError);
    expect(() =>
      logoDataUrl(LOGO.replace("<title>", "<script>alert(1)</script><title>") as SanitisedSvg),
    ).toThrow(TypeError);
  });

  it("only takes a sanitised logo at compile time", () => {
    // @ts-expect-error a plain string is not a SanitisedSvg.
    expect(() => logoDataUrl("<svg/>")).toThrow(TypeError);
  });
});

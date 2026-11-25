import { describe, expect, it, vi } from "vitest";
import { logoDataUrl } from "./logo-data-url.ts";
import { logoImage } from "./logo-image.ts";
import { sanitiseSvgLogo } from "./sanitise-svg-logo.ts";
import type { SanitisedSvg } from "./sanitised-svg.ts";

const calls = vi.hoisted(() => ({ sanitise: 0 }));
vi.mock("./sanitise-svg-logo.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("./sanitise-svg-logo.ts")>();
  return {
    ...original,
    sanitiseSvgLogo: (...args: Parameters<typeof original.sanitiseSvgLogo>) => {
      calls.sanitise += 1;
      return original.sanitiseSvgLogo(...args);
    },
  };
});

function sanitised(attributes: string, body = '<rect width="1" height="1"/>'): SanitisedSvg {
  const result = sanitiseSvgLogo(
    `<svg xmlns="http://www.w3.org/2000/svg" ${attributes}>${body}</svg>`,
  );
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.svg;
}

describe("logoImage", () => {
  it("gives the data url of a sanitised logo, the one logoDataUrl gives", () => {
    const logo = sanitised('viewBox="0 0 120 40" width="120" height="40"');
    expect(logoImage(logo)?.url).toBe(logoDataUrl(logo));
  });

  it("checks the logo once: the sanitiser reads it a single time", () => {
    const logo = sanitised('viewBox="0 0 120 40" width="120" height="40"');
    calls.sanitise = 0;
    expect(logoImage(logo)).toBeDefined();
    expect(calls.sanitise).toBe(1);
  });

  // The size an image has is the root's width and height, which may differ in shape from the view
  // box (the logo is then drawn fitted inside its frame).
  it.each([
    [
      "the width and height beside a view box of the same shape",
      'viewBox="0 0 120 40" width="120" height="40"',
      120,
      40,
    ],
    [
      "a width and height of another shape than the view box",
      'viewBox="0 0 120 40" width="200" height="40"',
      200,
      40,
    ],
    [
      "a stretching aspect ratio, which the sanitiser clips to a view box of the frame's shape",
      'viewBox="0 0 120 40" width="300" height="40" preserveAspectRatio="none"',
      300,
      40,
    ],
    ["a width and height with no view box", 'width="210.5" height="80.25"', 210.5, 80.25],
    ["a fractional view box", 'viewBox="0 0 1.5 1" width="150" height="100"', 150, 100],
    ["a view box under one unit", 'viewBox="0 0 0.5 0.25" width="100" height="50"', 100, 50],
    ["no width and height, which follow the view box", 'viewBox="0 0 24 12"', 24, 12],
  ])("gives the size of %s", (_name, attributes, width, height) => {
    expect(logoImage(sanitised(attributes))).toMatchObject({ width, height });
  });

  it.each([
    ["mm", "100mm", "20mm", (100 * 96) / 25.4, (20 * 96) / 25.4],
    ["cm", "10cm", "2cm", (10 * 96) / 2.54, (2 * 96) / 2.54],
    ["in", "2in", "1in", 192, 96],
    ["pt", "75pt", "30pt", 100, 40],
    ["pc", "10pc", "5pc", 160, 80],
  ])(
    "gives the size in pixels of a logo sized in %s",
    (_unit, width, height, pixelsWide, pixelsHigh) => {
      const image = logoImage(
        sanitised(`viewBox="0 0 100 20" width="${width}" height="${height}"`),
      );
      expect(image?.width).toBeCloseTo(pixelsWide, 4);
      expect(image?.height).toBeCloseTo(pixelsHigh, 4);
    },
  );

  it.each([
    [
      "a script",
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><script>alert(1)</script></svg>',
    ],
    [
      "an event handler",
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" onload="alert(1)"/>',
    ],
    ["text that is not an svg", "Acme"],
    ["a number", 1],
    ["nothing", undefined],
  ])("gives nothing for %s", (_name, value) => {
    expect(logoImage(value)).toBeUndefined();
  });

  it("gives nothing for a sanitised logo that was then changed", () => {
    const logo = sanitised('viewBox="0 0 120 40" width="120" height="40"');
    expect(logoImage(logo.replace("</svg>", " </svg>"))).toBeUndefined();
  });
});

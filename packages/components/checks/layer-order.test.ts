import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

/** The `z-index` of the first rule whose selector contains `selector`. */
function zIndexOf(css: string, selector: string): number {
  const start = css.indexOf(selector);
  expect(start, `${selector} is in the stylesheet`).toBeGreaterThanOrEqual(0);
  const body = css.slice(start, css.indexOf("}", start));
  const match = /z-index:\s*(-?\d+)/.exec(body);
  expect(match, `${selector} sets a z-index`).not.toBeNull();
  return Number(match?.[1]);
}

describe("the order things are painted in over the page", () => {
  // The skip link is the first control on the page and must be seen whenever it has focus, over
  // anything that sticks to the window, the consent banner included, which comes later in the DOM
  // and so would win a tie.
  it("puts the layout's skip link above the consent banner, which is above the layout's own chrome", () => {
    const skip = zIndexOf(read("../src/components/layout/layout.css"), "\n.skip {");
    const banner = zIndexOf(
      read("../src/components/consent-banner/consent-banner.css"),
      ':host(:not([placement="top"])',
    );
    const chrome = [...read("../src/components/layout/layout.css").matchAll(/z-index:\s*(\d+)/g)]
      .map((match) => Number(match[1]))
      .filter((value) => value !== skip);
    expect(skip).toBeGreaterThan(banner);
    expect(Math.max(...chrome)).toBeLessThan(banner);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { brandLogoSource } from "../src/components/brand-logo/brand-logo-source";

const DEMO = readFileSync(new URL("../src/demo.js", import.meta.url), "utf8");

// A demo logo that the sanitiser would change is not drawn, and the demo would quietly show a
// wordmark instead; this holds each one to being the sanitiser's own output.
describe("the logos in the demo script", () => {
  const logos = [...DEMO.matchAll(/'(<svg[^']*)'/g)].map((match) => match[1] ?? "");

  it("are there", () => {
    expect(logos).toHaveLength(2);
  });

  it.each(logos.map((logo, index) => [index, logo] as const))(
    "number %s is drawn by idg-brand-logo",
    (_index, logo) => {
      expect(brandLogoSource(logo)).toBeDefined();
    },
  );
});

import { readFileSync } from "node:fs";
import { generateBrandTheme, parseBrandKit, sanitiseSvgLogo } from "@identgineer/brand";
import { h, render } from "@stencil/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../brand-logo/brand-logo";
import "../brand-swatches/brand-swatches";
import { brandLogoSource } from "../brand-logo/brand-logo-source";
import "./brand-guidelines";

const reads = vi.hoisted(() => ({ count: 0 }));
vi.mock("@identgineer/brand/logo", async (importOriginal) => {
  const original = await importOriginal<typeof import("@identgineer/brand/logo")>();
  return {
    ...original,
    logoImage: (value: unknown) => {
      reads.count += 1;
      return original.logoImage(value);
    },
  };
});

const FIXTURES = new URL("../../../../brand/src/__fixtures__/", import.meta.url);
const parsed = parseBrandKit(
  JSON.parse(readFileSync(new URL("harbour-lights.kit.json", FIXTURES), "utf8")),
);
if (!parsed.ok) throw new Error("the fixture kit is not a kit");
const KIT = parsed.kit;
const THEME = generateBrandTheme(KIT);

// The logo check reads the whole text again with the sanitiser, which costs half a second for a
// large logo. A guide shows each of the logo and the mark on two backings, and must pay once for each.
describe("how often the guide checks its logos", () => {
  beforeEach(() => {
    reads.count = 0;
  });

  it("runs the check once for the logo and once for the mark, whatever the number of tiles", async () => {
    const { root } = await render(<idg-brand-guidelines kit={KIT} theme={THEME} />);
    expect(root.shadowRoot?.querySelectorAll("idg-brand-logo")).toHaveLength(4);
    expect(reads.count).toBe(2);
  });

  it("runs it again only for a logo it has not checked", async () => {
    const { setProps } = await render(<idg-brand-guidelines kit={KIT} theme={THEME} />);
    reads.count = 0;
    await setProps({ kit: { ...KIT, tagline: "A new line" } });
    expect(reads.count).toBe(0);
    await setProps({ kit: { ...KIT, mark: KIT.logo } });
    expect(reads.count).toBe(0);
  });
});

function logoText(width: number) {
  const result = sanitiseSvgLogo(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="${String(width)}" height="10"><rect width="${String(width)}" height="1"/></svg>`,
  );
  if (!result.ok) throw new Error("expected a logo");
  return result.svg;
}

describe("how often two guides check their logos", () => {
  beforeEach(() => {
    reads.count = 0;
  });

  it("checks each of four distinct texts once when two guides are given kits in the same task", async () => {
    const first = { ...KIT, logo: logoText(11), mark: logoText(12) };
    const second = { ...KIT, logo: logoText(13), mark: logoText(14) };
    await render(
      <div>
        <idg-brand-guidelines kit={first} theme={THEME} />
        <idg-brand-guidelines kit={second} theme={THEME} />
      </div>,
    );
    expect(reads.count).toBe(4);
  });
});

describe("what the logo check remembers", () => {
  beforeEach(() => {
    reads.count = 0;
  });

  it("holds no text longer than the sanitiser accepts, so that what it keeps is bounded", () => {
    const tooLong = "x".repeat(512 * 1024 + 1);
    brandLogoSource(tooLong);
    brandLogoSource(tooLong);
    expect(reads.count).toBe(2);
  });

  it("forgets the oldest of five distinct texts, and keeps the last four", () => {
    const texts = [21, 22, 23, 24, 25].map(logoText);
    for (const text of texts) brandLogoSource(text);
    reads.count = 0;
    for (const text of texts.slice(1)) brandLogoSource(text);
    expect(reads.count).toBe(0);
    brandLogoSource(texts[0]);
    expect(reads.count).toBe(1);
  });
});

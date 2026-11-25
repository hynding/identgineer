import { readFileSync } from "node:fs";
import { generateBrandTheme, parseBrandKit } from "@identgineer/brand";
import { h, render } from "@stencil/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../brand-logo/brand-logo";
import "../brand-swatches/brand-swatches";
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

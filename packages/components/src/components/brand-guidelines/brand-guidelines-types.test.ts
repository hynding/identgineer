import { readFileSync } from "node:fs";
import {
  generateBrandTheme,
  parseBrandKit,
  type BrandKit,
  type BrandTheme,
} from "@identgineer/brand";
import { describe, expect, it } from "vitest";
import type { BrandGuidelinesKit, BrandGuidelinesTheme } from "./brand-guidelines-types";

const FIXTURES = new URL("../../../../brand/src/__fixtures__/", import.meta.url);
const result = parseBrandKit(
  JSON.parse(readFileSync(new URL("harbour-lights.kit.json", FIXTURES), "utf8")),
);
if (!result.ok) throw new Error("the fixture kit is not a kit");

// These are checked by the compiler, which `pnpm typecheck` runs over this file: a kit and a theme
// the brand package makes must be assignable to what the component declares, with no import of the
// brand package's types in the component's own.
const kit: BrandKit = result.kit;
const theme: BrandTheme = generateBrandTheme(kit);
const asKit: BrandGuidelinesKit = kit;
const asTheme: BrandGuidelinesTheme = theme;
const asDocument: BrandGuidelinesTheme = theme.document;

// @ts-expect-error a kit whose name is not text is not a kit
const badKit: BrandGuidelinesKit = { ...kit, name: 4 };
// @ts-expect-error a kit without a tone is not a kit
const noTone: BrandGuidelinesKit = { name: "x", typography: "system", corners: "soft" };
// @ts-expect-error a theme without a light and a dark scheme is not a theme
const badTheme: BrandGuidelinesTheme = { light: { color: {} } };

describe("the declared types of the guide's inputs", () => {
  it("accept the kit and the theme the brand package makes, and the theme's document", () => {
    expect([asKit, asTheme, asDocument, badKit, noTone, badTheme]).toHaveLength(6);
    expect(asKit.name).toBe("Harbour Lights");
  });
});

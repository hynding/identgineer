import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { brandKitToCms, readCmsBrandKit, readCmsBrandKitSummary } from "./cms-brand-kit.ts";
import { sanitiseSvgLogo } from "./sanitise-svg-logo.ts";
import { kitFrom } from "./test-support.ts";

const harbourLights = JSON.parse(
  readFileSync(new URL("./__fixtures__/harbour-lights.kit.json", import.meta.url), "utf8"),
) as Record<string, unknown>;

const LOGO_SOURCE =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 1"><rect width="2" height="1"/></svg>';

const sanitised = (source: string) => {
  const result = sanitiseSvgLogo(source);
  if (!result.ok) throw new Error("expected a logo");
  return result.svg;
};

/** A row as the CMS answers it: the kit's fields beside its own ids and timestamps. */
const rowOf = (data: object, extra: Record<string, unknown> = {}) => ({
  id: 7,
  documentId: "pjx5ucx7febfca6f8rtjrxga",
  ...data,
  isPublic: false,
  createdAt: "2026-11-25T02:17:45.897Z",
  updatedAt: "2026-11-25T02:17:45.897Z",
  publishedAt: "2026-11-25T02:17:45.897Z",
  ...extra,
});

const minimalRow = (extra: Record<string, unknown> = {}) =>
  rowOf(
    {
      brandId: "acme",
      name: "Acme",
      tagline: null,
      primaryColor: "#4f46e5",
      secondaryColor: null,
      neutralTint: null,
      typography: "system",
      corners: "soft",
      tone: "calm",
      logo: null,
      mark: null,
    },
    extra,
  );

const failure = (value: unknown) => {
  const result = readCmsBrandKit(value);
  if (result.ok) throw new Error("expected the record to be refused");
  return result;
};

describe("brandKitToCms", () => {
  it("writes every field of the CMS shape, null where the kit has none, and never an owner", () => {
    expect(brandKitToCms(kitFrom())).toEqual({
      brandId: "acme",
      name: "Acme",
      tagline: null,
      primaryColor: "#4f46e5",
      secondaryColor: null,
      neutralTint: null,
      typography: "system",
      corners: "soft",
      tone: "balanced",
      logo: null,
      mark: null,
    });
  });

  it("writes colours as lower-case #rrggbb and the logo and mark exactly as sanitised", () => {
    const logo = sanitised(LOGO_SOURCE);
    const kit = kitFrom({
      tagline: "Light the way",
      colors: { primary: "#F4C430", secondary: "#abc", neutralTint: "#1B2A4A" },
      logo,
      mark: logo,
    });
    expect(brandKitToCms(kit)).toMatchObject({
      tagline: "Light the way",
      primaryColor: "#f4c430",
      secondaryColor: "#aabbcc",
      neutralTint: "#1b2a4a",
      logo,
      mark: logo,
    });
  });

  it("ignores anything a JavaScript caller added to the kit, an owner included", () => {
    const kit = { ...kitFrom(), owner: 8, isPublic: true, themeTokens: {} };
    expect(Object.keys(brandKitToCms(kit))).not.toContain("owner");
    expect(Object.keys(brandKitToCms(kit))).not.toContain("themeTokens");
  });
});

describe("readCmsBrandKit", () => {
  it("round trips a kit through the CMS shape", () => {
    const parsed = kitFrom({
      ...harbourLights,
      tagline: "Light the way",
      mark: harbourLights.logo,
    });
    const result = readCmsBrandKit(rowOf(brandKitToCms(parsed), { isPublic: true }));
    expect(result).toEqual({
      ok: true,
      record: { documentId: "pjx5ucx7febfca6f8rtjrxga", isPublic: true, kit: parsed },
    });
  });

  it("reads a null optional field as absent", () => {
    const result = readCmsBrandKit(minimalRow());
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(Object.keys(result.record.kit).sort()).toEqual(
      ["colors", "corners", "id", "name", "tone", "typography"].sort(),
    );
    expect(Object.keys(result.record.kit.colors)).toEqual(["primary"]);
  });

  it("ignores the CMS's own ids and timestamps, and an owner it was not asked for", () => {
    const result = readCmsBrandKit(
      minimalRow({ locale: null, owner: { id: 3, email: "owner@example.test" } }),
    );
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain("owner@example.test");
  });

  it("refuses a field it does not know, naming it", () => {
    expect(failure(minimalRow({ themeTokens: {} })).errors).toEqual([
      {
        path: "themeTokens",
        code: "unknown-key",
        message: "themeTokens: is not a brand kit field",
      },
    ]);
  });

  it("refuses a prototype key without polluting anything", () => {
    const row = JSON.parse(
      `{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},${JSON.stringify(
        minimalRow(),
      ).slice(1)}`,
    ) as unknown;
    const result = failure(row);
    expect(result.errors.map((error) => [error.path, error.code])).toEqual([
      ["__proto__", "unknown-key"],
      ["constructor", "unknown-key"],
    ]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("stops listing a record's errors at 50, with one more saying so, however many keys it has", () => {
    const keys = Object.fromEntries(
      Array.from({ length: 7000 }, (_, index) => [`k${String(index)}`, 0]),
    );
    const { errors } = failure(minimalRow({ ...keys, primaryColor: "red" }));
    expect(errors).toHaveLength(51);
    expect(errors[49]).toMatchObject({ path: "k49", code: "unknown-key" });
    expect(errors[50]).toEqual({
      path: "",
      code: "too-many-errors",
      message: "too many errors to list",
    });
  });

  it("caps the errors of the record and of its fields together", () => {
    const keys = Object.fromEntries(
      Array.from({ length: 49 }, (_, index) => [`k${String(index)}`, 0]),
    );
    const { errors } = failure(minimalRow({ ...keys, primaryColor: "red", tone: 3 }));
    expect(errors.map((error) => error.code).slice(48)).toEqual([
      "unknown-key",
      "invalid-color",
      "too-many-errors",
    ]);
  });

  it("does not show a key that could carry markup", () => {
    expect(failure(minimalRow({ "<img src=x>": 1 })).errors[0]).toMatchObject({
      path: "(a key that cannot be shown)",
      code: "unknown-key",
    });
  });

  it("locates the kit's errors by the CMS field, never repeating the value", () => {
    const result = failure(
      minimalRow({ brandId: "dark", primaryColor: "javascript:alert(1)", tone: 3 }),
    );
    expect(result.errors).toEqual([
      expect.objectContaining({ path: "brandId", code: "reserved-id" }),
      expect.objectContaining({ path: "primaryColor", code: "invalid-color" }),
      expect.objectContaining({ path: "tone", code: "wrong-type" }),
    ]);
    expect(result.errors[0]?.message.startsWith("brandId: ")).toBe(true);
    expect(result.errors[1]?.message.startsWith("primaryColor: ")).toBe(true);
    expect(JSON.stringify(result)).not.toContain("javascript");
  });

  it("keeps the document id of a refused record so it can be named", () => {
    expect(failure(minimalRow({ name: "" }))).toMatchObject({
      documentId: "pjx5ucx7febfca6f8rtjrxga",
      errors: [{ path: "name", code: "too-short" }],
    });
  });

  it("refuses a logo that is not exactly what the sanitiser returns, without its text", () => {
    const hostile =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 1" onload="steal()"><rect width="2" height="1"/></svg>';
    const result = failure(minimalRow({ logo: hostile, mark: LOGO_SOURCE }));
    expect(result.errors.map((error) => [error.path, error.code])).toEqual([
      ["logo", "unsanitised-logo"],
      ["mark", "unsanitised-logo"],
    ]);
    expect(JSON.stringify(result)).not.toContain("steal");
    expect(JSON.stringify(result)).not.toContain("<svg");
  });

  it.each([
    ["documentId", undefined, "missing"],
    ["documentId", 12, "wrong-type"],
    ["documentId", "../brand-kits", "invalid-id"],
    ["documentId", "", "invalid-id"],
    ["isPublic", "yes", "wrong-type"],
    ["isPublic", undefined, "missing"],
  ])("refuses %s of %j", (field, value, code) => {
    const row = Object.fromEntries(
      Object.entries(minimalRow({ [field]: value })).filter(
        ([key]) => value !== undefined || key !== field,
      ),
    );
    expect(failure(row).errors).toEqual([expect.objectContaining({ path: field, code })]);
  });

  it("names no document id it could not read", () => {
    expect(failure(minimalRow({ documentId: "../x" })).documentId).toBeUndefined();
  });

  it.each([null, [], "kit", 3, new Date(0)])("refuses %j as a record", (value) => {
    expect(failure(value).errors).toEqual([
      { path: "", code: "not-an-object", message: "must be an object" },
    ]);
  });
});

describe("readCmsBrandKitSummary", () => {
  it("reads every field but the logo and mark, which it never checks", () => {
    const hostile =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 1" onload="steal()"><rect width="2" height="1"/></svg>';
    const result = readCmsBrandKitSummary(minimalRow({ logo: hostile, mark: 5, tagline: "Hi" }));
    expect(result).toEqual({
      ok: true,
      record: {
        documentId: "pjx5ucx7febfca6f8rtjrxga",
        isPublic: false,
        summary: { ...kitFrom({ tone: "calm", tagline: "Hi" }), logos: "not-loaded" },
      },
    });
    if (result.ok) expect(Object.keys(result.record.summary)).not.toContain("logo");
  });

  it("refuses what readCmsBrandKit refuses in the other fields", () => {
    const result = readCmsBrandKitSummary(minimalRow({ primaryColor: "red", extra: 1 }));
    expect(result).toMatchObject({
      ok: false,
      errors: [
        { path: "extra", code: "unknown-key" },
        { path: "primaryColor", code: "invalid-color" },
      ],
    });
  });
});

import { readFileSync } from "node:fs";
import {
  BrandKitStoreError,
  createBrandKitStore,
  parseBrandKit,
  type BrandKit,
  type BrandKitStore,
} from "@identgineer/brand";
import { describe, expect, it } from "vitest";
import {
  isBrandEditorStore,
  readSaved,
  readStoreFailure,
  type BrandEditorStore,
} from "./brand-editor-store";

const FIXTURES = new URL("../../../../brand/src/__fixtures__/", import.meta.url);
const parsed = parseBrandKit(JSON.parse(readFileSync(new URL("acme.kit.json", FIXTURES), "utf8")));
if (!parsed.ok) throw new Error("the fixture kit is not a kit");
const ACME: BrandKit = parsed.kit;
const CANARY = '<img src=x onerror="window.__pwned = 1">';

// Checked by the compiler, which `pnpm typecheck` runs over this file: the store the brand package
// makes is what the editor declares, with no import of the package's types in the component's own.
const real: BrandKitStore = createBrandKitStore({
  baseUrl: "https://cms.example.com",
  fetch: () => Promise.reject(new Error("not in a unit test")),
});
const asEditorStore: BrandEditorStore = real;
// @ts-expect-error a store without update is not one the editor can save to
const noUpdate: BrandEditorStore = { create: real.create };

describe("the editor's store", () => {
  it("is satisfied by the object createBrandKitStore returns", () => {
    expect(isBrandEditorStore(asEditorStore)).toBe(true);
    expect(noUpdate).toBeDefined();
  });

  it("is anything with create and update functions, and nothing else", () => {
    const fake = { create: () => Promise.resolve({ ok: true }), update: () => Promise.resolve({}) };
    expect(isBrandEditorStore(fake)).toBe(true);
    for (const value of [
      undefined,
      null,
      "store",
      { create: () => undefined },
      { create: "x", update: "y" },
      new Proxy(
        {},
        {
          get(): never {
            throw new Error("no");
          },
        },
      ),
    ]) {
      expect(isBrandEditorStore(value)).toBe(false);
    }
  });
});

describe("readSaved", () => {
  it("reads the document id and the theme id of a stored kit", () => {
    expect(
      readSaved({ ok: true, record: { documentId: "abc123", isPublic: false, kit: ACME } }),
    ).toEqual({ documentId: "abc123", id: "acme" });
  });

  it("reads anything else, a refused record included, as nothing", () => {
    for (const value of [
      undefined,
      null,
      { ok: false, errors: [] },
      { ok: true },
      { ok: true, record: { documentId: "has spaces", kit: ACME } },
      { ok: true, record: { documentId: `a${CANARY}`, kit: ACME } },
      { ok: true, record: { documentId: "abc", kit: { id: 4 } } },
      { ok: "true", record: { documentId: "abc", kit: ACME } },
      {
        ok: true,
        get record(): never {
          throw new Error("no");
        },
      },
    ]) {
      expect(readSaved(value)).toBeUndefined();
    }
  });
});

describe("readStoreFailure", () => {
  it("reads the store's error code and the fields it names, as the form's fields", () => {
    expect(
      readStoreFailure(
        new BrandKitStoreError("validation", { fields: ["brandId", "primaryColor", "logo"] }),
      ),
    ).toEqual({ code: "validation", fields: ["id", "primary", "logo"] });
    expect(
      readStoreFailure(
        new BrandKitStoreError("not-applied", {
          fields: ["tagline", "neutralTint", "secondaryColor"],
          documentId: "doc-1",
        }),
      ),
    ).toEqual({
      code: "not-applied",
      fields: ["tagline", "neutralTint", "secondary"],
      documentId: "doc-1",
    });
    expect(readStoreFailure(new BrandKitStoreError("network"))).toEqual({
      code: "network",
      fields: [],
    });
  });

  it("reads every store code, and nothing of the message", () => {
    for (const code of [
      "unauthorized",
      "forbidden",
      "not-found",
      "validation",
      "not-applied",
      "rate-limited",
      "network",
      "request-refused",
      "malformed-response",
      "unexpected-status",
    ] as const) {
      expect(readStoreFailure(new BrandKitStoreError(code))).toEqual({ code, fields: [] });
    }
  });

  it("reads an unknown code, an unknown field, a bad document id and anything thrown as unknown or left out", () => {
    expect(readStoreFailure(new Error(CANARY))).toEqual({ code: "unknown", fields: [] });
    expect(readStoreFailure({ code: "conflict", message: CANARY })).toEqual({
      code: "unknown",
      fields: [],
    });
    expect(
      readStoreFailure({
        code: "validation",
        fields: ["owner", CANARY, 4, "name", "name"],
        documentId: CANARY,
      }),
    ).toEqual({ code: "validation", fields: ["name"] });
    expect(readStoreFailure({ code: "validation", fields: "primaryColor" })).toEqual({
      code: "validation",
      fields: [],
    });
    for (const value of [
      undefined,
      null,
      "network",
      42,
      new Proxy(
        {},
        {
          get(): never {
            throw new Error("no");
          },
          getOwnPropertyDescriptor(): never {
            throw new Error("no");
          },
        },
      ),
      {
        get code(): never {
          throw new Error("no");
        },
      },
    ]) {
      expect(readStoreFailure(value)).toEqual({ code: "unknown", fields: [] });
    }
  });
});

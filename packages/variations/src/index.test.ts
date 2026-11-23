import { describe, expect, it } from "vitest";
import * as variations from "./index.ts";

describe("the public API", () => {
  it("exports the documented surface and nothing else", () => {
    expect(Object.keys(variations).sort()).toEqual(
      [
        "AXES",
        "CHANGE_EVENT",
        "REGISTRY",
        "STORAGE_KEY",
        "URL_PARAM_PREFIX",
        "applyVariations",
        "clearStoredVariations",
        "decodeVariations",
        "encodeVariations",
        "getVariations",
        "isVariationId",
        "loadVariations",
        "onVariationsChange",
        "parseVariations",
        "registerThemeIds",
        "resetVariations",
        "saveVariations",
        "shuffleVariations",
        "validateVariations",
        "variationsUrl",
      ].sort(),
    );
  });

  it("is safe to import where there is no DOM", () => {
    expect(typeof (globalThis as { document?: unknown }).document).toBe("undefined");
    expect(variations.getVariations().theme).toBe("aurora");
  });
});

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
        "resetVariations",
        "saveVariations",
        "shuffleVariations",
        "validateVariations",
        "variationsUrl",
      ].sort(),
    );
  });

  it("does not pull Node-only code into the browser entry point", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/bootstrap|node:/);
  });

  it("is safe to import where there is no DOM", () => {
    expect(typeof (globalThis as { document?: unknown }).document).toBe("undefined");
    expect(variations.getVariations().theme).toBe("aurora");
  });
});

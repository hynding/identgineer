import { describe, expect, it } from "vitest";
import { attributes, run } from "./bootstrap-harness.ts";
import { STORAGE_KEY, URL_PARAM_PREFIX } from "./constants.ts";
import { VECTORS } from "./hostile-vectors.ts";
import { STATE_KEYS } from "./registry.ts";
import { loadVariations } from "./storage.ts";
import { decodeVariations } from "./url.ts";

/** The runtime's answer in the bootstrap's terms: `system` is the absence of the attribute. */
function runtimeAnswer(value: string | undefined): string | null {
  return value === undefined || value === "system" ? null : value;
}

describe("the runtime and the built bootstrap agree on every hostile vector", () => {
  describe("in the URL", () => {
    for (const key of STATE_KEYS) {
      it(`for ${key}`, () => {
        for (const { name, value } of VECTORS) {
          if (typeof value !== "string") continue;
          const search = `?${URL_PARAM_PREFIX}${key}=${encodeURIComponent(value)}`;
          const fromRuntime = runtimeAnswer(decodeVariations(search)[key]);
          const fromBootstrap = attributes(run({ search }).root)[key];
          expect(fromBootstrap, `${name} in the URL`).toBe(fromRuntime);
        }
      });
    }
  });

  describe("in storage", () => {
    for (const key of STATE_KEYS) {
      it(`for ${key}`, () => {
        for (const { name, value } of VECTORS) {
          const stored = JSON.stringify({ [key]: value });
          const fromRuntime = runtimeAnswer(
            loadVariations({
              getItem: (name) => (name === STORAGE_KEY ? stored : null),
            } as never)[key],
          );
          const fromBootstrap = attributes(run({ stored }).root)[key];
          expect(fromBootstrap, `${name} in storage`).toBe(fromRuntime);
        }
      });
    }
  });

  it("accepts the valid ids and rejects the rest, so the table is not vacuous", () => {
    const accepted = VECTORS.filter(
      ({ value }) =>
        typeof value === "string" &&
        Object.keys(decodeVariations(`?idg-theme=${value}`)).length > 0,
    );
    expect(accepted.length).toBeGreaterThanOrEqual(8);
    expect(accepted.length).toBeLessThan(VECTORS.length / 2);
  });
});

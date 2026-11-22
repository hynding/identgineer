import { describe, expect, it } from "vitest";
import { FONT_PAIRINGS, TYPOGRAPHY_IDS } from "./font-pairings.ts";

const GENERIC_FAMILIES = ["serif", "sans-serif", "monospace", "system-ui", "ui-monospace"];

describe("font pairings", () => {
  it("offers several pairings with unique ids, listed in TYPOGRAPHY_IDS", () => {
    expect(FONT_PAIRINGS.length).toBeGreaterThanOrEqual(5);
    expect(FONT_PAIRINGS.map((pairing) => pairing.id)).toEqual([...TYPOGRAPHY_IDS]);
    expect(new Set(TYPOGRAPHY_IDS).size).toBe(TYPOGRAPHY_IDS.length);
  });

  it.each(FONT_PAIRINGS)(
    "$id ends every stack in a generic family, so nothing is fetched",
    (pairing) => {
      for (const stack of [pairing.display, pairing.body, pairing.mono]) {
        expect(GENERIC_FAMILIES).toContain(stack.at(-1));
        for (const family of stack) {
          // Plain names only: nothing that could close a quoted font name or start a URL.
          expect(family).toMatch(/^[A-Za-z][A-Za-z0-9 -]{0,40}$/);
        }
      }
    },
  );

  it.each(FONT_PAIRINGS)("$id has typography values within sane bounds", (pairing) => {
    expect([400, 500, 600, 700, 800, 900]).toContain(pairing.displayWeight);
    expect(pairing.displayLineHeight).toBeGreaterThanOrEqual(1);
    expect(pairing.displayLineHeight).toBeLessThanOrEqual(1.4);
    expect(pairing.bodyLineHeight).toBeGreaterThanOrEqual(1.4);
    expect(pairing.bodyLineHeight).toBeLessThanOrEqual(1.8);
    expect(pairing.label).not.toBe("");
    expect(Object.isFrozen(pairing)).toBe(true);
    expect(Object.isFrozen(pairing.display)).toBe(true);
  });
});

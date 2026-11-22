import { describe, expect, it } from "vitest";
import { fillTemplate, mergeLabels } from "./labels";

const DEFAULTS = { submit: "Sign in", title: "Welcome" } as const;

describe("mergeLabels", () => {
  it("keeps every default without overrides", () => {
    expect(mergeLabels(DEFAULTS, undefined)).toEqual(DEFAULTS);
  });

  it("takes the strings it is given and keeps the defaults of the rest", () => {
    expect(mergeLabels(DEFAULTS, { submit: "Anmelden" })).toEqual({
      submit: "Anmelden",
      title: "Welcome",
    });
  });

  it("ignores what is not a string, so a partial object from JavaScript cannot blank a label", () => {
    const overrides = { submit: undefined, title: 3, extra: "x" } as unknown as Partial<
      typeof DEFAULTS
    >;
    expect(mergeLabels(DEFAULTS, overrides)).toEqual(DEFAULTS);
  });

  it("ignores an overrides value that is not an object", () => {
    expect(mergeLabels(DEFAULTS, "nope" as unknown as Partial<typeof DEFAULTS>)).toEqual(DEFAULTS);
  });
});

describe("fillTemplate", () => {
  it("replaces each named placeholder", () => {
    expect(fillTemplate("Try again in {time}.", { time: "0:42" })).toBe("Try again in 0:42.");
  });

  it("leaves an unknown placeholder as written", () => {
    expect(fillTemplate("{used} of {max}", { used: "3" })).toBe("3 of {max}");
  });

  it("does not read a replacement as a pattern", () => {
    expect(fillTemplate("{name}", { name: "$& $1" })).toBe("$& $1");
  });
});

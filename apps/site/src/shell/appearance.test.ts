import { describe, expect, it } from "vitest";
import { describeChoice, describeLook, labelOf, lookCount } from "./appearance";

describe("a description of the page's look", () => {
  it("names the four axes by their labels, for a live region to read out", () => {
    expect(
      describeLook({
        theme: "ember",
        design: "glass",
        layout: "bento",
        ux: "focus",
        scheme: "system",
      }),
    ).toBe(
      "Now showing the Ember theme, the Glass design, the Bento layout and the Focus UX mode.",
    );
  });

  it("falls back to the id for a theme the registry does not know, such as one from a brand kit", () => {
    const look = describeLook({
      theme: "acme" as never,
      design: "flat",
      layout: "top-bar",
      ux: "comfortable",
      scheme: "dark",
    });
    expect(look).toContain("the acme theme");
  });
});

describe("the number of looks", () => {
  it("is every combination of the four axes", () => {
    expect(lookCount()).toBe(8 * 8 * 8 * 8);
  });
});

describe("a description of one choice", () => {
  it("names the axis and the value by their labels", () => {
    expect(describeChoice("design", "brutalist")).toBe("Design: Brutalist.");
    expect(describeChoice("ux", "power")).toBe("UX mode: Power.");
  });

  it("falls back to the id for a value the registry does not know", () => {
    expect(labelOf("theme", "acme")).toBe("acme");
    expect(labelOf("theme", "ember")).toBe("Ember");
    expect(describeChoice("theme", "acme")).toBe("Theme: acme.");
  });
});

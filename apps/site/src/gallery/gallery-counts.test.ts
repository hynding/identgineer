import { REGISTRY, type VariationsRegistry } from "@identgineer/variations";
import { describe, expect, it } from "vitest";
import { routeOfPath } from "../routes.ts";
import { countsLine } from "./gallery-counts.ts";

function withThemes(count: number): VariationsRegistry {
  const [first] = REGISTRY.theme.variations;
  if (first === undefined) throw new Error("no theme");
  return {
    ...REGISTRY,
    theme: {
      ...REGISTRY.theme,
      variations: Array.from({ length: count }, (_, index) => ({
        ...first,
        id: `theme-${String(index)}` as never,
      })),
    },
  };
}

describe("the line that counts the gallery's values", () => {
  it("names every axis's count in words, from the registries", () => {
    expect(countsLine(REGISTRY)).toBe("Eight themes, eight designs, eight layouts and eight UX modes");
  });

  it("follows a registry that gains or loses a value", () => {
    expect(countsLine(withThemes(9))).toBe("Nine themes, eight designs, eight layouts and eight UX modes");
    expect(countsLine(withThemes(1))).toBe("One theme, eight designs, eight layouts and eight UX modes");
  });

  it("writes a count past twelve as a number", () => {
    expect(countsLine(withThemes(13))).toBe("13 themes, eight designs, eight layouts and eight UX modes");
  });

  it("is what the gallery's route says of the page", () => {
    expect(routeOfPath("/variations/")?.description).toBe(
      `${countsLine()}, side by side and ready to mix.`,
    );
  });
});

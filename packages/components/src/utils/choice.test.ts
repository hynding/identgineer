import { describe, expect, it } from "vitest";
import { oneOf } from "./choice";

const SIZES = ["sm", "md", "lg"] as const;

describe("oneOf", () => {
  it("returns an allowed value", () => {
    expect(oneOf(SIZES, "lg", "md")).toBe("lg");
  });

  it.each([undefined, null, "", "huge", "LG", 3])("falls back for %j", (value) => {
    expect(oneOf(SIZES, value, "md")).toBe("md");
  });
});

import { TOKEN_NAMES } from "@identgineer/tokens";
import { describe, expect, it } from "vitest";
import { GAP_STEPS, SIZE_STEPS, stepOf } from "./layout-steps";

describe("layout steps", () => {
  it.each(GAP_STEPS.filter((step) => step !== "none"))(
    "gap step %s is a step of the space scale",
    (step) => {
      expect(TOKEN_NAMES).toContain(`--idg-space-${step}`);
    },
  );

  it("offers no gap that is not none or a space step", () => {
    const spaceSteps = TOKEN_NAMES.filter((name) => name.startsWith("--idg-space-")).map((name) =>
      name.replace("--idg-space-", ""),
    );
    expect([...GAP_STEPS].filter((step) => step !== "none").sort()).toEqual([...spaceSteps].sort());
  });

  it.each(SIZE_STEPS)("size step %s is a step of the size scale", (step) => {
    expect(TOKEN_NAMES).toContain(`--idg-size-${step}`);
  });

  it("orders gaps and sizes from smallest to largest", () => {
    expect(GAP_STEPS[0]).toBe("none");
    expect(GAP_STEPS.at(-1)).toBe("3xl");
    expect(SIZE_STEPS[0]).toBe("xs");
    expect(SIZE_STEPS.at(-1)).toBe("2xl");
  });
});

describe("stepOf", () => {
  it("returns an allowed step", () => {
    expect(stepOf(SIZE_STEPS, "xl")).toBe("xl");
  });

  it.each([undefined, null, "", "huge", "XL", "20rem", "var(--x)", 3])(
    "returns undefined for %j, so the layout's own value applies",
    (value) => {
      expect(stepOf(SIZE_STEPS, value)).toBeUndefined();
    },
  );
});

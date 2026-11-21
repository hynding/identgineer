import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GAP_STEPS, SIZE_STEPS, stepOf } from "./layout-steps";

const PRIMITIVES: unknown = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../tokens/src/tokens/primitive.json", import.meta.url)),
    "utf8",
  ),
);

/** The steps of a scale in the tokens package, read from the source the CSS is built from. */
function stepsOf(scale: string): string[] {
  const group = isRecord(PRIMITIVES) ? PRIMITIVES[scale] : undefined;
  if (!isRecord(group)) throw new Error(`the tokens have no ${scale} scale`);
  return Object.keys(group).filter((key) => !key.startsWith("$"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

describe("layout steps", () => {
  it("offers none and exactly the steps of the space scale as gaps", () => {
    expect([...GAP_STEPS].filter((step) => step !== "none").sort()).toEqual(
      stepsOf("space").sort(),
    );
  });

  it("offers every step of the size scale but screen as a size", () => {
    expect([...SIZE_STEPS].sort()).toEqual(
      stepsOf("size")
        .filter((step) => step !== "screen")
        .sort(),
    );
  });

  it("keeps screen in the size scale, for the cover", () => {
    expect(stepsOf("size")).toContain("screen");
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

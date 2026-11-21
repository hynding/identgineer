import { describe, expect, it } from "vitest";
import { computePosition, type PositionInput } from "./position";

const VIEWPORT = { width: 1000, height: 800 };
const ANCHOR = { x: 100, y: 100, width: 80, height: 30 };
const FLOATING = { width: 200, height: 100 };

function place(overrides: Partial<PositionInput>) {
  return computePosition({
    anchor: ANCHOR,
    floating: FLOATING,
    viewport: VIEWPORT,
    placement: "bottom-start",
    offset: 8,
    padding: 8,
    ...overrides,
  });
}

describe("computePosition", () => {
  it.each([
    ["bottom-start", 100, 138],
    ["bottom", 40, 138],
    ["top-start", 100, -8],
    ["right-start", 188, 100],
    ["right", 188, 65],
    ["right-end", 188, 30],
  ] as const)("places %s against the anchor before any correction", (placement, x, y) => {
    const tall = { anchor: { ...ANCHOR, y: 400 } };
    const result = place({ placement, ...(placement.startsWith("top") ? tall : {}) });
    expect(result.x).toBe(x);
    expect(result.y).toBe(placement.startsWith("top") ? 292 : y);
  });

  it("flips to the other side when the preferred side has no room", () => {
    const result = place({ placement: "top", anchor: { ...ANCHOR, y: 50 } });
    expect(result.placement).toBe("bottom");
    expect(result.y).toBe(88);
  });

  it("flips horizontally near the far edge", () => {
    const result = place({ placement: "right-start", anchor: { ...ANCHOR, x: 900 } });
    expect(result.placement).toBe("left-start");
    expect(result.x).toBe(692);
  });

  it("keeps the preferred side when neither side has room, and stays inside the viewport", () => {
    const result = place({
      placement: "bottom",
      anchor: { x: 400, y: 380, width: 80, height: 40 },
      floating: { width: 200, height: 700 },
    });
    expect(result.placement).toBe("bottom");
    expect(result.y).toBe(92);
  });

  it("shifts along the cross axis to stay inside the viewport", () => {
    expect(place({ placement: "bottom-start", anchor: { ...ANCHOR, x: 950 } }).x).toBe(792);
    expect(place({ placement: "bottom-end", anchor: { ...ANCHOR, x: 10 } }).x).toBe(8);
  });

  it("pins a surface wider than the viewport to the start padding", () => {
    expect(place({ floating: { width: 1200, height: 100 } }).x).toBe(8);
  });

  it("treats an unknown placement as bottom", () => {
    const result = place({ placement: "sideways" as "bottom" });
    expect(result.placement).toBe("bottom");
  });
});

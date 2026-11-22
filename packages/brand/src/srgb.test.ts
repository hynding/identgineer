import { describe, expect, it } from "vitest";
import { formatHexColor, parseHexColor } from "./srgb.ts";

describe("parseHexColor", () => {
  it.each([
    ["#000000", [0, 0, 0]],
    ["#ffffff", [255, 255, 255]],
    ["#4f46e5", [79, 70, 229]],
    ["#4F46E5", [79, 70, 229]],
    ["#fff", [255, 255, 255]],
    ["#a1c", [170, 17, 204]],
  ])("reads %s as numbers", (input, expected) => {
    expect(parseHexColor(input)).toEqual(expected);
  });

  it.each([
    "",
    "#",
    "#ff",
    "#ffff",
    "#fffff",
    "#fffffff",
    "#ffffffff",
    "ffffff",
    " #ffffff",
    "#ffffff ",
    "#ffffff\n",
    "#ffffff\0",
    "#gggggg",
    "#ff ff ff",
    "#ｆｆｆ",
    "red",
    "rgb(1, 2, 3)",
    "red;} body{display:none}",
    "#fff;}",
    "#ffffff".repeat(1000),
  ])("refuses %j", (input) => {
    expect(parseHexColor(input)).toBeUndefined();
  });
});

describe("formatHexColor", () => {
  it("writes six lower-case digits from numbers", () => {
    expect(formatHexColor([79, 70, 229])).toBe("#4f46e5");
    expect(formatHexColor([0, 0, 0])).toBe("#000000");
    expect(formatHexColor([255, 255, 255])).toBe("#ffffff");
    expect(formatHexColor([10, 11, 12])).toBe("#0a0b0c");
  });

  it("rounds and clamps, so any number becomes a valid channel", () => {
    expect(formatHexColor([254.6, -3, 300])).toBe("#ff00ff");
    expect(formatHexColor([Number.NaN, 0.4, 0.5])).toBe("#000001");
  });

  it("round-trips every #rgb colour", () => {
    for (let value = 0; value < 4096; value += 1) {
      const hex = `#${[8, 4, 0].map((shift) => ((value >> shift) & 15).toString(16).repeat(2)).join("")}`;
      const rgb = parseHexColor(hex);
      expect(rgb && formatHexColor(rgb)).toBe(hex);
    }
  });
});

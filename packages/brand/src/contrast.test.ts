import { contrastRatio, relativeLuminance } from "@identgineer/tokens";
import { describe, expect, it } from "vitest";
import { contrastBetween, luminanceOf } from "./contrast.ts";
import { formatHexColor } from "./srgb.ts";
import { seeded } from "./seeded-random.ts";

describe("contrastBetween", () => {
  it("agrees bit for bit with the tokens package's WCAG check, which the build applies", () => {
    const random = seeded(1);
    const channel = () => Math.floor(random() * 256);
    for (let index = 0; index < 5_000; index += 1) {
      const first = [channel(), channel(), channel()] as const;
      const second = [channel(), channel(), channel()] as const;
      expect(luminanceOf(first)).toBe(relativeLuminance(formatHexColor(first)));
      expect(contrastBetween(first, second)).toBe(
        contrastRatio(formatHexColor(first), formatHexColor(second)),
      );
    }
  });

  it("is 21 for black on white and 1 for a colour on itself", () => {
    expect(contrastBetween([0, 0, 0], [255, 255, 255])).toBe(21);
    expect(contrastBetween([79, 70, 229], [79, 70, 229])).toBe(1);
  });
});

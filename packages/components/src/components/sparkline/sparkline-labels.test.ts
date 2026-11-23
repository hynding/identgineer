import { describe, expect, it } from "vitest";
import { numberFormatter } from "../../utils/format-number";
import { SPARKLINE_LABELS, describeSparkline } from "./sparkline-labels";
import { summarise } from "./sparkline-values";

const say = (values: number[]) =>
  describeSparkline("", summarise(values), SPARKLINE_LABELS, numberFormatter("en"));

describe("describeSparkline", () => {
  it("says the numbers as they are written, and a trend they agree with", () => {
    expect(say([1, 5, 9])).toBe("From 1 to 9, lowest 1, highest 9, rising.");
    expect(say([9, 1])).toBe("From 9 to 1, lowest 1, highest 9, falling.");
  });

  it("does not claim a trend that the written numbers contradict", () => {
    expect(say([100, 100.001])).toBe("From 100 to 100, lowest 100, highest 100, steady.");
    expect(say([5e-324, 0])).toBe("From 5E-324 to 0, lowest 0, highest 5E-324, falling.");
  });

  it("writes minus zero as zero and a huge number in a few characters", () => {
    expect(say([-0, 0])).toBe("From 0 to 0, lowest 0, highest 0, steady.");
    expect(say([1e308, 1])).toBe("From 1E308 to 1, lowest 1, highest 1E308, falling.");
  });
});

import { describe, expect, it } from "vitest";
import { isSettledOutput } from "./settled-output.ts";

const VALID =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10"><rect width="1" height="1"/></svg>';
const INVALID =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10"><use x="1"/></svg>';

describe("isSettledOutput, the sanitiser's check of its own output", () => {
  it("takes an output the independent check passes and a second pass gives back", () => {
    expect(isSettledOutput(VALID, (svg) => svg)).toBe(true);
  });

  it("refuses an output a second pass would change or refuse", () => {
    expect(isSettledOutput(VALID, (svg) => `${svg} `)).toBe(false);
    expect(isSettledOutput(VALID, () => undefined)).toBe(false);
  });

  it("refuses an output the independent check finds a problem in, before a second pass", () => {
    let passes = 0;
    const again = (svg: string): string => {
      passes += 1;
      return svg;
    };
    expect(isSettledOutput(INVALID, again)).toBe(false);
    expect(passes).toBe(0);
  });
});

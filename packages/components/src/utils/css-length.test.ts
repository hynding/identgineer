import { describe, expect, it } from "vitest";
import { safeCssLength } from "./css-length";

describe("safeCssLength", () => {
  it.each(["20rem", "320px", "50vh", "12.5em", "80%", "40dvh", "60ch"])("keeps %s", (value) => {
    expect(safeCssLength(value)).toBe(value);
  });

  it.each([
    "",
    "20",
    "rem",
    "20 rem",
    " 20rem",
    "calc(1px + 2px)",
    "20rem; color: red",
    "url(x)",
    "-5px",
    "1e3px",
    "var(--x)",
    "20rem !important",
  ])("refuses %j", (value) => {
    expect(safeCssLength(value)).toBeUndefined();
  });

  it("refuses a missing value", () => {
    expect(safeCssLength(undefined)).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import { toFilePath } from "../scripts/to-file-path.ts";

describe("toFilePath", () => {
  it("decodes percent-encoding, as a checkout path with a space or non-ASCII needs", () => {
    expect(toFilePath(new URL("file:///home/my%20repo/p%C3%A9/a.ts"))).toBe(
      "/home/my repo/pé/a.ts",
    );
  });

  it("is what the generator uses for the target it reads Prettier's config for", () => {
    const here = toFilePath(
      new URL("../src/generated/registry-data.ts", import.meta.url.replace(/[^/]*$/, "x/")),
    );
    expect(here).not.toContain("%");
  });
});

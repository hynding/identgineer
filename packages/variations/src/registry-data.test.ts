import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderRegistryData } from "../scripts/render-registry-data.ts";

describe("the checked-in registry data", () => {
  it("is byte for byte what the generator produces from @identgineer/tokens", async () => {
    const checkedIn = readFileSync(
      new URL("./generated/registry-data.ts", import.meta.url),
      "utf8",
    );
    expect(checkedIn).toBe(await renderRegistryData());
  });

  it("says in its header that it is generated, and by what", () => {
    const checkedIn = readFileSync(
      new URL("./generated/registry-data.ts", import.meta.url),
      "utf8",
    );
    expect(checkedIn.split("\n").slice(0, 3).join("\n")).toMatch(/generated.*do not edit/is);
    expect(checkedIn).toContain("pnpm --filter @identgineer/variations generate");
  });
});

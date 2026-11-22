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

  it("carries the added theme id rule of @identgineer/tokens, so the browser entry applies the same rule", async () => {
    const { ADDED_THEME_ID_RULE } = await import("@identgineer/tokens");
    const { REGISTRY_DATA } = await import("./generated/registry-data.ts");
    expect(REGISTRY_DATA.theme.addedIdRule).toEqual(ADDED_THEME_ID_RULE);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const WORKFLOW = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");

function commands(job: string): string[] {
  const body = WORKFLOW.split(new RegExp(`^  ${job}:`, "m"))[1]?.split(/^  \S/m)[0] ?? "";
  return [...body.matchAll(/^\s+- run: (.+)$/gm)].map((match) => match[1] ?? "");
}

// Some checks read build output (dist is git-ignored), so in CI they can only see it if the build
// came first; otherwise they skip and the guarantee they give is empty.
describe("the verify job", () => {
  const steps = commands("verify");

  it("builds before it runs the tests", () => {
    expect(steps).toContain("pnpm build");
    expect(steps.indexOf("pnpm build")).toBeLessThan(steps.indexOf("pnpm test"));
  });
});

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TYPES = fileURLToPath(new URL("../dist/types", import.meta.url));

function declarations(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return declarations(path);
    return entry.name.endsWith(".d.ts") ? [path] : [];
  });
}

// The variations package is TypeScript source with `.ts` import specifiers, which a consumer's
// compiler refuses to read (TS5097). Nothing a consumer can import may point at it. This reads the
// build output, so it needs the components built first (CI builds before it tests). Locally it
// skips when there is no build; in CI a missing build fails, so the guard can never be silently empty.
describe("the built declarations", () => {
  it.runIf(Boolean(process.env["CI"]))("are built when running in CI", () => {
    expect(existsSync(TYPES)).toBe(true);
  });
});

describe.skipIf(!existsSync(TYPES))("the built declarations, once built", () => {
  const files = existsSync(TYPES) ? declarations(TYPES) : [];

  it("are there", () => {
    expect(files.some((file) => file.endsWith("variation-switcher.d.ts"))).toBe(true);
  });

  it("never import from @identgineer/variations", () => {
    const leaking = files.filter((file) =>
      /from\s+["']@identgineer\/variations|import\(["']@identgineer\/variations/.test(
        readFileSync(file, "utf8"),
      ),
    );
    expect(leaking.map((file) => file.slice(TYPES.length + 1))).toEqual([]);
  });
});

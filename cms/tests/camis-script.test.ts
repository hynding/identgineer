import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const SCRIPT = fileURLToPath(new URL("../scripts/camis.js", import.meta.url));

const run = (environment: Record<string, string | undefined>) => {
  const env = { ...process.env, ...environment };
  if (environment.CAMIS_DIR === undefined) delete env.CAMIS_DIR;
  return spawnSync(process.execPath, [SCRIPT, "validate", "camis.json"], {
    encoding: "utf8",
    env,
  });
};

describe("cms/scripts/camis.js", () => {
  const empty = mkdtempSync(join(tmpdir(), "camis-dir-"));
  afterAll(() => {
    rmSync(empty, { recursive: true, force: true });
  });

  it("refuses to run without CAMIS_DIR and says how to set it", () => {
    const result = run({ CAMIS_DIR: undefined });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("CAMIS_DIR is not set");
    expect(result.stdout).toBe("");
  });

  it("refuses an empty CAMIS_DIR", () => {
    const result = run({ CAMIS_DIR: "" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("CAMIS_DIR is not set");
  });

  it("refuses a CAMIS_DIR that is not a camis checkout and names the path", () => {
    const result = run({ CAMIS_DIR: empty });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(join(empty, "packages", "cli", "bin", "camis.mjs"));
  });
});

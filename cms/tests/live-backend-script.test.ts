import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { readCmsText } from "./model";

const SCRIPT = fileURLToPath(new URL("../scripts/live-backend.js", import.meta.url));

const run = (camisDir: string | undefined) => {
  const env = { ...process.env, CAMIS_DIR: camisDir };
  if (camisDir === undefined) delete env.CAMIS_DIR;
  return spawnSync(process.execPath, [SCRIPT, "--", "true"], { encoding: "utf8", env });
};

describe("cms/scripts/live-backend.js", () => {
  const empty = mkdtempSync(join(tmpdir(), "camis-dir-"));
  afterAll(() => {
    rmSync(empty, { recursive: true, force: true });
  });

  it("refuses to run without CAMIS_DIR, before writing anything", () => {
    const result = run(undefined);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("CAMIS_DIR is not set");
    expect(result.stdout).toBe("");
  });

  it("refuses a CAMIS_DIR that is not a camis checkout", () => {
    const result = run(empty);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`CAMIS_DIR does not hold a camis checkout: ${empty}`);
  });

  it("serves on the loopback address only and writes inside the git-ignored generated directory", () => {
    const script = readCmsText("scripts/live-backend.js");
    expect(script).toContain('const HOST = "127.0.0.1";');
    expect(script).toContain('const LIVE_DIR = join(CMS_DIR, "generated", "live");');
  });

  it("generates a fresh APP_KEY at run time instead of holding one", () => {
    expect(readCmsText("scripts/live-backend.js")).toContain(
      'APP_KEY: `base64:${randomBytes(32).toString("base64")}`',
    );
  });
});

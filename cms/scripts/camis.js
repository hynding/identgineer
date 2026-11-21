// Runs the camis CLI from a local camis checkout against this directory's project. camis is not
// published to npm, so it is found through CAMIS_DIR instead of being a dependency.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CMS_DIR = fileURLToPath(new URL("..", import.meta.url));

const fail = (message) => {
  process.stderr.write(`${message}\n`);
  process.exit(1);
};

const camisDir = process.env.CAMIS_DIR;
if (camisDir === undefined || camisDir === "") {
  fail(
    [
      "CAMIS_DIR is not set.",
      "Point it at a camis checkout (https://github.com/hynding/camis) with its dependencies installed:",
      "  git clone https://github.com/hynding/camis ../camis && pnpm -C ../camis install",
      "  CAMIS_DIR=../camis pnpm cms:validate",
    ].join("\n"),
  );
}

const bin = resolve(camisDir, "packages", "cli", "bin", "camis.mjs");
if (!existsSync(bin)) {
  fail(`CAMIS_DIR does not hold a camis checkout: ${bin} does not exist.`);
}

const result = spawnSync(process.execPath, ["--no-warnings", bin, ...process.argv.slice(2)], {
  cwd: CMS_DIR,
  stdio: "inherit",
});
if (result.error !== undefined) fail(`could not run camis: ${result.error.message}`);
process.exit(result.status ?? 1);

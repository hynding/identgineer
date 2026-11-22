import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const SCRIPT = fileURLToPath(new URL("../scripts/live-backend.js", import.meta.url));
export const NODE = process.execPath;

/**
 * A stand-in `php` on a PATH of its own (no Composer): `-r` prints the version in the file
 * `php-version`, `artisan` records its environment, and `-S` serves `/up` (or, as the file
 * `server-mode` says, fails at boot or exits a moment after coming up), recording its arguments,
 * environment and process id.
 */
const FAKE_PHP = `#!${NODE}
const { appendFileSync, existsSync, readFileSync } = require("node:fs");
const { createServer } = require("node:http");
const { join } = require("node:path");
const here = __dirname;
const record = (file, value) => appendFileSync(join(here, file), JSON.stringify(value) + "\\n");
const [first, second] = process.argv.slice(2);
if (first === "-r") {
  process.stdout.write(readFileSync(join(here, "php-version"), "utf8"));
} else if (first === "artisan") {
  record("artisan.jsonl", { args: process.argv.slice(2), env: process.env });
} else if (first === "-S") {
  const mode = existsSync(join(here, "server-mode")) ? readFileSync(join(here, "server-mode"), "utf8") : "ok";
  record("server.jsonl", { args: process.argv.slice(2), env: process.env, pid: process.pid });
  if (mode === "die-at-boot") {
    process.stderr.write("Failed to listen on " + second + " (reason: Address already in use)\\n");
    process.exit(1);
  }
  const [host, port] = second.split(":");
  createServer((request, response) => response.end("up")).listen(Number(port), host);
  if (mode === "die-after-up") setTimeout(() => process.exit(3), 1500);
}
`;

/**
 * A stand-in camis CLI: `scaffold filament <dir>` lays out a Laravel app whose vendor package carries its
 * git checkout, as Composer leaves one it could only clone; `build` records its process id in
 * `build.pid` and, when the file `build-mode` says `hang`, runs until it is killed.
 */
const FAKE_CAMIS = `import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const here = import.meta.dirname;
const [command, ...rest] = process.argv.slice(2);
const dir = rest.at(-1);
if (command === "scaffold") {
  for (const sub of ["public", join("storage", "logs"), join("vendor", "acme", "pkg", ".git")]) {
    mkdirSync(join(dir, sub), { recursive: true });
  }
  writeFileSync(join(dir, "vendor", "autoload.php"), "<?php\\n");
  writeFileSync(join(dir, "vendor", "acme", "pkg", "src.php"), "<?php\\n");
  writeFileSync(join(dir, "vendor", "acme", "pkg", ".git", "HEAD"), "ref: refs/heads/main\\n");
} else if (command === "build") {
  writeFileSync(join(here, "build.pid"), String(process.pid));
  const mode = join(here, "build-mode");
  if (existsSync(mode) && readFileSync(mode, "utf8") === "hang") setInterval(() => {}, 1000);
}
`;

export interface Fake {
  readonly root: string;
  readonly live: string;
  readonly env: NodeJS.ProcessEnv;
  /** The directory of the stand-in camis CLI, where `build.pid` lands. */
  readonly camisBin: string;
  readonly records: (
    file: string,
  ) => { args: string[]; env: Record<string, string>; pid: number }[];
}

const roots: string[] = [];

export const fake = (
  options: {
    version?: string;
    serverMode?: string;
    /** false: no app yet, and a stand-in `composer` on the PATH for the scaffold. */
    scaffolded?: boolean;
    buildMode?: "hang";
  } = {},
): Fake => {
  const root = mkdtempSync(join(tmpdir(), "live-backend-"));
  roots.push(root);
  const bin = join(root, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "php"), FAKE_PHP);
  chmodSync(join(bin, "php"), 0o755);
  writeFileSync(join(bin, "php-version"), options.version ?? "80312 8.3.12");
  if (options.serverMode !== undefined) writeFileSync(join(bin, "server-mode"), options.serverMode);
  const camis = join(root, "camis", "packages", "cli", "bin");
  mkdirSync(camis, { recursive: true });
  writeFileSync(join(camis, "camis.mjs"), FAKE_CAMIS);
  if (options.buildMode !== undefined) writeFileSync(join(camis, "build-mode"), options.buildMode);
  const live = join(root, "live");
  const app = join(live, "strapi-php");
  if (options.scaffolded === false) {
    writeFileSync(join(bin, "composer"), `#!${NODE}\n`);
    chmodSync(join(bin, "composer"), 0o755);
  } else {
    for (const dir of ["vendor", "public", join("storage", "logs")]) {
      mkdirSync(join(app, dir), { recursive: true });
    }
    writeFileSync(join(app, "vendor", "autoload.php"), "<?php\n");
  }
  return {
    root,
    live,
    camisBin: camis,
    env: { PATH: bin, HOME: root, CAMIS_DIR: join(root, "camis"), IDENTITY_LIVE_DIR: live },
    records: (file) =>
      existsSync(join(bin, file))
        ? readFileSync(join(bin, file), "utf8")
            .trim()
            .split("\n")
            .map(
              (line) =>
                JSON.parse(line) as { args: string[]; env: Record<string, string>; pid: number },
            )
        : [],
  };
};

/** Runs the live backend script on `setup` with `command`, synchronously. */
export const runFake = (setup: Fake, command: readonly string[], extra: NodeJS.ProcessEnv = {}) =>
  spawnSync(NODE, [SCRIPT, "--", ...command], {
    encoding: "utf8",
    env: { ...setup.env, ...extra },
    timeout: 30_000,
  });

/** Removes every directory `fake` made. */
export const removeFakes = (): void => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
};

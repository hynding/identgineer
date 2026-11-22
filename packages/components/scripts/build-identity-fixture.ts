import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  identityModules,
  outputName,
  readModule,
  transpileIdentityModule,
} from "./identity-fixture-modules.ts";

// Runs after `stencil build`, which empties www: the identity fixture's SDK and fake go to
// www/identity-sdk, served only by the browser tests' static server. Never part of dist.
const SOURCE = fileURLToPath(new URL("../../identity/src", import.meta.url));
const TARGET = fileURLToPath(new URL("../www/identity-sdk", import.meta.url));

const modules = identityModules(SOURCE);
for (const path of modules) {
  const target = join(TARGET, outputName(SOURCE, path));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, transpileIdentityModule(readModule(path), path));
}
console.log(`identity fixture: wrote ${String(modules.length)} modules to ${TARGET}`);

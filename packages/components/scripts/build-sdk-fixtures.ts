import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { outputName, readModule, sdkModules, transpileSdkModule } from "./sdk-fixture-modules.ts";

// Runs after `stencil build`, which empties www: each fixture's SDK and fakes go to their own folder
// of www, served only by the browser tests' static server. Never part of dist.
const FIXTURES = [
  {
    name: "identity",
    source: "../../identity/src",
    target: "../www/identity-sdk",
    // The memory lock manager needs AsyncLocalStorage, and the testing index re-exports it; the
    // fixture imports the fake directly.
    leftOut: ["testing/memory-locks.ts", "testing/index.ts"],
  },
  {
    name: "tracking",
    source: "../../tracking/src",
    target: "../www/tracking-sdk",
    leftOut: [],
  },
] as const;

for (const fixture of FIXTURES) {
  const source = fileURLToPath(new URL(fixture.source, import.meta.url));
  const target = fileURLToPath(new URL(fixture.target, import.meta.url));
  const modules = sdkModules(source, fixture.leftOut);
  for (const path of modules) {
    const file = join(target, outputName(source, path));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, transpileSdkModule(readModule(path), path));
  }
  console.log(`${fixture.name} fixture: wrote ${String(modules.length)} modules to ${target}`);
}

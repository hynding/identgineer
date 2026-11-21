import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTokenFiles } from "../src/build-token-files.ts";
import { ROLE_SOURCES } from "../src/theme-sources.ts";
import { TOKEN_SOURCES } from "../src/token-sources.ts";
import { findSourceProblems } from "../src/verify-sources.ts";

const DIST = fileURLToPath(new URL("../dist/", import.meta.url));

const problems = findSourceProblems(TOKEN_SOURCES, ROLE_SOURCES);
if (problems.length > 0) {
  throw new Error(`Token verification failed:\n${problems.map((line) => `  ${line}`).join("\n")}`);
}

const files = buildTokenFiles(TOKEN_SOURCES);
for (const [relative, css] of Object.entries(files)) {
  const target = join(DIST, relative);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, css);
}
console.log(`tokens: wrote ${String(Object.keys(files).length)} files to ${DIST}`);

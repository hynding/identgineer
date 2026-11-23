import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bootstrapConfig } from "./bootstrap-config.ts";
import { buildBootstrapSource } from "./bootstrap-source.ts";

export const BOOTSTRAP_MAX_BYTES = 2048;

const SCRIPT_FILE = "bootstrap.js";
const METADATA_FILE = "bootstrap.sri.json";

export function integrityOf(script: string): string {
  return `sha384-${createHash("sha384").update(script).digest("base64")}`;
}

/** Same registry in, same bytes out: no timestamps, stable ordering, so the hash is stable. */
export function buildBootstrapFiles(): Record<string, string> {
  const script = buildBootstrapSource(bootstrapConfig());
  const bytes = Buffer.byteLength(script);
  if (bytes >= BOOTSTRAP_MAX_BYTES) {
    throw new Error(
      `${SCRIPT_FILE} is ${String(bytes)} bytes; the budget is under ${String(BOOTSTRAP_MAX_BYTES)}`,
    );
  }
  const metadata = { file: SCRIPT_FILE, integrity: integrityOf(script), bytes };
  return { [SCRIPT_FILE]: script, [METADATA_FILE]: `${JSON.stringify(metadata, null, 2)}\n` };
}

export function writeBootstrapFiles(directory: string): string[] {
  mkdirSync(directory, { recursive: true });
  return Object.entries(buildBootstrapFiles()).map(([name, contents]) => {
    writeFileSync(join(directory, name), contents);
    return name;
  });
}

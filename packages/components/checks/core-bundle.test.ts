import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const PACKAGE = fileURLToPath(new URL("..", import.meta.url));
// The two builds a page loads from: the lazy build the www output serves, and the dist module build.
const BUILDS = ["www/build", "dist/esm"].map((directory) => join(PACKAGE, directory));

// The most bytes of script a page that uses only `idg-button` may load, entry and shared chunks
// together, for each build. Measured at 32,430 (www) and 82,533 (dist) bytes. Before the brand
// components the button's bundle alone was 326 KB in www, because Stencil grouped it with 44 others,
// and with the brand components in that group it was 450 KB. A heavy module that lands in a chunk the
// button loads raises this and fails it.
const CEILING_BYTES: Record<string, number> = { "www/build": 40_000, "dist/esm": 100_000 };

// Strings only the brand package's heavy code holds: the logo sanitiser's error code, the theme
// generator's refusal of a bad kit, and the emitter's refusal of an altered theme.
const HEAVY_MARKERS = [
  "number-out-of-range",
  "not a valid brand kit",
  "brand theme was altered after generation",
];

function scripts(directory: string): string[] {
  return readdirSync(directory).filter((name) => /\.(?:js|mjs)$/.test(name));
}

/** The files a module loads before it runs: its static imports, and theirs. Dynamic ones are not. */
function closure(directory: string, start: string): string[] {
  const seen = new Set<string>();
  const queue = [start];
  for (const name of queue) {
    if (seen.has(name)) continue;
    seen.add(name);
    const text = readFileSync(join(directory, name), "utf8");
    for (const match of text.matchAll(/(?:from|import)\s*["']\.\/([^"']+\.m?js)["']/g)) {
      if (match[1] !== undefined && existsSync(join(directory, match[1]))) queue.push(match[1]);
    }
  }
  return [...seen];
}

describe.skipIf(!BUILDS.every((directory) => existsSync(directory)))(
  "what a page that uses only idg-button loads, once built",
  () => {
    for (const directory of BUILDS) {
      const build = directory.slice(PACKAGE.length);
      const entries = scripts(directory).filter(
        (name) =>
          name.endsWith(".entry.js") &&
          /\bidg_button\b/.test(readFileSync(join(directory, name), "utf8")),
      );

      describe(build, () => {
        it("has one entry for the button", () => {
          expect(entries).toHaveLength(1);
        });

        it("loads nothing of the logo sanitiser, the theme generator or the emitters", () => {
          const loaded = closure(directory, entries[0] ?? "");
          for (const name of loaded) {
            const text = readFileSync(join(directory, name), "utf8");
            for (const marker of HEAVY_MARKERS) {
              expect(text.includes(marker), `${name} holds "${marker}"`).toBe(false);
            }
          }
        });

        it("stays within its size ceiling", () => {
          const loaded = closure(directory, entries[0] ?? "");
          const bytes = loaded.reduce((sum, name) => sum + statSync(join(directory, name)).size, 0);
          expect(bytes).toBeLessThanOrEqual(CEILING_BYTES[build] ?? 0);
        });
      });
    }
  },
);

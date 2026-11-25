import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const PACKAGE = fileURLToPath(new URL("..", import.meta.url));
// The two builds a page loads from: the lazy build the www output serves, and the dist module build.
const BUILDS = ["www/build", "dist/esm"].map((directory) => join(PACKAGE, directory));

// A representative of each non-brand group, and the most bytes of script a page that uses only that
// component may load (its entry and the chunks it imports), for `www/build` and `dist/esm`. The
// ceilings are set from the sizes measured in the README, with a margin of about 15%.
const REPRESENTATIVES: Record<string, { readonly www: number; readonly dist: number }> = {
  "idg-button": { www: 58000, dist: 124000 },
  "idg-field": { www: 177000, dist: 356000 },
  "idg-sign-in": { www: 177000, dist: 356000 },
  "idg-event-table": { www: 81000, dist: 197000 },
  "idg-consent-banner": { www: 109000, dist: 227000 },
  "idg-dialog": { www: 109000, dist: 227000 },
  "idg-menu": { www: 58000, dist: 146000 },
  "idg-tabs": { www: 37000, dist: 101000 },
  "idg-accordion": { www: 33000, dist: 91000 },
  "idg-stack": { www: 97000, dist: 185000 },
};

// Composites and what they create when they render, which must share one entry: a component that
// is created at run time is requested only then, so one in another entry costs a round trip before
// it draws (the dashboard's rows were in the page 200 ms before they were seen).
const TOGETHER: readonly (readonly string[])[] = [
  ["idg-event-table", "idg-table", "idg-pagination", "idg-skeleton"],
  ["idg-menu", "idg-menu-item", "idg-menu-group", "idg-menu-separator", "idg-user-menu"],
  ["idg-tabs", "idg-tab", "idg-tab-panel"],
  ["idg-accordion", "idg-accordion-item"],
  ["idg-consent-preferences", "idg-dialog", "idg-switch"],
  ["idg-sign-in", "idg-register", "idg-password-reset", "idg-field", "idg-input"],
];

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

/** The entry of a build that holds a component. */
function entryOf(directory: string, tag: string): string {
  const word = new RegExp(`\\b${tag.replaceAll("-", "_")}\\b`);
  const found = scripts(directory).filter(
    (name) => name.endsWith(".entry.js") && word.test(readFileSync(join(directory, name), "utf8")),
  );
  expect(found, `the entry of ${tag}`).toHaveLength(1);
  return found[0] ?? "";
}

function loaded(directory: string, tag: string): string[] {
  return closure(directory, entryOf(directory, tag));
}

function holds(directory: string, files: readonly string[], marker: string): boolean {
  return files.some((name) => readFileSync(join(directory, name), "utf8").includes(marker));
}

describe.skipIf(!BUILDS.every((directory) => existsSync(directory)))(
  "what a page loads of each component, once built",
  () => {
    for (const directory of BUILDS) {
      const build = directory.slice(PACKAGE.length);
      const key = build === "www/build" ? "www" : "dist";

      describe(build, () => {
        for (const [tag, ceilings] of Object.entries(REPRESENTATIVES)) {
          it(`loads nothing of the sanitiser, generator or emitters for ${tag}, within its ceiling`, () => {
            const files = loaded(directory, tag);
            for (const marker of HEAVY_MARKERS) {
              expect(holds(directory, files, marker), `${tag} loads "${marker}"`).toBe(false);
            }
            const bytes = files.reduce(
              (sum, name) => sum + statSync(join(directory, name)).size,
              0,
            );
            expect(bytes).toBeLessThanOrEqual(ceilings[key]);
          });
        }

        // The absence above would hold vacuously if a message were reworded: the brand bundles are
        // where the markers are.
        it("finds the sanitiser in the logo's and the guide's closures, and all three in the export's", () => {
          for (const tag of ["idg-brand-logo", "idg-brand-guidelines", "idg-brand-export"]) {
            expect(holds(directory, loaded(directory, tag), HEAVY_MARKERS[0] ?? ""), tag).toBe(
              true,
            );
          }
          const exported = loaded(directory, "idg-brand-export");
          for (const marker of HEAVY_MARKERS) expect(holds(directory, exported, marker)).toBe(true);
        });

        it("keeps the brand components in bundles apart from every other component", () => {
          const brand = [
            "idg-brand-logo",
            "idg-brand-swatches",
            "idg-brand-guidelines",
            "idg-brand-export",
          ];
          const entries = brand.map((tag) => entryOf(directory, tag));
          expect(new Set(entries).size).toBe(brand.length);
          expect(entries).not.toContain(entryOf(directory, "idg-button"));
        });

        it.each(TOGETHER)("draws what %s creates from its own entry", (...tags) => {
          const entries = new Set(tags.map((tag) => entryOf(directory, tag)));
          expect([...entries]).toHaveLength(1);
        });
      });
    }
  },
);

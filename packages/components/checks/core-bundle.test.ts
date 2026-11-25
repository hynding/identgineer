import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import ts from "typescript";
import { BUNDLES } from "../stencil-bundles";

const PACKAGE = fileURLToPath(new URL("..", import.meta.url));
// The two builds a page loads from: the lazy build the www output serves, and the dist module build.
const BUILDS = ["www/build", "dist/esm"].map((directory) => join(PACKAGE, directory));

// A representative of each non-brand group, and the most bytes of script a page that uses only that
// component may load (its entry and the chunks it imports), for `www/build` and `dist/esm`. The
// ceilings are set from the sizes measured in the README, with a margin of about 15%.
const REPRESENTATIVES: Record<string, { readonly www: number; readonly dist: number }> = {
  "idg-button": { www: 66700, dist: 135000 },
  "idg-field": { www: 177000, dist: 356000 },
  "idg-sign-in": { www: 177000, dist: 356000 },
  "idg-event-table": { www: 78000, dist: 194000 },
  "idg-consent-banner": { www: 101000, dist: 217000 },
  "idg-dialog": { www: 101000, dist: 217000 },
  "idg-menu": { www: 58000, dist: 146000 },
  "idg-tabs": { www: 37000, dist: 101000 },
  "idg-accordion": { www: 33000, dist: 91000 },
  "idg-stack": { www: 97000, dist: 185000 },
};

// Composites and what they create when they render, which must share one entry: a component that
// is created at run time is requested only then, so one in another entry costs a round trip before
// it draws (the dashboard's rows were in the page 200 ms before they were seen).
const TOGETHER: readonly (readonly string[])[] = [
  ["idg-event-table", "idg-table", "idg-pagination"],
  ["idg-menu", "idg-menu-item", "idg-menu-group", "idg-menu-separator", "idg-user-menu"],
  ["idg-tabs", "idg-tab", "idg-tab-panel"],
  ["idg-accordion", "idg-accordion-item"],
  ["idg-consent-preferences", "idg-dialog"],
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

        // The editor validates, previews and sanitises, but never writes a theme: it loads the
        // package's edit entry, which holds no emitter.
        it("finds the sanitiser and the generator in the editor's closure, and not the emitter", () => {
          const editor = loaded(directory, "idg-brand-editor");
          const [sanitiser = "", generator = "", emitter = ""] = HEAVY_MARKERS;
          expect(holds(directory, editor, sanitiser)).toBe(true);
          expect(holds(directory, editor, generator)).toBe(true);
          expect(holds(directory, editor, emitter)).toBe(false);
        });

        it("keeps the brand components in bundles apart from every other component", () => {
          const brand = [
            "idg-brand-logo",
            "idg-brand-swatches",
            "idg-brand-guidelines",
            "idg-brand-export",
            "idg-brand-editor",
          ];
          const entries = brand.map((tag) => entryOf(directory, tag));
          expect(new Set(entries).size).toBe(brand.length);
          expect(entries).not.toContain(entryOf(directory, "idg-button"));
        });

        // A composite of another group asks for controls when it renders, so what controls imports
        // on arrival is a second round trip unless the page has fetched it already; a chunk that
        // every entry imports is fetched with the first entry, and one of controls' own is not.
        it("imports into controls only chunks that every entry imports", () => {
          const imports = (name: string) =>
            new Set(
              [
                ...readFileSync(join(directory, name), "utf8").matchAll(
                  /(?:from|import)\s*["']\.\/([^"']+\.m?js)["']/g,
                ),
              ].map((match) => match[1] ?? ""),
            );
          const entries = scripts(directory).filter((name) => name.endsWith(".entry.js"));
          const common = entries
            .map(imports)
            .reduce((all, next) => new Set([...all].filter((name) => next.has(name))));
          const own = [...imports(entryOf(directory, "idg-button"))].filter(
            (name) => !common.has(name),
          );
          expect(own).toEqual([]);
        });

        it.each(TOGETHER)("draws what %s creates from its own entry", (...tags) => {
          const entries = new Set(tags.map((tag) => entryOf(directory, tag)));
          expect([...entries]).toHaveLength(1);
        });
      });
    }
  },
);

// What is rendered by whom, read from the sources: a component and the helper modules it imports.
const SOURCES = join(PACKAGE, "src");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.(?:spec|test)\.tsx?$|\.d\.ts$/.test(entry.name)
      ? [path]
      : [];
  });
}

/**
 * The source with its comments blanked out, found by the TypeScript parser: a regular expression
 * would take `/*` inside a string (`accept="image/*"`) for the start of a comment and hide the code
 * up to the next `*\/`. A comment is the trivia before a token; JSX text is not trivia, so `//` in
 * it stays.
 */
function withoutComments(text: string): string {
  const source = ts.createSourceFile(
    "source.tsx",
    text,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TSX,
  );
  const comments = new Map<number, number>();
  const visit = (node: ts.Node): void => {
    const children = node.getChildren(source);
    if (children.length === 0 && node.kind !== ts.SyntaxKind.JsxText) {
      for (const range of ts.getLeadingCommentRanges(text, node.pos) ?? []) {
        comments.set(range.pos, range.end);
      }
    }
    for (const child of children) visit(child);
  };
  visit(source);
  let blanked = text;
  for (const [start, end] of comments) {
    blanked =
      blanked.slice(0, start) +
      blanked.slice(start, end).replaceAll(/[^\n]/g, " ") +
      blanked.slice(end);
  }
  return blanked;
}

/** A component's file, and every module of the package it imports, which can render more elements. */
function modulesOf(file: string): string[] {
  const seen = new Set<string>();
  const queue = [file];
  for (const path of queue) {
    if (seen.has(path)) continue;
    seen.add(path);
    const text = withoutComments(readFileSync(path, "utf8"));
    for (const match of text.matchAll(/from\s+["'](\.[^"']*)["']/g)) {
      const base = resolve(dirname(path), match[1] ?? "");
      const found = [`${base}.tsx`, `${base}.ts`, join(base, "index.ts")].find((candidate) =>
        existsSync(candidate),
      );
      if (found !== undefined) queue.push(found);
    }
  }
  return [...seen];
}

const COMPONENTS = sourceFiles(SOURCES).flatMap((file) => {
  const tag = /tag:\s*"(idg-[a-z-]+)"/.exec(withoutComments(readFileSync(file, "utf8")))?.[1];
  return tag === undefined ? [] : [{ tag, file }];
});

/** The tags a source draws: as JSX, or by name in a string (createElement, a tag held in a variable). */
function renderedTags(source: string, known: ReadonlySet<string>): Set<string> {
  const text = withoutComments(source);
  const found = new Set<string>();
  for (const match of text.matchAll(/<(idg-[a-z-]+)/g)) found.add(match[1] ?? "");
  // Only an exact component tag counts, so an id such as "idg-sign-out" needs no exception.
  for (const match of text.matchAll(/["'`](idg-[a-z-]+)["'`]/g)) {
    if (known.has(match[1] ?? "")) found.add(match[1] ?? "");
  }
  return found;
}

const KNOWN_TAGS: ReadonlySet<string> = new Set(COMPONENTS.map(({ tag }) => tag));

const groupOf = (tag: string) => BUNDLES.find((group) => group.components.includes(tag))?.name;

// What a component renders that is in a group of its own and not in `controls`: the element waits a
// round trip for that bundle, so each is listed here with the reason it is accepted.
const ACCEPTED_RENDERS: Record<string, string> = {
  "idg-brand-guidelines>idg-brand-logo":
    "a guide of the sanitiser's logo tiles; the logo's bundle is requested once the guide renders",
  "idg-brand-guidelines>idg-brand-swatches":
    "the swatches are a bundle of their own, small, and requested once the guide renders",
  // The editor's fields are the form controls every form uses: copying them into the editor's
  // group would put them in two bundles, which a component cannot be. They are requested in the
  // same round trip as the logo and the guide below, so the editor waits one hop in all.
  "idg-brand-editor>idg-field":
    "the field around each control is the forms group's; requested with the editor's other parts",
  "idg-brand-editor>idg-input":
    "the hex, name, id and tagline inputs are the forms group's own control",
  "idg-brand-editor>idg-select":
    "the font pairing, corners and tone are the forms group's own select",
  "idg-brand-editor>idg-brand-logo":
    "an upload's thumbnail is the logo element with its sanitiser check; the guide requests it too",
  "idg-brand-editor>idg-brand-guidelines":
    "the preview is the guide, a bundle of its own, requested in the same hop as the fields",
};

describe("the bundles of stencil-bundles.ts, against the components' sources", () => {
  it("finds the components, and every one is in exactly one group", () => {
    expect(COMPONENTS.length).toBeGreaterThan(50);
    for (const { tag } of COMPONENTS) {
      const holding = BUNDLES.filter((group) => group.components.includes(tag));
      expect(
        holding.map((group) => group.name),
        `${tag} is in`,
      ).toHaveLength(1);
    }
  });

  it("lists no component that does not exist, and none twice", () => {
    const tags = new Set(COMPONENTS.map(({ tag }) => tag));
    const listed = BUNDLES.flatMap((group) => group.components);
    expect(listed.filter((tag) => !tags.has(tag))).toEqual([]);
    expect(listed.length).toBe(new Set(listed).size);
  });

  it("sees a tag drawn as JSX, by createElement, or named in a string, and not in a comment", () => {
    const known = new Set(["idg-tooltip", "idg-badge", "idg-icon", "idg-stat"]);
    const source = `
      // idg-stat in a comment
      render() { return <idg-badge />; }
      show() { return document.createElement("idg-tooltip"); }
      const Tag = cond ? \`idg-icon\` : "idg-button-not-a-tag";
      const id = "idg-sign-out";
    `;
    expect([...renderedTags(source, known)].sort()).toEqual([
      "idg-badge",
      "idg-icon",
      "idg-tooltip",
    ]);
  });

  it("reads a comment marker inside a string or JSX text as text, so a string hides no code", () => {
    const known = new Set(["idg-badge", "idg-icon", "idg-stat", "idg-tooltip"]);
    const source = `
      const accept = "image/*";
      render() { return <idg-badge />; }
      const close = '*/';
      const url = \`https://example.com//path\`;
      show() { return <p>Use // or /* freely, then <idg-icon /></p>; }
      /* <idg-stat /> in a comment */
      // <idg-tooltip /> after a line comment
    `;
    expect([...renderedTags(source, known)].sort()).toEqual(["idg-badge", "idg-icon"]);
  });

  it("renders only what is in its own group or in controls, bar the accepted", () => {
    const outside: string[] = [];
    for (const { tag, file } of COMPONENTS) {
      const rendered = new Set(
        modulesOf(file).flatMap((module) => [
          ...renderedTags(readFileSync(module, "utf8"), KNOWN_TAGS),
        ]),
      );
      for (const other of rendered) {
        if (other === tag) continue;
        const group = groupOf(other);
        if (group === groupOf(tag) || group === "controls") continue;
        if (`${tag}>${other}` in ACCEPTED_RENDERS) continue;
        outside.push(`${tag} (${groupOf(tag) ?? "none"}) renders ${other} (${group ?? "none"})`);
      }
    }
    expect(outside).toEqual([]);
  });

  it("accepts only renders that are made", () => {
    for (const key of Object.keys(ACCEPTED_RENDERS)) {
      const [tag, other] = key.split(">");
      const component = COMPONENTS.find((candidate) => candidate.tag === tag);
      const texts = modulesOf(component?.file ?? "").map((module) => readFileSync(module, "utf8"));
      expect(
        texts.some((text) => text.includes(`<${other ?? ""}`)),
        key,
      ).toBe(true);
      expect(groupOf(other ?? ""), key).not.toBe(groupOf(tag ?? ""));
    }
  });
});

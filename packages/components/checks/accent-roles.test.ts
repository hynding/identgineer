import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ACCENT_ROLE_USES, findAccentUses } from "./accent-roles";

const SRC = fileURLToPath(new URL("../src", import.meta.url));

function listFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

const key = (file: string, selector: string, property: string, token: string) =>
  `${file} ${selector} ${property} ${token}`;

describe("findAccentUses", () => {
  it("lists each accent role a declaration reads, accent-subtle included, leaving comments out", () => {
    const css = `a { background: var(--idg-color-accent); /* var(--idg-color-accent) */
      color: var(--idg-color-on-accent-indicator); border-color: var(--idg-color-accent-subtle);
      box-shadow: inset 0 0 0 1px var(--idg-color-accent-border), var(--idg-elevation-sm);
      outline-color: var(--idg-color-on-accent-subtle); }`;
    expect(findAccentUses(css)).toEqual([
      { selector: "a", property: "background", token: "accent" },
      { selector: "a", property: "color", token: "on-accent-indicator" },
      { selector: "a", property: "border-color", token: "accent-subtle" },
      { selector: "a", property: "box-shadow", token: "accent-border" },
      { selector: "a", property: "outline-color", token: "on-accent-subtle" },
    ]);
  });

  it("names the normalised selector and every at-rule around a declaration", () => {
    const css = `.a,
      .b:hover { color: var(--idg-color-accent); }
      @container  idg-nav style(--_nav: drawer) {
        @media (min-width: 40rem) {
          .a   > .c { background: var(--idg-color-accent-subtle) }
        }
      }`;
    expect(findAccentUses(css)).toEqual([
      { selector: ".a, .b:hover", property: "color", token: "accent" },
      {
        selector:
          "@container idg-nav style(--_nav: drawer) >> @media (min-width: 40rem) >> .a > .c",
        property: "background",
        token: "accent-subtle",
      },
    ]);
  });

  it("tells the same property and token apart by selector, so moving one is seen", () => {
    const before = findAccentUses(".a { color: var(--idg-color-accent); } .b { color: red; }");
    const after = findAccentUses(".a { color: red; } .b { color: var(--idg-color-accent); }");
    expect(before).not.toEqual(after);
  });
});

describe("findAccentUses, var() spellings", () => {
  it.each([
    ["a fallback", "a { color: var(--idg-color-accent, #000); }"],
    ["inner spaces", "a { color: var( --idg-color-accent ); }"],
    ["a fallback after a space", "a { color: var(--idg-color-accent , currentcolor); }"],
    ["a line break", "a { color: var(\n    --idg-color-accent\n  ); }"],
  ])("finds a role read with %s", (_label, css) => {
    expect(findAccentUses(css)).toEqual([{ selector: "a", property: "color", token: "accent" }]);
  });

  it("reads the function name in any case, as CSS does", () => {
    expect(
      findAccentUses(
        "a { color: VAR(--idg-color-accent); background: Var( --idg-color-on-accent ); }",
      ),
    ).toEqual([
      { selector: "a", property: "color", token: "accent" },
      { selector: "a", property: "background", token: "on-accent" },
    ]);
  });

  it("does not take a longer role name for a shorter one", () => {
    expect(findAccentUses("a { color: var(--idg-color-accent-strong); }")).toEqual([]);
  });
});

/** The CSS a source file carries: the file itself, or the template literals of a TypeScript one. */
function stylesheetsIn(file: string): string[] {
  const source = readFileSync(file, "utf8");
  if (file.endsWith(".css")) return [source];
  return [...source.matchAll(/`([^`]*)`/g)].map((match) => match[1] ?? "");
}

const isSource = (file: string) =>
  file.endsWith(".css") ||
  (file.endsWith(".ts") && !file.endsWith(".d.ts") && !/\.test\.ts$/.test(file));

const ACCENT_MENTION = /--idg-color-(?:on-)?accent/gi;

describe("accent roles in the component stylesheets", () => {
  const files = listFiles(SRC).filter(isSource);
  const rel = (file: string) => relative(SRC, file).split("\\").join("/");
  const actual = files
    .flatMap((file) =>
      stylesheetsIn(file).flatMap((css) =>
        findAccentUses(css).map(({ selector, property, token }) =>
          key(rel(file), selector, property, token),
        ),
      ),
    )
    .sort();

  it("are exactly the classified uses, so a new one has to be classified", () => {
    expect(actual).toEqual(
      ACCENT_ROLE_USES.map(({ file, selector, property, token }) =>
        key(file, selector, property, token),
      ).sort(),
    );
  });

  it("include the CSS written as a template string in a TypeScript file", () => {
    expect(ACCENT_ROLE_USES).toContainEqual(
      expect.objectContaining({
        file: "components/table/table-light-styles.ts",
        token: "accent-subtle",
      }),
    );
  });

  it("are read only where a scan sees them: every mention sits inside a stylesheet", () => {
    for (const file of files) {
      const mentions = (readFileSync(file, "utf8").match(ACCENT_MENTION) ?? []).length;
      const scanned = stylesheetsIn(file).join("\n");
      expect((scanned.match(ACCENT_MENTION) ?? []).length, rel(file)).toBe(mentions);
    }
  });

  it("show state through the accent-subtle tint only where something else marks it too", () => {
    for (const entry of ACCENT_ROLE_USES) {
      const tint = entry.token.endsWith("accent-subtle");
      expect(tint || entry.use !== "tint", `${entry.file} ${entry.property}`).toBe(true);
      if (entry.use !== "tint" || entry.markedBy === undefined) continue;
      if (entry.markedBy.kind === "content") continue;
      const { what } = entry.markedBy;
      const marker = ACCENT_ROLE_USES.find(
        (other) => other.file === entry.file && other.use === "indicator" && other.what === what,
      );
      expect(marker, `${entry.file}: ${entry.what} is marked by ${what}`).toBeDefined();
    }
  });

  it("mark the current navigation item beyond its tint, and the revealed password by its icon", () => {
    expect(ACCENT_ROLE_USES).toContainEqual(
      expect.objectContaining({
        file: "components/layout/layout.css",
        token: "accent-subtle",
        use: "tint",
        markedBy: { kind: "indicator", what: "current navigation item marker" },
      }),
    );
    expect(ACCENT_ROLE_USES).toContainEqual(
      expect.objectContaining({
        file: "components/input/input.css",
        token: "accent-subtle",
        use: "tint",
        markedBy: { kind: "content", what: "the eye icon turns to eye-off" },
      }),
    );
  });

  it("mark state only with accent-indicator and its text colour", () => {
    for (const entry of ACCENT_ROLE_USES) {
      const indicatorToken = entry.token.endsWith("accent-indicator");
      expect(indicatorToken, `${entry.file} ${entry.property}`).toBe(entry.use === "indicator");
    }
  });
});

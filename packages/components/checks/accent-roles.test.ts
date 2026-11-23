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

const key = (file: string, property: string, token: string) => `${file} ${property} ${token}`;

describe("findAccentUses", () => {
  it("lists each accent role a declaration reads, leaving accent-subtle and comments out", () => {
    const css = `a { background: var(--idg-color-accent); /* var(--idg-color-accent) */
      color: var(--idg-color-on-accent-indicator); border-color: var(--idg-color-accent-subtle);
      box-shadow: inset 0 0 0 1px var(--idg-color-accent-border), var(--idg-elevation-sm); }`;
    expect(findAccentUses(css)).toEqual([
      { property: "background", token: "accent" },
      { property: "color", token: "on-accent-indicator" },
      { property: "box-shadow", token: "accent-border" },
    ]);
  });
});

describe("findAccentUses, var() spellings", () => {
  it.each([
    ["a fallback", "a { color: var(--idg-color-accent, #000); }"],
    ["inner spaces", "a { color: var( --idg-color-accent ); }"],
    ["a fallback after a space", "a { color: var(--idg-color-accent , currentcolor); }"],
    ["a line break", "a { color: var(\n    --idg-color-accent\n  ); }"],
  ])("finds a role read with %s", (_label, css) => {
    expect(findAccentUses(css)).toEqual([{ property: "color", token: "accent" }]);
  });

  it("does not take a longer role name for a shorter one", () => {
    expect(findAccentUses("a { color: var(--idg-color-accent-strong); }")).toEqual([]);
  });
});

describe("accent roles in the component stylesheets", () => {
  const actual = listFiles(SRC)
    .filter((file) => file.endsWith(".css"))
    .flatMap((file) =>
      findAccentUses(readFileSync(file, "utf8")).map(({ property, token }) =>
        key(relative(SRC, file).split("\\").join("/"), property, token),
      ),
    )
    .sort();

  it("are exactly the classified uses, so a new one has to be classified", () => {
    expect(actual).toEqual(
      ACCENT_ROLE_USES.map(({ file, property, token }) => key(file, property, token)).sort(),
    );
  });

  it("mark state only with accent-indicator and its text colour", () => {
    for (const entry of ACCENT_ROLE_USES) {
      const indicatorToken = entry.token.endsWith("accent-indicator");
      expect(indicatorToken, `${entry.file} ${entry.property}`).toBe(entry.use === "indicator");
    }
  });
});

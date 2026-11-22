import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DESIGN_IDS } from "./design-ids.ts";
import { DESIGNS } from "./design-registry.ts";
import { DESIGN_SOURCES } from "./design-sources.ts";
import { formatValue } from "./emit-css.ts";
import { flattenTokens } from "./flatten-tokens.ts";
import { LAYOUT_IDS } from "./layout-ids.ts";
import { LAYOUTS } from "./layout-registry.ts";
import { LAYOUT_SOURCES } from "./layout-sources.ts";
import { mergeTokens } from "./merge-tokens.ts";
import { parseMode } from "./parse-mode.ts";
import { resolveMode } from "./resolve-mode.ts";
import { ROLE_SOURCES } from "./theme-sources.ts";
import { TOKEN_SOURCES } from "./token-sources.ts";
import { MIN_TARGET_PX, findTargetSizeProblems, toPixels } from "./target-size.ts";
import type { FlatToken, ResolvedToken } from "./token-types.ts";
import { UX_MODE_IDS } from "./ux-ids.ts";
import { UX_MODES } from "./ux-registry.ts";
import { UX_MODE_SOURCES } from "./ux-sources.ts";
import { findModeProblems } from "./verify-mode.ts";
import { findOwnershipProblems } from "./verify-ownership.ts";
import { collectAxisTokens, findSourceProblems } from "./verify-sources.ts";

const shared = mergeTokens(
  ...TOKEN_SOURCES.shared.map(({ file, json }) => flattenTokens(file, json)),
);
const designDefaults = flattenTokens(ROLE_SOURCES.design.file, ROLE_SOURCES.design.json);
const uxDefaults = flattenTokens(ROLE_SOURCES.ux.file, ROLE_SOURCES.ux.json);
const layoutDefaults = flattenTokens(ROLE_SOURCES.layout.file, ROLE_SOURCES.layout.json);
const designs = DESIGN_SOURCES.map((source) => parseMode(source, "design"));
const uxModes = UX_MODE_SOURCES.map((source) => parseMode(source, "ux"));
const layouts = LAYOUT_SOURCES.map((source) => parseMode(source, "layout"));

function filesIn(relativeDirectory: string): string[] {
  return readdirSync(fileURLToPath(new URL(relativeDirectory, import.meta.url)))
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.replace(/\.json$/, ""))
    .sort();
}

function valueOf(tokens: readonly ResolvedToken[], path: string): string {
  const token = tokens.find((candidate) => candidate.path === path);
  return token ? formatValue(token) : `missing ${path}`;
}

function token(path: string, source: string, value = "1px"): FlatToken {
  return { path, type: "dimension", value, description: undefined, source };
}

describe.each([
  {
    name: "design",
    registry: DESIGNS,
    ids: DESIGN_IDS,
    directory: "./tokens/designs/",
    first: "flat",
  },
  {
    name: "layout",
    registry: LAYOUTS,
    ids: LAYOUT_IDS,
    directory: "./tokens/layouts/",
    first: "top-bar",
  },
  {
    name: "UX mode",
    registry: UX_MODES,
    ids: UX_MODE_IDS,
    directory: "./tokens/ux/",
    first: "comfortable",
  },
])("$name registry", ({ registry, ids, directory, first }) => {
  it(`has exactly eight entries with unique ids, ${first} first`, () => {
    expect(registry).toHaveLength(8);
    expect(new Set(registry.map((entry) => entry.id)).size).toBe(8);
    expect(registry[0]?.id).toBe(first);
  });

  it("matches the files on disk, so a file cannot be added or dropped silently", () => {
    expect(filesIn(directory)).toEqual([...ids].sort());
    expect(registry.map((entry) => entry.id)).toEqual([...ids]);
  });

  it("is derived from the JSON: every entry has a label and a description", () => {
    for (const entry of registry) {
      expect(entry.label, entry.id).not.toBe("");
      expect(entry.description.length, entry.id).toBeGreaterThan(20);
    }
  });
});

describe.each([
  { axis: "design" as const, modes: designs, defaults: designDefaults },
  { axis: "layout" as const, modes: layouts, defaults: layoutDefaults },
  { axis: "ux" as const, modes: uxModes, defaults: uxDefaults },
])("every $axis mode", ({ axis, modes, defaults }) => {
  it.each(modes.map((mode) => [mode.id, mode] as const))(
    "%s defines every token its axis owns and nothing else",
    (_id, mode) => {
      expect(findModeProblems(axis, mode, defaults)).toEqual([]);
    },
  );
});

describe("findModeProblems", () => {
  const [flat] = designs;

  it("reports a missing token with file, mode and token", () => {
    if (!flat) throw new Error("no designs");
    const partial = { ...flat, tokens: flat.tokens.filter((t) => t.path !== "shape.radius.md") };
    expect(findModeProblems("design", partial, designDefaults)).toEqual([
      `${flat.file}: design "flat" does not define "shape.radius.md"`,
    ]);
  });

  it("reports a layout that leaves a token out, naming the layout", () => {
    const [first] = layouts;
    if (!first) throw new Error("no layouts");
    const partial = { ...first, tokens: first.tokens.filter((t) => t.path !== "layout.gap") };
    expect(findModeProblems("layout", partial, layoutDefaults)).toEqual([
      `${first.file}: layout "top-bar" does not define "layout.gap"`,
    ]);
  });

  it("reports a token that another axis owns", () => {
    if (!flat) throw new Error("no designs");
    const leaking = { ...flat, tokens: [...flat.tokens, token("motion.duration.base", flat.file)] };
    expect(findModeProblems("design", leaking, designDefaults)).toEqual([
      `${flat.file}: "motion.duration.base" is not a design-owned token`,
    ]);
  });
});

describe("axis ownership", () => {
  it("keeps every token with exactly one axis, so the axes stay independent", () => {
    expect(findOwnershipProblems(collectAxisTokens(TOKEN_SOURCES, ROLE_SOURCES))).toEqual([]);
  });

  it("reports a token set by two axes, naming both files", () => {
    expect(
      findOwnershipProblems([
        { axis: "theme", tokens: [token("shape.radius.md", "tokens/themes/aurora.json")] },
        { axis: "design", tokens: [token("shape.radius.md", "tokens/designs/flat.json")] },
        { axis: "ux", tokens: [token("density.gap-scale", "tokens/ux/compact.json")] },
      ]),
    ).toEqual([
      'tokens/designs/flat.json: "shape.radius.md" is set by the design axis but the theme axis already owns it (tokens/themes/aurora.json)',
    ]);
  });

  it("does not report one axis setting the same token in several of its own modes", () => {
    expect(
      findOwnershipProblems([
        {
          axis: "design",
          tokens: [token("shape.radius.md", "a.json"), token("shape.radius.md", "b.json")],
        },
      ]),
    ).toEqual([]);
  });
});

describe("target size floor", () => {
  it("is 24px, the WCAG 2.2 AA minimum", () => {
    expect(MIN_TARGET_PX).toBe(24);
  });

  it.each([
    ["24px", 24],
    ["1.5rem", 24],
    ["2.75rem", 44],
  ])("converts %s to %d px", (value, pixels) => {
    expect(toPixels(value, "where")).toBe(pixels);
  });

  it.each(["2em", "calc(1rem + 2px)", "auto"])(
    "refuses %s, which has no fixed pixel size",
    (value) => {
      expect(() => toPixels(value, "tokens/ux/x.json: token")).toThrow("tokens/ux/x.json: token");
    },
  );

  it.each(uxModes.map((mode) => [mode.id, mode] as const))(
    "%s keeps its minimum target and control height at 24px or more",
    (_id, mode) => {
      const resolved = resolveMode(shared, mode.tokens);
      for (const path of ["density.target-size", "density.control-height"]) {
        expect(toPixels(valueOf(resolved, path), path), path).toBeGreaterThanOrEqual(MIN_TARGET_PX);
      }
      expect(findTargetSizeProblems(mode, resolved)).toEqual([]);
    },
  );

  it("reports a target or control below the floor with file, mode and token", () => {
    const [first] = uxModes;
    if (!first) throw new Error("no UX modes");
    const tiny: ResolvedToken[] = [
      { ...token("density.target-size", first.file, "1rem"), type: "dimension" },
      { ...token("density.control-height", first.file, "23px"), type: "dimension" },
    ];
    expect(findTargetSizeProblems(first, tiny)).toEqual([
      `${first.file}: UX mode "comfortable" sets "density.target-size" to 16px, below the 24px minimum`,
      `${first.file}: UX mode "comfortable" sets "density.control-height" to 23px, below the 24px minimum`,
    ]);
  });
});

describe("layout ids", () => {
  it("are the eight page layouts, top-bar first as the default", () => {
    expect([...LAYOUT_IDS]).toEqual([
      "top-bar",
      "side-rail",
      "split-hero",
      "magazine",
      "dashboard",
      "centered",
      "bento",
      "immersive",
    ]);
  });
});

describe("distinctness", () => {
  function signatures(modes: typeof designs, paths: readonly string[]): string[] {
    return modes.map((mode) => {
      const resolved = resolveMode(shared, mode.tokens);
      return paths.map((path) => valueOf(resolved, path)).join(" | ");
    });
  }

  it("no two designs share radius, border width and medium shadow", () => {
    const all = signatures(designs, ["shape.radius.md", "border.width", "elevation.md"]);
    expect(new Set(all).size).toBe(all.length);
  });

  it("no two layouts share content measure, grid track and column count", () => {
    const all = signatures(layouts, ["layout.content-max", "layout.grid-min", "layout.columns"]);
    expect(new Set(all).size).toBe(all.length);
  });

  it.each(["layout.content-max", "layout.grid-min", "layout.aside-width", "layout.nav-size"])(
    "the eight layouts give %s at least five different values, so they differ noticeably",
    (path) => {
      const values = layouts.map((layout) => valueOf(resolveMode(shared, layout.tokens), path));
      expect(new Set(values).size).toBeGreaterThanOrEqual(5);
    },
  );

  it("each layout names its own page shell arrangement, so the shell can tell them apart with a style query", () => {
    for (const layout of layouts) {
      const resolved = resolveMode(shared, layout.tokens);
      expect(valueOf(resolved, "layout.shell"), layout.id).toBe(layout.id);
    }
  });

  it.each(["layout.rail-width", "layout.sticky-inset"])(
    "the eight layouts give %s at least three different values",
    (path) => {
      const values = layouts.map((layout) => valueOf(resolveMode(shared, layout.tokens), path));
      expect(new Set(values).size).toBeGreaterThanOrEqual(3);
    },
  );

  it("pins the top of the page only where the layout's bar stays in view", () => {
    const pinned = layouts
      .filter(
        (layout) => valueOf(resolveMode(shared, layout.tokens), "layout.sticky-inset") !== "0",
      )
      .map((layout) => layout.id)
      .sort();
    expect(pinned).toEqual(["dashboard", "top-bar"]);
  });

  it("no layout sets a column count below one or above twelve", () => {
    for (const layout of layouts) {
      const columns = Number(valueOf(resolveMode(shared, layout.tokens), "layout.columns"));
      expect(columns, layout.id).toBeGreaterThanOrEqual(1);
      expect(columns, layout.id).toBeLessThanOrEqual(12);
    }
  });

  it("no two UX modes share control height, base duration and gap multiplier", () => {
    const all = signatures(uxModes, [
      "density.control-height",
      "motion.duration.base",
      "density.gap-scale",
    ]);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("source verification", () => {
  it("finds no problem in the shipped themes, designs, layouts, UX modes and preferences", () => {
    expect(findSourceProblems(TOKEN_SOURCES, ROLE_SOURCES)).toEqual([]);
  });

  it("reports a preference that sets a token no design or UX mode owns", () => {
    const broken = {
      ...TOKEN_SOURCES,
      preferences: {
        file: "tokens/preferences.json",
        json: {
          "reduced-motion": { color: { $type: "color", bg: { $value: "#000000" } } },
          "more-contrast": {},
          "forced-colors": {},
        },
      },
    };
    expect(findSourceProblems(broken, ROLE_SOURCES)).toEqual([
      'tokens/preferences.json: preference "reduced-motion" sets "color.bg", which no design or UX mode owns',
    ]);
  });
});

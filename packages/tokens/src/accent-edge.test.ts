import { describe, expect, it } from "vitest";
import { withAccentEdge } from "./accent-edge.ts";
import { buildTokenFiles } from "./build-token-files.ts";
import { THEME_IDS } from "./theme-ids.ts";
import { TOKEN_NAMES } from "./token-names.ts";
import { TOKEN_SOURCES } from "./token-sources.ts";
import type { ResolvedToken } from "./token-types.ts";

function color(role: string, value: string): ResolvedToken {
  return { path: `color.${role}`, type: "color", value, description: undefined, source: "t.json" };
}

const PAGE = ["bg", "bg-subtle", "surface", "surface-raised"];

function scheme(accent: string): ResolvedToken[] {
  return [
    ...PAGE.map((role) => color(role, "#ffffff")),
    color("accent", accent),
    color("accent-border", "#555555"),
  ];
}

describe("withAccentEdge", () => {
  it("paints no edge where the accent itself reaches 3:1 on every page background", () => {
    expect(withAccentEdge(scheme("#4f46e5")).at(-1)).toMatchObject({
      path: "color.accent-edge",
      value: "transparent",
    });
  });

  it("paints the accent border where the accent does not", () => {
    expect(withAccentEdge(scheme("#bef000")).at(-1)).toMatchObject({
      path: "color.accent-edge",
      value: "#555555",
    });
  });

  it("adds nothing to tokens without an accent, such as a dark rule that does not flip it", () => {
    const tokens = [color("bg", "#000000")];
    expect(withAccentEdge(tokens)).toEqual(tokens);
  });
});

describe("the built accent edge", () => {
  const files = buildTokenFiles(TOKEN_SOURCES);

  it("is declared by the base layer, as no edge", () => {
    expect(TOKEN_NAMES).toContain("--idg-color-accent-edge");
    expect(files["tokens.css"]).toContain("--idg-color-accent-edge: transparent;");
  });

  it.each(THEME_IDS.filter((id) => id !== "citrus"))(
    "is no edge in both schemes of %s, whose accent stands out",
    (id) => {
      const declarations = files[`themes/${id}.css`]?.match(/--idg-color-accent-edge: [^;]+;/g);
      expect(declarations?.length).toBe(3);
      expect(new Set(declarations)).toEqual(new Set(["--idg-color-accent-edge: transparent;"]));
    },
  );

  it("is citrus light's accent border, and no edge in citrus dark", () => {
    const declarations = files["themes/citrus.css"]?.match(/--idg-color-accent-edge: [^;]+;/g);
    expect(declarations).toEqual([
      "--idg-color-accent-edge: #7f8c2a;",
      "--idg-color-accent-edge: transparent;",
      "--idg-color-accent-edge: transparent;",
    ]);
  });
});

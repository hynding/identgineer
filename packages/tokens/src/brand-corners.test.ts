import { describe, expect, it } from "vitest";
import { brandRadiusVariableName, followBrandCorners } from "./brand-corners.ts";
import { buildTokenFiles } from "./build-token-files.ts";
import { DESIGNS } from "./design-registry.ts";
import { DESIGN_SOURCES } from "./design-sources.ts";
import { parseMode, type ModeSource } from "./parse-mode.ts";
import type { ResolvedToken } from "./token-types.ts";
import { TOKEN_SOURCES } from "./token-sources.ts";

const files = buildTokenFiles(TOKEN_SOURCES);
const RADIUS_NAMES = ["sm", "md", "lg", "pill"];
const DECLINING = ["brutalist", "editorial", "pixel"];

function resolved(path: string, value: string): ResolvedToken {
  return { path, type: "dimension", value, description: undefined, source: "test.json" };
}

function designSource(identgineer: Record<string, unknown>, file = "designs/test.json") {
  return {
    id: "test",
    file,
    json: {
      $description: "A test design.",
      $extensions: { identgineer: { label: "Test", ...identgineer } },
      tokens: {},
    },
  } satisfies ModeSource;
}

describe("brandRadiusVariableName", () => {
  it("names the brand layer's preference for each radius", () => {
    expect(RADIUS_NAMES.map(brandRadiusVariableName)).toEqual([
      "--idg-brand-radius-sm",
      "--idg-brand-radius-md",
      "--idg-brand-radius-lg",
      "--idg-brand-radius-pill",
    ]);
  });
});

describe("followBrandCorners", () => {
  it("resolves each radius as the brand's preference, falling back to the design's own value", () => {
    expect(
      followBrandCorners([
        resolved("shape.radius.md", "0.5rem"),
        resolved("shape.radius.pill", "9999px"),
      ]).map(({ path, value }) => [path, value]),
    ).toEqual([
      ["shape.radius.md", "var(--idg-brand-radius-md, 0.5rem)"],
      ["shape.radius.pill", "var(--idg-brand-radius-pill, 9999px)"],
    ]);
  });

  it("leaves every other token as it is", () => {
    const tokens = [resolved("border.width", "1px"), resolved("shape.radiusish", "2px")];
    expect(followBrandCorners(tokens)).toEqual(tokens);
  });
});

describe("the followsBrandCorners flag", () => {
  it("is read from $extensions.identgineer for a design", () => {
    expect(
      parseMode(designSource({ followsBrandCorners: true }), "design").followsBrandCorners,
    ).toBe(true);
    expect(
      parseMode(designSource({ followsBrandCorners: false }), "design").followsBrandCorners,
    ).toBe(false);
  });

  it("is required, as a boolean, so every design decides", () => {
    expect(() => parseMode(designSource({}), "design")).toThrow(
      'designs/test.json: design "test" needs $extensions.identgineer.followsBrandCorners (true or false)',
    );
    expect(() => parseMode(designSource({ followsBrandCorners: "yes" }), "design")).toThrow(
      'designs/test.json: design "test" needs $extensions.identgineer.followsBrandCorners (true or false)',
    );
  });

  it("is refused on a layout or UX mode, which own no corners", () => {
    expect(() =>
      parseMode(designSource({ followsBrandCorners: true }, "layouts/test.json"), "layout"),
    ).toThrow(
      'layouts/test.json: layout "test" cannot declare followsBrandCorners; only designs do',
    );
  });

  it("is on every design definition, declined by the designs whose identity is their corners", () => {
    expect(
      DESIGNS.filter((design) => !design.followsBrandCorners)
        .map(({ id }) => id)
        .sort(),
    ).toEqual(DECLINING);
    for (const source of DESIGN_SOURCES) {
      const design = DESIGNS.find(({ id }) => id === source.id);
      expect(design?.followsBrandCorners, source.id).toBe(
        parseMode(source, "design").followsBrandCorners,
      );
    }
  });
});

describe("built designs and brand corners", () => {
  it.each(DESIGNS.filter((design) => design.followsBrandCorners).map(({ id }) => id))(
    "%s resolves every radius through the brand's preference",
    (id) => {
      const css = files[`designs/${id}.css`] ?? "";
      for (const name of RADIUS_NAMES) {
        expect(css).toMatch(
          new RegExp(`--idg-shape-radius-${name}: var\\(--idg-brand-radius-${name}, [^;()]+\\);`),
        );
      }
    },
  );

  it.each(DECLINING)("%s keeps its own corners and never reads the brand's", (id) => {
    const css = files[`designs/${id}.css`] ?? "";
    expect(css).not.toContain("--idg-brand-radius");
    for (const name of RADIUS_NAMES) {
      expect(css).toMatch(new RegExp(`--idg-shape-radius-${name}: [^;]+;`));
    }
  });

  it("never declares a brand radius itself, so without a brand theme each design's own value applies", () => {
    for (const [path, css] of Object.entries(files)) {
      expect(css, path).not.toMatch(/--idg-brand-radius-[a-z]+\s*:/);
    }
  });
});

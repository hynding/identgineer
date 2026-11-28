import { REGISTRY, encodeVariations, type VariationsRegistry } from "@identgineer/variations";
import { describe, expect, it } from "vitest";
import { COMBINATIONS, combinationRecords, galleryRecords } from "./gallery-records.ts";

/** The registry with a ninth theme, as a package that adds one would have it. */
function withNinthTheme(): VariationsRegistry {
  const [first] = REGISTRY.theme.variations;
  if (first === undefined) throw new Error("no theme");
  return {
    ...REGISTRY,
    theme: {
      ...REGISTRY.theme,
      variations: [
        ...REGISTRY.theme.variations,
        { ...first, id: "dusk" as never, label: "Dusk", description: "A ninth theme." },
      ],
    },
  };
}

describe("the gallery's records, made from the variation registries", () => {
  it("are four sections in the axes' order, each a tile for every value in the registry's order", () => {
    const sections = galleryRecords();
    expect(sections.map((section) => section.axis)).toEqual(["theme", "design", "layout", "ux"]);
    expect(sections.map((section) => [section.id, section.title])).toEqual([
      ["themes", "Themes"],
      ["designs", "Designs"],
      ["layouts", "Layouts"],
      ["ux-modes", "UX modes"],
    ]);
    for (const section of sections) {
      const values = REGISTRY[section.axis].variations;
      expect(section.tiles.map((tile) => tile.id)).toEqual(values.map((value) => value.id));
      expect(section.tiles.map((tile) => [tile.label, tile.description])).toEqual(
        values.map((value) => [value.label, value.description]),
      );
      expect(section.tiles).toHaveLength(8);
    }
  });

  it("mark the registry's default of each axis, and no other value", () => {
    for (const section of galleryRecords()) {
      const defaults = section.tiles.filter((tile) => tile.isDefault).map((tile) => tile.id);
      expect(defaults).toEqual([REGISTRY[section.axis].defaultId]);
    }
  });

  it("link each tile to the page with that one choice in the URL the bootstrap reads, at its section", () => {
    for (const section of galleryRecords()) {
      for (const tile of section.tiles) {
        expect(tile.href).toBe(
          `/variations/?${encodeVariations({ [section.axis]: tile.id })}#${section.id}`,
        );
      }
    }
    expect(galleryRecords()[0]?.tiles[1]?.href).toBe("/variations/?idg-theme=ember#themes");
  });

  it("name the attribute that scopes each axis, which a tile puts on its preview", () => {
    expect(galleryRecords().map((section) => section.attribute)).toEqual([
      "data-theme",
      "data-design",
      "data-layout",
      "data-ux",
    ]);
  });

  it("include a ninth value of any registry, with no other change", () => {
    const sections = galleryRecords(withNinthTheme());
    expect(sections[0]?.tiles).toHaveLength(9);
    expect(sections[0]?.tiles.at(-1)).toEqual({
      id: "dusk",
      label: "Dusk",
      description: "A ninth theme.",
      href: "/variations/?idg-theme=dusk#themes",
      isDefault: false,
    });
    expect(sections.slice(1).map((section) => section.tiles.length)).toEqual([8, 8, 8]);
  });

  it("refuse an id that could not be written into a URL or an attribute, naming where", () => {
    const [first] = REGISTRY.design.variations;
    if (first === undefined) throw new Error("no design");
    const hostile: VariationsRegistry = {
      ...REGISTRY,
      design: {
        ...REGISTRY.design,
        variations: [{ ...first, id: 'x" onmouseover="alert(1)' as never }],
      },
    };
    expect(() => galleryRecords(hostile)).toThrow(
      /design "x\\" onmouseover=\\"alert\(1\)" has an id/,
    );
  });
});

describe("the curated combinations", () => {
  it("are a handful, each different, each a value of every axis the registry has", () => {
    expect(COMBINATIONS.length).toBeGreaterThanOrEqual(4);
    expect(COMBINATIONS.length).toBeLessThanOrEqual(8);
    expect(new Set(COMBINATIONS.map((combination) => combination.label)).size).toBe(
      COMBINATIONS.length,
    );
    expect(new Set(COMBINATIONS.map((combination) => JSON.stringify(combination.state))).size).toBe(
      COMBINATIONS.length,
    );
    for (const { label, state } of COMBINATIONS) {
      for (const axis of ["theme", "design", "layout", "ux"] as const) {
        const ids = REGISTRY[axis].variations.map((value) => value.id) as string[];
        expect(ids, `${label}: ${axis}`).toContain(state[axis]);
      }
    }
  });

  it("link to the page with all four choices in the URL, and no scheme, which stays the visitor's", () => {
    const records = combinationRecords();
    expect(records.map((record) => record.label)).toEqual(COMBINATIONS.map((each) => each.label));
    for (const [index, record] of records.entries()) {
      const combination = COMBINATIONS[index];
      expect(record.href).toBe(
        `/variations/?${encodeVariations(combination?.state ?? {})}#combine`,
      );
      expect(record.href).not.toContain("scheme");
      expect(record.description).toBe(combination?.description);
    }
    expect(records[0]?.href).toMatch(
      /^\/variations\/\?idg-theme=[a-z]+&idg-design=[a-z]+&idg-layout=[a-z-]+&idg-ux=[a-z]+#combine$/,
    );
  });
});

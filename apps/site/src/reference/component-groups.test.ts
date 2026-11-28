import { BUNDLES } from "@identgineer/components/bundles";
import { describe, expect, it } from "vitest";
import type { ComponentDoc } from "./component-docs.ts";
import { groupComponents } from "./component-groups.ts";

function doc(tag: string): ComponentDoc {
  return {
    tag,
    summary: [],
    properties: [],
    events: [],
    methods: [],
    slots: [],
    parts: [],
    cssProperties: [],
  };
}

const tags = (group: { readonly components: readonly ComponentDoc[] }) =>
  group.components.map((component) => component.tag);

describe("grouping the components as the components package bundles them", () => {
  const bundles = [
    { name: "controls", components: ["idg-button", "idg-badge"] },
    { name: "forms", components: ["idg-input", "idg-select"] },
  ];

  it("makes one group of each bundle, in the bundles' order, its components in theirs", () => {
    const groups = groupComponents(
      [doc("idg-select"), doc("idg-badge"), doc("idg-input"), doc("idg-button")],
      bundles,
    );
    expect(groups.map((group) => group.key)).toEqual(["controls", "forms"]);
    expect(groups.map(tags)).toEqual([
      ["idg-button", "idg-badge"],
      ["idg-input", "idg-select"],
    ]);
  });

  it("gives a bundle it has no title for a title made of its name, so a new bundle needs no edit", () => {
    const groups = groupComponents(
      [doc("idg-button"), doc("idg-chip")],
      [...bundles, { name: "chips-and-tags", components: ["idg-chip"] }],
    );
    const added = groups.find((group) => group.key === "chips-and-tags");
    expect(added?.title).toBe("Chips and tags");
    expect(added?.description).toBeUndefined();
    expect(tags(added ?? { components: [] })).toEqual(["idg-chip"]);
  });

  it("leaves out a bundle none of whose components is documented, and a component not in the file", () => {
    const groups = groupComponents([doc("idg-button")], bundles);
    expect(groups.map((group) => group.key)).toEqual(["controls"]);
    expect(tags(groups[0] ?? { components: [] })).toEqual(["idg-button"]);
  });

  it("puts a component no bundle names in a last group of its own, so it is never lost", () => {
    const groups = groupComponents([doc("idg-button"), doc("idg-newcomer")], bundles);
    expect(groups.map((group) => group.key)).toEqual(["controls", "other"]);
    expect(groups.at(-1)?.title).toBe("Other components");
    expect(tags(groups.at(-1) ?? { components: [] })).toEqual(["idg-newcomer"]);
  });

  it("shows the bundles of the brand components, each one component, as one group", () => {
    const groups = groupComponents(
      [doc("idg-brand-logo"), doc("idg-brand-editor"), doc("idg-button")],
      [
        { name: "controls", components: ["idg-button"] },
        { name: "brand-logo", components: ["idg-brand-logo"] },
        { name: "brand-editor", components: ["idg-brand-editor"] },
      ],
    );
    expect(groups.map((group) => group.key)).toEqual(["controls", "brand"]);
    expect(groups[1]?.title).toBe("Brand kits");
    expect(tags(groups[1] ?? { components: [] })).toEqual(["idg-brand-logo", "idg-brand-editor"]);
  });

  it("holds every component of the package once, whichever bundle names it", () => {
    const all = BUNDLES.flatMap((bundle) => bundle.components);
    const groups = groupComponents(all.map(doc), BUNDLES);
    expect(groups.flatMap(tags).toSorted()).toEqual([...all].toSorted());
    expect(groups.map((group) => group.key)).not.toContain("other");
  });
});

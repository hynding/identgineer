import { describe, expect, it } from "vitest";
import { isRendered, renderedItems } from "./slot-items";

const item = (localName: string, ...attributes: string[]) => ({
  localName,
  hasAttribute: (name: string) => attributes.includes(name),
});

describe("isRendered", () => {
  it.each(["p", "div", "idg-card", "img", "li"])("counts a %s", (name) => {
    expect(isRendered(item(name))).toBe(true);
  });

  it.each(["template", "script", "style", "noscript", "link", "meta", "datalist"])(
    "does not count a %s, which draws nothing",
    (name) => {
      expect(isRendered(item(name))).toBe(false);
    },
  );

  it("does not count an element that is hidden", () => {
    expect(isRendered(item("p", "hidden"))).toBe(false);
  });
});

describe("renderedItems", () => {
  it("keeps the items that draw, in order", () => {
    const first = item("p");
    const second = item("idg-card");
    expect(
      renderedItems([item("template"), first, item("p", "hidden"), item("script"), second]),
    ).toEqual([first, second]);
  });

  it("is empty when nothing draws", () => {
    expect(renderedItems([item("script"), item("p", "hidden")])).toEqual([]);
  });
});

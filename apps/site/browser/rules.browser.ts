import { REGISTRY } from "@identgineer/variations";
import { expect, test } from "./fixtures";
import { LAYOUTS, hydrated } from "./pages";

const DESIGNS = REGISTRY.design.variations.map((variation) => variation.id);

/** The thinnest and the heaviest a rule a layout promises may be drawn, in pixels. */
const THINNEST = 2;
const HEAVIEST = 8;

// A token may be a unitless 0 (a design without borders, a layout with no sticky bar), and
// arithmetic on it in a length (`calc(0 * 3)`, `calc(0 + 1rem)`) makes the whole declaration
// invalid, so what a layout promises silently goes. In every design, the rules side-rail and
// magazine draw are there and of a modest weight, and in every layout a section reached by a link
// stops short of the top of the window.
test("the rules the layouts promise are drawn in every design, at a modest weight", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const problems: string[] = [];
  const promised = [
    { layout: "side-rail", selector: ".feature-head", sides: ["borderInlineStartWidth"] },
    {
      layout: "magazine",
      selector: ".feature-variations",
      sides: ["borderBlockStartWidth", "borderBlockEndWidth"],
    },
  ] as const;
  for (const design of DESIGNS) {
    for (const { layout, selector, sides } of promised) {
      await page.goto(`/?idg-layout=${layout}&idg-design=${design}`);
      await hydrated(page, "site-home");
      const widths = await page.evaluate(
        ({ selector, sides }) => {
          const element = document.querySelector(selector);
          if (!element) return null;
          const style = getComputedStyle(element);
          return sides.map((side) => Number.parseFloat(style[side]));
        },
        { selector, sides: [...sides] },
      );
      if (!widths) {
        problems.push(`${design}/${layout}: ${selector} is missing`);
        continue;
      }
      widths.forEach((width, index) => {
        if (width < THINNEST || width > HEAVIEST) {
          problems.push(
            `${design}/${layout}: ${selector} ${String(sides[index])} is ${String(width)}px`,
          );
        }
      });
    }
  }
  expect(problems).toEqual([]);
});

test("a section reached by a link stops short of the top of the window in every layout", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const problems: string[] = [];
  for (const layout of LAYOUTS) {
    await page.goto(`/?idg-layout=${layout}`);
    await hydrated(page, "site-home");
    const margin = await page.evaluate(() =>
      Number.parseFloat(
        getComputedStyle(document.querySelector(".feature") ?? document.body)
          .scrollMarginBlockStart,
      ),
    );
    if (!(margin > 0)) problems.push(`${layout}: the scroll margin is ${String(margin)}px`);
  }
  expect(problems).toEqual([]);
});

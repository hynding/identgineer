import { REGISTRY } from "@identgineer/variations";
import { expectNoAxeViolations } from "./accessibility";
import { test } from "./fixtures";
import { PAGES, hydrated } from "./pages";

// The components suite checks every component's contrast in every theme. The site adds colours of
// its own on top (links, chips, the hero's text on the accent's subtle colour), so each page is
// checked once in each theme, design and UX mode as well, in both schemes where colour changes.
const AXES = [
  ...REGISTRY.theme.variations.flatMap(({ id }) => [
    `idg-theme=${id}&idg-scheme=light`,
    `idg-theme=${id}&idg-scheme=dark`,
  ]),
  ...REGISTRY.design.variations.flatMap(({ id }) => [
    `idg-design=${id}&idg-scheme=light`,
    `idg-design=${id}&idg-scheme=dark`,
  ]),
  ...REGISTRY.ux.variations.map(({ id }) => `idg-ux=${id}`),
];

for (const { name, path, component } of PAGES) {
  for (const query of AXES) {
    test(`${name} with ${query} passes axe`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`${path}?${query}`);
      await hydrated(page, component);
      await expectNoAxeViolations(page);
    });
  }
}

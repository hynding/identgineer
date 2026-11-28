import { REGISTRY } from "@identgineer/variations";
import { expect, test } from "./fixtures";
import { ENGINES, misfitsOf, settled } from "./misfits";
import { FULLY_SWEPT, LAYOUTS, PAGES, hydrated, sidewaysScroll } from "./pages";
import { fitTag } from "./parts";

const DESIGNS = REGISTRY.design.variations.map((variation) => variation.id);
const THEMES = REGISTRY.theme.variations.map((variation) => variation.id);
const UX_MODES = REGISTRY.ux.variations.map((variation) => variation.id);

/** The smallest phone in common use, a phone, a tablet and a desktop window. */
const FIT_WIDTHS = [320, 390, 820, 1440] as const;

/**
 * The widths the reference and the gallery are swept at: also the two widths the grids of their
 * tiles change columns near, and the widest window, where a grid is likeliest to stretch.
 */
const GRID_FIT_WIDTHS = [320, 390, 820, 1100, 1152, 1440, 1920] as const;
const GRID_PAGES: ReadonlySet<string> = new Set([
  "/components/",
  "/components/idg-input/",
  "/variations/",
]);

// Every design with every layout and every UX mode, the theme and the scheme turning with them, so
// that each theme meets each pair of the other three across the sweep, in each engine. A page is
// opened once for each look and the window then widened through the four widths. Without calc-size()
// the declarations that use it are dropped and the fallbacks under @supports not apply; without
// style queries as well, every layout is the shell's own arrangement with the site's base rules in
// it, and the layout's tokens still apply.
for (const engine of ENGINES) {
  PAGES.forEach(({ name, path, component }, pageIndex) => {
    DESIGNS.forEach((design, designIndex) => {
      LAYOUTS.forEach((layout, layoutIndex) => {
        // A page outside the full sweep takes one layout with each design, a different one for
        // each design and, from page to page, different pairs.
        const paired = (designIndex + pageIndex) % LAYOUTS.length === layoutIndex;
        if (!FULLY_SWEPT.has(path) && !paired) return;
        const widths = GRID_PAGES.has(path) ? GRID_FIT_WIDTHS : FIT_WIDTHS;
        test(
          `${name}${engine.name} in ${design} with ${layout} fits every UX mode at ${widths.join(", ")}px: no sideways scroll, nothing cut or spilled, no word broken, no controls over each other`,
          { tag: fitTag(engine.key, path) },
          async ({ page }) => {
            test.setTimeout(60_000);
            const problems: string[] = [];
            for (const [uxIndex, ux] of UX_MODES.entries()) {
              const turn = designIndex + layoutIndex + uxIndex;
              const theme = THEMES[turn % THEMES.length] ?? "aurora";
              const scheme = turn % 2 === 0 ? "light" : "dark";
              await page.setViewportSize({ width: 320, height: 900 });
              await page.goto(
                `${path}?idg-design=${design}&idg-theme=${theme}&idg-layout=${layout}&idg-ux=${ux}&idg-scheme=${scheme}`,
              );
              await hydrated(page, component);
              if (engine.strip) {
                expect(await engine.strip(page), `${engine.name} taken out`).toBeGreaterThan(0);
              }
              for (const width of widths) {
                await page.setViewportSize({ width, height: 900 });
                await settled(page);
                const where = `${theme}/${ux}/${scheme} at ${String(width)}px`;
                const sideways = await sidewaysScroll(page);
                if (sideways > 0) problems.push(`${where}: scrolls ${String(sideways)}px sideways`);
                const { brokenWords, cut, spilled, overlapping } = await misfitsOf(page);
                for (const word of brokenWords) problems.push(`${where}: "${word}" broken`);
                for (const what of cut) problems.push(`${where}: ${what} cut`);
                for (const what of spilled) problems.push(`${where}: ${what} spilled`);
                for (const pair of overlapping) problems.push(`${where}: ${pair} overlap`);
              }
            }
            expect(problems).toEqual([]);
          },
        );
      });
    });
  });
}

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
        test(
          `${name}${engine.name} in ${design} with ${layout} fits every UX mode at 320, 390, 820 and 1440px: no sideways scroll, nothing cut or spilled, no word broken, no controls over each other`,
          { tag: fitTag(engine.key, path) },
          async ({ page }) => {
            test.setTimeout(60_000);
            const problems: string[] = [];
            for (const [uxIndex, ux] of UX_MODES.entries()) {
              const turn = designIndex + layoutIndex + uxIndex;
              const theme = THEMES[turn % THEMES.length] ?? "aurora";
              const scheme = turn % 2 === 0 ? "light" : "dark";
              await page.setViewportSize({ width: FIT_WIDTHS[0], height: 900 });
              await page.goto(
                `${path}?idg-design=${design}&idg-theme=${theme}&idg-layout=${layout}&idg-ux=${ux}&idg-scheme=${scheme}`,
              );
              await hydrated(page, component);
              if (engine.strip) {
                expect(await engine.strip(page), `${engine.name} taken out`).toBeGreaterThan(0);
              }
              for (const width of FIT_WIDTHS) {
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

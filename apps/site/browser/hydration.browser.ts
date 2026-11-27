import type { Browser, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { LAYOUTS, PAGES, hydrated } from "./pages";

const CLIENT_BUILD = "**/build/site.esm.js";

/**
 * The first screen as prerendered, with scripts allowed but the client build replaced by an empty
 * module: what a visitor sees before hydration, including what depends on scripting being enabled.
 */
async function prerendered(page: Page, url: string): Promise<Buffer> {
  await page.route(CLIENT_BUILD, (route) =>
    route.fulfill({ contentType: "text/javascript", body: "" }),
  );
  await page.goto(url);
  await page.evaluate(() => document.fonts.ready);
  const shot = await page.screenshot({ animations: "disabled" });
  await page.unroute(CLIENT_BUILD);
  return shot;
}

/**
 * The share of pixels that differ by more than a step of anti-aliasing. A layer the browser
 * composites on its own (a pinned region) is drawn with slightly different edges, which is no
 * change a visitor sees; a moved, doubled or recoloured element changes thousands of pixels.
 */
async function changedShare(browser: Browser, before: Buffer, after: Buffer): Promise<number> {
  const scratch = await browser.newPage();
  try {
    return await scratch.evaluate(
      async ([first, second]) => {
        const pixels = async (base64: string) => {
          const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
          const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
          const context = canvas.getContext("2d");
          if (!context) throw new Error("no 2d context");
          context.drawImage(bitmap, 0, 0);
          return context.getImageData(0, 0, bitmap.width, bitmap.height).data;
        };
        const [a, b] = await Promise.all([pixels(first), pixels(second)]);
        if (a.length !== b.length) return 1;
        let changed = 0;
        for (let index = 0; index < a.length; index += 4) {
          for (let channel = 0; channel < 3; channel += 1) {
            if (Math.abs((a[index + channel] ?? 0) - (b[index + channel] ?? 0)) > 48) {
              changed += 1;
              break;
            }
          }
        }
        return changed / (a.length / 4);
      },
      [before.toString("base64"), after.toString("base64")] as const,
    );
  } finally {
    await scratch.close();
  }
}

// Hydration takes over the prerendered page as it is: nothing in the first screen moves, appears
// twice or changes colour when the client build arrives.
for (const { name, path, component } of PAGES) {
  for (const layout of LAYOUTS) {
    test(`${name} in ${layout} looks the same before and after hydration`, async ({
      page,
      browser,
    }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      const url = `${path}?idg-layout=${layout}`;
      const before = await prerendered(page, url);
      await page.goto(url);
      await hydrated(page, component);
      const after = await page.screenshot({ animations: "disabled" });
      expect(await changedShare(browser, before, after)).toBeLessThan(0.0001);
    });
  }
}

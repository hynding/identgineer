import type { Page } from "@playwright/test";
import { applyAxes } from "./axes";
import { expect, test } from "./fixtures";
import { frames } from "./layout-shell-page";

const SIZE_M = "var(--idg-size-m)";

/** A token length in pixels, as the page computes it now. */
function lengthOf(page: Page, value: string): Promise<number> {
  return page.evaluate((token) => {
    const probe = document.createElement("div");
    probe.style.inlineSize = token;
    document.body.append(probe);
    const pixels = probe.getBoundingClientRect().width;
    probe.remove();
    return pixels;
  }, value);
}

test.describe("the variation switcher cannot collapse where its container sizes it by its content", () => {
  for (const width of [390, 768, 1280]) {
    test(`on the index page at ${String(width)}px both panels are a sensible width and the heading is on one line`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/index.html");
      await expect(page.locator("idg-variation-switcher:not(.hydrated)")).toHaveCount(0);
      await applyAxes(page, { layout: "bento", design: "brutalist", ux: "calm" });
      await frames(page, 4);
      const room = await lengthOf(page, SIZE_M);
      const found = await page.evaluate(() =>
        [...document.querySelectorAll("#variation-demo idg-variation-switcher")].map((host) => {
          const heading = host.shadowRoot?.querySelector('[part="heading"]');
          const range = document.createRange();
          if (heading) range.selectNodeContents(heading);
          const tops = [...range.getClientRects()]
            .filter((box) => box.width > 0)
            .map((box) => Math.round(box.top));
          const parent = host.parentElement?.getBoundingClientRect().width ?? 0;
          return { width: host.getBoundingClientRect().width, parent, lines: new Set(tops).size };
        }),
      );
      expect(found.length).toBe(2);
      for (const panel of found) {
        expect(panel.width).toBeGreaterThanOrEqual(Math.min(room, panel.parent) - 1);
        expect(panel.lines).toBe(1);
      }
    });
  }

  test("in a flex row, a grid cell, a block and an inline block the host has the width its container allows, up to the size token", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/fixtures/variation-switcher.html");
    await expect(page.locator("idg-variation-switcher:not(.hydrated)")).toHaveCount(0);
    const room = await lengthOf(page, SIZE_M);
    const found = await page.evaluate(async () => {
      const contexts: [string, string][] = [
        ["flex row", "display: flex"],
        ["grid cell", "display: grid"],
        ["block", "display: block"],
        ["inline block", "display: inline-block; inline-size: 40rem"],
      ];
      const hosts: [string, HTMLElement, HTMLElement][] = [];
      for (const [name, style] of contexts) {
        const parent = document.createElement("div");
        for (const declaration of style.split(";")) {
          const [property, value] = declaration.split(":").map((part) => part.trim());
          if (property && value) parent.style.setProperty(property, value);
        }
        const host = document.createElement("idg-variation-switcher");
        parent.append(host);
        document.body.append(parent);
        hosts.push([name, host, parent]);
      }
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return hosts.map(([name, host, parent]) => ({
        name,
        width: host.getBoundingClientRect().width,
        parent: parent.getBoundingClientRect().width,
      }));
    });
    for (const context of found) {
      expect(context.width, context.name).toBeGreaterThanOrEqual(
        Math.min(room, context.parent) - 1,
      );
    }
  });
});

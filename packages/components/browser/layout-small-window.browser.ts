import type { Page } from "@playwright/test";
import { DESIGNS, LAYOUTS, UX_MODES } from "./axes";
import { expect, test } from "./fixtures";
import { frames } from "./layout-shell-page";
import { setTextSize } from "./text-size";

const PAGES = ["/fixtures/layout-shell.html", "/fixtures/variation-switcher.html"] as const;
const TAGS =
  "idg-layout, idg-button, idg-card, idg-grid, idg-table, idg-icon, idg-variation-switcher";

interface Finding {
  sideways: number;
  outside: string[];
  brandLines: number;
}

/** Reads, in the page, how far it scrolls sideways, what text leaves the window, and the brand's lines. */
function inspect(page: Page): Promise<Finding> {
  return page.evaluate(() => {
    const root = document.documentElement;
    const width = root.clientWidth;
    const outside: string[] = [];
    const hidden = (element: Element): boolean => {
      const box = element.getBoundingClientRect();
      return box.width <= 1 || box.height <= 1 || !element.checkVisibility();
    };
    // Text inside a box that scrolls or clips on purpose, and that is itself in the window, is held.
    const held = (element: Element): boolean => {
      let node: Element | null = element;
      while (node) {
        if (getComputedStyle(node).overflowX !== "visible") {
          const box = node.getBoundingClientRect();
          if (box.left >= -1 && box.right <= width + 1) return true;
        }
        // The flat tree: a slotted element sits in its slot, so a scroller around the slot holds it.
        const parent: Node | null = node.assignedSlot ?? node.parentNode;
        node =
          parent instanceof ShadowRoot ? parent.host : parent instanceof Element ? parent : null;
      }
      return false;
    };
    const walk = (node: Node): void => {
      if (node instanceof Text) {
        const parent = node.parentElement;
        if (!parent || !node.data.trim() || hidden(parent) || held(parent)) return;
        const range = document.createRange();
        range.selectNodeContents(node);
        const leaves = [...range.getClientRects()].some(
          (box) => box.width > 0 && (box.right > width + 1 || box.left < -1),
        );
        if (leaves) outside.push(node.data.trim().slice(0, 24));
        return;
      }
      if (node instanceof Element) {
        if (node.shadowRoot) walk(node.shadowRoot);
        if (["SCRIPT", "STYLE"].includes(node.tagName)) return;
      }
      node.childNodes.forEach(walk);
    };
    walk(document.body);
    const name = document.querySelector('[slot="brand"] span');
    if (!name) throw new Error("no brand");
    const range = document.createRange();
    range.selectNodeContents(name);
    const tops = new Set(
      [...range.getClientRects()].filter((box) => box.width > 0).map((box) => Math.round(box.top)),
    );
    return {
      sideways: Math.max(root.scrollWidth, document.body.scrollWidth) - width,
      outside,
      brandLines: tops.size,
    };
  });
}

async function openSmall(page: Page, address: string, direction: "ltr" | "rtl", wide: boolean) {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(address);
  await expect(
    page.locator(
      TAGS.split(", ")
        .map((tag) => `${tag}:not(.hydrated)`)
        .join(", "),
    ),
  ).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate((dir) => {
    document.documentElement.setAttribute("dir", dir);
  }, direction);
  await setTextSize(page, { label: "200%", fontSize: "200%", wide });
  await frames(page);
}

for (const address of PAGES) {
  const variants = [
    ["ltr", false],
    ["ltr", true],
    ["rtl", false],
    ["rtl", true],
  ] as const;
  for (const [direction, wide] of variants) {
    for (const layout of LAYOUTS) {
      const font = wide ? "wide text" : "default text";
      test(`${address}, ${layout}, ${direction}, ${font}: at 320px with text at 200% no design or UX mode scrolls the page sideways, pushes text out of the window or breaks the brand`, async ({
        page,
      }) => {
        test.setTimeout(180_000);
        await openSmall(page, address, direction, wide);
        const failures: string[] = [];
        for (const design of DESIGNS) {
          for (const ux of UX_MODES) {
            await page.evaluate(
              ({ design: d, ux: u, layout: l }) => {
                const root = document.documentElement;
                root.dataset.layout = l;
                root.dataset.design = d;
                root.dataset.ux = u;
              },
              { design, ux, layout },
            );
            await frames(page, 3);
            const found = await inspect(page);
            const where = `${design} / ${ux}`;
            if (found.sideways > 0)
              failures.push(`${where}: scrolls sideways by ${String(found.sideways)}px`);
            if (found.outside.length > 0)
              failures.push(`${where}: text outside the window: ${found.outside.join(", ")}`);
            if (found.brandLines > 1)
              failures.push(`${where}: brand on ${String(found.brandLines)} lines`);
          }
        }
        expect(failures).toEqual([]);
      });
    }
  }
}

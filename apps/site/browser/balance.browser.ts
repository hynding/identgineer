import { expect, test } from "./fixtures";
import { hydrated } from "./pages";

/** A tablet held upright and on its side, a small laptop and two desktop windows. */
const BALANCE_WIDTHS = [768, 820, 1024, 1280, 1440] as const;

/** The most of a section's height that may be empty under its content, as a share of it. */
const MOST_EMPTY = 0.2;

// Where a layout sets sections side by side, as tiles, panels or columns, a row is as tall as its
// tallest section, and a section whose content ends much higher stands half empty. In the default
// look, at each width, no section may be more than a fifth empty below its content.
for (const layout of ["bento", "dashboard", "magazine"] as const) {
  test(`${layout}: no section side by side with another stands more than a fifth empty below its content`, async ({
    page,
  }) => {
    const problems: string[] = [];
    for (const width of BALANCE_WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/?idg-layout=${layout}`);
      await hydrated(page, "site-home");
      const sections = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>(".feature")].map((section) => {
          const box = section.getBoundingClientRect();
          const end = box.bottom - Number.parseFloat(getComputedStyle(section).paddingBlockEnd);
          // What the section shows ends with its last line of text or its last element that holds
          // no other: a box around them may be stretched to the row.
          let content = box.top;
          const range = document.createRange();
          const walker = document.createTreeWalker(
            section,
            NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
          );
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (node instanceof Element && node.childElementCount > 0) continue;
            if (node instanceof Text) range.selectNodeContents(node);
            const inner =
              node instanceof Element
                ? node.getBoundingClientRect()
                : range.getBoundingClientRect();
            if (inner.width > 0 && inner.height > 0) content = Math.max(content, inner.bottom);
          }
          return { id: section.id, height: box.height, empty: end - content };
        }),
      );
      for (const { id, height, empty } of sections) {
        if (empty > height * MOST_EMPTY) {
          problems.push(
            `${String(width)}px: ${id} is ${String(Math.round(empty))}px empty of ${String(Math.round(height))}px`,
          );
        }
      }
    }
    expect(problems).toEqual([]);
  });
}

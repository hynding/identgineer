import { prerenderedPages } from "../src/routes";
import { expect, test } from "./fixtures";
import { LAYOUTS, hydrated } from "./pages";

/** Every reading page, by its address. */
const READING_PAGES = prerenderedPages().flatMap((page) =>
  page.component === "site-content-page" && page.path !== undefined ? [page.path] : [],
);

// Where the table of contents cannot stand beside the article, it comes before it in every layout,
// never after the whole article where it would be found too late.
for (const layout of LAYOUTS) {
  test(`a reading page in ${layout} shows one table of contents, beside the article or before it`, async ({
    page,
  }) => {
    const problems: string[] = [];
    for (const width of [390, 820, 1100, 1440] as const) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/identity/?idg-layout=${layout}`);
      await hydrated(page, "site-content-page");
      const found = await page.evaluate(() => {
        const article = document.querySelector("article.prose")?.getBoundingClientRect();
        return [...document.querySelectorAll("nav.contents")]
          .filter((contents) => contents.checkVisibility())
          .map((contents) => {
            const box = contents.getBoundingClientRect();
            const beside =
              article !== undefined &&
              box.top < article.bottom &&
              (box.left >= article.right || box.right <= article.left);
            const before = article !== undefined && box.bottom <= article.top;
            return beside || before;
          });
      });
      if (found.length !== 1) problems.push(`${String(width)}px: ${String(found.length)} shown`);
      else if (found[0] !== true) problems.push(`${String(width)}px: after the article`);
    }
    expect(problems).toEqual([]);
  });
}

interface Band {
  readonly heading: number;
  readonly text: number;
  readonly column: number;
}

// immersive draws each section as a band across the window. Its heading is centred over the
// column of its text, and that column is centred in the band, at every width, on every page.
test("immersive centres each band's heading on the column of its text, on every reading page", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const problems: string[] = [];
  for (const path of READING_PAGES) {
    for (const width of [820, 1024, 1440, 1920] as const) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${path}?idg-layout=immersive`);
      await hydrated(page, "site-content-page");
      const bands = await page.evaluate(() =>
        [...document.querySelectorAll(".prose-section")].map((section) => {
          const centre = (element: Element | null) => {
            const box = element?.getBoundingClientRect();
            return box === undefined ? Number.NaN : (box.left + box.right) / 2;
          };
          const heading = section.querySelector(":scope > h2");
          const range = document.createRange();
          if (heading) range.selectNodeContents(heading);
          const text = range.getBoundingClientRect();
          return {
            heading: (text.left + text.right) / 2,
            text: centre(section.querySelector(":scope > :not(h2)")),
            column: centre(section),
          };
        }),
      );
      bands.forEach(({ heading, text, column }: Band, index) => {
        const where = `${path} at ${String(width)}px, section ${String(index + 1)}`;
        if (Math.abs(heading - text) > 2) {
          problems.push(`${where}: heading ${String(Math.round(heading - text))}px off its text`);
        }
        if (Math.abs(text - column) > 2) {
          problems.push(`${where}: text ${String(Math.round(text - column))}px off the band`);
        }
      });
    }
  }
  expect(problems).toEqual([]);
});

// The first band starts under the hero after the shell's own gap, not after a second one.
test("immersive starts a reading page's content one gap under the hero", async ({ page }) => {
  const problems: string[] = [];
  for (const width of [390, 820, 1440] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/identity/?idg-layout=immersive");
    await hydrated(page, "site-content-page");
    const { gap, sectionGap } = await page.evaluate(() => {
      const hero = document
        .querySelector(".site-layout")
        ?.shadowRoot?.querySelector('[part="hero"]');
      // The first line of text drawn under the hero: the contents, or the article's first words.
      const body = document.querySelector(".reading-body") ?? document.body;
      const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      let top = Number.NaN;
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!/\S/.test(node.textContent ?? "") || !node.parentElement?.checkVisibility()) continue;
        range.selectNodeContents(node);
        const box = range.getBoundingClientRect();
        if (box.height > 0) {
          top = box.top;
          break;
        }
      }
      const probe = document.createElement("div");
      probe.style.blockSize = "var(--idg-layout-section-gap)";
      body.append(probe);
      const sectionGap = probe.getBoundingClientRect().height;
      probe.remove();
      return { gap: top - (hero?.getBoundingClientRect().bottom ?? Number.NaN), sectionGap };
    });
    if (!(gap <= sectionGap * 1.6)) {
      problems.push(
        `${String(width)}px: ${String(Math.round(gap))}px under the hero, the gap is ${String(Math.round(sectionGap))}px`,
      );
    }
  }
  expect(problems).toEqual([]);
});

// A table or a code sample wider than its column scrolls along itself; a shade at the edge that
// has more to show says so, and none is drawn on a box that does not scroll.
for (const layout of LAYOUTS) {
  test(`a box that scrolls in ${layout} shades the edge it has more beyond`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(`/docs/theming/?idg-layout=${layout}`);
    await hydrated(page, "site-content-page");
    const shades = () =>
      page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>(".table-scroll, .code-sample pre")].map(
          (box) => {
            const style = getComputedStyle(box);
            return {
              // Any overflow is a scroll, a pixel of a rounded width too, and the timeline runs.
              scrolls: box.scrollWidth > box.clientWidth,
              start: Number.parseFloat(style.getPropertyValue("--_shade-start")) > 0,
              end: Number.parseFloat(style.getPropertyValue("--_shade-end")) > 0,
            };
          },
        ),
      );
    const before = await shades();
    expect(before.some((box) => box.scrolls)).toBe(true);
    for (const { scrolls, start, end } of before) {
      expect({ start, end }).toEqual({ start: false, end: scrolls });
    }
    await page.evaluate(() => {
      for (const box of document.querySelectorAll<HTMLElement>(".table-scroll, .code-sample pre")) {
        box.scrollLeft = box.scrollWidth;
      }
    });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    for (const { scrolls, start, end } of await shades()) {
      expect({ start, end }).toEqual({ start: scrolls, end: false });
    }
  });
}

// A short name in code (an attribute, a value) is read whole: it never wraps, even at a hyphen.
for (const layout of LAYOUTS) {
  test(`a short name in code is never wrapped in ${layout}`, async ({ page }) => {
    const problems: string[] = [];
    for (const width of [320, 390, 1024, 1440] as const) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/docs/theming/?idg-layout=${layout}`);
      await hydrated(page, "site-content-page");
      const wrapped = await page.evaluate(() =>
        [...document.querySelectorAll(".prose code")]
          .filter((code) => code.closest("pre") === null && code.textContent.length < 17)
          .filter((code) => {
            const tops = [...code.getClientRects()].map((line) => Math.round(line.top));
            return new Set(tops).size > 1;
          })
          .map((code) => code.textContent),
      );
      for (const name of wrapped) problems.push(`${String(width)}px: ${name}`);
    }
    expect(problems).toEqual([]);
  });
}

// Where the shell's aside stands beside the content (from 72rem), it is a column already: a docs
// page puts its own pages in a row over the article rather than a third column, so the article has
// the content column's width and not a fraction of it. Just below 72rem the shell's aside is hidden,
// and the docs' pages are a column beside the article again. (immersive sets every band in a
// centred column of its own, tested above.)
for (const layout of ["top-bar", "magazine", "dashboard", "bento"] as const) {
  test(`a docs page in ${layout} gives its article the content column beside the aside`, async ({
    page,
  }) => {
    const problems: string[] = [];
    for (const width of [1151, 1152, 1440, 1920] as const) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/docs/theming/?idg-layout=${layout}`);
      await hydrated(page, "site-content-page");
      const { article, column, pagesAbove, pagesBeside, inRow } = await page.evaluate(() => {
        const main = document
          .querySelector(".site-layout")
          ?.shadowRoot?.querySelector('[part="main"]');
        const style = main ? getComputedStyle(main) : undefined;
        const padding = style
          ? Number.parseFloat(style.paddingInlineStart) + Number.parseFloat(style.paddingInlineEnd)
          : 0;
        const docs = document.querySelector("nav.docs-pages")?.getBoundingClientRect();
        const prose = document.querySelector("article.prose")?.getBoundingClientRect();
        const [first, second] = [...document.querySelectorAll("nav.docs-pages li")].map((item) =>
          item.getBoundingClientRect(),
        );
        return {
          article: prose?.width ?? 0,
          column: (main?.clientWidth ?? 0) - padding,
          pagesAbove: docs !== undefined && prose !== undefined && docs.bottom <= prose.top,
          pagesBeside: docs !== undefined && prose !== undefined && docs.right <= prose.left,
          inRow:
            first !== undefined &&
            second !== undefined &&
            Math.round(first.top) === Math.round(second.top) &&
            second.left >= first.right,
        };
      });
      const where = `${String(width)}px:`;
      if (width < 1152) {
        if (!pagesBeside) problems.push(`${where} the docs' pages are not beside the article`);
        if (inRow) problems.push(`${where} the docs' pages are a row`);
        continue;
      }
      if (article < column * 0.9) {
        problems.push(
          `${where} the article is ${String(Math.round(article))}px of ${String(Math.round(column))}px`,
        );
      }
      if (!pagesAbove) problems.push(`${where} the docs' pages are not over the article`);
      if (!inRow) problems.push(`${where} the docs' pages are not a row`);
    }
    expect(problems).toEqual([]);
  });
}

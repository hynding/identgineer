import type { Page } from "@playwright/test";
import { applyAxes, LAYOUTS, UX_MODES } from "./axes";
import { expect, test } from "./fixtures";
import { frames, openShell } from "./layout-shell-page";

type Arrangement = "same-row" | "stacked" | "no-toggle";

/** Where the brand and the menu button sit at 100% text, as the shell has always drawn them. */
const HEADER: Record<string, Record<number, Arrangement>> = {
  bento: { 320: "same-row", 360: "same-row", 390: "same-row", 768: "same-row", 1280: "no-toggle" },
  centered: { 320: "stacked", 360: "stacked", 390: "stacked", 768: "no-toggle", 1280: "no-toggle" },
  dashboard: {
    320: "same-row",
    360: "same-row",
    390: "same-row",
    768: "no-toggle",
    1280: "no-toggle",
  },
  immersive: {
    320: "same-row",
    360: "same-row",
    390: "same-row",
    768: "same-row",
    1280: "same-row",
  },
  magazine: { 320: "stacked", 360: "stacked", 390: "stacked", 768: "no-toggle", 1280: "no-toggle" },
  "side-rail": {
    320: "same-row",
    360: "same-row",
    390: "same-row",
    768: "no-toggle",
    1280: "no-toggle",
  },
  "split-hero": {
    320: "same-row",
    360: "same-row",
    390: "same-row",
    768: "same-row",
    1280: "same-row",
  },
  "top-bar": {
    320: "same-row",
    360: "same-row",
    390: "same-row",
    768: "same-row",
    1280: "no-toggle",
  },
};

function arrangement(page: Page): Promise<Arrangement> {
  return page.locator("#shell").evaluate((host): Arrangement => {
    const brand = host.shadowRoot?.querySelector<HTMLElement>('[part="brand"]');
    const toggle = host.shadowRoot?.querySelector<HTMLElement>('[part="toggle"]');
    if (!brand || !toggle) throw new Error("no brand or toggle");
    if (!toggle.checkVisibility()) return "no-toggle";
    const a = brand.getBoundingClientRect();
    const b = toggle.getBoundingClientRect();
    return Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1 ? "same-row" : "stacked";
  });
}

test.describe("the header at ordinary sizes is arranged as it always was", () => {
  for (const layout of LAYOUTS) {
    test(`${layout}: brand and menu button share a row, or stack, or the button is gone, at 320px to 1280px`, async ({
      page,
    }) => {
      await openShell(page, { layout });
      const expected = HEADER[layout];
      if (!expected) throw new Error(`no expectation for ${layout}`);
      for (const [width, want] of Object.entries(expected)) {
        await page.setViewportSize({ width: Number(width), height: 800 });
        await frames(page, 3);
        expect(await arrangement(page), `${layout} at ${width}px`).toBe(want);
      }
    });
  }
});

/** The lengths of the tokens a card reads, in pixels, as the page computes them now. */
const tokens = (page: Page) =>
  page.evaluate(() => {
    const lengthOf = (value: string): number => {
      const probe = document.createElement("div");
      probe.style.paddingInlineStart = value;
      document.body.append(probe);
      const pixels = Number.parseFloat(getComputedStyle(probe).paddingInlineStart);
      probe.remove();
      return pixels;
    };
    return {
      pad: lengthOf("calc(var(--idg-space-m) * var(--idg-density-gap-scale))"),
      cap: lengthOf("var(--idg-space-s)"),
    };
  });

/** The inline padding of the header and the body of every card on the page. */
const cardPaddings = (page: Page): Promise<number[]> =>
  page.evaluate(() => {
    const seen: number[] = [];
    for (const card of document.querySelectorAll("idg-card")) {
      for (const part of ["header", "body"]) {
        const region = card.shadowRoot?.querySelector(`[part="${part}"]`);
        if (region) seen.push(Number.parseFloat(getComputedStyle(region).paddingInlineStart));
      }
    }
    return seen;
  });

test.describe("a card is padded as the density says, and only in a narrow window is the padding capped", () => {
  for (const width of [320, 390, 768, 1280]) {
    test(`at ${String(width)}px the inline padding of every card region follows the rule, in every layout and UX mode`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await openShell(page, { width });
      const failures: string[] = [];
      for (const layout of LAYOUTS) {
        for (const ux of UX_MODES) {
          await applyAxes(page, { layout, ux });
          await frames(page, 2);
          const { pad, cap } = await tokens(page);
          const expected = width <= 448 ? Math.min(pad, cap) : pad;
          const seen = await cardPaddings(page);
          if (seen.length === 0) failures.push(`${layout} / ${ux}: no card regions`);
          for (const padding of seen) {
            if (Math.abs(padding - expected) > 0.1) {
              failures.push(`${layout} / ${ux}: ${String(padding)}px, not ${String(expected)}px`);
              break;
            }
          }
        }
      }
      expect(failures).toEqual([]);
    });
  }
});

test.describe("a card sized by its content is as wide as its content", () => {
  /** Puts a card in each context that sizes it by its content, then reads it back. */
  const measure = (page: Page) =>
    page.evaluate(() => {
      const text = "A card makes the row taller.";
      const contexts: [string, (parent: HTMLElement, card: HTMLElement) => void][] = [
        ["flex row", (parent) => (parent.style.display = "flex")],
        ["fit-content", (_parent, card) => (card.style.inlineSize = "fit-content")],
        [
          "max-content track",
          (parent) => {
            parent.style.display = "grid";
            parent.style.gridTemplateColumns = "max-content";
          },
        ],
        ["inline-flex", (_parent, card) => (card.style.display = "inline-flex")],
      ];
      const found: Record<string, { width: number; padding: number; lines: number; text: number }> =
        {};
      for (const [name, setup] of contexts) {
        const parent = document.createElement("div");
        const card = document.createElement("idg-card");
        card.textContent = text;
        document.querySelector("main, #shell")?.append(parent);
        parent.append(card);
        setup(parent, card);
        found[name] = { width: 0, padding: 0, lines: 0, text: 0 };
      }
      return new Promise<typeof found>((resolve) => {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const cards = [...document.querySelectorAll("#shell > div > idg-card")];
            Object.keys(found).forEach((name, index) => {
              const card = cards[index];
              const body = card?.shadowRoot?.querySelector<HTMLElement>('[part="body"]');
              if (!card || !body) return;
              const range = document.createRange();
              range.selectNodeContents(card);
              const rects = [...range.getClientRects()].filter((box) => box.width > 0);
              found[name] = {
                width: card.getBoundingClientRect().width,
                padding: Number.parseFloat(getComputedStyle(body).paddingInlineStart),
                lines: new Set(rects.map((box) => Math.round(box.top))).size,
                text: Math.max(...rects.map((box) => box.width)),
              };
            });
            resolve(found);
          }),
        );
      });
    });

  for (const width of [768, 1280]) {
    test(`at ${String(width)}px a card in a flex row, at fit-content, in a max-content track or inline-flex keeps its padding, its text on one line and the width its content needs`, async ({
      page,
    }) => {
      await openShell(page, { width, layout: "top-bar" });
      const { pad } = await tokens(page);
      const found = await measure(page);
      for (const [name, card] of Object.entries(found)) {
        expect(card.padding, `${name}: padding`).toBeCloseTo(pad, 1);
        expect(card.lines, `${name}: lines of text`).toBe(1);
        // The padding, the text and the card's borders, which are at most a few pixels.
        expect(card.width - 2 * pad - card.text, `${name}: width`).toBeLessThan(12);
        expect(card.width - 2 * pad - card.text, `${name}: width`).toBeGreaterThanOrEqual(-1);
      }
    });
  }

  test("the cards of the layout primitives fixture keep their text on one line", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/fixtures/layout-primitives.html");
    await expect(page.locator("idg-card:not(.hydrated)")).toHaveCount(0);
    await frames(page, 3);
    const lines = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          "#cluster-divider idg-card, #row-centred idg-card, #cluster-hdivider idg-card",
        ),
      ].map((card) => {
        const range = document.createRange();
        range.selectNodeContents(card);
        return new Set(
          [...range.getClientRects()]
            .filter((box) => box.width > 0)
            .map((box) => Math.round(box.top)),
        ).size;
      }),
    );
    expect(lines.length).toBeGreaterThan(0);
    for (const count of lines) expect(count).toBeLessThanOrEqual(1);
  });
});

test.describe("a card keeps its words whole", () => {
  /**
   * The pieces of the text in the cards (a word, or the part of one up to a hyphen) that run over
   * more than one line, with how wide each is and how wide the room for the text is.
   */
  const brokenWords = (page: Page) =>
    page.evaluate(() => {
      const measure = document.createElement("canvas").getContext("2d");
      if (!measure) throw new Error("no canvas");
      const found: { piece: string; natural: number; room: number }[] = [];
      for (const card of document.querySelectorAll("idg-card")) {
        const body = card.shadowRoot?.querySelector<HTMLElement>('[part="body"]');
        if (!body) continue;
        const room =
          body.getBoundingClientRect().width -
          2 * Number.parseFloat(getComputedStyle(body).paddingInlineStart);
        const walk = (node: Node): void => {
          if (node instanceof Text) {
            const parent = node.parentElement;
            if (!parent?.checkVisibility()) return;
            const text = getComputedStyle(parent);
            measure.font = `${text.fontWeight} ${text.fontSize} ${text.fontFamily}`;
            const spacing = Number.parseFloat(text.letterSpacing) || 0;
            for (const piece of node.data.matchAll(/[^\s-]+-?/g)) {
              const range = document.createRange();
              range.setStart(node, piece.index);
              range.setEnd(node, piece.index + piece[0].length);
              const lines = new Set([...range.getClientRects()].map((box) => Math.round(box.top)));
              const natural = measure.measureText(piece[0]).width + spacing * piece[0].length;
              if (lines.size > 1) found.push({ piece: piece[0], natural, room });
            }
            return;
          }
          node.childNodes.forEach(walk);
        };
        walk(card);
      }
      return found;
    });

  for (const [width, layout, design, ux] of [
    [768, "dashboard", "pixel", "focus"],
    [1280, "dashboard", "pixel", "focus"],
    [1280, "dashboard", "flat", "comfortable"],
    [768, "top-bar", "flat", "comfortable"],
  ] as const) {
    test(`${layout} / ${design} / ${ux} at ${String(width)}px: no word of a card's text is broken, as it never was`, async ({
      page,
    }) => {
      await openShell(page, { width });
      await applyAxes(page, { layout, ux });
      await page.evaluate((value) => {
        document.documentElement.dataset.design = value;
      }, design);
      await frames(page, 3);
      expect((await brokenWords(page)).map((word) => word.piece)).toEqual([]);
    });
  }

  for (const [width, design, ux] of [
    [320, "pixel", "focus"],
    [390, "pixel", "focus"],
    [390, "flat", "comfortable"],
  ] as const) {
    test(`dashboard / ${design} / ${ux} at ${String(width)}px: a word breaks only where it is wider than the room for the text`, async ({
      page,
    }) => {
      await openShell(page, { width });
      await applyAxes(page, { layout: "dashboard", ux });
      await page.evaluate((value) => {
        document.documentElement.dataset.design = value;
      }, design);
      await frames(page, 3);
      const fitting = (await brokenWords(page)).filter((word) => word.natural + 6 <= word.room);
      expect(fitting.map((word) => word.piece)).toEqual([]);
    });
  }
});

/** The cells of the tables on the page whose text breaks inside a word, one line each. */
function brokenCells(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const found: string[] = [];
    for (const cell of document.querySelectorAll("idg-table th, idg-table td")) {
      const range = document.createRange();
      range.selectNodeContents(cell);
      const lines = new Set([...range.getClientRects()].map((box) => Math.round(box.top)));
      const words = cell.textContent.trim().split(/\s+/).length;
      if (lines.size > words) found.push(`${cell.textContent.trim()}: ${String(lines.size)} lines`);
    }
    return found;
  });
}

test.describe("a table keeps its columns", () => {
  for (const [width, fontSize] of [
    [390, "100%"],
    [320, "200%"],
  ] as const) {
    test(`at ${String(width)}px with text at ${fontSize} no cell of a table in a card breaks inside a word`, async ({
      page,
    }) => {
      await openShell(page, { width, fontSize, layout: "top-bar", ux: "focus" });
      await page.evaluate(() => {
        const table = document.querySelector("idg-table");
        const card = document.createElement("idg-card");
        card.setAttribute("heading", "Activity");
        table?.replaceWith(card);
        if (table) card.append(table);
      });
      await frames(page, 3);
      expect(await brokenCells(page)).toEqual([]);
    });
  }

  test("at 390px the fixture's own table keeps its columns in every layout and UX mode", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openShell(page, { width: 390 });
    const failures: string[] = [];
    for (const layout of LAYOUTS) {
      for (const ux of UX_MODES) {
        await applyAxes(page, { layout, ux });
        await frames(page, 2);
        const broken = await brokenCells(page);
        if (broken.length > 0) failures.push(`${layout} / ${ux}: ${broken.join(", ")}`);
      }
    }
    expect(failures).toEqual([]);
  });
});

test.describe("the variation switcher breaks no words outside a narrow window", () => {
  test("on the index page at 768px its heading is on one line, as it always was", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 768, height: 800 });
    await page.goto("/index.html");
    await expect(page.locator("idg-variation-switcher:not(.hydrated)")).toHaveCount(0);
    await applyAxes(page, { layout: "bento", design: "brutalist", ux: "calm" });
    await frames(page, 4);
    const lines = await page.evaluate(() => {
      const heading = document
        .querySelector("idg-variation-switcher")
        ?.shadowRoot?.querySelector('[part="heading"]');
      const range = document.createRange();
      if (heading) range.selectNodeContents(heading);
      const tops = [...range.getClientRects()]
        .filter((box) => box.width > 0)
        .map((box) => Math.round(box.top));
      return new Set(tops).size;
    });
    expect(lines).toBe(1);
  });
});

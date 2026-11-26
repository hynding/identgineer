import type { Page } from "@playwright/test";
import { REGISTRY } from "@identgineer/variations";
import { DESIGNS, applyAxes, settle } from "./axes";
import { expect, test } from "./fixtures";
import { setBrowserTextSize } from "./text-size";

const PAGE = "/fixtures/identity-layout.html";
const FORMS = "idg-sign-in, idg-register, idg-password-reset";

async function open(page: Page): Promise<void> {
  await page.goto(PAGE);
  await expect(page.locator("html[data-identity-ready]")).toHaveCount(1);
  await expect(
    page.locator(`:is(${FORMS}, idg-cluster, idg-session-guard):not(.hydrated)`),
  ).toHaveCount(0);
  await page.evaluate(() => {
    (document.getElementById("dialog") as HTMLDialogElement).showModal();
    document.getElementById("popover")?.showPopover();
  });
  await settle(page);
}

/** Each form's case and width, and the width the identity measure resolves to. */
function widths(page: Page) {
  return page.evaluate((forms) => {
    const probe = document.createElement("div");
    document.body.append(probe);
    probe.style.inlineSize = "var(--idg-identity-measure, var(--idg-size-m))";
    const measure = probe.getBoundingClientRect().width;
    probe.remove();
    return {
      measure,
      forms: Array.from(document.querySelectorAll(forms), (form) => {
        const box = form.getBoundingClientRect();
        return {
          name: `${form.closest("[data-case]")?.getAttribute("data-case") ?? "?"} ${form.localName}`,
          width: box.width,
          right: box.right,
        };
      }),
    };
  }, FORMS);
}

test.describe("identity forms in parents that size them by their content", () => {
  test("keep the identity measure as their width on a wide screen", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page);
    const { measure, forms } = await widths(page);
    expect(forms).toHaveLength(6);
    expect(measure).toBeGreaterThan(0);
    for (const form of forms) {
      expect(Math.abs(form.width - measure), form.name).toBeLessThanOrEqual(1);
    }
  });

  test("fit a 320px screen without scrolling sideways", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await open(page);
    const { forms } = await widths(page);
    for (const form of forms) {
      expect(form.width, form.name).toBeGreaterThan(160);
      expect(form.right, form.name).toBeLessThanOrEqual(320);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);
  });

  /** Each form's width beside what `value` measures in the form's own font. */
  const widthsFor = (page: Page, value: string) =>
    page.evaluate(
      ([forms, measure]) =>
        Array.from(document.querySelectorAll(forms), (form) => {
          const probe = document.createElement("div");
          probe.style.font = getComputedStyle(form).font;
          probe.style.inlineSize = measure;
          probe.style.position = "absolute";
          document.body.append(probe);
          const expected = probe.getBoundingClientRect().width;
          probe.remove();
          const box = form.getBoundingClientRect();
          return {
            name: `${form.closest("[data-case]")?.getAttribute("data-case") ?? "?"} ${form.localName}`,
            width: box.width,
            right: box.right,
            expected,
          };
        }),
      [FORMS, value] as const,
    );

  // In any unit a length takes, the font-relative ones in the form's own font.
  for (const value of ["25rem", "25em", "40ch"]) {
    test(`take a measure the page sets, ${value}, on a wide screen and at 320px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await open(page);
      await page.evaluate((measure) => {
        document.documentElement.style.setProperty("--idg-identity-measure", measure);
      }, value);
      await settle(page);
      for (const form of await widthsFor(page, value)) {
        expect(form.expected, form.name).toBeGreaterThan(300);
        expect(Math.abs(form.width - form.expected), form.name).toBeLessThanOrEqual(1);
      }
      await page.setViewportSize({ width: 320, height: 900 });
      await settle(page);
      for (const form of await widthsFor(page, value)) {
        expect(form.width, form.name).toBeGreaterThan(160);
        expect(form.right, form.name).toBeLessThanOrEqual(320);
      }
    });
  }
  // The measure line is of no font's glyphs and takes none of the page's text spacing.
  test("keep the measure as their width, and none as their smallest, in every theme, whatever the page's text-indent and letter-spacing", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page);
    await page.evaluate(() => {
      document.body.style.textIndent = "3em";
      document.body.style.letterSpacing = "0.2em";
    });
    for (const { id } of REGISTRY.theme.variations) {
      await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme;
      }, id);
      await settle(page);
      const forms = await widthsFor(page, "var(--idg-identity-measure, var(--idg-size-m))");
      expect(forms).toHaveLength(6);
      for (const form of forms) {
        expect(Math.abs(form.width - form.expected), `${id} ${form.name}`).toBeLessThanOrEqual(1);
      }
      const smallest = await page.evaluate(
        (selector) =>
          Array.from(document.querySelectorAll<HTMLElement>(selector), (form) => {
            form.style.inlineSize = "min-content";
            const width = form.getBoundingClientRect().width;
            form.style.removeProperty("inline-size");
            return width;
          }),
        FORMS,
      );
      for (const width of smallest) expect(width, id).toBeLessThanOrEqual(0.5);
    }
  });
});

test.describe("idg-session-guard in a flex row or a grid", () => {
  /** The boxes of a case's cards, relative to the case. */
  const cardBoxes = (page: Page, name: string) =>
    page.locator(`[data-case="${name}"]`).evaluate((container) => {
      const origin = container.getBoundingClientRect();
      return Array.from(container.querySelectorAll(".card"), (card) => {
        const box = card.getBoundingClientRect();
        return [box.x - origin.x, box.y - origin.y, box.width, box.height].map(Math.round);
      });
    });

  async function signIn(page: Page): Promise<void> {
    await page.evaluate(`window.identityFixture.client.signIn({
      identifier: "ada", password: window.identityFixture.password })`);
    await expect(page.locator('[data-case="guard-flex"] .card').first()).toBeVisible();
    await settle(page);
  }

  test("lays out what it shows as the parent's own items, as a twin without a guard", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page);
    await signIn(page);
    for (const layout of ["flex", "grid"]) {
      const twin = await cardBoxes(page, `twin-${layout}`);
      expect(twin).toHaveLength(3);
      expect(twin[0]?.[2], layout).toBeGreaterThan(200);
      expect(await cardBoxes(page, `guard-${layout}`), layout).toEqual(twin);
    }
  });

  test("adds no group, region or other node to the accessibility tree", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page);
    await signIn(page);
    for (const layout of ["flex", "grid"]) {
      expect(await page.locator(`[data-case="guard-${layout}"]`).ariaSnapshot(), layout).toBe(
        await page.locator(`[data-case="twin-${layout}"]`).ariaSnapshot(),
      );
    }
  });
});

/** Each three-column case: its tracks, and the width of each item it shows against one track's. */
function threeColumnCases(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".grid-3")].map((grid) => {
      const tracks = getComputedStyle(grid).gridTemplateColumns.split(" ").map(Number.parseFloat);
      const items = [...grid.querySelectorAll(".card, p")]
        .map((item) => item.getBoundingClientRect().width)
        .filter((width) => width > 0);
      return { name: grid.dataset.case ?? "", tracks, items };
    }),
  );
}

// The grid of cards is three columns at an ordinary text size, as it always was, from the
// narrowest window up, and a signed-out guard's one paragraph takes one of them; only a large text
// size in a narrow window gives it fewer, where three cards' words would not fit.
test.describe("the three-column cases are three columns at 100% text", () => {
  for (const width of [320, 768, 1280]) {
    test(`at ${String(width)}px, in every design`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await open(page);
      const failures: string[] = [];
      for (const design of DESIGNS) {
        await applyAxes(page, { design });
        for (const { name, tracks, items } of await threeColumnCases(page)) {
          const [first = 0] = tracks;
          if (tracks.length !== 3 || tracks.some((track) => Math.abs(track - first) > 0.5)) {
            failures.push(`${design}, ${name}: tracks ${tracks.join(" ")}`);
          }
          if (items.length === 0 || items.some((item) => Math.abs(item - first) > 0.5)) {
            failures.push(
              `${design}, ${name}: items ${items.join(" ")} in a ${String(first)}px track`,
            );
          }
        }
      }
      expect(failures).toEqual([]);
    });
  }

  test("with the browser's text at 200% in a 320px window there are fewer", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await open(page);
    await setBrowserTextSize(page, 200);
    await settle(page);
    for (const { tracks } of await threeColumnCases(page)) expect(tracks.length).toBeLessThan(3);
  });
});

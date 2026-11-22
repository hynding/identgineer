import { emitBrandThemeCss, generateBrandTheme, parseBrandKit } from "@identgineer/brand";
import type { Page } from "@playwright/test";
import { SCHEMES, THEMES, applyAxes } from "./axes";
import { contrastRatio } from "./contrast";
import { expect, test } from "./fixtures";

interface Probe {
  readonly name: string;
  readonly mark: string;
  readonly against: string;
}

/**
 * Colours as the browser computes them: each probe is a mark of state and what it sits on, the
 * nearest opaque background behind it, found by walking up through shadow roots.
 */
async function measure(page: Page, probes: string): Promise<Probe[]> {
  return page.evaluate((kind) => {
    const opaque = (color: string) => color !== "rgba(0, 0, 0, 0)" && color !== "transparent";
    const behind = (start: Element | null): string => {
      let node: Node | null = start;
      while (node) {
        if (node instanceof Element) {
          const color = getComputedStyle(node).backgroundColor;
          if (opaque(color)) return color;
        }
        node = node.parentNode instanceof ShadowRoot ? node.parentNode.host : node.parentNode;
      }
      return getComputedStyle(document.documentElement).backgroundColor;
    };
    const inside = (host: string, part: string) => {
      const element = document.querySelector(host)?.shadowRoot?.querySelector(part);
      if (!element) throw new Error(`missing ${host} ${part}`);
      return element;
    };
    const style = (element: Element, pseudo?: string) => getComputedStyle(element, pseudo);
    if (kind === "forms") {
      const radio = inside('#billing idg-radio[value="yearly"]', ".native");
      const checkbox = inside("#partial", ".native");
      const toggle = inside("#alerts", ".native");
      return [
        {
          name: "checked radio dot",
          mark: style(radio, "::before").backgroundColor,
          against: style(radio).backgroundColor,
        },
        {
          name: "mixed checkbox",
          mark: style(checkbox).backgroundColor,
          against: behind(document.querySelector("#partial")?.parentElement ?? null),
        },
        {
          name: "switch track, on",
          mark: style(toggle).backgroundColor,
          against: behind(document.querySelector("#alerts")?.parentElement ?? null),
        },
        {
          name: "switch thumb, on",
          mark: style(toggle, "::before").backgroundColor,
          against: style(toggle).backgroundColor,
        },
      ];
    }
    if (kind === "surfaces") {
      const bar = inside("#progress-upload", ".bar");
      return [
        {
          name: "progress fill on its track",
          mark: style(bar).color,
          against: style(bar).backgroundColor,
        },
        {
          name: "progress fill on the page",
          mark: style(bar).color,
          against: behind(document.querySelector("#progress-upload")?.parentElement ?? null),
        },
      ];
    }
    const current = inside("#pagination-buttons", '[aria-current="page"]');
    const tab = inside("#tabs idg-tab[selected]", ".tab");
    return [
      {
        name: "current page",
        mark: style(current).backgroundColor,
        against: behind(current.parentElement),
      },
      {
        name: "selected tab marker",
        mark: style(tab, "::after").backgroundColor,
        against: behind(tab),
      },
    ];
  }, probes);
}

/** Waits until every component has hydrated and drawn, so what is measured is the final style. */
async function hydrated(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    [...document.querySelectorAll("*")].every(
      (element) => !element.localName.startsWith("idg-") || element.classList.contains("hydrated"),
    ),
  );
}

/** The primary submit button's fill, border or inset ring reaches 3:1 against what is behind it. */
async function expectVisibleBoundary(page: Page): Promise<void> {
  const { background, border, borderWidth, ring, behind } = await page.evaluate(() => {
    const host = document.querySelector('idg-button[type="submit"]');
    const control = host?.shadowRoot?.querySelector("button");
    if (!host || !control) throw new Error("missing the submit button");
    let node: Node | null = host.parentNode;
    let page = getComputedStyle(document.documentElement).backgroundColor;
    while (node) {
      if (node instanceof Element) {
        const color = getComputedStyle(node).backgroundColor;
        if (color !== "rgba(0, 0, 0, 0)") {
          page = color;
          break;
        }
      }
      node = node.parentNode instanceof ShadowRoot ? node.parentNode.host : node.parentNode;
    }
    const style = getComputedStyle(control);
    const inset = /(rgba?\([^)]*\))[^,]*\binset\b|\binset\b[^,]*?(rgba?\([^)]*\))/.exec(
      style.boxShadow,
    );
    return {
      background: style.backgroundColor,
      border: style.borderTopColor,
      borderWidth: Number.parseFloat(style.borderTopWidth),
      ring: inset?.[1] ?? inset?.[2] ?? "",
      behind: page,
    };
  });
  const edges = [background, ...(borderWidth > 0 ? [border] : []), ...(ring === "" ? [] : [ring])];
  const best = Math.max(...edges.map((edge) => contrastRatio(edge, behind)));
  expect(
    best,
    `fill ${background}, border ${border} (${String(borderWidth)}px), ring ${ring}, on ${behind}`,
  ).toBeGreaterThanOrEqual(3);
}

const FIXTURES = [
  ["forms", "/fixtures/forms.html"],
  ["surfaces", "/fixtures/surfaces.html"],
  ["navigation", "/fixtures/navigation.html"],
] as const;

test.describe("accent state indicators", () => {
  for (const [kind, path] of FIXTURES) {
    for (const theme of THEMES) {
      for (const scheme of SCHEMES) {
        test(`${kind} marks state at 3:1 or more in ${theme} ${scheme}`, async ({ page }) => {
          await page.goto(path);
          await hydrated(page);
          await applyAxes(page, { theme, scheme });
          for (const { name, mark, against } of await measure(page, kind)) {
            expect(
              contrastRatio(mark, against),
              `${name}: ${mark} on ${against}`,
            ).toBeGreaterThanOrEqual(3);
          }
        });
      }
    }
  }
});

test.describe("primary button boundary", () => {
  for (const design of ["flat", "soft", "elevated"]) {
    for (const theme of THEMES) {
      for (const scheme of SCHEMES) {
        test(`is visible against the page in ${design}, ${theme} ${scheme}`, async ({ page }) => {
          await page.goto("/fixtures/forms.html");
          await hydrated(page);
          await applyAxes(page, { design, theme, scheme });
          await expectVisibleBoundary(page);
        });
      }
    }
  }
});

/** A theme generated from a one-colour kit, adopted as a constructable stylesheet under the policy. */
async function adoptBrandTheme(page: Page, id: string, primary: string): Promise<void> {
  const result = parseBrandKit({
    id,
    name: "Fixture",
    colors: { primary },
    typography: "system",
    corners: "soft",
    tone: "balanced",
  });
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  const css = emitBrandThemeCss(generateBrandTheme(result.kit));
  await page.evaluate((text) => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(text);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  }, css);
}

test.describe("generated brand themes with a light accent", () => {
  for (const [id, primary] of [
    ["sunbeam", "#facc15"],
    ["snowfall", "#ffffff"],
  ] as const) {
    for (const [kind, path] of FIXTURES) {
      test(`${kind} marks state at 3:1 or more with ${primary} in light`, async ({ page }) => {
        await page.goto(path);
        await hydrated(page);
        await adoptBrandTheme(page, id, primary);
        await applyAxes(page, { theme: id, scheme: "light" });
        const accent = await page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue("--idg-color-accent").trim(),
        );
        expect(accent).toBe(primary);
        if (kind === "forms") {
          await applyAxes(page, { design: "soft" });
          await expectVisibleBoundary(page);
          await applyAxes(page, { design: "flat" });
        }
        for (const { name, mark, against } of await measure(page, kind)) {
          expect(
            contrastRatio(mark, against),
            `${name}: ${mark} on ${against}`,
          ).toBeGreaterThanOrEqual(3);
        }
      });
    }
  }
});

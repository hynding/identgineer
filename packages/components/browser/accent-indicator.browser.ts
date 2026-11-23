import { emitBrandThemeCss, generateBrandTheme, parseBrandKit } from "@identgineer/brand";
import type { Page } from "@playwright/test";
import { DESIGNS, SCHEMES, THEMES, applyAxes } from "./axes";
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

interface Edge {
  readonly kind: string;
  readonly color: string;
  /** Width in pixels, averaged over the four sides, halved for a broken (dashed or dotted) line. */
  readonly width: number;
}

interface Control {
  readonly fill: string;
  readonly behind: string;
  readonly edges: readonly Edge[];
}

/** What the browser draws around a button: its border, outline and zero-blur inset rings. */
async function readControl(page: Page, selector: string): Promise<Control> {
  return page.evaluate((hostSelector) => {
    const host = document.querySelector(hostSelector);
    const control = host?.shadowRoot?.querySelector("button");
    if (!host || !control) throw new Error(`missing ${hostSelector}`);
    let node: Node | null = host.parentNode;
    let behind = getComputedStyle(document.documentElement).backgroundColor;
    while (node) {
      if (node instanceof Element) {
        const color = getComputedStyle(node).backgroundColor;
        if (color !== "rgba(0, 0, 0, 0)") {
          behind = color;
          break;
        }
      }
      node = node.parentNode instanceof ShadowRoot ? node.parentNode.host : node.parentNode;
    }
    const style = getComputedStyle(control);
    const drawn = (lineStyle: string) =>
      lineStyle === "none" || lineStyle === "hidden"
        ? 0
        : /dashed|dotted/.test(lineStyle)
          ? 0.5
          : 1;
    const edges: Edge[] = [];
    for (const side of ["Top", "Right", "Bottom", "Left"] as const) {
      const width = Number.parseFloat(style.getPropertyValue(`border-${side.toLowerCase()}-width`));
      const coverage = drawn(style.getPropertyValue(`border-${side.toLowerCase()}-style`));
      if (width * coverage > 0) {
        edges.push({
          kind: `border ${side.toLowerCase()}`,
          color: style.getPropertyValue(`border-${side.toLowerCase()}-color`),
          width: (width * coverage) / 4,
        });
      }
    }
    const outline = Number.parseFloat(style.outlineWidth) * drawn(style.outlineStyle);
    if (outline > 0) edges.push({ kind: "outline", color: style.outlineColor, width: outline });
    for (const shadow of style.boxShadow.split(/,(?![^(]*\))/)) {
      const ring = /(rgba?\([^)]*\)) 0px 0px 0px ([\d.]+)px inset/.exec(shadow.trim());
      if (ring?.[1] && ring[2])
        edges.push({ kind: "ring", color: ring[1], width: Number(ring[2]) });
    }
    return { fill: style.backgroundColor, behind, edges };
  }, selector);
}

function describe(control: Control): string {
  const edges = control.edges.map((edge) => `${edge.kind} ${edge.color} ${String(edge.width)}px`);
  return `fill ${control.fill}, ${edges.join(", ") || "no edge"}, on ${control.behind}`;
}

/**
 * How strongly a control is outlined against the page: the width of every edge that reaches 3:1,
 * or 10 when an opaque fill itself does, since a fill that stands out needs no edge.
 */
function edgeStrength(control: Control): number {
  const opaque = control.fill.startsWith("rgb(");
  if (opaque && contrastRatio(control.fill, control.behind) >= 3) return 10;
  return control.edges
    .filter((edge) => contrastRatio(edge.color, control.behind) >= 3)
    .reduce((total, edge) => total + edge.width, 0);
}

const PRIMARY = 'idg-button[type="submit"]';
const SECONDARY = 'idg-button[type="reset"][variant="secondary"]';

/** The primary submit button's fill or one of its edges reaches 3:1 against what is behind it. */
async function expectVisibleBoundary(page: Page): Promise<void> {
  const control = await readControl(page, PRIMARY);
  const best = Math.max(
    contrastRatio(control.fill, control.behind),
    ...control.edges.map((edge) => contrastRatio(edge.color, control.behind)),
  );
  expect(best, describe(control)).toBeGreaterThanOrEqual(3);
}

/** The primary is outlined clearly more strongly than the secondary beside it, by 1px or more. */
async function expectPrimaryStandsOut(page: Page): Promise<void> {
  const primary = await readControl(page, PRIMARY);
  const secondary = await readControl(page, SECONDARY);
  expect(
    edgeStrength(primary) - edgeStrength(secondary),
    `primary: ${describe(primary)}; secondary: ${describe(secondary)}`,
  ).toBeGreaterThanOrEqual(1);
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
  for (const design of DESIGNS) {
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

const BRANDS = [
  ["sunbeam", "#facc15"],
  ["snowfall", "#ffffff"],
  ["midnight", "#111827"],
] as const;

test.describe("generated brand themes", () => {
  for (const [id, primary] of BRANDS) {
    for (const scheme of SCHEMES) {
      for (const [kind, path] of FIXTURES) {
        test(`${kind} marks state at 3:1 or more with ${primary} in ${scheme}`, async ({
          page,
        }) => {
          await page.goto(path);
          await hydrated(page);
          await adoptBrandTheme(page, id, primary);
          await applyAxes(page, { theme: id, scheme });
          const accent = await page.evaluate(() =>
            getComputedStyle(document.documentElement)
              .getPropertyValue("--idg-color-accent")
              .trim(),
          );
          expect(accent).toBe(primary);
          if (kind === "forms") {
            for (const design of DESIGNS) {
              await applyAxes(page, { design });
              await expectVisibleBoundary(page);
            }
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
  }
});

/** Accents that blend with the page: the primary must still read as primary next to the secondary. */
const BLENDING = [
  { theme: "citrus", scheme: "light", primary: undefined },
  { theme: "snowfall", scheme: "light", primary: "#ffffff" },
  { theme: "midnight", scheme: "dark", primary: "#111827" },
] as const;

test.describe("primary next to secondary where the accent blends with the page", () => {
  for (const { theme, scheme, primary } of BLENDING) {
    for (const design of DESIGNS) {
      test(`stands out in ${design}, ${theme} ${scheme}`, async ({ page }) => {
        await page.goto("/fixtures/forms.html");
        await hydrated(page);
        if (primary) await adoptBrandTheme(page, theme, primary);
        await applyAxes(page, { theme, scheme, design });
        await expectPrimaryStandsOut(page);
      });
    }
  }
});

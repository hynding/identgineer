import { REGISTRY } from "@identgineer/variations";
import { CONTENT_LIMITS, type Block, type ContentPage } from "../src/content/content-page";
import { navigationPaths } from "../src/content/navigation";
import { NAVIGATION_LABEL } from "../src/content/validate-content-page";
import { expect, test } from "./fixtures";
import { ENGINES, misfitsOf, settled } from "./misfits";
import { LAYOUTS, hydrated, sidewaysScroll } from "./pages";
import { fitTag } from "./parts";

const DESIGNS = REGISTRY.design.variations.map((variation) => variation.id);
const UX_MODES = REGISTRY.ux.variations.map((variation) => variation.id);

const WIDTHS = [320, 390, 820, 1440] as const;

/** One word as long as a field may hold, of the widest letter, ending in a mark that tells it apart. */
function word(length: number, mark = ""): string {
  return `${"W".repeat(length - mark.length)}${mark}`;
}

/** The longest unbroken text the validator takes in every field of a page an editor writes. */
function worstPage(slug: string): ContentPage {
  const run = (length: number) => [{ type: "text" as const, text: word(length) }];
  const body: Block[] = [
    {
      type: "paragraph",
      content: [
        { type: "text", text: word(400) },
        { type: "link", href: "/docs/", text: word(300) },
        { type: "text", text: word(200), code: true },
      ],
    },
    { type: "heading", level: 2, text: word(CONTENT_LIMITS.heading, "a") },
    { type: "heading", level: 3, text: word(CONTENT_LIMITS.heading, "b") },
    { type: "heading", level: 4, text: word(CONTENT_LIMITS.heading, "c") },
    { type: "list", style: "bulleted", items: [run(300), run(300)] },
    {
      type: "code",
      language: "ts",
      code: `${word(400)}\n${word(20)}`,
      caption: word(CONTENT_LIMITS.caption),
    },
    { type: "heading", level: 2, text: word(CONTENT_LIMITS.heading, "d") },
    {
      type: "callout",
      tone: "warning",
      title: word(CONTENT_LIMITS.heading),
      content: run(300),
    },
    {
      type: "table",
      caption: word(CONTENT_LIMITS.caption),
      columns: Array.from({ length: CONTENT_LIMITS.columns }, () => word(CONTENT_LIMITS.heading)),
      rows: [Array.from({ length: CONTENT_LIMITS.columns }, () => run(200))],
    },
    { type: "example", name: "theme-tiles", caption: word(CONTENT_LIMITS.caption) },
  ];
  return {
    slug,
    title: word(CONTENT_LIMITS.title),
    summary: word(CONTENT_LIMITS.summary),
    seo: {},
    body,
  };
}

/** The longest unbroken label the validator takes, for every page of the bar and the footer. */
function worstNavigation(): string {
  const labels = Object.fromEntries(
    [...navigationPaths()].map((path) => [path, word(NAVIGATION_LABEL)]),
  );
  return JSON.stringify({ header: labels, footer: labels });
}

/** A reading page with a section's navigation, and one without. */
const READING = [
  { path: "/docs/theming/", slug: "theming" },
  { path: "/identity/", slug: "identity" },
] as const;

// What the fit sweep checks, for the worst an editor can send: each field as long as it may be, in
// one unbroken word. Words are broken here, as they must be to fit; nothing else may go wrong.
for (const engine of ENGINES) {
  READING.forEach(({ path, slug }, readingIndex) => {
    LAYOUTS.forEach((layout, layoutIndex) => {
      const design = DESIGNS[(layoutIndex + readingIndex) % DESIGNS.length] ?? "studio";
      const ux = UX_MODES[layoutIndex % UX_MODES.length] ?? "standard";
      test(
        `${path}${engine.name} with the longest unbroken text the CMS may send, in ${design} with ${layout}, fits at 320, 390, 820 and 1440px: no sideways scroll, nothing cut or spilled, no controls over each other`,
        { tag: fitTag(engine.key, path) },
        async ({ page }) => {
          test.setTimeout(60_000);
          await page.setViewportSize({ width: WIDTHS[0], height: 900 });
          await page.goto(`${path}?idg-design=${design}&idg-layout=${layout}&idg-ux=${ux}`);
          await hydrated(page, "site-content-page");
          const worst = worstPage(slug);
          await page.evaluate(
            async ({ json, navigation }) => {
              const host = document.querySelector("site-content-page");
              host?.setAttribute("page", json);
              host?.setAttribute("navigation", navigation);
              await document.fonts.ready;
            },
            { json: JSON.stringify(worst), navigation: worstNavigation() },
          );
          await expect(page.locator("h1")).toHaveText(worst.title);
          if (engine.strip) {
            expect(await engine.strip(page), `${engine.name} taken out`).toBeGreaterThan(0);
          }
          const problems: string[] = [];
          for (const width of WIDTHS) {
            await page.setViewportSize({ width, height: 900 });
            await settled(page);
            const where = `${String(width)}px`;
            const sideways = await sidewaysScroll(page);
            if (sideways > 0) problems.push(`${where}: scrolls ${String(sideways)}px sideways`);
            const { cut, spilled, overlapping } = await misfitsOf(page);
            for (const what of cut) problems.push(`${where}: ${what} cut`);
            for (const what of spilled) problems.push(`${where}: ${what} spilled`);
            for (const pair of overlapping) problems.push(`${where}: ${pair} overlap`);
          }
          expect(problems).toEqual([]);
        },
      );
    });
  });
}

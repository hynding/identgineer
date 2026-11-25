import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { DESIGNS, LAYOUTS, applyAxes } from "./axes";
import { BRAND_PAGE, EDITOR_PAGE, EXPORT_PAGE, openBrand } from "./brand-page";
import { expect, test } from "./fixtures";
import { openShell } from "./layout-shell-page";
import { REFLOW_WIDTHS, clippedText, hydrated, settleFrames, sidewaysScroll } from "./reflow";
import { setTextSize } from "./text-size";

const FIXTURES = fileURLToPath(new URL("../www/fixtures", import.meta.url));
const BRAND_PAGES: readonly string[] = [BRAND_PAGE, EXPORT_PAGE, EDITOR_PAGE];

// logo-render.html is a harness that its own test drives with data it serves, so it is not a page
// to open bare.
const DRIVEN = new Set(["logo-render.html"]);

// Every page the build serves, read from it, so a new fixture joins the sweep without an edit here.
const PAGES = [
  "/index.html",
  ...readdirSync(FIXTURES)
    .filter((file) => file.endsWith(".html") && !DRIVEN.has(file))
    .sort()
    .map((file) => `/fixtures/${file}`),
];

async function openPage(page: Page, address: string): Promise<void> {
  if (BRAND_PAGES.includes(address)) {
    await openBrand(page, { page: address as typeof BRAND_PAGE });
  } else {
    await page.goto(address);
    await hydrated(page);
  }
}

test.describe("no page scrolls sideways at 320px with text at 200%", () => {
  for (const address of PAGES) {
    test(address, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 800 });
      await openPage(page, address);
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      await settleFrames(page);
      expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0);
    });
  }
});

// The widths between a phone and a tablet are where a rule that stops at a fixed window width lets
// a long word reach past its box, and a card clips what it holds. Every layout is read at each
// width, in every design (the card's edge and padding are the design's), in the roomiest UX mode
// and in the default one.
test.describe("with text at 200% nothing is clipped or leaves the window, at every width", () => {
  for (const width of REFLOW_WIDTHS) {
    for (const layout of LAYOUTS) {
      test(`${layout} at ${String(width)}px`, async ({ page }) => {
        test.setTimeout(120_000);
        await openShell(page, { width, layout, fontSize: "200%" });
        const failures: string[] = [];
        for (const design of DESIGNS) {
          for (const ux of ["comfortable", "spacious"]) {
            await applyAxes(page, { design, ux });
            const clipped = await clippedText(page);
            if (clipped.length > 0) failures.push(`${design} / ${ux}: ${clipped.join(", ")}`);
            const sideways = await sidewaysScroll(page);
            if (sideways > 0)
              failures.push(`${design} / ${ux}: scrolls sideways by ${String(sideways)}px`);
          }
        }
        expect(failures).toEqual([]);
      });
    }
  }
});

interface Shown {
  where: string;
  text: string;
  /** The value's content box, in pixels, and the widest word of the value, as the select draws it. */
  room: number;
  widest: number;
  em: number;
  cutAcross: boolean;
  cutDown: boolean;
  underChevron: boolean;
}

/** What every `idg-select` on the page shows, through every shadow root. */
function shownValues(page: Page): Promise<Shown[]> {
  return page.evaluate(() => {
    const found: Shown[] = [];
    const walk = (root: Document | ShadowRoot): void => {
      for (const element of root.querySelectorAll("*")) {
        if (element.shadowRoot) walk(element.shadowRoot);
        if (element.localName !== "idg-select") continue;
        const inner = element.shadowRoot;
        const native = inner?.querySelector("select");
        const chevron = inner?.querySelector(".chevron");
        const chosen = native?.selectedOptions[0];
        if (!native || !chevron || !chosen) throw new Error("a select without its parts");
        const style = getComputedStyle(native);
        const context = document.createElement("canvas").getContext("2d");
        if (!context) throw new Error("no canvas");
        context.font = style.font;
        const words = chosen.text.split(/\s+/).filter(Boolean);
        const widest = Math.max(...words.map((word) => context.measureText(word).width));
        const box = native.getBoundingClientRect();
        const rtl = style.direction === "rtl";
        const start = rtl
          ? box.right - Number.parseFloat(style.paddingRight)
          : box.left + Number.parseFloat(style.paddingLeft);
        const end = rtl
          ? box.left + Number.parseFloat(style.paddingLeft)
          : box.right - Number.parseFloat(style.paddingRight);
        const text = { left: Math.min(start, end), right: Math.max(start, end) };
        const mark = chevron.getBoundingClientRect();
        found.push({
          where: element.id || (element.getAttribute("name") ?? "select"),
          text: chosen.text,
          room: text.right - text.left,
          widest,
          em: Number.parseFloat(style.fontSize),
          cutAcross: native.scrollWidth > native.clientWidth + 1,
          cutDown: native.scrollHeight > native.clientHeight + 1,
          underChevron: mark.left < text.right - 1 && mark.right > text.left + 1,
        });
      }
    };
    walk(document);
    return found;
  });
}

// A native select's closed value does not wrap by default, so the component lets it, and trims the
// padding and the room it keeps for the chevron where the field is narrow against its text. A value
// is not cut when the select shows every line of it, nothing runs under the chevron, and each line
// is wider than a few letters: a word breaks only where it is wider than the whole field.
test.describe("a select's shown value is not cut with text at 200%", () => {
  const fixtures = [
    ["/fixtures/forms.html", 9],
    ["/fixtures/brand-editor.html", 9],
  ] as const;
  for (const [address, count] of fixtures) {
    for (const width of REFLOW_WIDTHS) {
      for (const wide of [false, true]) {
        const font = wide ? "wide text" : "default text";
        test(`${address} at ${String(width)}px, ${font}`, async ({ page }) => {
          await page.setViewportSize({ width, height: 800 });
          await openPage(page, address);
          await setTextSize(page, { label: "200%", fontSize: "200%", wide });
          await settleFrames(page);
          const found = await shownValues(page);
          expect(found.length).toBeGreaterThanOrEqual(address.includes("forms") ? 5 : count);
          const failures = found.flatMap((value) => {
            const problems: string[] = [];
            if (value.cutAcross) problems.push("cut across");
            if (value.cutDown) problems.push("cut down");
            if (value.underChevron) problems.push("runs under the chevron");
            if (value.room < Math.min(value.widest, 3 * value.em))
              problems.push(
                `only ${String(Math.round(value.room))}px for a ${String(Math.round(value.widest))}px word`,
              );
            return problems.length > 0
              ? [`${value.where} "${value.text}": ${problems.join(", ")}`]
              : [];
          });
          expect(failures).toEqual([]);
        });
      }
    }
  }
});

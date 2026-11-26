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
  "/csp-demo.html",
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

// Every design, since each sets its own borders, padding and display face, and the wide face as
// well as the design's own, since a wider word is what a narrow window cannot hold.
for (const wide of [false, true]) {
  test.describe(`no page scrolls sideways at 320px with text at 200%, ${wide ? "wide" : "default"} text`, () => {
    for (const address of PAGES) {
      test(address, async ({ page }) => {
        await page.setViewportSize({ width: 320, height: 800 });
        await openPage(page, address);
        await setTextSize(page, { label: "200%", fontSize: "200%", wide });
        const failures: string[] = [];
        for (const design of DESIGNS) {
          await applyAxes(page, { design });
          const sideways = await sidewaysScroll(page);
          if (sideways > 0) failures.push(`${design}: scrolls sideways by ${String(sideways)}px`);
        }
        expect(failures).toEqual([]);
      });
    }
  });
}

// A page that hides what overflows it (a section with `overflow: hidden`) does not scroll, and
// clips instead, so the text itself is read: it must be inside every box that clips it and inside
// the window. The narrow widths are read in every design; the wider ones in the page's own design
// and in the two that take the most room (a thick border and capitals, stepped corners).
for (const wide of [false, true]) {
  test.describe(`no text is clipped on any page with text at 200%, ${wide ? "wide" : "default"} text`, () => {
    for (const address of PAGES) {
      for (const width of REFLOW_WIDTHS) {
        test(`${address} at ${String(width)}px`, async ({ page }) => {
          test.setTimeout(120_000);
          await page.setViewportSize({ width, height: 800 });
          await openPage(page, address);
          await setTextSize(page, { label: "200%", fontSize: "200%", wide });
          const designs = width <= 400 ? DESIGNS : [undefined, "brutalist", "pixel"];
          const failures: string[] = [];
          for (const design of designs) {
            if (design) await applyAxes(page, { design });
            else await settleFrames(page);
            const clipped = await clippedText(page);
            if (clipped.length > 0) failures.push(`${design ?? "own"}: ${clipped.join(", ")}`);
          }
          expect(failures).toEqual([]);
        });
      }
    }
  });
}

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
  /** The value's content box, in pixels, and the first word of the value, as the select draws it. */
  room: number;
  first: number;
  em: number;
  lines: number;
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
        const first = context.measureText(words[0] ?? "").width;
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
          first,
          em: Number.parseFloat(style.fontSize),
          lines: Math.round(
            (native.clientHeight -
              Number.parseFloat(style.paddingTop) -
              Number.parseFloat(style.paddingBottom)) /
              Number.parseFloat(style.lineHeight),
          ),
          underChevron: mark.left < text.right - 1 && mark.right > text.left + 1,
        });
      }
    };
    walk(document);
    return found;
  });
}

// A native select's closed value is one line and ends in an ellipsis where it does not fit, as it
// always did. Where the window is narrow against the text, the padding and the room kept for the
// chevron give way (by lengths of the window and of the text, so they do not depend on the field's
// own size, which a field sized by its content has not got), and the value keeps its first word.
test.describe("a select's shown value keeps its first word with text at 200%", () => {
  for (const address of ["/fixtures/forms.html", "/fixtures/brand-editor.html"]) {
    for (const width of REFLOW_WIDTHS) {
      for (const wide of [false, true]) {
        const font = wide ? "wide text" : "default text";
        test(`${address} at ${String(width)}px, ${font}`, async ({ page }) => {
          await page.setViewportSize({ width, height: 800 });
          await openPage(page, address);
          await setTextSize(page, { label: "200%", fontSize: "200%", wide });
          await settleFrames(page);
          const found = await shownValues(page);
          expect(found.length).toBeGreaterThanOrEqual(address.includes("forms") ? 5 : 9);
          const failures = found.flatMap((value) => {
            const problems: string[] = [];
            if (value.lines > 1) problems.push("wraps");
            if (value.underChevron) problems.push("runs under the chevron");
            if (value.room < Math.min(value.first, 3 * value.em))
              problems.push(
                `only ${String(Math.round(value.room))}px for a ${String(Math.round(value.first))}px first word`,
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

/** The tokens the select's padding and chevron room are made of, resolved on the select's own box. */
interface Edges {
  boxPad: string;
  boxPadToken: string;
  nativeEnd: string;
  nativeEndToken: string;
  markEnd: string | undefined;
  markEndToken: string;
  inset: string;
  insetToken: string;
}

function edgesOf(page: Page, selector: string): Promise<Edges[]> {
  return page.evaluate((query) => {
    const found: Edges[] = [];
    const walk = (root: Document | ShadowRoot): void => {
      for (const element of root.querySelectorAll("*")) {
        if (element.shadowRoot) walk(element.shadowRoot);
        if (!element.matches(query)) continue;
        const inner = element.shadowRoot;
        const box = inner?.querySelector<HTMLElement>(".box");
        const native = inner?.querySelector<HTMLElement>(".native");
        const mark = inner?.querySelector<HTMLElement>(".invalid-mark");
        const chevron = inner?.querySelector<HTMLElement>(".chevron");
        if (!box || !native || !chevron) throw new Error("a select without its parts");
        const scale = getComputedStyle(box).getPropertyValue("--_padding-scale") || "1";
        const resolve = (value: string, property: "paddingLeft" | "marginLeft" = "paddingLeft") => {
          const probe = document.createElement("div");
          if (property === "paddingLeft") probe.style.paddingInline = value;
          else probe.style.marginInline = value;
          box.append(probe);
          const resolved = getComputedStyle(probe)[property];
          probe.remove();
          return resolved;
        };
        found.push({
          boxPad: getComputedStyle(box).paddingLeft,
          boxPadToken: resolve(`calc(var(--idg-density-control-padding-inline) * ${scale})`),
          nativeEnd: getComputedStyle(native).paddingRight,
          nativeEndToken: resolve("calc(1.5em + var(--idg-space-2xs))"),
          markEnd: mark ? getComputedStyle(mark).marginRight : undefined,
          markEndToken: resolve("1.5em", "marginLeft"),
          inset: getComputedStyle(chevron).right,
          insetToken: resolve("var(--idg-density-control-padding-inline)"),
        });
      }
    };
    walk(document);
    return found;
  }, selector);
}

// At an ordinary text size nothing about a select is other than it was: the box pads by the
// control token, the value by the chevron's room beside it, the invalid mark and the chevron stand
// where they stood. Only a window narrow against its text gives any of it up.
test.describe("a select looks as it did at 100% text and an ordinary width", () => {
  for (const width of [320, 375, 768, 1280]) {
    test(`${String(width)}px: the padding, the chevron's room and the invalid mark are the tokens' own`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/fixtures/forms.html");
      await hydrated(page);
      await page.evaluate(() => {
        for (const select of document.querySelectorAll("idg-select")) {
          select.shadowRoot?.querySelector(".box")?.classList.add("size-lg");
        }
      });
      const found = [...(await edgesOf(page, "idg-select"))];
      expect(found.length).toBeGreaterThanOrEqual(5);
      for (const edges of found) {
        expect(edges.boxPad).toBe(edges.boxPadToken);
        expect(edges.nativeEnd).toBe(edges.nativeEndToken);
        if (edges.markEnd !== undefined) expect(edges.markEnd).toBe(edges.markEndToken);
        // The chevron stands where it always stood, at the unscaled token, whatever the size.
        expect(edges.inset).toBe(edges.insetToken);
      }
    });
  }
});

// A select sized by its content (an inline block, a float, a max-content track, a flex row) is as
// wide as its longest option needs: the same as with the padding and the chevron's room fixed at
// their tokens, which is what it has always been.
test.describe("a select sized by its content is as wide as its longest option needs", () => {
  const CONTEXTS = [
    ["an inline block", "display: inline-block"],
    ["a float", "float: left"],
    ["a max-content grid track", "display: grid; grid-template-columns: max-content"],
    ["a flex row", "display: flex"],
  ] as const;
  // The widest a select is at 100% text: the roomiest UX mode (its type scale makes the select's own
  // text larger than the page's) at the large size, in every design, in the narrowest window, where
  // a reach measured in the select's own text would already give way.
  const CASES = [
    { width: 1280, ux: undefined, size: undefined, designs: [undefined] },
    { width: 320, ux: "focus", size: "lg", designs: DESIGNS },
  ] as const;
  for (const { width, ux, size, designs } of CASES) {
    for (const [context, style] of CONTEXTS) {
      for (const invalid of [false, true]) {
        const mode = ux ? `, ${ux} UX, size ${size ?? ""}, every design` : "";
        test(`in ${context}${invalid ? ", invalid" : ""} at ${String(width)}px and 100% text${mode}`, async ({
          page,
        }) => {
          await page.setViewportSize({ width, height: 800 });
          await page.goto("/fixtures/forms.html");
          await hydrated(page);
          const failures: string[] = [];
          for (const design of designs) {
            if (design || ux)
              await applyAxes(page, { ...(design ? { design } : {}), ...(ux ? { ux } : {}) });
            const found = await measureContentSized(page, style, invalid, size);
            if (Math.abs(found.measured - found.expected) > 0.5 || found.clipped) {
              failures.push(
                `${design ?? "own"}: ${String(found.measured)}px, was ${String(found.expected)}px${found.clipped ? ", clipped" : ""}`,
              );
            }
          }
          expect(failures).toEqual([]);
        });
      }
    }
  }
});

/** A select of three options in a parent of this style, measured as it is and with the padding and
 * the chevron's room fixed at their tokens, which is what it has always been. */
function measureContentSized(
  page: Page,
  rule: string,
  mark: boolean,
  size: string | undefined,
): Promise<{ measured: number; expected: number; clipped: boolean }> {
  return page.evaluate(
    async ({ style, invalid, large }) => {
      const parent = document.createElement("div");
      parent.style.cssText = style;
      const select = document.createElement("idg-select");
      if (invalid) select.setAttribute("invalid", "");
      if (large) select.setAttribute("size", large);
      for (const text of ["Short", "Old-style serif over system sans", "Mid length"]) {
        const option = document.createElement("option");
        option.value = text;
        option.textContent = text;
        select.append(option);
      }
      parent.append(select);
      document.body.append(parent);
      await customElements.whenDefined("idg-select");
      await new Promise((resolve) => setTimeout(resolve, 200));
      const root = select.shadowRoot;
      const native = root?.querySelector("select");
      if (!root || !native) throw new Error("no select");
      const widest = (): number => {
        select.value = "Old-style serif over system sans";
        return select.getBoundingClientRect().width;
      };
      const measured = widest();
      const reference = new CSSStyleSheet();
      reference.replaceSync(
        ".box { padding-inline: calc(var(--idg-density-control-padding-inline) * var(--_padding-scale)); } .native { padding-inline-end: calc(1.5em + var(--idg-space-2xs)); } .invalid .native { padding-inline-end: calc(1.5em + var(--idg-space-2xs)); } .invalid-mark { margin-inline-end: 1.5em; }",
      );
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, reference];
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const expected = widest();
      const clipped = native.scrollWidth > native.clientWidth + 1;
      parent.remove();
      return { measured, expected, clipped };
    },
    { style: rule, invalid: mark, large: size },
  );
}

// The value is one line, as on every page that holds a select, in the dashboard's header and in
// the brand editor's form, and it stays the same height as the options are chosen through.
test.describe("a select stays one line, and one height, as options are chosen", () => {
  // Only the page's own pickers are chosen through: the variation switcher's selects change the
  // design and the UX mode of the page, and with them every height on it.
  for (const [address, own] of [
    ["/fixtures/dashboard.html", "idg-property-picker idg-select"],
    ["/fixtures/brand-editor.html", "idg-brand-editor idg-select"],
  ] as const) {
    for (const width of [768, 1280]) {
      test(`${address} at ${String(width)}px and 100% text`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await openPage(page, address);
        const heights = () =>
          page.evaluate(() => {
            const found: { name: string; box: number; lines: number; shown: string }[] = [];
            const walk = (root: Document | ShadowRoot): void => {
              for (const element of root.querySelectorAll("*")) {
                if (element.shadowRoot) walk(element.shadowRoot);
                if (element.localName !== "idg-select") continue;
                const box = element.shadowRoot?.querySelector(".box");
                const native = element.shadowRoot?.querySelector("select");
                if (!box || !native) throw new Error("no select");
                found.push({
                  name: element.id || (element.getAttribute("name") ?? "select"),
                  box: box.getBoundingClientRect().height,
                  lines: Math.round(
                    (native.clientHeight -
                      Number.parseFloat(getComputedStyle(native).paddingTop) -
                      Number.parseFloat(getComputedStyle(native).paddingBottom)) /
                      Number.parseFloat(getComputedStyle(native).lineHeight),
                  ),
                  shown: native.selectedOptions[0]?.text ?? "",
                });
              }
            };
            walk(document);
            return found;
          });
        const before = await heights();
        expect(before.length).toBeGreaterThan(0);
        for (const select of before) {
          expect(select.lines, `${select.name} "${select.shown}"`).toBe(1);
        }
        const selects = page.locator(own);
        expect(await selects.count()).toBeGreaterThan(0);
        for (let index = 0; index < (await selects.count()); index += 1) {
          const select = selects.nth(index);
          await select.focus();
          for (let press = 0; press < 3; press += 1) await page.keyboard.press("ArrowDown");
        }
        const after = await heights();
        expect(after.map((select) => select.box)).toEqual(before.map((select) => select.box));
        expect(after.every((select) => select.lines === 1)).toBe(true);
      });
    }
  }
});

// The helper that finds clipped text must see text slotted straight into a component, which
// sits in the component's slot and not in its parent.
test("the clipped text helper reports bare text slotted into a clipping component", async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await page.setContent(`<!doctype html><body></body>`);
  await page.evaluate(() => {
    class Narrow extends HTMLElement {
      constructor() {
        super();
        const root = this.attachShadow({ mode: "open" });
        const frame = document.createElement("div");
        frame.style.cssText = "width: 60px; overflow: hidden";
        frame.append(document.createElement("slot"));
        root.append(frame);
      }
    }
    customElements.define("idg-narrow", Narrow);
    const host = document.createElement("idg-narrow");
    host.textContent = "Accessibilityaccessibility";
    host.style.cssText = "display: block; white-space: nowrap";
    document.body.append(host);
  });
  const found = await clippedText(page);
  expect(found.length).toBe(1);
  expect(found[0]).toContain("Accessibility");
});

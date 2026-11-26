import type { Page } from "@playwright/test";
import { applyAxes } from "./axes";
import { expect, test } from "./fixtures";
import { hydrated, settleFrames } from "./reflow";

// The adjustments for a large text size in a narrow window (padding that gives way, labels that
// wrap, a list drawn above its panel) must not change a component anywhere there is room. Each
// component below is placed in the parents that size it by its content, beside text that competes
// for the room, and measured twice: as it is, and with those adjustments taken back out by a
// reference sheet that restores the rules the component had before them. The two must be the same
// size. Comparing in the page, and not with numbers measured once, holds in every face a machine
// may have (a machine without Inter falls back to a wider face) and in every design.

const LONG =
  "Some sibling text that is long enough to compete for room in the row and to wrap over lines";

/** An element as data: its name, its attributes and what it holds, built in the page with DOM calls. */
type Markup = string | readonly [string, Readonly<Record<string, string>>, ...Markup[]];

const element = (
  name: string,
  attributes: Record<string, string>,
  ...children: Markup[]
): Markup => [name, attributes, ...children];

const tabs = (orientation: "horizontal" | "vertical", labels: string[], panels: string[]): Markup =>
  element(
    "idg-tabs",
    { label: "Sections", orientation },
    ...labels.map((label, index) => element("idg-tab", { value: String(index) }, label)),
    ...panels.map((text, index) =>
      element("idg-tab-panel", { value: String(index) }, element("p", {}, text)),
    ),
  );

const COMPONENTS: Readonly<Record<string, Markup>> = {
  badge: element("idg-badge", { variant: "warning" }, "In review today"),
  "small badge with a dot": element(
    "idg-badge",
    { variant: "success", dot: "", size: "sm" },
    "Subscription active",
  ),
  "avatar group": element(
    "idg-avatar-group",
    { label: "Team", max: "4" },
    ...[
      "Ada Lovelace",
      "Grace Hopper",
      "Alan Turing",
      "Margaret Hamilton",
      "Edsger Dijkstra",
      "Barbara Liskov",
    ].map((name) => element("idg-avatar", { name })),
  ),
  "horizontal tabs": tabs(
    "horizontal",
    ["Overview", "Activity", "Billing settings"],
    ["Summary text.", "b", "c"],
  ),
  "vertical tabs": tabs(
    "vertical",
    ["Profile", "Security", "Notifications"],
    ["Your name, picture and pronouns.", "b", "c"],
  ),
  "short vertical tabs": tabs("vertical", ["A", "B"], ["Hi", "Yo"]),
  progress: element("idg-progress", { label: "Sprint fourteen", value: "64", "show-value": "" }),
  stat: element("idg-stat", { label: "Revenue", value: "$48.2k", delta: "12.4%", direction: "up" }),
  button: element("idg-button", {}, "Save all changes"),
  "large button": element("idg-button", { size: "lg" }, "Compare plans"),
  card: element(
    "idg-card",
    { heading: "Release notes for version", variant: "raised" },
    "Faster builds, a calmer settings page and internationalisation everywhere.",
    element("idg-button", { slot: "footer", variant: "secondary" }, "Compare plans"),
  ),
  select: element(
    "idg-select",
    { label: "Typeface" },
    element("option", {}, "Old-style serif over system sans"),
    element("option", {}, "Short"),
  ),
  "large select": element(
    "idg-select",
    { label: "Typeface", size: "lg" },
    element("option", {}, "Old-style serif over system sans"),
  ),
  "small select": element(
    "idg-select",
    { label: "Typeface", size: "sm" },
    element("option", {}, "Old-style serif over system sans"),
  ),
  alert: element(
    "idg-alert",
    { variant: "warning", dismissible: "" },
    element("span", { slot: "title" }, "Card expires soon"),
    "Update the payment method before September.",
  ),
  accordion: element(
    "idg-accordion",
    {},
    element(
      "idg-accordion-item",
      { heading: "Shipping and international returns", open: "" },
      element("p", {}, "Orders ship within two days."),
    ),
  ),
};

/** Each parent: its style, and whether long text sits beside the component in it. */
const CONTEXTS: Readonly<Record<string, { style: string; beside: "none" | "flex" | "cell" }>> = {
  "a flex row beside long text": { style: "display: flex; gap: 8px", beside: "flex" },
  "a table cell beside long text": { style: "display: table; inline-size: 100%", beside: "cell" },
  "a min-content grid track": {
    style: "display: grid; grid-template-columns: min-content",
    beside: "none",
  },
  "a max-content grid track": {
    style: "display: grid; grid-template-columns: max-content",
    beside: "none",
  },
  "an inline block": { style: "display: inline-block", beside: "none" },
};

// What each component had before the narrow adjustments, by the rules those adjustments changed.
const REFERENCE: Readonly<Record<string, string>> = {
  "idg-badge": `
    :host { max-inline-size: none; }
    .badge { inline-size: auto; white-space: nowrap; overflow-wrap: normal; }
    .badge:not(.size-sm) { padding-inline: var(--idg-space-xs); }
    .label { overflow: hidden; text-overflow: ellipsis; }`,
  "idg-avatar-group": `
    :host { max-inline-size: none; }
    .group { inline-size: auto; max-inline-size: none; flex-wrap: nowrap; }`,
  "idg-tab": `
    :host { max-inline-size: none; }
    .tab {
      inline-size: auto;
      max-inline-size: none;
      padding-inline: calc(var(--idg-space-m) * var(--idg-density-gap-scale));
      white-space: nowrap;
      overflow-wrap: normal;
    }`,
  "idg-tabs": `
    :host { container-type: normal; contain-intrinsic-inline-size: none; }
    .panels { overflow-wrap: normal; }`,
  "idg-progress": `
    .header { flex-wrap: nowrap; }
    .label { min-inline-size: auto; overflow-wrap: normal; }
    .value { overflow-wrap: normal; }`,
  "idg-stat": `.delta { max-inline-size: none; overflow-wrap: normal; }`,
  "idg-button": `
    :host { max-inline-size: none; }
    .control {
      max-inline-size: none;
      padding-inline: calc(var(--idg-density-control-padding-inline) * var(--_padding-scale));
    }`,
  "idg-card": `
    .header, .body, .footer { padding-inline: var(--_pad); }
    .heading, .card { overflow-wrap: normal; }
    @media (max-width: 28rem) {
      .card { overflow-wrap: break-word; }
      .header, .body, .footer { padding-inline: min(var(--_pad), var(--idg-space-s)); }
    }`,
  "idg-select": `
    .box { padding-inline: calc(var(--idg-density-control-padding-inline) * var(--_padding-scale)); }
    .native, .invalid .native { padding-inline-end: calc(1.5em + var(--idg-space-2xs)); }
    .invalid-mark { margin-inline-end: 1.5em; }
    .chevron { inset-inline-end: var(--idg-density-control-padding-inline); }`,
  "idg-alert": `.content { overflow-wrap: normal; }`,
  "idg-accordion-item": `.title { overflow-wrap: normal; }`,
};

interface Size {
  context: string;
  width: number;
  height: number;
}

async function place(page: Page, component: Markup): Promise<void> {
  await page.evaluate(
    ({ tree, contexts, long }) => {
      type Built = string | readonly [string, Record<string, string>, ...Built[]];
      const build = (node: Built): Node => {
        if (typeof node === "string") return document.createTextNode(node);
        const [name, attributes, ...children] = node;
        const made = document.createElement(name);
        for (const [key, value] of Object.entries(attributes)) made.setAttribute(key, value);
        for (const child of children) made.append(build(child));
        return made;
      };
      const text = (style: string, words: string) => {
        const span = document.createElement("div");
        span.style.cssText = style;
        span.textContent = words;
        return span;
      };
      document.querySelector("#probe")?.remove();
      const holder = document.createElement("div");
      holder.id = "probe";
      for (const [name, context] of contexts) {
        const parent = document.createElement("div");
        parent.dataset.context = name;
        parent.style.cssText = `${context.style}; margin-block-end: 24px`;
        if (context.beside === "cell") {
          const cell = document.createElement("div");
          cell.style.cssText = "display: table-cell";
          cell.append(build(tree as Built));
          parent.append(cell, text("display: table-cell", `${long} ${long}`));
        } else {
          parent.append(build(tree as Built));
          if (context.beside === "flex") parent.append(text("flex: 1 1 auto", long));
        }
        holder.append(parent);
      }
      document.body.prepend(holder);
    },
    { tree: component, contexts: Object.entries(CONTEXTS), long: LONG },
  );
  await hydrated(page);
  await settleFrames(page);
}

function sizes(page: Page): Promise<Size[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("#probe > [data-context]")].map((parent) => {
      const host = parent.querySelector('[class~="hydrated"]');
      if (!host) throw new Error(`no component in ${parent.dataset.context ?? ""}`);
      const box = host.getBoundingClientRect();
      return { context: parent.dataset.context ?? "", width: box.width, height: box.height };
    }),
  );
}

/** Takes the narrow adjustments out of every component in the probe, nested ones too. */
async function withReference(page: Page): Promise<void> {
  await page.evaluate((reference) => {
    const walk = (root: ParentNode): void => {
      for (const element of root.querySelectorAll("*")) {
        const inner = element.shadowRoot;
        if (!inner) continue;
        const css = reference[element.localName];
        if (css !== undefined) {
          const sheet = new CSSStyleSheet();
          sheet.replaceSync(css);
          inner.adoptedStyleSheets = [...inner.adoptedStyleSheets, sheet];
        }
        walk(inner);
      }
    };
    const probe = document.querySelector("#probe");
    if (!probe) throw new Error("no probe");
    walk(probe);
  }, REFERENCE);
  await settleFrames(page);
}

for (const width of [1280, 375]) {
  test.describe(`at ${String(width)}px and 100% text a component is the size it was in a parent sized by its content`, () => {
    for (const [name, component] of Object.entries(COMPONENTS)) {
      test(name, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto("/fixtures/surfaces.html");
        await hydrated(page);
        const failures: string[] = [];
        for (const design of [undefined, "brutalist", "pixel"]) {
          if (design) await applyAxes(page, { design });
          await place(page, component);
          const found = await sizes(page);
          await withReference(page);
          const expected = await sizes(page);
          expect(found.length).toBe(Object.keys(CONTEXTS).length);
          found.forEach((size, index) => {
            const reference = expected[index];
            if (!reference) return;
            if (
              Math.abs(size.width - reference.width) > 0.5 ||
              Math.abs(size.height - reference.height) > 0.5
            ) {
              failures.push(
                `${design ?? "own"}, ${size.context}: ${String(Math.round(size.width))}x${String(Math.round(size.height))}, was ${String(Math.round(reference.width))}x${String(Math.round(reference.height))}`,
              );
            }
          });
        }
        expect(failures).toEqual([]);
      });
    }
  });
}

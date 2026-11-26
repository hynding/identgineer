import type { Page } from "@playwright/test";
import { DESIGNS, applyAxes } from "./axes";
import { expect, test } from "./fixtures";
import { hydrated, settleFrames } from "./reflow";

// The adjustments for a large text size in a narrow window (padding that gives way, labels that
// wrap, a list drawn above its panel) must not change a component anywhere there is room. Each
// component below is placed in the parents that size it by its content, beside text that competes
// for the room, and in narrow columns of a fixed width, and measured twice: as it is, and with those
// adjustments taken back out by a reference sheet that restores the rules the component had before
// them. The two must be the same size. Comparing in the page, and not with numbers measured once,
// holds in every face a machine may have (a machine without Inter falls back to a wider face) and in
// every design.

const LONG =
  "Some sibling text that is long enough to compete for room in the row and to wrap over lines";

/** An element as data: its name, its attributes and what it holds, built in the page with DOM calls. */
type Markup = string | readonly [string, Readonly<Record<string, string>>, ...Markup[]];

const element = (
  name: string,
  attributes: Record<string, string>,
  ...children: Markup[]
): Markup => [name, attributes, ...children];

const tabs = (
  orientation: "horizontal" | "vertical",
  labels: readonly (string | readonly Markup[])[],
  panels: string[],
): Markup =>
  element(
    "idg-tabs",
    { label: "Sections", orientation },
    ...labels.map((label, index) =>
      element(
        "idg-tab",
        { value: String(index) },
        ...(typeof label === "string" ? [label] : label),
      ),
    ),
    ...panels.map((text, index) =>
      element("idg-tab-panel", { value: String(index) }, element("p", {}, text)),
    ),
  );

/** A tab holding an icon and a word, and one holding a word and a badge. */
const MIXED: readonly (readonly Markup[])[] = [
  [element("img", { src: "/fixtures/avatar.svg", width: "24", height: "24", alt: "" }), "Inbox"],
  ["Sent ", element("idg-badge", {}, "3")],
];

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
  "tabs with an icon and a badge": tabs("horizontal", MIXED, ["x", "y"]),
  "vertical tabs with an icon and a badge": tabs("vertical", MIXED, ["x", "y"]),
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

/**
 * Each parent: its style, whether it sizes the component by its content or gives it a fixed width,
 * and whether long text sits beside the component in it.
 */
const CONTEXTS: Readonly<
  Record<string, { style: string; sized: "content" | "fixed"; beside: "none" | "flex" | "cell" }>
> = {
  "a flex row beside long text": {
    style: "display: flex; gap: 8px",
    sized: "content",
    beside: "flex",
  },
  "a table cell beside long text": {
    style: "display: table; inline-size: 100%",
    sized: "content",
    beside: "cell",
  },
  "a min-content grid track": {
    style: "display: grid; grid-template-columns: min-content",
    sized: "content",
    beside: "none",
  },
  "a max-content grid track": {
    style: "display: grid; grid-template-columns: max-content",
    sized: "content",
    beside: "none",
  },
  "an inline block": { style: "display: inline-block", sized: "content", beside: "none" },
  "a 150px column": { style: "inline-size: 150px", sized: "fixed", beside: "none" },
  "a 200px column": { style: "inline-size: 200px", sized: "fixed", beside: "none" },
  "a 260px column": { style: "inline-size: 260px", sized: "fixed", beside: "none" },
};

// What each component had before the narrow adjustments, by the rules those adjustments changed.
// A true comparison would be against the components as main builds them, but the suite has only
// this branch's build to serve (CI builds one tree, and a second build of main's components for a
// test alone is not something it has), so each rule the adjustments changed is set back here to
// main's value, in a sheet adopted after the component's own, which therefore wins at an equal
// specificity. It neutralises, and must be kept in step with:
// - idg-badge: the host's and the badge's percentage maximum, the badge's max-content width and
//   break-word (main: one line, nowrap, the label cut off with an ellipsis), the padding's reach;
// - idg-avatar-group: the host's and the row's maximum, its max-content width and its wrapping;
// - idg-tab: the host's and the tab's maximum (to the list's end padding, none beside a vertical
//   list, the list's width under 20rem), the max-content width, break-word, the padding's reach,
//   and the label element, which main had not (display: contents puts what is slotted back in the
//   tab's own row);
// - idg-tabs: the vertical list's calc-size minimum, the drawing of a vertical list above its panel
//   under 20rem, and the panel's break-word;
// - idg-progress: the label's zero minimum and the label's and value's break-word;
// - idg-stat: the delta's maximum and break-word;
// - idg-button: the host's and the control's maximum, their minimum (no narrower than the longest
//   word, unless the window is narrow against the text) and the padding's reach;
// - idg-card: the padding's reach, the heading's break-word and the card's break-word up to 40rem
//   (main: break-word and the smaller padding under 28rem);
// - idg-select: the padding's, the chevron room's, the invalid mark's and the chevron's reach;
// - idg-alert: break-word on the content;
// - idg-accordion-item: break-word on the heading.
const REFERENCE: Readonly<Record<string, string>> = {
  "idg-badge": `
    :host { max-inline-size: none; }
    .badge { inline-size: auto; max-inline-size: none; white-space: nowrap; overflow-wrap: normal; }
    .badge:not(.size-sm) { padding-inline: var(--idg-space-xs); }
    .label { overflow: hidden; text-overflow: ellipsis; }`,
  "idg-avatar-group": `
    :host { max-inline-size: none; }
    .group { inline-size: auto; max-inline-size: none; flex-wrap: nowrap; }`,
  "idg-tab": `
    :host, :host([orientation]) { max-inline-size: none; }
    .tab, :host([orientation]) .tab {
      inline-size: auto;
      max-inline-size: none;
      padding-inline: calc(var(--idg-space-m) * var(--idg-density-gap-scale));
      white-space: nowrap;
      overflow-wrap: normal;
    }
    .label { display: contents; }`,
  "idg-tabs": `
    :host([orientation="vertical"]) .tabs { flex-direction: row; align-items: flex-start; }
    :host([orientation="vertical"]) .list {
      flex-direction: column;
      max-inline-size: 40%;
      min-inline-size: auto;
      border-block-end: 0;
      border-inline-end-width: var(--idg-border-width);
      border-inline-end-style: var(--idg-border-style);
      border-inline-end-color: var(--idg-border-color);
    }
    .panels { overflow-wrap: normal; }`,
  "idg-progress": `
    .label { min-inline-size: auto; overflow-wrap: normal; }
    .value { overflow-wrap: normal; }`,
  "idg-stat": `.delta { max-inline-size: none; overflow-wrap: normal; }`,
  "idg-button": `
    :host { min-inline-size: auto; max-inline-size: none; }
    .control {
      min-inline-size: auto;
      max-inline-size: none;
      padding-inline: calc(var(--idg-density-control-padding-inline) * var(--_padding-scale));
    }`,
  "idg-card": `
    .header, .body, .footer { padding-inline: var(--_pad); }
    .card { overflow-wrap: normal; }
    .heading { overflow-wrap: inherit; }
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
  /** Whether the host is as wide as its content: an inline box, or in a parent that sizes it so. */
  contentSized: boolean;
  /**
   * How far, in pixels and summed over every run of text, the component's text reaches past the
   * component, the column it is in, or a box inside it that clips it; and how far a box the
   * component draws reaches past the component or the column (a tab, past its list by more than a
   * pixel). Text that only stands in the component's own padding is not counted: it is not broken.
   */
  overflow: number;
  /** Whether the component is a card whose heading has a word wider than the heading's box. */
  headingWordWider: boolean;
  /** How far, in pixels, an accordion heading's text runs across its chevron, at most over its lines. */
  overChevron: number;
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
        parent.dataset.sized = context.sized;
        parent.style.cssText = `${context.style}; margin-block-end: 24px`;
        if (context.beside === "cell") {
          const cell = document.createElement("div");
          cell.style.cssText = "display: table-cell";
          cell.append(build(JSON.parse(tree) as Built));
          parent.append(cell, text("display: table-cell", `${long} ${long}`));
        } else {
          parent.append(build(JSON.parse(tree) as Built));
          if (context.beside === "flex") parent.append(text("flex: 1 1 auto", long));
        }
        holder.append(parent);
      }
      document.body.prepend(holder);
    },
    { tree: JSON.stringify(component), contexts: Object.entries(CONTEXTS), long: LONG },
  );
  await hydrated(page);
  await settleFrames(page);
}

function sizes(page: Page): Promise<Size[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("#probe > [data-context]")].map((parent) => {
      const host = parent.querySelector('[class~="hydrated"]');
      if (!host) throw new Error(`no component in ${parent.dataset.context ?? ""}`);
      const contentSized =
        parent.dataset.sized === "content" || getComputedStyle(host).display.startsWith("inline");
      const own = host.getBoundingClientRect();
      const room = parent.getBoundingClientRect();
      interface Edges {
        left: number;
        right: number;
      }
      const narrower = (one: Edges, other: Edges): Edges => ({
        left: Math.max(one.left, other.left),
        right: Math.min(one.right, other.right),
      });
      const past = (box: Edges, limit: Edges) =>
        Math.max(0, box.right - limit.right, limit.left - box.left);
      const up = (element: Element): Element | null => {
        const next: Node | null = element.assignedSlot ?? element.parentNode;
        return next instanceof ShadowRoot ? next.host : next instanceof Element ? next : null;
      };
      // Every box between a run of text and the host that clips what leaves it, by its padding box.
      const clips = (text: Text): Edges[] => {
        const found: Edges[] = [];
        for (
          let element: Element | null = text.assignedSlot ?? text.parentElement;
          element;
          element = up(element)
        ) {
          if (getComputedStyle(element).overflowX !== "visible") {
            const box = element.getBoundingClientRect();
            const left = box.left + element.clientLeft;
            found.push({ left, right: left + element.clientWidth });
          }
          if (element === host) break;
        }
        return found;
      };
      const drawn = (style: CSSStyleDeclaration) =>
        style.backgroundColor !== "rgba(0, 0, 0, 0)" ||
        style.backgroundImage !== "none" ||
        (style.borderRightStyle !== "none" && Number.parseFloat(style.borderRightWidth) > 0);
      let overflow = 0;
      const walk = (node: Node): void => {
        if (node instanceof Text && node.data.trim()) {
          const range = document.createRange();
          range.selectNodeContents(node);
          const limits = [narrower(own, room), ...clips(node)];
          let most = 0;
          for (const line of range.getClientRects()) {
            if (line.width > 0) {
              for (const limit of limits) most = Math.max(most, past(line, limit));
            }
          }
          overflow += most;
        }
        if (node instanceof Element && node.getRootNode() instanceof ShadowRoot) {
          // A box the component draws (a background or a border), past the component or the column
          // it is in; and a
          // tab, which is drawn when it is chosen, hovered or focused, past its list by more than
          // the pixel a tab is allowed, so that a fraction of one does not wrap its label.
          const tabs = node.classList.contains("tab")
            ? (node.getRootNode() as ShadowRoot).host.closest("idg-tabs")
            : null;
          const list = tabs?.shadowRoot?.querySelector(".list");
          if (list) {
            const beyond = past(node.getBoundingClientRect(), list.getBoundingClientRect());
            if (beyond > 1.01) overflow += beyond;
          } else if (drawn(getComputedStyle(node)))
            overflow += past(node.getBoundingClientRect(), narrower(own, room));
        }
        if (node instanceof Element && node.shadowRoot) walk(node.shadowRoot);
        node.childNodes.forEach(walk);
      };
      walk(host);
      // A card's heading: whether its longest word is wider than the heading's content box.
      let headingWordWider = false;
      const heading =
        host.localName === "idg-card" ? host.shadowRoot?.querySelector(".heading") : null;
      if (heading) {
        const style = getComputedStyle(heading);
        const context = document.createElement("canvas").getContext("2d");
        if (!context) throw new Error("no canvas");
        context.font = style.font;
        const text = heading.textContent;
        const shown = style.textTransform === "uppercase" ? text.toUpperCase() : text;
        const spacing = Number.parseFloat(style.letterSpacing) || 0;
        const widest = Math.max(
          ...shown
            .split(/\s+/)
            .filter(Boolean)
            .map((word) => context.measureText(word).width + spacing * word.length),
        );
        const content =
          heading.clientWidth -
          Number.parseFloat(style.paddingLeft) -
          Number.parseFloat(style.paddingRight);
        headingWordWider = widest > content + 0.5;
      }
      // An accordion heading's text drawn across its chevron, by the width the two share on a line.
      let overChevron = 0;
      for (const item of host.localName === "idg-accordion"
        ? host.querySelectorAll("idg-accordion-item")
        : []) {
        const chevron = item.shadowRoot?.querySelector(".chevron")?.getBoundingClientRect();
        const slot = item.shadowRoot?.querySelector(".title slot");
        if (!chevron || !(slot instanceof HTMLSlotElement)) continue;
        const assigned = slot.assignedNodes({ flatten: true });
        for (const node of assigned.length > 0 ? assigned : [...slot.childNodes]) {
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const line of range.getClientRects()) {
            const across = Math.min(line.right, chevron.right) - Math.max(line.left, chevron.left);
            const down = Math.min(line.bottom, chevron.bottom) - Math.max(line.top, chevron.top);
            if (down > 0) overChevron = Math.max(overChevron, across);
          }
        }
      }
      return {
        context: parent.dataset.context ?? "",
        width: own.width,
        height: own.height,
        contentSized,
        overflow,
        headingWordWider,
        overChevron,
      };
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

// Every design, since each sets its own borders, padding and faces, in the narrowest window and a
// tablet's (above that nothing changes the components again), and at 375px for the card and the
// vertical tabs, whose rules change between the two.
const AT_375 = new Set([
  "card",
  "vertical tabs",
  "short vertical tabs",
  "vertical tabs with an icon and a badge",
]);
for (const width of [320, 375, 768]) {
  test.describe(`at ${String(width)}px and 100% text a component is the size it was in a parent sized by its content or a narrow column`, () => {
    for (const [name, component] of Object.entries(COMPONENTS)) {
      if (width === 375 && !AT_375.has(name)) continue;
      test(name, async ({ page }) => {
        test.setTimeout(120_000);
        await page.setViewportSize({ width, height: 900 });
        await page.goto("/fixtures/surfaces.html");
        await hydrated(page);
        const failures: string[] = [];
        for (const design of DESIGNS) {
          await applyAxes(page, { design });
          await place(page, component);
          const found = await sizes(page);
          await withReference(page);
          const expected = await sizes(page);
          expect(found.length).toBe(Object.keys(CONTEXTS).length);
          found.forEach((size, index) => {
            const reference = expected[index];
            if (!reference) return;
            const sameWidth = Math.abs(size.width - reference.width) <= 0.5;
            const sameHeight = Math.abs(size.height - reference.height) <= 0.5;
            // A difference is allowed only where the text reached past the component before (a
            // component squeezed below its content, in a flex row or a narrow column), and now
            // reaches less far: the text wraps, so the component may grow taller, and it may be
            // wider only where it is as wide as its content, which reached past it.
            const mended =
              reference.overflow > 1 &&
              size.overflow < reference.overflow - 0.5 &&
              (sameWidth || size.contentSized);
            // The one exception: a card's heading breaks a word wider than its box, at any width,
            // where it used to stand in the card's padding. It is what keeps a heading word from
            // being clipped by the card's edge with a large root font size, which no media query
            // sees. Only a card, only taller, and only where a heading word was wider than its box.
            const heading =
              component[0] === "idg-card" &&
              sameWidth &&
              size.height > reference.height &&
              reference.headingWordWider;
            // On main a heading word wider than the room beside an accordion's chevron ran across the
            // chevron, which is broken though it stays inside the item. Only an accordion, only
            // where its heading's text crossed the chevron by more than a pixel and now does not,
            // no narrower or shorter, and wider only where it is as wide as its content.
            const chevron =
              component[0] === "idg-accordion" &&
              reference.overChevron > 1 &&
              size.overChevron <= 1 &&
              (sameWidth || size.contentSized) &&
              size.width >= reference.width - 0.5 &&
              size.height >= reference.height - 0.5;
            if (!(sameWidth && sameHeight) && !mended && !heading && !chevron) {
              failures.push(
                `${design}, ${size.context}: ${String(Math.round(size.width))}x${String(Math.round(size.height))}, was ${String(Math.round(reference.width))}x${String(Math.round(reference.height))}${size.overflow > 1 || reference.overflow > 1 ? `, text ${String(Math.round(size.overflow))}px past it, was ${String(Math.round(reference.overflow))}px` : ""}`,
              );
            }
          });
        }
        expect(failures).toEqual([]);
      });
    }
  });
}

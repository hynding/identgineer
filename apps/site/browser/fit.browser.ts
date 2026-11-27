import type { Page } from "@playwright/test";
import { REGISTRY } from "@identgineer/variations";
import { expect, test } from "./fixtures";
import { LAYOUTS, PAGES, hydrated, sidewaysScroll } from "./pages";

const DESIGNS = REGISTRY.design.variations.map((variation) => variation.id);
const THEMES = REGISTRY.theme.variations.map((variation) => variation.id);
const UX_MODES = REGISTRY.ux.variations.map((variation) => variation.id);

/** The smallest phone in common use, a phone, a tablet and a desktop window. */
const FIT_WIDTHS = [320, 390, 820, 1440] as const;

interface Misfit {
  /** Words broken inside themselves at the end of a line, as "Identgineer (in h1)". */
  readonly brokenWords: string[];
  /** Text or a control that reaches past the window, or past a box that clips it. */
  readonly cut: string[];
  /** Text or a control that reaches past the box drawn around it, or a bordered box its content overflows. */
  readonly spilled: string[];
  /** Two controls drawn over each other. */
  readonly overlapping: string[];
}

/**
 * Walks every visible text node and control of the page, shadow roots included. A word whose
 * letters sit on more than one line is broken inside itself. A line or a control that reaches past
 * the window, or past the nearest box that clips what overflows it, is cut; one that reaches past
 * the nearest box drawn with a border or a background has spilled out of it. Two links, buttons or
 * fields that cover each other, neither inside the other, overlap.
 */
function misfitsOf(page: Page): Promise<Misfit> {
  return page.evaluate(() => {
    const brokenWords: string[] = [];
    const cut: string[] = [];
    const spilled: string[] = [];
    const overlapping: string[] = [];
    const CONTROLS = ["a", "button", "input", "select", "textarea"];
    const REPLACED = [...CONTROLS, "svg", "img"];

    const parentOf = (node: Node): Element | null => {
      if (node instanceof Element && node.assignedSlot) return node.assignedSlot;
      if (node instanceof Text && node.assignedSlot) return node.assignedSlot;
      const parent = node.parentNode;
      return parent instanceof ShadowRoot ? parent.host : (parent as Element | null);
    };
    const describe = (element: Element) => {
      const className =
        typeof element.className === "string" ? element.className.trim().split(/\s+/)[0] : "";
      const part = element.getAttribute("part");
      return `${element.localName}${className ? `.${className}` : ""}${part ? `[part=${part}]` : ""}`;
    };
    const transparent = (colour: string) =>
      colour === "transparent" || /,\s*0\)$/.test(colour) || colour.endsWith("/ 0)");
    const isDrawnBox = (style: CSSStyleDeclaration) =>
      style.display !== "contents" &&
      style.display !== "inline" &&
      ((Number.parseFloat(style.borderInlineStartWidth) > 0 &&
        Number.parseFloat(style.borderInlineEndWidth) > 0 &&
        style.borderInlineStartStyle !== "none") ||
        !transparent(style.backgroundColor));
    const clips = (style: CSSStyleDeclaration) =>
      (style.overflowX !== "visible" &&
        style.overflowX !== "auto" &&
        style.overflowX !== "scroll") ||
      style.contain.includes("paint");

    /** Whether a line or control box reaches past the window, its clipping box or its drawn box. */
    const check = (boxes: Iterable<DOMRect>, what: string, node: Node) => {
      let drawn: Element | undefined;
      const clippers: Element[] = [];
      for (let current = parentOf(node); current; current = parentOf(current)) {
        if (current === document.documentElement || current === document.body) break;
        const style = getComputedStyle(current);
        if (clips(style)) clippers.push(current);
        if (drawn === undefined && isDrawnBox(style)) drawn = current;
      }
      for (const box of boxes) {
        if (box.width <= 0 || box.height <= 0) continue;
        if (box.right > window.innerWidth + 0.5 || box.left < -0.5) {
          cut.push(`${what} past the window`);
          return;
        }
        for (const clipper of clippers) {
          const edge = clipper.getBoundingClientRect();
          if (box.right > edge.right + 1 || box.left < edge.left - 1) {
            cut.push(`${what} by ${describe(clipper)}`);
            return;
          }
        }
        if (drawn) {
          const edge = drawn.getBoundingClientRect();
          const by = Math.max(box.right - edge.right, edge.left - box.left);
          if (by > 1) {
            spilled.push(`${what} out of ${describe(drawn)} by ${String(Math.round(by))}px`);
            return;
          }
        }
      }
    };

    const checkBorderedBox = (element: Element) => {
      const style = getComputedStyle(element);
      if (style.overflowX !== "visible" || !element.checkVisibility()) return;
      if (Number.parseFloat(style.borderInlineStartWidth) === 0) return;
      if (element.scrollWidth > element.clientWidth + 1) {
        spilled.push(
          `${describe(element)} overflowed by ${String(element.scrollWidth - element.clientWidth)}px`,
        );
      }
    };

    const checkWords = (node: Text, element: Element) => {
      const text = node.data;
      const range = document.createRange();
      for (const match of text.matchAll(/[\p{L}\p{N}][\p{L}\p{N},.]*[\p{L}\p{N}]/gu)) {
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        const tops = [...range.getClientRects()]
          .filter((line) => line.width > 0)
          .map((line) => line.top);
        if (tops.length > 1 && Math.max(...tops) - Math.min(...tops) > 3) {
          brokenWords.push(`${match[0]} (in ${describe(element)})`);
        }
      }
    };

    const controls: { element: Element; box: DOMRect }[] = [];
    const hidden = (element: Element) =>
      !element.checkVisibility({ visibilityProperty: true }) ||
      element.closest(".visually-hidden") !== null ||
      getComputedStyle(element).clipPath.includes("inset(50%");

    const visit = (root: Document | ShadowRoot) => {
      const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
      );
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node instanceof Element) {
          checkBorderedBox(node);
          if (node.shadowRoot) visit(node.shadowRoot);
          if (REPLACED.includes(node.localName) && !hidden(node)) {
            const box = node.getBoundingClientRect();
            if (box.width > 0) check([box], `<${describe(node)}>`, node);
            if (CONTROLS.includes(node.localName) && box.width >= 2 && box.height >= 2) {
              controls.push({ element: node, box });
            }
          }
          continue;
        }
        const text = node.textContent ?? "";
        const element = node.parentElement;
        if (!/\S/.test(text) || !element || hidden(element)) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        check(range.getClientRects(), `"${text.trim().slice(0, 30)}"`, node);
        checkWords(node as Text, element);
      }
    };
    visit(document);

    const contains = (outer: Element, inner: Element) => {
      for (let current: Element | null = inner; current; current = parentOf(current)) {
        if (current === outer) return true;
      }
      return false;
    };
    const named = (element: Element) =>
      `${describe(element)} "${element.textContent.trim().slice(0, 20)}"`;
    controls.forEach((first, index) => {
      for (const second of controls.slice(index + 1)) {
        const across =
          Math.min(first.box.right, second.box.right) - Math.max(first.box.left, second.box.left);
        const down =
          Math.min(first.box.bottom, second.box.bottom) - Math.max(first.box.top, second.box.top);
        if (
          across > 2 &&
          down > 2 &&
          !contains(first.element, second.element) &&
          !contains(second.element, first.element)
        ) {
          overlapping.push(
            `${named(first.element)} and ${named(second.element)} (${String(Math.round(across))}×${String(Math.round(down))}px)`,
          );
        }
      }
    });
    return { brokenWords, cut, spilled, overlapping };
  });
}

/** Lets the page lay itself out again at the window's new size. */
async function settled(page: Page): Promise<void> {
  await page.evaluate(async () => {
    for (let frame = 0; frame < 3; frame += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  });
}

// Every design with every layout and every UX mode, the theme and the scheme turning with them, so
// that each theme meets each pair of the other three across the sweep. A page is opened once for
// each look and the window then widened through the four widths.
for (const { name, path, component } of PAGES) {
  DESIGNS.forEach((design, designIndex) => {
    LAYOUTS.forEach((layout, layoutIndex) => {
      test(`${name} in ${design} with ${layout} fits every UX mode at 320, 390, 820 and 1440px: no sideways scroll, nothing cut or spilled, no word broken, no controls over each other`, async ({
        page,
      }) => {
        test.setTimeout(60_000);
        const problems: string[] = [];
        for (const [uxIndex, ux] of UX_MODES.entries()) {
          const turn = designIndex + layoutIndex + uxIndex;
          const theme = THEMES[turn % THEMES.length] ?? "aurora";
          const scheme = turn % 2 === 0 ? "light" : "dark";
          await page.setViewportSize({ width: FIT_WIDTHS[0], height: 900 });
          await page.goto(
            `${path}?idg-design=${design}&idg-theme=${theme}&idg-layout=${layout}&idg-ux=${ux}&idg-scheme=${scheme}`,
          );
          await hydrated(page, component);
          for (const width of FIT_WIDTHS) {
            await page.setViewportSize({ width, height: 900 });
            await settled(page);
            const where = `${theme}/${ux}/${scheme} at ${String(width)}px`;
            const sideways = await sidewaysScroll(page);
            if (sideways > 0) problems.push(`${where}: scrolls ${String(sideways)}px sideways`);
            const { brokenWords, cut, spilled, overlapping } = await misfitsOf(page);
            for (const word of brokenWords) problems.push(`${where}: "${word}" broken`);
            for (const what of cut) problems.push(`${where}: ${what} cut`);
            for (const what of spilled) problems.push(`${where}: ${what} spilled`);
            for (const pair of overlapping) problems.push(`${where}: ${pair} overlap`);
          }
        }
        expect(problems).toEqual([]);
      });
    });
  });
}

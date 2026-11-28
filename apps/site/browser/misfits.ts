import type { Page } from "@playwright/test";
import { withoutCalcSize } from "@identgineer/components/browser/without-calc-size";
import { withoutStyleQueries } from "@identgineer/components/browser/without-style-queries";

export interface Misfit {
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
export function misfitsOf(page: Page): Promise<Misfit> {
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

    const scrollsSideways = (style: CSSStyleDeclaration) =>
      style.overflowX === "auto" || style.overflowX === "scroll";

    /** Whether a line or control box reaches past the window, its clipping box or its drawn box. */
    const check = (boxes: Iterable<DOMRect>, what: string, node: Node) => {
      let drawn: Element | undefined;
      const clippers: Element[] = [];
      for (let current = parentOf(node); current; current = parentOf(current)) {
        if (current === document.documentElement || current === document.body) break;
        const style = getComputedStyle(current);
        // A box that scrolls sideways and takes focus to be scrolled (a code sample, a wide table)
        // holds lines past its edge on purpose: they are reached by scrolling it, not cut.
        if (scrollsSideways(style) && (current as HTMLElement).tabIndex >= 0) return;
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

    const controls: { element: Element; boxes: DOMRect[] }[] = [];
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
              // A link that runs over two lines of a paragraph is a box on each line, not the
              // rectangle around both, which would cover the links beside it.
              const boxes = [...node.getClientRects()].filter((line) => line.width > 0);
              controls.push({ element: node, boxes: boxes.length > 0 ? boxes : [box] });
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
    const overlap = (a: DOMRect, b: DOMRect) => ({
      across: Math.min(a.right, b.right) - Math.max(a.left, b.left),
      down: Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top),
    });
    controls.forEach((first, index) => {
      for (const second of controls.slice(index + 1)) {
        if (contains(first.element, second.element) || contains(second.element, first.element)) {
          continue;
        }
        const found = first.boxes
          .flatMap((a) => second.boxes.map((b) => overlap(a, b)))
          .find(({ across, down }) => across > 2 && down > 2);
        if (found) {
          overlapping.push(
            `${named(first.element)} and ${named(second.element)} (${String(Math.round(found.across))}×${String(Math.round(found.down))}px)`,
          );
        }
      }
    });
    return { brokenWords, cut, spilled, overlapping };
  });
}

/** Lets the page lay itself out again at the window's new size. */
export async function settled(page: Page): Promise<void> {
  await page.evaluate(async () => {
    for (let frame = 0; frame < 3; frame += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  });
}

/** Takes out of the page both features Firefox lacks; returns the fewer changes of the two. */
async function withoutEither(page: Page): Promise<number> {
  const calcSize = await withoutCalcSize(page);
  return Math.min(calcSize, await withoutStyleQueries(page));
}

/**
 * The engines a visitor may come with: Chromium; one without `calc-size()`, as Safari is; and one
 * without `calc-size()` or container style queries, as Firefox is. Each test carries the tag of the
 * CI part it runs in (see parts.ts).
 */
export const ENGINES = [
  { key: "chromium", name: "", strip: undefined },
  { key: "no-calc-size", name: " without calc-size()", strip: withoutCalcSize },
  {
    key: "no-style-queries",
    name: " without calc-size() or container style queries",
    strip: withoutEither,
  },
] as const;

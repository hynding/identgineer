import type { Page } from "@playwright/test";
import { expect } from "./fixtures";

/**
 * The window widths a reflow test runs at with text at 200%: the narrowest supported one, and the
 * widths up to a tablet where a rule that is cut off at a fixed window width stops applying.
 */
export const REFLOW_WIDTHS = [320, 400, 480, 600, 768] as const;

/** Waits until every `idg-` element on the page has hydrated and the fonts are loaded. */
export async function hydrated(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          [...document.querySelectorAll("*")].filter(
            (element) =>
              element.localName.startsWith("idg-") && !element.classList.contains("hydrated"),
          ).length,
      ),
    )
    .toBe(0);
  await page.evaluate(() => document.fonts.ready);
}

/** Lets the page render, so what a script scheduled for the next frames has run. */
export function settleFrames(page: Page, count = 3): Promise<void> {
  return page.evaluate(async (times) => {
    for (let index = 0; index < times; index += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }, count);
}

/** How far the page scrolls sideways, in pixels; zero or less is none. */
export function sidewaysScroll(page: Page): Promise<number> {
  return page.evaluate(() => {
    const root = document.documentElement;
    return Math.max(root.scrollWidth, document.body.scrollWidth) - root.clientWidth;
  });
}

/**
 * The text a box that clips (`overflow: hidden` or `clip` on the inline axis) cuts off, or that
 * leaves the window: each is a few words of it, with the part that holds it. Text in a box that is
 * hidden or has no size is not drawn, so it is not counted. The tree walked is the flat one, so
 * text in a slot is judged by the boxes around the slot.
 */
export function clippedText(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const window_ = document.documentElement.clientWidth;
    const found: string[] = [];
    const parentOf = (node: Element): Element | null => {
      const parent: Node | null = node.assignedSlot ?? node.parentNode;
      if (parent instanceof ShadowRoot) return parent.host;
      return parent instanceof Element ? parent : null;
    };
    // The box that cuts this one off, if one does: a box that clips holds only what is inside it,
    // and one that scrolls holds all of it, in reach, where it is itself in the window.
    const clipper = (box: DOMRect, from: Element): Element | "held" | undefined => {
      for (let node: Element | null = from; node; node = parentOf(node)) {
        const overflow = getComputedStyle(node).overflowX;
        if (overflow === "visible") continue;
        const edge = node.getBoundingClientRect();
        const start = edge.left + node.clientLeft;
        const end = start + node.clientWidth;
        if (box.right <= end + 1 && box.left >= start - 1) continue;
        if (overflow === "hidden" || overflow === "clip") return node;
        if (edge.left >= -1 && edge.right <= window_ + 1) return "held";
      }
      return undefined;
    };
    const describe = (element: Element): string =>
      `${element.localName}${element.getAttribute("part") ? `::part(${element.getAttribute("part") ?? ""})` : ""}`;
    const walk = (node: Node): void => {
      if (node instanceof Text) {
        // The element that holds the text is the one with a box; a slot has none (`display: contents`),
        // so it only says where the text is drawn, and the boxes around the slot are the ones that clip.
        const holder = node.parentElement;
        const parent = node.assignedSlot ?? holder;
        if (
          !holder ||
          !parent ||
          !node.data.trim() ||
          !holder.checkVisibility({ visibilityProperty: true })
        )
          return;
        const place = holder.getBoundingClientRect();
        if (place.width <= 1 || place.height <= 1) return;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const box of range.getClientRects()) {
          if (box.width <= 0) continue;
          const cut = clipper(box, parent);
          if (cut === "held") break;
          if (cut || box.right > window_ + 1 || box.left < -1) {
            found.push(`"${node.data.trim().slice(0, 24)}" in ${describe(cut ?? parent)}`);
            break;
          }
        }
        return;
      }
      if (node instanceof Element) {
        if (["SCRIPT", "STYLE"].includes(node.tagName)) return;
        if (node.shadowRoot) walk(node.shadowRoot);
      }
      node.childNodes.forEach(walk);
    };
    walk(document.body);
    return found;
  });
}

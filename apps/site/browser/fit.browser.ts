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
  /** Words broken inside themselves at the end of a line, as "Identgine|er". */
  readonly brokenWords: string[];
  /** Text that reaches past the window or past a box that clips it. */
  readonly cut: string[];
  /** Boxes with a border whose content reaches past it. */
  readonly spilled: string[];
}

/**
 * Walks every visible text node of the page, shadow roots included, a character at a time: a
 * letter or digit that starts a new line straight after another one is a word broken inside itself,
 * and a line that reaches past the window, or past the nearest box that clips what overflows it, is
 * cut.
 */
function misfitsOf(page: Page): Promise<Misfit> {
  return page.evaluate(() => {
    const brokenWords: string[] = [];
    const cut: string[] = [];
    const wordCharacter = /[\p{L}\p{N}]/u;
    const parentOf = (node: Node): Element | null => {
      if (node instanceof Element && node.assignedSlot) return node.assignedSlot;
      const parent = node.parentNode;
      return parent instanceof ShadowRoot ? parent.host : (parent as Element | null);
    };
    const clipperOf = (element: Element): Element | null => {
      for (let current = parentOf(element); current; current = parentOf(current)) {
        if (current === document.documentElement) return null;
        const style = getComputedStyle(current);
        if (style.overflowX !== "visible" || style.contain.includes("paint")) return current;
      }
      return null;
    };
    const spilled: string[] = [];
    const describe = (element: Element) =>
      `${element.localName}${element.className && typeof element.className === "string" ? `.${element.className.split(" ")[0] ?? ""}` : ""}`;
    const checkBox = (element: Element) => {
      const style = getComputedStyle(element);
      if (style.overflowX !== "visible" || !element.checkVisibility()) return;
      if (Number.parseFloat(style.borderInlineStartWidth) === 0) return;
      if (element.scrollWidth > element.clientWidth + 1) {
        spilled.push(
          `${describe(element)} by ${String(element.scrollWidth - element.clientWidth)}px`,
        );
      }
    };
    const visit = (root: Document | ShadowRoot) => {
      const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
      );
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node instanceof Element) {
          checkBox(node);
          if (node.shadowRoot) visit(node.shadowRoot);
          continue;
        }
        const text = node.textContent ?? "";
        const element = node.parentElement;
        if (!/\S/.test(text) || element?.checkVisibility() !== true) continue;
        if (element.closest(".visually-hidden")) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const clipper = clipperOf(element);
        const limit = clipper
          ? Math.min(clipper.getBoundingClientRect().right, window.innerWidth)
          : window.innerWidth;
        const start = clipper ? Math.max(clipper.getBoundingClientRect().left, 0) : 0;
        for (const line of range.getClientRects()) {
          if (line.width > 0 && (line.right > limit + 1 || line.left < start - 1)) {
            cut.push(
              `"${text.trim().slice(0, 40)}" by ${String(Math.round(line.right - limit))}px`,
            );
            break;
          }
        }
        let previousTop: number | undefined;
        for (let index = 0; index < text.length; index += 1) {
          range.setStart(node, index);
          range.setEnd(node, index + 1);
          const box = range.getClientRects()[0];
          if (!box || box.width === 0) {
            previousTop = undefined;
            continue;
          }
          const character = text.charAt(index);
          const before = text.charAt(index - 1);
          if (
            previousTop !== undefined &&
            box.top > previousTop + 2 &&
            wordCharacter.test(character) &&
            wordCharacter.test(before)
          ) {
            const wordStart = text.lastIndexOf(" ", index) + 1;
            const end = text.indexOf(" ", index);
            brokenWords.push(
              `${text.slice(wordStart, index)}|${text.slice(index, end < 0 ? undefined : end)}`,
            );
          }
          previousTop = box.top;
        }
      }
    };
    visit(document);
    return { brokenWords, cut, spilled };
  });
}

// Every design with every layout once, at each width, with the theme and the UX mode turning with
// them: the 64 pairs of design and layout, and the 64 of design and UX mode, are each met once.
for (const { name, path, component } of PAGES) {
  for (const width of FIT_WIDTHS) {
    DESIGNS.forEach((design, designIndex) => {
      const theme = THEMES[designIndex % THEMES.length] ?? "aurora";
      test(`${name} in ${design}/${theme} at ${String(width)}px fits every layout: no sideways scroll, nothing cut, no word broken`, async ({
        page,
      }) => {
        test.setTimeout(60_000);
        await page.setViewportSize({ width, height: 900 });
        const problems: string[] = [];
        for (const [layoutIndex, layout] of LAYOUTS.entries()) {
          const ux = UX_MODES[(designIndex + layoutIndex) % UX_MODES.length] ?? "comfortable";
          await page.goto(
            `${path}?idg-design=${design}&idg-theme=${theme}&idg-layout=${layout}&idg-ux=${ux}`,
          );
          await hydrated(page, component);
          const where = `${layout}/${ux}`;
          const sideways = await sidewaysScroll(page);
          if (sideways > 0) problems.push(`${where}: scrolls ${String(sideways)}px sideways`);
          const { brokenWords, cut, spilled } = await misfitsOf(page);
          for (const word of brokenWords) problems.push(`${where}: "${word}" broken`);
          for (const text of cut) problems.push(`${where}: ${text} cut`);
          for (const box of spilled) problems.push(`${where}: ${box} spilled`);
        }
        expect(problems).toEqual([]);
      });
    });
  }
}

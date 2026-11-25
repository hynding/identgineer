import type { Page } from "@playwright/test";

/**
 * Helpers that run in the page to read through shadow roots, which a selector does not cross. Each
 * is a function of a host selector so a test can name the element it measures.
 */

/** The headings under a host, in document order, through every shadow root inside it. */
export async function headingsIn(
  page: Page,
  host: string,
): Promise<{ level: number; text: string }[]> {
  return page.locator(host).evaluate((element) => {
    const collect = (root: ParentNode): Element[] =>
      [...root.querySelectorAll("*")].flatMap((node) => [
        ...(/^h[1-6]$/.test(node.localName) ? [node] : []),
        ...(node.shadowRoot ? collect(node.shadowRoot) : []),
      ]);
    return collect(element.shadowRoot ?? element).map((heading) => ({
      level: Number(heading.localName.slice(1)),
      text: heading.textContent.replaceAll(/\s+/g, " ").trim(),
    }));
  });
}

/** Every element under a host that matches the selector, through every shadow root inside it. */
export async function countDeep(page: Page, host: string, selector: string): Promise<number> {
  return page.locator(host).evaluate((element, wanted) => {
    const collect = (root: ParentNode): number =>
      root.querySelectorAll(wanted).length +
      [...root.querySelectorAll("*")].reduce(
        (sum, node) => sum + (node.shadowRoot ? collect(node.shadowRoot) : 0),
        0,
      );
    return collect(element.shadowRoot ?? element);
  }, selector);
}

export interface Reflow {
  /** `scrollWidth - clientWidth` of the page: above zero is a sideways scroll. */
  readonly page: number;
  /** For each host, how many of the elements inside it (through shadow roots) are wider than it. */
  readonly wider: number[];
  /** How many hosts were measured, so a test cannot pass on measuring nothing. */
  readonly hosts: number;
  /** How many elements were measured in all. */
  readonly elements: number;
}

/**
 * Whether the page scrolls sideways, and whether anything inside any host matching `selector`
 * reaches past the host's own inline end. Both are read after the caller has waited for the
 * re-render its change causes.
 */
export async function measureReflow(page: Page, selector: string): Promise<Reflow> {
  return page.evaluate((wanted) => {
    const root = document.documentElement;
    const inside = (parent: ParentNode): Element[] =>
      [...parent.querySelectorAll("*")].flatMap((node) => [
        node,
        ...(node.shadowRoot ? inside(node.shadowRoot) : []),
      ]);
    const hosts = [...document.querySelectorAll(wanted)];
    const counted = hosts.map((host) => {
      const box = host.getBoundingClientRect();
      const elements = inside(host.shadowRoot ?? host);
      return {
        count: elements.length,
        wider: elements.filter((element) => {
          const edge = element.getBoundingClientRect();
          return edge.width > 0 && edge.right > box.right + 1;
        }).length,
      };
    });
    return {
      page: root.scrollWidth - root.clientWidth,
      wider: counted.map(({ wider }) => wider),
      hosts: hosts.length,
      elements: counted.reduce((sum, { count }) => sum + count, 0),
    };
  }, selector);
}

import type { Page } from "@playwright/test";
import { applyAxes, LAYOUTS } from "./axes";
import { expect } from "./fixtures";

export const SHELL_PAGE = "/fixtures/layout-shell.html";

export type Layout = (typeof LAYOUTS)[number];

const TAGS = ["idg-layout", "idg-button", "idg-card", "idg-grid", "idg-table", "idg-icon"];

export interface OpenOptions {
  width?: number;
  height?: number;
  layout?: string;
  ux?: string;
  direction?: "ltr" | "rtl";
  /** A share of the root font size, such as `200%`, set through the style object the policy allows. */
  fontSize?: string;
}

/** Opens the shell fixture and waits until every component on it has hydrated. */
export async function openShell(page: Page, options: OpenOptions = {}): Promise<void> {
  await page.setViewportSize({ width: options.width ?? 1280, height: options.height ?? 800 });
  await page.goto(SHELL_PAGE);
  await expect(page.locator(TAGS.map((tag) => `${tag}:not(.hydrated)`).join(", "))).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(
    ({ direction, fontSize }) => {
      if (direction) document.documentElement.setAttribute("dir", direction);
      if (fontSize) document.documentElement.style.fontSize = fontSize;
    },
    { direction: options.direction, fontSize: options.fontSize },
  );
  if (options.layout !== undefined || options.ux !== undefined) {
    await applyAxes(page, { layout: options.layout, ux: options.ux });
  }
  await frames(page);
}

/** Lets the page render twice, so what a script scheduled for the next frame has run. */
export function frames(page: Page, count = 2): Promise<void> {
  return page.evaluate(async (times) => {
    for (let index = 0; index < times; index += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }, count);
}

export const REGION_NAMES = [
  "skip",
  "brand",
  "toggle",
  "navigation",
  "actions",
  "hero",
  "main",
  "aside",
  "footer",
] as const;

export type RegionName = (typeof REGION_NAMES)[number];

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
  /** Whether it is drawn at all: it has a box and no ancestor hides it. */
  shown: boolean;
}

export type Regions = Record<RegionName, Rect>;

/** The box of every region of the shell, in page coordinates, so a scrolled page reads the same. */
export function regions(page: Page): Promise<Regions> {
  return page.locator("#shell").evaluate((host, names) => {
    const result: Record<string, unknown> = {};
    for (const name of names) {
      const element = host.shadowRoot?.querySelector<HTMLElement>(`[part="${name}"]`);
      if (!element) throw new Error(`no ${name} part`);
      const box = element.getBoundingClientRect();
      const x = box.x + window.scrollX;
      const y = box.y + window.scrollY;
      result[name] = {
        x,
        y,
        width: box.width,
        height: box.height,
        right: x + box.width,
        bottom: y + box.height,
        shown: element.checkVisibility() && box.width > 0 && box.height > 0,
      };
    }
    return result as Regions;
  }, REGION_NAMES);
}

/** The box of a light-DOM element of the page, in page coordinates. */
export function boxOfSlotted(page: Page, selector: string): Promise<Rect> {
  return page.locator(selector).evaluate((element) => {
    const box = element.getBoundingClientRect();
    const x = box.x + window.scrollX;
    const y = box.y + window.scrollY;
    return {
      x,
      y,
      width: box.width,
      height: box.height,
      right: x + box.width,
      bottom: y + box.height,
      shown: element.checkVisibility() && box.width > 0 && box.height > 0,
    };
  });
}

export function setLayout(page: Page, layout: string): Promise<void> {
  return page.evaluate((next) => {
    document.documentElement.dataset.layout = next;
  }, layout);
}

/** Resizes the shell's own container, so a test can tell the container from the viewport. */
export function setShellWidth(page: Page, width: string): Promise<void> {
  return page.locator("#shell").evaluate((host, value) => {
    host.style.inlineSize = value;
  }, width);
}

export interface FocusInfo {
  /** The region of the shell that has focus: a slot name, a control of the shell, or `outside`. */
  region: string;
  /** The id of the focused element when it has one, else its tag. */
  id: string;
}

/**
 * Where focus is, looking through shadow roots. An element of the page is placed by the slot its
 * ancestor under the shell is assigned to, and a control in the shell's own tree by its part.
 */
export function focusInfo(page: Page): Promise<FocusInfo> {
  return page.evaluate(() => {
    let active: Element | null = document.activeElement;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
    if (!active || active === document.body || active === document.documentElement) {
      return { region: "none", id: "" };
    }
    const shell = document.getElementById("shell");
    const id = active.id || active.tagName.toLowerCase();
    // Climb out of shadow roots until the element is a child of the shell or one of its own parts.
    let current: Element | null = active;
    while (current && current.parentElement !== shell) {
      const root: Node = current.getRootNode();
      if (root instanceof ShadowRoot && root.host === shell) {
        const part = current.closest("[part]")?.getAttribute("part") ?? "";
        return { region: part, id };
      }
      current = current.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
    }
    if (!current) return { region: "outside", id };
    return { region: current.getAttribute("slot") ?? "main", id };
  });
}

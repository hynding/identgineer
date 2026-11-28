import type { Page } from "@playwright/test";
import { generatedRoutes } from "../src/reference/generated-routes";
import { prerenderedPages } from "../src/routes";
import { expect } from "./fixtures";

/** An address the site does not have, which the server answers with the 404 page. */
export const MISSING_PATH = "/no-such-page/";

/** The page of every component of the library: each is checked once, in `reference.browser.ts`. */
export const COMPONENT_ROUTES = generatedRoutes();

/**
 * The component pages that meet every other suite: the longest tables (idg-input) and the longest
 * text (idg-layout), as the page of one component stands for the 60 of the same markup.
 */
export const SAMPLED_COMPONENTS = ["idg-input", "idg-layout"] as const;

/** Every prerendered page, by the address a visitor opens it at. */
export const PAGES = prerenderedPages(
  COMPONENT_ROUTES.filter((route) =>
    (SAMPLED_COMPONENTS as readonly string[]).includes(route.content),
  ),
).map((page) => ({
  name: page.path ?? "404",
  path: page.path ?? MISSING_PATH,
  component: page.component,
}));

/**
 * The pages the fit sweep takes through every design with every layout: the home page, the longest
 * reading page, the docs page with the widest content (tables and code), the index of the
 * components, the component page with the longest tables and the variations gallery. Every other page meets
 * each design, each layout and each UX mode once, in eight of the pairs.
 */
export const FULLY_SWEPT: ReadonlySet<string> = new Set([
  "/",
  "/identity/",
  "/docs/theming/",
  "/components/",
  "/components/idg-input/",
  "/variations/",
]);

export const LAYOUTS = [
  "top-bar",
  "side-rail",
  "split-hero",
  "magazine",
  "dashboard",
  "centered",
  "bento",
  "immersive",
] as const;

/** A phone, a tablet and a desktop window. */
export const WIDTHS = [390, 820, 1440] as const;

/**
 * Waits until the client build has hydrated the page's own component, which Stencil reports ready
 * only once every component it renders has loaded too, and the next frames have been drawn.
 */
export async function hydrated(page: Page, component: string): Promise<void> {
  await page.evaluate(async (tag) => {
    await customElements.whenDefined(tag);
    const host = document.querySelector<Element & { componentOnReady?: () => Promise<unknown> }>(
      tag,
    );
    await host?.componentOnReady?.();
    await document.fonts.ready;
    for (let frame = 0; frame < 3; frame += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }, component);
  await expect(page.locator(component)).toHaveCount(1);
}

/** How far the page scrolls sideways, in pixels; zero or less is none. */
export function sidewaysScroll(page: Page): Promise<number> {
  return page.evaluate(() => {
    const root = document.documentElement;
    return Math.max(root.scrollWidth, document.body.scrollWidth) - root.clientWidth;
  });
}

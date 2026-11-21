import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";

const TOKENS = fileURLToPath(new URL("../www/tokens", import.meta.url));

function idsIn(directory: string): string[] {
  return readdirSync(`${TOKENS}/${directory}`)
    .map((file) => file.replace(/\.css$/, ""))
    .sort();
}

// Read from the built tokens, so a new design or UX mode joins the matrix without an edit here.
export const DESIGNS = idsIn("designs");
export const UX_MODES = idsIn("ux");
export const SCHEMES = ["light", "dark"] as const;

export interface Axes {
  theme?: string;
  design?: string;
  ux?: string;
  scheme?: (typeof SCHEMES)[number];
}

/** Sets the axis attributes on the root, then waits for transitions started by the change. */
export async function applyAxes(page: Page, axes: Axes): Promise<void> {
  await page.evaluate((next) => {
    const root = document.documentElement;
    if (next.theme) root.dataset.theme = next.theme;
    if (next.design) root.dataset.design = next.design;
    if (next.ux) root.dataset.ux = next.ux;
    if (next.scheme) root.dataset.scheme = next.scheme;
  }, axes);
  await settle(page);
}

/** Waits for every CSS transition, in light and shadow trees, so contrast is read at rest. */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const roots: (Document | ShadowRoot)[] = [document];
    for (const root of roots) {
      for (const element of root.querySelectorAll("*")) {
        if (element.shadowRoot) roots.push(element.shadowRoot);
      }
    }
    const transitions = roots
      .flatMap((root) => root.getAnimations())
      .filter((animation) => animation instanceof CSSTransition);
    await Promise.all(transitions.map((transition) => transition.finished.catch(() => undefined)));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

import { navigationRoutes } from "../routes.ts";
import { parseNavigationItem } from "./validate-content-page.ts";

/**
 * Labels the CMS gives the pages of the site's navigation, by path, for the bar and for the
 * footer. A page without one keeps the route table's label.
 */
export interface NavigationLabels {
  readonly header: Readonly<Record<string, string>>;
  readonly footer: Readonly<Record<string, string>>;
}

export const NO_LABELS: NavigationLabels = { header: {}, footer: {} };

export function navigationPaths(): ReadonlySet<string> {
  return new Set(navigationRoutes().map((route) => route.path));
}

/**
 * The labels from the JSON the prerenderer put in the page's attribute, each checked again as a
 * navigation item; anything that is not exactly that is left out, and the route's label stands.
 */
export function readNavigationLabels(json: string): NavigationLabels {
  if (json === "") return NO_LABELS;
  let input: unknown;
  try {
    input = JSON.parse(json);
  } catch {
    return NO_LABELS;
  }
  const paths = navigationPaths();
  const pick = (placement: "header" | "footer"): Record<string, string> => {
    const given = (input as Record<string, unknown> | null)?.[placement];
    if (typeof given !== "object" || given === null) return {};
    const labels: Record<string, string> = {};
    for (const [href, label] of Object.entries(given as Record<string, unknown>)) {
      const result = parseNavigationItem({ label, href, placement, order: 0 }, paths);
      if (result.ok) labels[href] = result.item.label;
    }
    return labels;
  };
  return { header: pick("header"), footer: pick("footer") };
}

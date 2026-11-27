import { DEFAULT_THEME_ID, THEMES } from "@identgineer/tokens";
import type { PrerenderedPage } from "../src/routes.ts";

export const SITE_NAME = "Identgineer";

export type OpenGraphProperty =
  "og:type" | "og:site_name" | "og:title" | "og:description" | "og:url";

export interface PageMetadata {
  readonly title: string;
  readonly description: string;
  /** Absent for the 404 page, which is served at whatever address was asked for. */
  readonly canonicalUrl: string | undefined;
  readonly robots: "noindex" | undefined;
  readonly openGraph: readonly (readonly [OpenGraphProperty, string])[];
  /** The browser's own chrome, before the page has painted, in the default theme of each scheme. */
  readonly themeColors: { readonly light: string; readonly dark: string };
}

function defaultThemeColors(): PageMetadata["themeColors"] {
  const theme = THEMES.find((candidate) => candidate.id === DEFAULT_THEME_ID);
  if (!theme) throw new Error(`The default theme "${DEFAULT_THEME_ID}" is not in the registry`);
  return { light: theme.swatches.light.bg, dark: theme.swatches.dark.bg };
}

export function pageMetadata(page: PrerenderedPage, siteUrl: URL): PageMetadata {
  const title = page.path === "/" ? page.title : `${page.title} · ${SITE_NAME}`;
  const canonicalUrl = page.path === undefined ? undefined : new URL(page.path, siteUrl).href;
  const openGraph: [OpenGraphProperty, string][] = [
    ["og:type", "website"],
    ["og:site_name", SITE_NAME],
    ["og:title", title],
    ["og:description", page.description],
  ];
  if (canonicalUrl !== undefined) openGraph.push(["og:url", canonicalUrl]);
  return {
    title,
    description: page.description,
    canonicalUrl,
    robots: page.path === undefined ? "noindex" : undefined,
    openGraph,
    themeColors: defaultThemeColors(),
  };
}

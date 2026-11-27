import type { PageComponent } from "../src/routes.ts";
import type { PageMetadata } from "./metadata.ts";

/** Same-origin paths of what every page loads. */
export interface DocumentAssets {
  readonly bootstrap: { readonly src: string; readonly integrity: string };
  readonly stylesheets: readonly string[];
  readonly moduleScript: string;
  readonly icon: string;
}

export interface DocumentInput {
  readonly metadata: PageMetadata;
  readonly component: PageComponent;
  readonly assets: DocumentAssets;
}

const ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);
}

function meta(attribute: "name" | "property", key: string, content: string): string {
  return `<meta ${attribute}="${escape(key)}" content="${escape(content)}">`;
}

/**
 * The document a page is rendered from, before Stencil draws its component into the body. The
 * variation bootstrap runs first and blocks, and the stylesheets are plain links, which also block,
 * so a visitor's stored or shared choice is on the root before anything is painted.
 */
export function renderDocument({ metadata, component, assets }: DocumentInput): string {
  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<script src="${escape(assets.bootstrap.src)}" integrity="${escape(assets.bootstrap.integrity)}"></script>`,
    `<title>${escape(metadata.title)}</title>`,
    meta("name", "description", metadata.description),
    metadata.robots === undefined ? "" : meta("name", "robots", metadata.robots),
    metadata.canonicalUrl === undefined
      ? ""
      : `<link rel="canonical" href="${escape(metadata.canonicalUrl)}">`,
    ...metadata.openGraph.map(([property, content]) => meta("property", property, content)),
    `<meta name="theme-color" content="${escape(metadata.themeColors.light)}" media="(prefers-color-scheme: light)">`,
    `<meta name="theme-color" content="${escape(metadata.themeColors.dark)}" media="(prefers-color-scheme: dark)">`,
    `<link rel="icon" href="${escape(assets.icon)}" type="image/svg+xml">`,
    ...assets.stylesheets.map((href) => `<link rel="stylesheet" href="${escape(href)}">`),
    `<script type="module" src="${escape(assets.moduleScript)}"></script>`,
  ].filter((line) => line !== "");
  return [
    "<!doctype html>",
    '<html lang="en">',
    `<head>${head.join("")}</head>`,
    `<body><${component}></${component}></body>`,
    "</html>",
  ].join("\n");
}

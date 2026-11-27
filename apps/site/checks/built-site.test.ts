import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseHtmlToDocument } from "@stencil/core/mock-doc";
import { describe, expect, it } from "vitest";
import { HEADERS_FILE, styleSource } from "../scripts/security-headers";
import { navigationRoutes, pageFile, prerenderedPages } from "../src/routes";

const WWW = fileURLToPath(new URL("../www", import.meta.url));

function filesIn(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesIn(path) : [relative(WWW, path)];
  });
}

/** Every element of a page, including those in declarative shadow roots. */
function elementsOf(root: ParentNode): Element[] {
  return [...root.querySelectorAll("*")].flatMap((element) =>
    element instanceof Object && element.nodeName === "TEMPLATE"
      ? [element, ...elementsOf((element as HTMLTemplateElement).content)]
      : [element],
  );
}

interface BuiltPage {
  readonly file: string;
  readonly elements: readonly Element[];
  readonly ids: ReadonlySet<string>;
}

function readPage(file: string): BuiltPage {
  const document = parseHtmlToDocument(
    readFileSync(join(WWW, file), "utf8"),
  ) as unknown as Document;
  const elements = elementsOf(document);
  return { file, elements, ids: new Set(elements.map((element) => element.id).filter(Boolean)) };
}

/** The file a root-relative path is served from, as the deployment serves it. */
function servedFile(path: string): string | undefined {
  const file = path.endsWith("/") ? `${path.slice(1)}index.html` : path.slice(1);
  const full = join(WWW, decodeURIComponent(file));
  return existsSync(full) && statSync(full).isFile() ? file : undefined;
}

// Reads the build output, so it needs the site built first (CI builds before it tests).
describe.skipIf(!existsSync(join(WWW, HEADERS_FILE)))("the built site", () => {
  const headers = JSON.parse(readFileSync(join(WWW, HEADERS_FILE), "utf8")) as Record<
    string,
    string
  >;
  const policy = headers["Content-Security-Policy"] ?? "";
  const styleSources = new Set(
    policy
      .split("; ")
      .find((directive) => directive.startsWith("style-src "))
      ?.split(" ")
      .slice(1),
  );
  const htmlFiles = filesIn(WWW).filter((file) => file.endsWith(".html"));
  const pages = new Map(htmlFiles.map((file) => [file, readPage(file)]));
  const home = pages.get("index.html");
  const canonical = home?.elements
    .find((element) => element.localName === "link" && element.getAttribute("rel") === "canonical")
    ?.getAttribute("href");
  const siteOrigin = new URL(canonical ?? "invalid:").origin;

  it("has a file for every live route and a 404 page", () => {
    for (const route of navigationRoutes()) expect(htmlFiles).toContain(pageFile(route.path));
    expect(htmlFiles).toContain("404.html");
  });

  it("has no page that is not in the route table", () => {
    expect(htmlFiles.sort()).toEqual(
      prerenderedPages()
        .map((page) => page.file)
        .sort(),
    );
  });

  it.each(htmlFiles)("%s runs no inline script and every script is the site's own", (file) => {
    const scripts = pages.get(file)?.elements.filter((element) => element.localName === "script");
    expect(scripts?.length).toBeGreaterThan(0);
    for (const script of scripts ?? []) {
      expect(script.textContent.trim()).toBe("");
      expect(servedFile(script.getAttribute("src") ?? "")).toBeDefined();
    }
  });

  it.each(htmlFiles)("%s has no style or event handler attribute", (file) => {
    const found = (pages.get(file)?.elements ?? []).flatMap((element) =>
      [...element.attributes]
        .filter(({ name }) => name === "style" || name.startsWith("on"))
        .map(({ name }) => `${element.localName}[${name}]`),
    );
    expect(found).toEqual([]);
  });

  it.each(htmlFiles)("%s holds only inline styles the policy names by hash", (file) => {
    const styles = pages.get(file)?.elements.filter((element) => element.localName === "style");
    for (const style of styles ?? []) {
      expect(styleSources).toContain(styleSource(style.textContent));
    }
  });

  it.each(htmlFiles)("%s links and loads only what the site has", (file) => {
    const page = pages.get(file);
    const problems: string[] = [];
    for (const element of page?.elements ?? []) {
      for (const name of ["href", "src"]) {
        const value = element.getAttribute(name);
        if (value === null) continue;
        const where = `${element.localName}[${name}="${value}"]`;
        if (value.startsWith("#")) {
          if (!page?.ids.has(value.slice(1))) problems.push(`${where}: no such id`);
          continue;
        }
        const url = new URL(value, `${siteOrigin}/${file}`);
        if (url.origin !== siteOrigin) {
          problems.push(`${where}: another origin`);
          continue;
        }
        // Only the canonical link names the site's own address in full; the rest are root-relative.
        if (/^[a-z]+:/i.test(value) && element.getAttribute("rel") !== "canonical") {
          problems.push(`${where}: absolute`);
        }
        const target = servedFile(url.pathname);
        if (target === undefined) {
          problems.push(`${where}: no such file`);
        } else if (url.hash !== "" && !pages.get(target)?.ids.has(url.hash.slice(1))) {
          problems.push(`${where}: no such id in ${target}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("names only the site's own address in its metadata", () => {
    const contents = [...pages.values()].flatMap((page) =>
      page.elements
        .filter((element) => element.localName === "meta")
        .map((element) => element.getAttribute("content") ?? ""),
    );
    const urls = contents.filter((content) => /^[a-z]+:\/\//i.test(content));
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.filter((url) => new URL(url).origin !== siteOrigin)).toEqual([]);
  });

  it("loads nothing from another origin in its stylesheets", () => {
    const sheets = filesIn(WWW).filter((file) => file.endsWith(".css"));
    expect(sheets.length).toBeGreaterThan(0);
    for (const sheet of sheets) {
      const css = readFileSync(join(WWW, sheet), "utf8");
      expect(css, sheet).not.toMatch(/url\(|@import/);
    }
  });
});

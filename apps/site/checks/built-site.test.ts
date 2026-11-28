import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseHtmlToDocument } from "@stencil/core/mock-doc";
import { beforeAll, describe, expect, it } from "vitest";
import { HEADERS_FILE, styleSource } from "../scripts/security-headers";
import { generatedRoutes } from "../src/reference/generated-routes";
import { livePaths, pageFile, prerenderedPages } from "../src/routes";

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

/**
 * The ids used twice in one tree: the document, or one declarative shadow root, as ids are
 * looked up in the tree that holds them.
 */
function duplicateIds(root: ParentNode): string[] {
  const seen = new Set<string>();
  const twice: string[] = [];
  for (const element of root.querySelectorAll("*")) {
    if (element.id !== "" && element.closest("template") === null) {
      if (seen.has(element.id)) twice.push(element.id);
      seen.add(element.id);
    }
  }
  for (const template of root.querySelectorAll("template")) {
    twice.push(...duplicateIds(template.content));
  }
  return twice;
}

interface BuiltPage {
  readonly file: string;
  readonly elements: readonly Element[];
  readonly ids: ReadonlySet<string>;
  readonly duplicateIds: readonly string[];
}

function readPage(file: string): BuiltPage {
  const document = parseHtmlToDocument(
    readFileSync(join(WWW, file), "utf8"),
  ) as unknown as Document;
  const elements = elementsOf(document);
  return {
    file,
    elements,
    ids: new Set(elements.map((element) => element.id).filter(Boolean)),
    duplicateIds: duplicateIds(document),
  };
}

/** The file a root-relative path is served from, as the deployment serves it. */
function servedFile(path: string): string | undefined {
  const file = path.endsWith("/") ? `${path.slice(1)}index.html` : path.slice(1);
  const full = join(WWW, decodeURIComponent(file));
  return existsSync(full) && statSync(full).isFile() ? file : undefined;
}

const built = existsSync(join(WWW, HEADERS_FILE));

// The pages made from the components package's documentation, as the build wrote them.
const GENERATED = built ? generatedRoutes() : [];
const required = process.env.CI !== undefined && process.env.CI !== "";

describe("the site's build output", () => {
  it.runIf(required)("is there on CI, which builds before it tests", () => {
    expect(built, "CI must build the site before its tests, or they check nothing").toBe(true);
  });
});

// Reads the build output, so it needs the site built first. Vitest runs the body of a skipped
// block to collect its tests, so nothing is read there but the names of the pages, and only from a
// build that is there; the rest is read before the tests run.
describe.skipIf(!built)("the built site", () => {
  const htmlFiles = built ? filesIn(WWW).filter((file) => file.endsWith(".html")) : [];
  let styleSources = new Set<string>();
  let pages = new Map<string, BuiltPage>();
  let siteOrigin = "";

  beforeAll(() => {
    const headers = JSON.parse(readFileSync(join(WWW, HEADERS_FILE), "utf8")) as Record<
      string,
      string
    >;
    const policy = headers["Content-Security-Policy"] ?? "";
    styleSources = new Set(
      policy
        .split("; ")
        .find((directive) => directive.startsWith("style-src "))
        ?.split(" ")
        .slice(1),
    );
    pages = new Map(htmlFiles.map((file) => [file, readPage(file)]));
    const canonical = pages
      .get("index.html")
      ?.elements.find(
        (element) => element.localName === "link" && element.getAttribute("rel") === "canonical",
      )
      ?.getAttribute("href");
    siteOrigin = new URL(canonical ?? "invalid:").origin;
  });

  it("has a file for every live route and a 404 page", () => {
    for (const path of livePaths(GENERATED)) expect(htmlFiles).toContain(pageFile(path));
    expect(htmlFiles).toContain("404.html");
  });

  it("lists every live route in its sitemap by its canonical address, and the sitemap in robots.txt", () => {
    const sitemap = readFileSync(join(WWW, "sitemap.xml"), "utf8");
    const listed = [...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)].map((match) => match[1]);
    expect(listed).toEqual([...livePaths(GENERATED)].map((path) => new URL(path, siteOrigin).href));
    expect(sitemap).not.toContain("404");
    const robots = readFileSync(join(WWW, "robots.txt"), "utf8");
    expect(robots).toContain(`Sitemap: ${siteOrigin}/sitemap.xml\n`);
  });

  it("has no page that is not in the route table", () => {
    expect(htmlFiles.sort()).toEqual(
      prerenderedPages(GENERATED)
        .map((page) => page.file)
        .sort(),
    );
  });

  it.each(htmlFiles)("%s gives no two elements of one tree the same id", (file) => {
    expect(pages.get(file)?.duplicateIds).toEqual([]);
  });

  it.each(htmlFiles)("%s runs no inline script and every script is the site's own", (file) => {
    const scripts = pages.get(file)?.elements.filter((element) => element.localName === "script");
    expect(scripts?.length).toBeGreaterThan(0);
    for (const script of scripts ?? []) {
      expect(script.textContent.trim()).toBe("");
      expect(servedFile(script.getAttribute("src") ?? "")).toBeDefined();
    }
  });

  it.each(htmlFiles)(
    "%s runs the bootstrap script first in the head, blocking and checked by its integrity",
    (file) => {
      const elements = pages.get(file)?.elements ?? [];
      const loading = elements.filter((element) =>
        ["script", "link", "style"].includes(element.localName),
      );
      const bootstrap = loading[0];
      expect(bootstrap?.localName).toBe("script");
      expect(bootstrap?.parentElement?.localName).toBe("head");
      for (const attribute of ["async", "defer", "type"]) {
        expect(bootstrap?.hasAttribute(attribute), attribute).toBe(false);
      }
      const src = bootstrap?.getAttribute("src") ?? "";
      const served = servedFile(src);
      expect(served).toBeDefined();
      const digest = createHash("sha384")
        .update(readFileSync(join(WWW, served ?? "")))
        .digest("base64");
      expect(bootstrap?.getAttribute("integrity")).toBe(`sha384-${digest}`);
    },
  );

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
        // A reading page may link to another site: only an https: link a reader follows, which
        // shares nothing with the page it leaves. Nothing is ever loaded from one.
        const leaves =
          element.localName === "a" &&
          url.protocol === "https:" &&
          element.getAttribute("rel") === "noopener noreferrer";
        if (url.origin !== siteOrigin && leaves) continue;
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

  it("serves nothing that no page needs", () => {
    // What the pages link and load, then every chunk of the client build that one of those names.
    const needed = new Set<string>([HEADERS_FILE, "sitemap.xml", "robots.txt", ...htmlFiles]);
    for (const page of pages.values()) {
      for (const element of page.elements) {
        for (const name of ["href", "src"]) {
          const value = element.getAttribute(name);
          if (value?.startsWith("/") !== true) continue;
          const file = servedFile(new URL(value, siteOrigin).pathname);
          if (file !== undefined) needed.add(file);
        }
      }
    }
    const chunks = filesIn(WWW).filter((file) => file.startsWith("build/"));
    // A lazy component is loaded by its bundle id, with ".entry.js" added at run time; any other
    // chunk is named whole.
    const idOf = (file: string) => {
      const name = file.split("/").pop() ?? "";
      return name.endsWith(".entry.js") ? name.slice(0, -".entry.js".length) : name;
    };
    let grown = true;
    while (grown) {
      grown = false;
      const loaded = [...needed]
        .filter((file) => file.startsWith("build/"))
        .map((file) => readFileSync(join(WWW, file), "utf8"))
        .join("\n");
      for (const chunk of chunks) {
        if (!needed.has(chunk) && loaded.includes(idOf(chunk))) {
          needed.add(chunk);
          grown = true;
        }
      }
    }
    expect(filesIn(WWW).filter((file) => !needed.has(file))).toEqual([]);
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

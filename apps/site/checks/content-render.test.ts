import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { HydrateResults, SerializeDocumentOptions } from "@stencil/core/internal";
import { parseHtmlToDocument } from "@stencil/core/mock-doc";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareServerDocument } from "../scripts/server-document";
import type { ContentPage } from "../src/content/content-page";

interface HydrateModule {
  renderToString(html: string, options: SerializeDocumentOptions): Promise<HydrateResults>;
}

const HYDRATE = fileURLToPath(new URL("../hydrate/index.mjs", import.meta.url));
const built = existsSync(HYDRATE);

/** A page with every kind of block, on the theming guide's route, so it has the docs' navigation. */
const PAGE: ContentPage = {
  slug: "theming",
  title: "Every block <b>once</b>",
  summary: "A summary with <script>alert(1)</script> in it.",
  seo: {},
  body: [
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Plain, " },
        { type: "text", text: "strong", strong: true },
        { type: "text", text: "emphasis", emphasis: true },
        { type: "text", text: "ENV_NAME", code: true },
        { type: "link", href: "/identity/", text: "inside" },
        { type: "link", href: "https://example.com/", text: "outside" },
        { type: "text", text: '<img src="https://evil.example/x.png" onerror="alert(1)">' },
      ],
    },
    { type: "heading", level: 2, text: "First section" },
    { type: "heading", level: 3, text: "A detail" },
    { type: "list", style: "numbered", items: [[{ type: "text", text: "One" }]] },
    { type: "list", style: "bulleted", items: [[{ type: "text", text: "Dot" }]] },
    { type: "code", language: "html", code: "<style>body{display:none}</style>", caption: "Cap" },
    { type: "heading", level: 2, text: "Second section" },
    {
      type: "callout",
      tone: "warning",
      title: "Mind",
      content: [{ type: "text", text: "Careful" }],
    },
    {
      type: "table",
      caption: "Cells",
      columns: ["Name", "Value"],
      rows: [[[{ type: "text", text: "a" }], [{ type: "text", text: "b", code: true }]]],
    },
    { type: "example", name: "theme-tiles", caption: "Tiles" },
  ],
};

/** Every element of a document, including those in declarative shadow roots. */
function elementsOf(root: ParentNode): Element[] {
  return [...root.querySelectorAll("*")].flatMap((element) =>
    element.nodeName === "TEMPLATE"
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

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

async function render(
  page: string,
  navigation = "",
  component = "site-content-page",
): Promise<Document> {
  const hydrate = (await import(pathToFileURL(HYDRATE).href)) as HydrateModule;
  const attributes = `page="${escapeAttribute(page)}" navigation="${escapeAttribute(navigation)}"`;
  const results = await hydrate.renderToString(
    `<!doctype html><html><head></head><body><${component} ${attributes}></${component}></body></html>`,
    {
      url: "https://identgineer.example/docs/theming/",
      serializeShadowRoot: "declarative-shadow-dom",
      prettyHtml: false,
      beforeHydrate: prepareServerDocument,
    },
  );
  const document = parseHtmlToDocument(results.html ?? "") as unknown as Document;
  return document;
}

describe.skipIf(!built)("a reading page, as the prerenderer draws it", () => {
  let document: Document;
  let elements: Element[];
  const all = (selector: string) => [...document.querySelectorAll(selector)];
  const one = (selector: string) => {
    const found = document.querySelector(selector);
    if (!found) throw new Error(`no ${selector}`);
    return found;
  };

  beforeAll(async () => {
    document = await render(JSON.stringify(PAGE));
    elements = elementsOf(document);
  });

  it("has one h1, the title, as text", () => {
    expect(all("h1")).toHaveLength(1);
    expect(one("h1").textContent).toBe("Every block <b>once</b>");
    expect(one(".lede").textContent).toBe("A summary with <script>alert(1)</script> in it.");
  });

  it("draws markup in the content only as text: no element, script, style or image it named", () => {
    expect(elements.filter((element) => element.localName === "b")).toEqual([]);
    expect(elements.filter((element) => element.localName === "img")).toEqual([]);
    expect(elements.some((element) => element.hasAttribute("onerror"))).toBe(false);
    const article = one("article.prose");
    expect(article.querySelectorAll("script, style")).toHaveLength(0);
    expect(article.textContent).toContain('<img src="https://evil.example/x.png"');
    expect(one(".code-sample code").textContent).toBe("<style>body{display:none}</style>");
  });

  it("draws the body in an article, cut into a section for each level 2 heading", () => {
    const article = one("article.prose");
    expect(article.getAttribute("aria-labelledby")).toBe("page-title");
    const sections = [...article.querySelectorAll("section.prose-section")];
    expect(sections.map((section) => section.querySelector("h2")?.textContent)).toEqual([
      "First section",
      "Second section",
    ]);
    expect(sections.map((section) => section.getAttribute("aria-labelledby"))).toEqual([
      "first-section",
      "second-section",
    ]);
    expect(one("h3#a-detail").textContent).toBe("A detail");
    expect(article.querySelector(".prose-intro p")).not.toBeNull();
  });

  it("keeps a run's emphasis, the code innermost", () => {
    const paragraph = one(".prose-intro p");
    expect(paragraph.querySelector("strong")?.textContent).toBe("strong");
    expect(paragraph.querySelector("em")?.textContent).toBe("emphasis");
    const code = paragraph.querySelector("code");
    expect(code?.textContent).toBe("ENV_NAME");
  });

  it.each([
    ["a short name", "data-theme", []],
    ["a query that starts with its mark", "?idg-theme=ember", []],
    ["a path that starts with its slash", "/docs/theming/", []],
    [
      "a custom property's name, between its parts but not after its leading dashes",
      "--idg-border-width",
      ["--idg-", "border-", "width"],
    ],
    ["a long name, between its parts", "@identgineer/components", ["@identgineer/", "components"]],
    [
      "a long setting, between its parts",
      "IDG_CMS_URL=https://cms.example.com/",
      ["IDG_", "CMS_", "URL=", "https://", "cms.", "example.", "com/"],
    ],
    [
      "a long name, inside its camelCase",
      "createIdentityClientFromEnvironment",
      ["create", "Identity", "Client", "From", "Environment"],
    ],
  ])("gives %s places to wrap only where it is long", async (_, name, parts) => {
    const drawn = await render(
      JSON.stringify({
        ...PAGE,
        body: [{ type: "paragraph", content: [{ type: "text", text: name, code: true }] }],
      }),
    );
    const code = drawn.querySelector(".prose-intro p code");
    expect(code?.textContent).toBe(name);
    // The text between the places to wrap, its other nodes (the renderer's comments) left out.
    const pieces = [""];
    for (const node of code?.childNodes ?? []) {
      if (node.nodeName === "WBR") pieces.push("");
      else if (node.nodeType === 3) pieces.push(`${pieces.pop() ?? ""}${node.textContent ?? ""}`);
    }
    expect(pieces.length === 1 ? [] : pieces).toEqual(parts);
  });

  it("links inside the site plainly, and outside it with noopener noreferrer", () => {
    const links = [...one(".prose-intro p").querySelectorAll("a")];
    expect(links.map((link) => [link.getAttribute("href"), link.getAttribute("rel")])).toEqual([
      ["/identity/", null],
      ["https://example.com/", "noopener noreferrer"],
    ]);
  });

  it("draws lists as ol and ul", () => {
    expect(one("ol.prose-list li").textContent).toBe("One");
    expect(one("ul.prose-list li").textContent).toBe("Dot");
  });

  it("draws a code sample as a figure: its language, its caption, a copy button and the code", () => {
    const figure = one("figure.code-sample");
    expect(figure.querySelector(".code-language")?.textContent).toBe("HTML");
    expect(figure.querySelector(".code-caption")?.textContent).toBe("Cap");
    const copy = figure.querySelector("idg-button.code-copy");
    expect(copy?.classList.contains("needs-script")).toBe(true);
    expect(copy?.textContent).toContain("Copy the Cap sample");
    expect(figure.querySelector("pre")?.getAttribute("tabindex")).toBe("0");
    // Plain text: no highlighter's spans.
    expect(figure.querySelectorAll("pre span")).toHaveLength(0);
  });

  it("draws a callout as a quiet alert of its tone, with its title", () => {
    const callout = one("idg-alert.callout");
    expect(callout.getAttribute("variant")).toBe("warning");
    expect(callout.hasAttribute("quiet")).toBe(true);
    expect(callout.querySelector('[slot="title"]')?.textContent).toBe("Mind");
  });

  it("draws a table with its caption and column headers, in a region that scrolls", () => {
    const region = one(".table-scroll");
    expect(region.getAttribute("role")).toBe("region");
    expect(region.getAttribute("tabindex")).toBe("0");
    const caption = region.querySelector("caption");
    expect(caption?.textContent).toBe("Cells");
    expect(region.getAttribute("aria-labelledby")).toBe(caption?.id);
    expect([...region.querySelectorAll("th")].map((th) => th.getAttribute("scope"))).toEqual([
      "col",
      "col",
    ]);
    expect(region.querySelector("td code")?.textContent).toBe("b");
  });

  it("draws a live example from the registry, in a figure with its caption", () => {
    const figure = one("figure.example-theme-tiles");
    expect(figure.querySelector("figcaption")?.textContent).toBe("Tiles");
    expect(figure.querySelector(".themes-room")).not.toBeNull();
  });

  it.each([
    ["in the shell's aside, as the home page's", 'nav.contents[slot="aside"]'],
    ["beside the article, for the layouts that draw no aside", "nav.contents-inline"],
  ])("lists the headings in a table of contents %s, level 3 under level 2", (_, selector) => {
    const contents = one(selector);
    const top = [...contents.querySelectorAll("a")].filter(
      (link) => link.parentElement?.parentElement?.parentElement === contents,
    );
    expect(top.map((link) => link.getAttribute("href"))).toEqual([
      "#first-section",
      "#second-section",
    ]);
    expect(contents.querySelector("ul ul a")?.getAttribute("href")).toBe("#a-detail");
  });

  it("names each table of contents by its visible heading or label", () => {
    expect(one('nav.contents[slot="aside"]').getAttribute("aria-labelledby")).toBe(
      "contents-title",
    );
    expect(one("nav.contents-inline").getAttribute("aria-label")).toBe("On this page");
    expect(one(".reading-body").classList.contains("with-section")).toBe(true);
  });

  it("marks the page in the docs' own navigation, and links the pages before and after", () => {
    const current = all('nav.docs-pages a[aria-current="page"]');
    expect(current.map((link) => link.getAttribute("href"))).toEqual(["/docs/theming/"]);
    expect(one("nav.docs-pages a").textContent).toBe("Overview");
    expect(all("nav.pager a").map((link) => link.getAttribute("rel"))).toEqual(["prev", "next"]);
  });

  it("marks the docs as the current section in the site's navigation", () => {
    const docs = all('a[slot="navigation"][href="/docs/"]');
    expect(docs.map((link) => link.getAttribute("aria-current"))).toEqual(["true"]);
  });

  it("takes the navigation's labels from the CMS, checked again, and keeps the rest", async () => {
    const labelled = await render(
      JSON.stringify(PAGE),
      JSON.stringify({
        header: { "/tracking/": "Analytics", "/nowhere/": "Lost" },
        footer: { "/docs/": "Read the docs" },
      }),
    );
    const label = (selector: string) => labelled.querySelector(selector)?.textContent;
    expect(label('a[slot="navigation"][href="/tracking/"]')).toBe("Analytics");
    expect(label('.site-footer-pages a[href="/tracking/"]')).toBe("Tracking");
    expect(label('.site-footer-pages a[href="/docs/"]')).toBe("Read the docs");
    expect(labelled.querySelector('a[href="/nowhere/"]')).toBeNull();
  });

  it("gives no two elements of one tree the same id", () => {
    expect(duplicateIds(document)).toEqual([]);
  });

  it.each(["Table 2", "table_2", "Table_2"])(
    "gives a heading named %j an id apart from the table's caption",
    async (text) => {
      const table = PAGE.body.find((block) => block.type === "table");
      const named = await render(
        JSON.stringify({ ...PAGE, body: [{ type: "heading", level: 2, text }, table] }),
      );
      expect(named.querySelector(".prose-section > h2")?.id).toBe("table-2");
      expect(named.querySelector("caption")?.id).toBe("table_2");
      expect(duplicateIds(named)).toEqual([]);
    },
  );

  it.each([
    ["is not JSON", "{"],
    ["is not valid", JSON.stringify({ ...PAGE, body: [{ type: "html", html: "<p>x</p>" }] })],
    ["has no route", JSON.stringify({ ...PAGE, slug: "nowhere" })],
  ])("says the page could not be shown when its content %s", async (_, page) => {
    const refused = await render(page);
    expect(refused.querySelector("h1")?.textContent).toBe("This page could not be shown");
    expect(refused.querySelector("article")).toBeNull();
  });
});

describe.skipIf(!built)("every page, as the prerenderer draws it", () => {
  it.each(["site-home", "site-not-found", "site-content-page"])(
    "%s takes the navigation's labels from the CMS",
    async (component) => {
      const navigation = JSON.stringify({ header: { "/tracking/": "Analytics" }, footer: {} });
      const document = await render(JSON.stringify(PAGE), navigation, component);
      const label = document.querySelector('a[slot="navigation"][href="/tracking/"]')?.textContent;
      expect(label).toBe("Analytics");
    },
  );
});

import { describe, expect, it, vi } from "vitest";
import type { ContentPage } from "../src/content/content-page.ts";
import { STATIC_PAGES } from "../src/content/pages/index.ts";
import { CMS_LIMITS, cmsBaseUrl, resolveSiteContent } from "./cms-content.ts";

const BASE = "https://cms.example.com/";

function staticPage(slug: string): ContentPage {
  const page = STATIC_PAGES.find((candidate) => candidate.slug === slug);
  if (!page) throw new Error(`no static page ${slug}`);
  return page;
}

/** A published Page record as Strapi 5 and strapi-php answer it, with its SEO populated. */
function record(slug: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 7,
    documentId: `doc-${slug}`,
    title: "Edited in the CMS",
    slug,
    summary: "A summary written in the CMS.",
    body: [
      { type: "heading", level: 2, children: [{ type: "text", text: "First" }] },
      { type: "paragraph", children: [{ type: "text", text: "From the CMS." }] },
      { type: "heading", level: 2, children: [{ type: "text", text: "Second" }] },
      {
        type: "paragraph",
        children: [{ type: "link", url: "/docs/", children: [{ type: "text", text: "The docs" }] }],
      },
    ],
    seo: { id: 3, metaTitle: "CMS title", metaDescription: null, noIndex: false },
    createdAt: "2026-11-01T10:00:00.000Z",
    updatedAt: "2026-11-02T10:00:00.000Z",
    publishedAt: "2026-11-02T10:00:00.000Z",
    ...overrides,
  };
}

function page(data: unknown[], pageCount = 1, current = 1) {
  return {
    data,
    meta: { pagination: { page: current, pageSize: 25, pageCount, total: data.length } },
  };
}

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
    ...init,
  });
}

interface FakeCms {
  readonly pages?: (signal: AbortSignal) => Response | Promise<Response>;
  readonly navigation?: (signal: AbortSignal) => Response | Promise<Response>;
}

/** A fetch that answers the two collections and records every request it was given. */
function fakeFetch(cms: FakeCms) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);
    expect(init?.redirect).toBe("error");
    expect(init?.credentials).toBe("omit");
    const signal = init?.signal ?? new AbortController().signal;
    if (url.pathname === "/api/pages") {
      return Promise.resolve(cms.pages?.(signal) ?? json(page([])));
    }
    if (url.pathname === "/api/navigation-items") {
      return Promise.resolve(cms.navigation?.(signal) ?? json(page([])));
    }
    return Promise.resolve(new Response("not found", { status: 404 }));
  });
}

async function resolve(cms: FakeCms, ...given: [url?: string | undefined]) {
  const url = given.length === 0 ? BASE : given[0];
  const fetch = fakeFetch(cms);
  const content = await resolveSiteContent({
    url,
    fetch,
    timeoutMs: 200,
    staticPages: STATIC_PAGES,
  });
  return { ...content, fetch };
}

describe("the CMS address", () => {
  it.each([
    ["https://cms.example.com", "https://cms.example.com/"],
    ["https://example.com/cms/", "https://example.com/cms/"],
    ["https://example.com/cms", "https://example.com/cms/"],
    ["http://localhost:1337", "http://localhost:1337/"],
    ["http://127.0.0.1:8000/", "http://127.0.0.1:8000/"],
    ["http://[::1]:8000", "http://[::1]:8000/"],
  ])("%s is read as %s", (given, base) => {
    expect(cmsBaseUrl(given)).toEqual({ ok: true, url: new URL(base) });
  });

  it.each([
    ["http://cms.example.com", /https: is required/],
    ["ftp://cms.example.com", /https: is required/],
    ["https://user:secret@cms.example.com", /credentials/],
    ["https://cms.example.com/?draft=1", /query or a fragment/],
    ["https://cms.example.com/#x", /query or a fragment/],
    ["not a url", /is not an address/],
  ])("%s is refused", (given, reason) => {
    const result = cmsBaseUrl(given);
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.reason).toMatch(reason);
  });
});

describe("the site's content", () => {
  it("is the repository's, with no request at all, when no CMS is set", async () => {
    const { pages, labels, warnings, fetch } = await resolve({}, undefined);
    expect(fetch).not.toHaveBeenCalled();
    expect([...pages.values()]).toEqual(STATIC_PAGES);
    expect(labels).toEqual({ header: {}, footer: {} });
    expect(warnings).toEqual([]);
  });

  it("is the repository's when the setting is empty", async () => {
    const { fetch } = await resolve({}, "");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("asks only for published pages and their SEO fields, without credentials or redirects", async () => {
    const { fetch } = await resolve({});
    const urls = fetch.mock.calls.map(([input]) => new URL(input as string));
    const pages = urls.find((url) => url.pathname === "/api/pages");
    expect(pages?.searchParams.get("status")).toBe("published");
    expect(pages?.searchParams.get("populate[seo]")).toBe("true");
    expect(pages?.searchParams.get("pagination[pageSize]")).toBe(String(CMS_LIMITS.pageSize));
    for (const [, init] of fetch.mock.calls) {
      expect(init?.method).toBe("GET");
      expect(new Headers(init?.headers).get("authorization")).toBeNull();
    }
  });

  it("takes a published page from the CMS in place of the static copy of the same slug", async () => {
    const { pages, warnings } = await resolve({ pages: () => json(page([record("identity")])) });
    const identity = pages.get("identity");
    expect(identity?.title).toBe("Edited in the CMS");
    expect(identity?.seo).toEqual({ metaTitle: "CMS title", noIndex: false });
    expect(identity?.body[1]).toEqual({
      type: "paragraph",
      content: [{ type: "text", text: "From the CMS." }],
    });
    expect(pages.get("tracking")).toBe(staticPage("tracking"));
    expect(warnings).toContain('CMS: no published page "tracking"; the static copy is used');
    expect(warnings.some((warning) => warning.includes('"identity"'))).toBe(false);
  });

  it("keeps markup in the CMS's text as text", async () => {
    const hostile = record("identity", {
      title: '<img src=x onerror="alert(1)">',
      body: [
        {
          type: "paragraph",
          children: [{ type: "text", text: "<script>alert(1)</script><style>*{}</style>" }],
        },
        { type: "heading", level: 2, children: [{ type: "text", text: "Two" }] },
        { type: "heading", level: 2, children: [{ type: "text", text: "Three" }] },
      ],
    });
    const { pages } = await resolve({ pages: () => json(page([hostile])) });
    expect(pages.get("identity")?.title).toBe('<img src=x onerror="alert(1)">');
    expect(pages.get("identity")?.body[0]).toEqual({
      type: "paragraph",
      content: [{ type: "text", text: "<script>alert(1)</script><style>*{}</style>" }],
    });
  });

  it.each([
    [
      "a javascript: link",
      {
        body: [
          {
            type: "paragraph",
            children: [
              { type: "link", url: "javascript:alert(1)", children: [{ type: "text", text: "x" }] },
            ],
          },
        ],
      },
      /block 1 \(paragraph\): content\[0\]\.href: "javascript:alert\(1\)" is not a path of the site/,
    ],
    [
      "an unknown block",
      { body: [{ type: "embed", html: "<iframe>" }] },
      /block 1: "embed" is not a block of Strapi's rich text/,
    ],
    [
      "an image",
      { body: [{ type: "image", image: { url: "https://cdn.example/x.png" }, children: [] }] },
      /block 1 \(image\): images are not drawn/,
    ],
    [
      "a huge body",
      {
        body: Array.from({ length: 300 }, () => ({
          type: "paragraph",
          children: [{ type: "text", text: "x" }],
        })),
      },
      /body: must hold at most 200 blocks/,
    ],
    ["no summary", { summary: null }, /summary: is required/],
  ])(
    "falls back to the static copy, with a warning, for a page with %s",
    async (_, change, why) => {
      const { pages, warnings } = await resolve({
        pages: () => json(page([record("identity", change)])),
      });
      expect(pages.get("identity")).toBe(staticPage("identity"));
      const warning = warnings.find((line) => line.includes('"identity"'));
      expect(warning).toMatch(/^CMS: page "identity" is not valid \(/);
      expect(warning).toMatch(why);
      expect(warning).toMatch(/; the static copy is used$/);
    },
  );

  it("never takes a draft, even one the API should not have answered", async () => {
    const draft = record("identity", { publishedAt: null, title: "Unpublished" });
    const { pages, warnings } = await resolve({ pages: () => json(page([draft])) });
    expect(pages.get("identity")).toBe(staticPage("identity"));
    expect(warnings).toContain('CMS: page "identity" is not published; it is left out');
  });

  it("adds no page the route table does not have", async () => {
    const { pages, warnings } = await resolve({ pages: () => json(page([record("pricing")])) });
    expect(pages.has("pricing")).toBe(false);
    expect(warnings).toContain('CMS: page "pricing" is no page of the site; it is left out');
  });

  describe("is the repository's, with a warning that says why, when the CMS", () => {
    it.each([
      ["answers 404", () => new Response("Not Found", { status: 404 }), /answered 404/],
      ["answers 500", () => new Response("Oops", { status: 500 }), /answered 500/],
      ["answers 503", () => new Response("", { status: 503 }), /answered 503/],
      [
        "answers HTML",
        () => new Response("<html></html>", { headers: { "content-type": "text/html" } }),
        /answered text\/html, not JSON/,
      ],
      [
        "answers something that is not JSON",
        () => new Response("{", { headers: { "content-type": "application/json" } }),
        /answered something that is not JSON/,
      ],
      [
        "answers JSON of another shape",
        () => json({ pages: [] }),
        /answered something that is not a page of records/,
      ],
      [
        "redirects",
        () =>
          new Response(null, { status: 302, headers: { location: "https://evil.example/api" } }),
        /answered 302/,
      ],
      [
        "answers more than the read takes, as it says up front",
        () =>
          new Response("{}", {
            headers: {
              "content-type": "application/json",
              "content-length": String(CMS_LIMITS.answerBytes + 1),
            },
          }),
        /answered more than 1048576 bytes/,
      ],
      [
        "answers more than the read takes, without saying",
        () =>
          json(
            { data: [], padding: "x".repeat(CMS_LIMITS.answerBytes) },
            {
              headers: { "content-type": "application/json" },
            },
          ),
        /answered more than 1048576 bytes/,
      ],
    ])("%s", async (_, answer, why) => {
      const { pages, warnings } = await resolve({ pages: answer });
      expect([...pages.values()]).toEqual(STATIC_PAGES);
      expect(warnings[0]).toMatch(/^CMS: pages could not be read \(/);
      expect(warnings[0]).toMatch(why);
      expect(warnings[0]).toMatch(/\); the static copy of every page is used$/);
    });

    it("cannot be reached", async () => {
      const { pages, warnings } = await resolve({
        pages: () => Promise.reject(new TypeError("fetch failed")),
      });
      expect([...pages.values()]).toEqual(STATIC_PAGES);
      expect(warnings[0]).toMatch(/could not be reached/);
    });

    it("answers a redirect to another origin as a real fetch reports it", async () => {
      const redirected = json(page([record("identity")]));
      Object.defineProperty(redirected, "redirected", { value: true });
      Object.defineProperty(redirected, "url", { value: "https://evil.example/api/pages" });
      const { pages, warnings } = await resolve({ pages: () => redirected });
      expect(pages.get("identity")).toBe(staticPage("identity"));
      expect(warnings[0]).toMatch(/was redirected/);
    });

    it("does not answer in time", async () => {
      const { warnings } = await resolve({
        // As fetch does, it gives up when the signal is aborted, and not before.
        pages: (signal) =>
          new Promise<Response>((_, reject) => {
            signal.addEventListener("abort", () => {
              reject(signal.reason as Error);
            });
          }),
      });
      expect(warnings[0]).toMatch(/did not answer within 200 ms/);
    });

    it("is not https:", async () => {
      const { fetch, warnings } = await resolve({}, "http://cms.example.com");
      expect(fetch).not.toHaveBeenCalled();
      expect(warnings).toEqual([
        "CMS: IDG_CMS_URL is not used (https: is required, or http: on localhost); the static copy of every page is used",
      ]);
    });
  });

  it("reads page after page, no further than the bound", async () => {
    const pageOf = vi.fn((current: number) => json(page([], 99, current)));
    let calls = 0;
    const { warnings } = await resolve({ pages: () => pageOf(++calls) });
    expect(calls).toBe(CMS_LIMITS.pages);
    expect(warnings).toContain(
      `CMS: pages has more than ${String(CMS_LIMITS.pages)} pages of records; the rest are not read`,
    );
  });

  describe("navigation", () => {
    const item = (fields: Record<string, unknown>) => ({
      id: 1,
      documentId: "n",
      order: 0,
      placement: "header",
      ...fields,
    });

    it("takes a CMS label for a page of the site's navigation, in its place", async () => {
      const { labels } = await resolve({
        navigation: () =>
          json(
            page([
              item({ label: "Sign-in", href: "/identity/" }),
              item({ label: "Guides", href: "/docs/", placement: "footer" }),
            ]),
          ),
      });
      expect(labels).toEqual({
        header: { "/identity/": "Sign-in" },
        footer: { "/docs/": "Guides" },
      });
    });

    it("adds no link, and keeps no label with markup or controls in it", async () => {
      const { labels, warnings } = await resolve({
        navigation: () =>
          json(
            page([
              item({ label: "Elsewhere", href: "https://evil.example/" }),
              item({ label: "Script", href: "javascript:alert(1)" }),
              item({ label: "Gallery", href: "/variations/" }),
              item({ label: "Bad\u202eone", href: "/tracking/" }),
            ]),
          ),
      });
      expect(labels).toEqual({ header: {}, footer: {} });
      expect(warnings).toEqual(
        expect.arrayContaining([
          expect.stringMatching(
            /navigation item 1 is not valid \(href: "https:\/\/evil\.example\/" is not a page of the site's navigation\)/,
          ),
          expect.stringMatching(/navigation item 2 is not valid/),
          expect.stringMatching(/navigation item 3 is not valid/),
          expect.stringMatching(/navigation item 4 is not valid \(label: holds a control/),
        ]),
      );
    });

    it("keeps the route table's labels when the items cannot be read", async () => {
      const { labels, warnings } = await resolve({
        navigation: () => new Response("", { status: 500 }),
      });
      expect(labels).toEqual({ header: {}, footer: {} });
      expect(warnings).toContain(
        "CMS: navigation items could not be read (the CMS answered 500); the route table's labels are used",
      );
    });
  });
});

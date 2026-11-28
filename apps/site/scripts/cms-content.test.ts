import { describe, expect, it, vi } from "vitest";
import type { ContentPage } from "../src/content/content-page.ts";
import { STATIC_PAGES } from "../src/content/pages/index.ts";
import { ROUTES } from "../src/routes.ts";
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

/**
 * JSON text for any value, however deep: JSON.stringify recurses and would give up on the very
 * answers these tests send, so this writes it with a stack of its own.
 */
function stringify(root: unknown): string {
  const out: string[] = [];
  const stack: unknown[] = [root];
  const CLOSE = Symbol("close");
  while (stack.length > 0) {
    const item = stack.pop();
    if (typeof item === "object" && item !== null && CLOSE in item) {
      out.push((item as { [CLOSE]: string })[CLOSE]);
    } else if (Array.isArray(item)) {
      out.push("[");
      stack.push({ [CLOSE]: "]" });
      for (let index = item.length - 1; index >= 0; index -= 1) {
        stack.push(item[index] ?? null);
        if (index > 0) stack.push({ [CLOSE]: "," });
      }
    } else if (typeof item === "object" && item !== null) {
      const entries = Object.entries(item) as [string, unknown][];
      out.push("{");
      stack.push({ [CLOSE]: "}" });
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const [key, value] = entries[index] ?? ["", null];
        stack.push(value);
        stack.push({ [CLOSE]: `${JSON.stringify(key)}:` });
        if (index > 0) stack.push({ [CLOSE]: "," });
      }
    } else {
      out.push(item === undefined ? "null" : JSON.stringify(item));
    }
  }
  return out.join("");
}

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(stringify(body), {
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
    ["a summary that is not text", { summary: 5 }, /summary: must be text/],
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

  describe("never fails the build, whatever the CMS sends", () => {
    function deepLinks(depth: number): Record<string, unknown> {
      let node: Record<string, unknown> = { type: "text", text: "x" };
      for (let level = 0; level < depth; level += 1) {
        node = { type: "link", url: "/docs/", children: [node] };
      }
      return node;
    }

    it("falls back for a body of links nested thousands deep", async () => {
      const body = [{ type: "paragraph", children: [deepLinks(5000)] }];
      const { pages, warnings } = await resolve({
        pages: () => json(page([record("identity", { body })])),
      });
      expect(pages.get("identity")).toBe(staticPage("identity"));
      expect(warnings[0]).toMatch(
        /^CMS: page "identity" is not valid \(.*a link inside a link is not drawn\); the static copy is used$/,
      );
    });

    it("falls back for values nested thousands deep in any field", async () => {
      let deep: unknown = "x";
      for (let level = 0; level < 100_000; level += 1) deep = [deep];
      const { pages } = await resolve({
        pages: () =>
          json(
            page([
              record("identity", { title: deep }),
              record("tracking", { seo: { metaTitle: deep } }),
              record("features", { body: [{ type: "heading", level: deep, children: [] }] }),
            ]),
          ),
        navigation: () => json(page([{ label: deep, href: deep, placement: deep, order: deep }])),
      });
      expect(pages.get("identity")).toBe(staticPage("identity"));
      expect(pages.get("tracking")).toBe(staticPage("tracking"));
      expect(pages.get("features")).toBe(staticPage("features"));
    });

    /** A small seeded generator, so a failure names the seed that found it. */
    function random(seed: number): () => number {
      let state = seed >>> 0;
      return () => {
        state = (state * 1_664_525 + 1_013_904_223) >>> 0;
        return state / 2 ** 32;
      };
    }

    const NASTY_STRINGS = [
      "",
      " ",
      "\u0000",
      "\u009b31m",
      "‮",
      "\ud800",
      "__proto__",
      "constructor",
      "javascript:alert(1)",
      "/docs",
      "//evil.example/",
      "<script>alert(1)</script>",
      "identity",
      "heading",
      "paragraph",
      "link",
      "list",
      "list-item",
      "quote",
      "code",
      "image",
      "text",
      "x".repeat(5000),
    ];

    function value(next: () => number, depth: number): unknown {
      const roll = next();
      if (depth <= 0 || roll < 0.3) {
        const pick = Math.floor(next() * 8);
        if (pick === 0) return null;
        if (pick === 1) return next() < 0.5;
        if (pick === 2) return Math.floor(next() * 10) - 2;
        if (pick === 3) return next() * 1e308 * (next() < 0.5 ? -1 : 1);
        return NASTY_STRINGS[Math.floor(next() * NASTY_STRINGS.length)];
      }
      if (roll < 0.6) {
        return Array.from({ length: Math.floor(next() * 4) }, () => value(next, depth - 1));
      }
      const keys = ["type", "children", "text", "url", "level", "format", "language", "slug"];
      const object: Record<string, unknown> = {};
      for (let count = Math.floor(next() * 5); count > 0; count -= 1) {
        const key =
          next() < 0.8
            ? (keys[Math.floor(next() * keys.length)] ?? "type")
            : (NASTY_STRINGS[Math.floor(next() * NASTY_STRINGS.length)] ?? "");
        object[key] = value(next, depth - 1);
      }
      return object;
    }

    function chain(next: () => number): unknown {
      // A long chain of one shape, as an attacker would send to exhaust a recursion.
      const shapes = [
        (inner: unknown) => [inner],
        (inner: unknown) => ({ type: "link", url: "/docs/", children: [inner] }),
        (inner: unknown) => ({ type: "paragraph", children: [inner] }),
        (inner: unknown) => ({ children: inner }),
      ];
      const shape = shapes[Math.floor(next() * shapes.length)] ?? shapes[0];
      let node: unknown = { type: "text", text: "x" };
      for (let level = 0; level < 20_000; level += 1) node = shape?.(node);
      return node;
    }

    it("never throws for random and adversarial answers", async () => {
      for (let seed = 1; seed <= 150; seed += 1) {
        const next = random(seed);
        const records = Array.from({ length: 1 + Math.floor(next() * 3) }, () => {
          const base = record(next() < 0.5 ? "identity" : String(value(next, 1)));
          const changed: Record<string, unknown> = { ...base };
          for (const key of ["title", "summary", "body", "seo", "slug", "publishedAt"]) {
            if (next() < 0.4) changed[key] = next() < 0.2 ? chain(next) : value(next, 6);
          }
          if (next() < 0.25) {
            changed.body = [{ type: "paragraph", children: [chain(next)] }];
          } else if (next() < 0.5) {
            changed.body = Array.from({ length: 1 + Math.floor(next() * 4) }, () =>
              next() < 0.1 ? chain(next) : value(next, 6),
            );
          }
          return next() < 0.1 ? value(next, 4) : changed;
        });
        const answer = next() < 0.8 ? page(records) : value(next, 5);
        const navigation = next() < 0.5 ? page([value(next, 4), chain(next)]) : value(next, 5);
        await expect(
          resolve({ pages: () => json(answer), navigation: () => json(navigation) }),
          `seed ${String(seed)}`,
        ).resolves.toBeDefined();
      }
    });

    it("never throws when a record's fields throw as they are read", async () => {
      const fetcher = vi.fn(() => {
        const hostile = new Proxy(
          {},
          {
            get() {
              throw new Error("boom");
            },
            ownKeys() {
              throw new Error("boom");
            },
          },
        );
        const response = json(page([]));
        Object.defineProperty(response, "json", { value: () => Promise.resolve(hostile) });
        return Promise.resolve(response);
      });
      await expect(
        resolveSiteContent({ url: BASE, fetch: fetcher, staticPages: STATIC_PAGES }),
      ).resolves.toBeDefined();
    });
  });

  describe("names what it refuses short, in printable ASCII, and never prints the setting", () => {
    const printable = (line: string) => {
      expect(line.length, line.slice(0, 80)).toBeLessThan(400);
      expect(line).toMatch(/^[\x20-\x7e]+$/);
    };

    it("for a slug of any length or character", async () => {
      const { warnings } = await resolve({
        pages: () =>
          json(
            page([
              record("a".repeat(100_000)),
              record("x\u009b31m‮"),
              record("identity", { body: [{ type: `x\u009b${"y".repeat(100_000)}` }] }),
              record("tracking", { [`k‮${"k".repeat(100_000)}`]: 1 }),
            ]),
          ),
        navigation: () =>
          json(
            page([
              {
                label: "x",
                href: "/docs/",
                placement: "header",
                order: 0,
                ["z".repeat(100_000)]: 1,
              },
            ]),
          ),
      });
      expect(warnings.length).toBeGreaterThan(3);
      for (const warning of warnings) printable(warning);
      expect(warnings).toContain("CMS: record 1 is no page of the site; it is left out");
      expect(warnings).toContain("CMS: record 2 is no page of the site; it is left out");
    });

    it("for a content type of any length", async () => {
      const { warnings } = await resolve({
        pages: () =>
          new Response("{}", { headers: { "content-type": `text/\u009b${"x".repeat(10_000)}` } }),
      });
      for (const warning of warnings) printable(warning);
    });

    it.each([
      "https://cms example/?token=SECRET",
      "https://user:SECRET@cms.example.com/",
      "https://cms.example.com/?token=SECRET",
      "http://cms.example.com/SECRET",
    ])("for an IDG_CMS_URL it does not use, %s", async (url) => {
      const { warnings } = await resolve({}, url);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).not.toContain("SECRET");
      expect(warnings[0]).toMatch(/^CMS: IDG_CMS_URL is not used \(/);
    });
  });

  it("reports a body that stops coming as a timeout, not as something that is not JSON", async () => {
    const { warnings } = await resolve({
      pages: (signal) =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('{"data":['));
              signal.addEventListener("abort", () => {
                controller.error(signal.reason);
              });
            },
          }),
          { headers: { "content-type": "application/json" } },
        ),
    });
    expect(warnings[0]).toMatch(/did not answer within 200 ms/);
  });

  it("stops reading a body that ignores the deadline, and lets its connection go", async () => {
    // Node's fetch can leave a read of a body pending after the abort, which kept the build
    // waiting for the socket's own timeout of five minutes.
    let cancelled = false;
    const { warnings } = await resolve({
      pages: () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('{"data":['));
            },
            cancel() {
              cancelled = true;
            },
          }),
          { headers: { "content-type": "application/json" } },
        ),
    });
    expect(warnings[0]).toMatch(/did not answer within 200 ms/);
    expect(cancelled).toBe(true);
  }, 2_000);

  describe("takes what an editor may write in the CMS", () => {
    it("with no summary, giving the page the route's description", async () => {
      const { pages, warnings } = await resolve({
        pages: () => json(page([record("identity", { summary: null })])),
      });
      const route = ROUTES.find((candidate) => candidate.path === "/identity/");
      expect(pages.get("identity")?.title).toBe("Edited in the CMS");
      expect(pages.get("identity")?.summary).toBe(route?.description);
      expect(warnings.some((warning) => warning.includes('"identity"'))).toBe(false);
    });

    it("with a heading 1, or any level, made a level the page can hold in order", async () => {
      const heading = (level: number, text: string) => ({
        type: "heading",
        level,
        children: [{ type: "text", text }],
      });
      const body = [
        heading(1, "One"),
        heading(4, "Four"),
        heading(6, "Six"),
        heading(2, "Two"),
        heading(3, "Three"),
      ];
      const { pages } = await resolve({
        pages: () => json(page([record("identity", { body })])),
      });
      expect(pages.get("identity")?.body).toEqual([
        { type: "heading", level: 2, text: "One" },
        { type: "heading", level: 3, text: "Four" },
        { type: "heading", level: 4, text: "Six" },
        { type: "heading", level: 2, text: "Two" },
        { type: "heading", level: 3, text: "Three" },
      ]);
    });

    it("with a link to a page without its last slash", async () => {
      const body = [
        {
          type: "paragraph",
          children: [{ type: "link", url: "/identity", children: [{ type: "text", text: "x" }] }],
        },
      ];
      const { pages } = await resolve({
        pages: () => json(page([record("tracking", { body })])),
        navigation: () =>
          json(page([{ label: "Accounts", href: "/identity", placement: "header", order: 0 }])),
      });
      expect(pages.get("tracking")?.body[0]).toEqual({
        type: "paragraph",
        content: [{ type: "link", href: "/identity/", text: "x" }],
      });
    });

    it("with two items for one page: the lower order wins, and the other is named", async () => {
      const item = (label: string, order: number) => ({
        label,
        href: "/identity/",
        placement: "header",
        order,
      });
      const { labels, warnings } = await resolve({
        navigation: () => json(page([item("Later", 5), item("First", 1), item("Tie", 1)])),
      });
      expect(labels.header).toEqual({ "/identity/": "First" });
      expect(warnings).toEqual(
        expect.arrayContaining([
          "CMS: navigation item 1 is another header label for /identity/ (order 5, after item 2's 1); it is left out",
          "CMS: navigation item 3 is another header label for /identity/ (order 1, after item 2's 1); it is left out",
        ]),
      );
    });
  });
});

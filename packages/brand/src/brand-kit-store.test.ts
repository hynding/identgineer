import { describe, expect, it } from "vitest";
import type { BrandKit } from "./brand-kit.ts";
import { BrandKitStoreError } from "./brand-kit-store-error.ts";
import { createBrandKitStore, MAX_RECORD_BYTES, MAX_SUMMARY_BYTES } from "./brand-kit-store.ts";
import { brandKitToCms } from "./cms-brand-kit.ts";
import { sanitiseSvgLogo } from "./sanitise-svg-logo.ts";
import { kitFrom } from "./test-support.ts";

const BASE = "https://cms.example.com";
const KITS = `${BASE}/api/brand-kits`;
const DOCUMENT_ID = "pjx5ucx7febfca6f8rtjrxga";
const SECRET = "body-text-that-must-not-leak";
/** What a list asks the CMS for: every field but the logo and mark. */
const SUMMARY_FIELDS = [
  "brandId",
  "name",
  "tagline",
  "primaryColor",
  "secondaryColor",
  "neutralTint",
  "typography",
  "corners",
  "tone",
  "isPublic",
];
const UNSANITISED_LOGO =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 1" onload="steal()"><rect width="2" height="1"/></svg>';

interface Sent {
  readonly url: string;
  readonly init: RequestInit;
}

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

const fakeFetch = (handler: Handler) => {
  const sent: Sent[] = [];
  const fetch = async (input: string, init: RequestInit): Promise<Response> => {
    sent.push({ url: input, init });
    return handler(input, init);
  };
  return { fetch, sent };
};

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });

const rowOf = (kit: BrandKit, extra: Record<string, unknown> = {}) => ({
  id: 1,
  documentId: DOCUMENT_ID,
  ...brandKitToCms(kit),
  isPublic: false,
  createdAt: "2026-11-25T02:17:45.897Z",
  updatedAt: "2026-11-25T02:17:45.897Z",
  publishedAt: "2026-11-25T02:17:45.897Z",
  ...extra,
});

/** A kit as a list answers it: without its logo and mark, and marked as such. */
const summaryOf = (kit: BrandKit): Record<string, unknown> => {
  const summary: Record<string, unknown> = { ...kit, logos: "not-loaded" };
  delete summary.logo;
  delete summary.mark;
  return summary;
};

const page = (rows: unknown[], pageSize = 10, at = 1) => ({
  data: rows,
  meta: {
    pagination: {
      page: at,
      pageSize,
      pageCount: Math.ceil(rows.length / pageSize),
      total: rows.length,
    },
  },
});

const storeWith = (handler: Handler, publicHandler: Handler = handler) => {
  const authorised = fakeFetch(handler);
  const anonymous = fakeFetch(publicHandler);
  const store = createBrandKitStore({
    baseUrl: BASE,
    fetch: authorised.fetch,
    publicFetch: anonymous.fetch,
  });
  return { store, sent: authorised.sent, publicSent: anonymous.sent };
};

const rejection = async (promise: Promise<unknown>): Promise<BrandKitStoreError> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof BrandKitStoreError) return error;
    throw error;
  }
  throw new Error("expected a rejection");
};

const textOf = (body: RequestInit["body"]): string => (typeof body === "string" ? body : "");

const bodyOf = (sent: Sent | undefined): unknown => JSON.parse(textOf(sent?.init.body));

const headerOf = (sent: Sent | undefined, name: string): string | null =>
  new Headers(sent?.init.headers).get(name);

describe("createBrandKitStore", () => {
  it.each([
    "http://cms.example.com",
    "ftp://cms.example.com",
    "not a url",
    "https://user:pass@cms.example.com",
    "https://cms.example.com/?a=1",
    "https://cms.example.com/#top",
  ])("refuses the base URL %s", (baseUrl) => {
    expect(() => createBrandKitStore({ baseUrl, fetch: fakeFetch(() => json({})).fetch })).toThrow(
      TypeError,
    );
  });

  it.each([
    ["http://localhost:1337", "http://localhost:1337/api/brand-kits"],
    ["http://127.0.0.1:8000/", "http://127.0.0.1:8000/api/brand-kits"],
    ["https://example.com/cms/", "https://example.com/cms/api/brand-kits"],
  ])("takes %s and sends to the API under it", async (baseUrl, expected) => {
    const { fetch, sent } = fakeFetch(() => json(page([])));
    await createBrandKitStore({ baseUrl, fetch }).list();
    expect(sent[0]?.url.split("?")[0]).toBe(expected);
  });

  it("refuses options without a fetch", () => {
    expect(() =>
      createBrandKitStore({ baseUrl: BASE } as unknown as Parameters<
        typeof createBrandKitStore
      >[0]),
    ).toThrow(TypeError);
  });
});

describe("list", () => {
  it("asks for one page of the caller's kits, in a stable order, with its credentials", async () => {
    const { store, sent, publicSent } = storeWith(() => json(page([rowOf(kitFrom())])));
    const result = await store.list();
    const url = new URL(sent[0]?.url ?? "");
    expect(`${url.origin}${url.pathname}`).toBe(KITS);
    expect([...url.searchParams]).toEqual([
      ["sort", "id:asc"],
      ...SUMMARY_FIELDS.map((field, index) => [`fields[${String(index)}]`, field]),
      ["pagination[page]", "1"],
      ["pagination[pageSize]", "10"],
    ]);
    expect(sent[0]?.init.method).toBe("GET");
    expect(headerOf(sent[0], "Accept")).toBe("application/json");
    expect(sent[0]?.init.body).toBeUndefined();
    expect(publicSent).toEqual([]);
    expect(result).toEqual({
      results: [
        {
          ok: true,
          record: { documentId: DOCUMENT_ID, isPublic: false, summary: summaryOf(kitFrom()) },
        },
      ],
      page: 1,
      pageSize: 10,
      pageCount: 1,
      total: 1,
    });
  });

  it("asks for the page and size given", async () => {
    const { store, sent } = storeWith(() => json(page([], 5, 3)));
    await store.list({ page: 3, pageSize: 5 });
    const url = new URL(sent[0]?.url ?? "");
    expect(url.searchParams.get("pagination[page]")).toBe("3");
    expect(url.searchParams.get("pagination[pageSize]")).toBe("5");
  });

  it.each([
    { page: 0 },
    { page: 1.5 },
    { pageSize: 0 },
    { pageSize: 11 },
    { pageSize: Number.NaN },
  ])("refuses %j without sending anything", async (options) => {
    const { store, sent } = storeWith(() => json(page([])));
    expect((await rejection(store.list(options))).code).toBe("validation");
    expect(sent).toEqual([]);
  });

  it("returns a bad record as an error for that record, and the others as kits", async () => {
    const good = rowOf(kitFrom());
    const bad = rowOf(kitFrom(), { documentId: "second", primaryColor: "red", extra: SECRET });
    const { store } = storeWith(() => json(page([good, bad, good])));
    const { results } = await store.list();
    expect(results.map((result) => result.ok)).toEqual([true, false, true]);
    expect(results[1]).toMatchObject({
      ok: false,
      index: 1,
      documentId: "second",
      errors: [
        { path: "extra", code: "unknown-key" },
        { path: "primaryColor", code: "invalid-color" },
      ],
    });
    expect(JSON.stringify(results)).not.toContain(SECRET);
  });

  it("leaves out the logo and mark, never checking any logo text that arrives", async () => {
    const row = rowOf(kitFrom(), { logo: UNSANITISED_LOGO, mark: UNSANITISED_LOGO });
    const { store } = storeWith(() => json(page([row])));
    const { results } = await store.list();
    expect(results).toEqual([
      {
        ok: true,
        record: { documentId: DOCUMENT_ID, isPublic: false, summary: summaryOf(kitFrom()) },
      },
    ]);
    expect(JSON.stringify(results)).not.toContain("steal");
  });

  it("checks every other field of a summary with parseBrandKit", async () => {
    const { store } = storeWith(() => json(page([rowOf(kitFrom(), { brandId: "dark" })])));
    const { results } = await store.list();
    expect(results[0]).toMatchObject({
      ok: false,
      errors: [{ path: "brandId", code: "reserved-id" }],
    });
  });

  it("bounds a page by the size of summaries, not of logos", async () => {
    const huge = rowOf(kitFrom(), { logo: "x".repeat(MAX_SUMMARY_BYTES * 2) });
    const { store } = storeWith(() => json(page([huge])));
    expect((await rejection(store.list({ pageSize: 1 }))).code).toBe("malformed-response");
  });

  const pagination = (values: Record<string, number>) => ({
    page: 1,
    pageSize: 10,
    pageCount: 1,
    total: 1,
    ...values,
  });

  it.each([
    ["another page than asked for", { page: 2 }],
    ["another page size than asked for", { pageSize: 25 }],
    ["a page count that does not follow from the total", { pageCount: 2 ** 53 - 1, total: 0 }],
    ["a page count over the total's", { pageCount: 2 }],
    ["more kits than the total leaves for the page", { total: 0, pageCount: 0 }],
  ])("refuses pagination with %s", async (_, values) => {
    const { store } = storeWith(() =>
      json({ data: [rowOf(kitFrom())], meta: { pagination: pagination(values) } }),
    );
    expect((await rejection(store.list())).code).toBe("malformed-response");
  });

  it("takes an empty list, and a page past the last one, as empty", async () => {
    const empty = storeWith(() => json(page([])));
    expect(await empty.store.list()).toMatchObject({ results: [], pageCount: 0, total: 0 });
    const past = storeWith(() =>
      json({ data: [], meta: { pagination: pagination({ page: 4, pageCount: 3, total: 25 }) } }),
    );
    expect((await past.store.list({ page: 4 })).results).toEqual([]);
  });

  it("refuses a page holding more kits than it asked for", async () => {
    const row = rowOf(kitFrom());
    const { store } = storeWith(() => json(page([row, row, row], 2)));
    expect((await rejection(store.list({ pageSize: 2 }))).code).toBe("malformed-response");
  });

  it.each([
    ["no data", { meta: page([]).meta }],
    ["data that is not a list", { data: {}, meta: page([]).meta }],
    ["no pagination", { data: [] }],
    [
      "a negative total",
      { data: [], meta: { pagination: { ...page([]).meta.pagination, total: -1 } } },
    ],
    ["a key beside data and meta", { ...page([]), error: SECRET }],
    ["a list", []],
    ["null", null],
  ])("refuses an answer with %s", async (_, body) => {
    const { store } = storeWith(() => json(body));
    const error = await rejection(store.list());
    expect(error.code).toBe("malformed-response");
    expect(JSON.stringify(error)).not.toContain(SECRET);
    expect(error.message).not.toContain(SECRET);
  });
});

describe("get", () => {
  it("reads one kit by its document id", async () => {
    const { store, sent } = storeWith(() => json({ data: rowOf(kitFrom()), meta: {} }));
    const result = await store.get(DOCUMENT_ID);
    expect(sent[0]?.url).toBe(`${KITS}/${DOCUMENT_ID}`);
    expect(result).toEqual({
      ok: true,
      record: { documentId: DOCUMENT_ID, isPublic: false, kit: kitFrom() },
    });
  });

  it("returns a record that fails as a located error, never as a kit", async () => {
    const { store } = storeWith(() =>
      json({ data: rowOf(kitFrom(), { logo: "<svg onload='x()'/>" }), meta: {} }),
    );
    const result = await store.get(DOCUMENT_ID);
    expect(result).toMatchObject({
      ok: false,
      documentId: DOCUMENT_ID,
      errors: [{ path: "logo" }],
    });
    expect(JSON.stringify(result)).not.toContain("onload");
  });

  it.each(["", "../admin", "a/b", "a%2Fb", "a b", "x".repeat(129), 5, null])(
    "refuses the id %j without sending anything",
    async (id) => {
      const { store, sent } = storeWith(() => json({}));
      const error = await rejection(store.get(id as string));
      expect(error.code).toBe("validation");
      expect(sent).toEqual([]);
    },
  );

  it("refuses an answer whose data is null", async () => {
    const { store } = storeWith(() => json({ data: null, meta: {} }));
    expect((await rejection(store.get(DOCUMENT_ID))).code).toBe("malformed-response");
  });

  it("asks again every time, keeping nothing", async () => {
    const { store, sent } = storeWith(() => json({ data: rowOf(kitFrom()), meta: {} }));
    await store.get(DOCUMENT_ID);
    await store.get(DOCUMENT_ID);
    expect(sent).toHaveLength(2);
  });
});

describe("create", () => {
  it("sends the kit in the CMS shape, never an owner, and returns the stored record", async () => {
    const kit = kitFrom({ tagline: "Light the way" });
    const { store, sent } = storeWith((_, init) => {
      const { data } = JSON.parse(textOf(init.body)) as { data: Record<string, unknown> };
      return json({ data: { id: 1, documentId: DOCUMENT_ID, isPublic: false, ...data } }, 201);
    });
    const result = await store.create({ ...kit, owner: 99 } as BrandKit);
    expect(sent[0]?.url).toBe(KITS);
    expect(sent[0]?.init.method).toBe("POST");
    expect(headerOf(sent[0], "Content-Type")).toBe("application/json");
    expect(bodyOf(sent[0])).toEqual({ data: brandKitToCms(kit) });
    expect(JSON.stringify(bodyOf(sent[0]))).not.toContain("owner");
    expect(result).toEqual({ ok: true, record: { documentId: DOCUMENT_ID, isPublic: false, kit } });
  });

  it("round trips a kit with a logo through the store", async () => {
    const upload = sanitiseSvgLogo(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 1"><rect width="2" height="1"/></svg>',
    );
    if (!upload.ok) throw new Error("expected a logo");
    const kit = kitFrom({ logo: upload.svg, mark: upload.svg, colors: { primary: "#ABC" } });
    let stored: Record<string, unknown> = {};
    const { store } = storeWith((_, init) => {
      if (init.method === "POST") {
        const { data } = JSON.parse(textOf(init.body)) as { data: Record<string, unknown> };
        stored = { id: 1, documentId: DOCUMENT_ID, isPublic: false, ...data };
      }
      return json({ data: stored, meta: {} });
    });
    await store.create(kit);
    expect(await store.get(DOCUMENT_ID)).toEqual({
      ok: true,
      record: { documentId: DOCUMENT_ID, isPublic: false, kit },
    });
  });

  it("sends isPublic only when it is given", async () => {
    const { store, sent } = storeWith(() => json({ data: rowOf(kitFrom(), { isPublic: true }) }));
    await store.create(kitFrom(), { isPublic: true });
    await store.create(kitFrom());
    expect(bodyOf(sent[0])).toMatchObject({ data: { isPublic: true } });
    expect(Object.keys((bodyOf(sent[1]) as { data: object }).data)).not.toContain("isPublic");
  });

  it.each([
    ["a colour that is not one", { colors: { primary: [300, 0, 0] } }, "primaryColor"],
    ["a logo that is not sanitised", { logo: "<svg onload='x()'/>" }, "logo"],
    ["a reserved id", { id: "dark" }, "brandId"],
    ["no colours", { colors: undefined }, "primaryColor"],
  ])("refuses a kit with %s without sending it", async (_, change, field) => {
    const { store, sent } = storeWith(() => json({}));
    const kit = { ...kitFrom(), ...change } as unknown as BrandKit;
    const error = await rejection(store.create(kit));
    expect(error).toMatchObject({ code: "validation", fields: [field] });
    expect(sent).toEqual([]);
  });

  it.each([null, "kit", []])("refuses %j as a kit", async (kit) => {
    const { store } = storeWith(() => json({}));
    expect((await rejection(store.create(kit as unknown as BrandKit))).code).toBe("validation");
  });

  it("refuses an isPublic that is not a boolean", async () => {
    const { store, sent } = storeWith(() => json({}));
    const options = { isPublic: "yes" } as unknown as { isPublic: boolean };
    expect((await rejection(store.create(kitFrom(), options))).code).toBe("validation");
    expect(sent).toEqual([]);
  });
});

describe("update", () => {
  it("replaces the whole kit, clearing what it no longer has", async () => {
    const { store, sent } = storeWith(() => json({ data: rowOf(kitFrom()) }));
    await store.update(DOCUMENT_ID, kitFrom(), { isPublic: false });
    expect(sent[0]?.url).toBe(`${KITS}/${DOCUMENT_ID}`);
    expect(sent[0]?.init.method).toBe("PUT");
    expect(bodyOf(sent[0])).toEqual({
      data: { ...brandKitToCms(kitFrom()), tagline: null, logo: null, isPublic: false },
    });
  });

  it("reports fields the CMS did not clear as not applied, never as a saved kit", async () => {
    const logo = sanitiseSvgLogo(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 1"><rect width="2" height="1"/></svg>',
    );
    if (!logo.ok) throw new Error("expected a logo");
    // strapi-php today keeps the old value of a field sent as null (hynding/camis#122).
    const stale = rowOf(kitFrom({ tagline: "Old", logo: logo.svg }));
    const { store } = storeWith(() => json({ data: stale }));
    const error = await rejection(store.update(DOCUMENT_ID, kitFrom()));
    expect(error).toMatchObject({ code: "not-applied", fields: ["tagline", "logo"] });
    expect(JSON.stringify(error)).not.toContain("Old");
  });

  it("reports any field the CMS answers differently from what was sent", async () => {
    const { store } = storeWith(() =>
      json({ data: rowOf(kitFrom({ name: "Other" }), { isPublic: false }) }),
    );
    const error = await rejection(store.create(kitFrom(), { isPublic: true }));
    expect(error).toMatchObject({ code: "not-applied", fields: ["name", "isPublic"] });
  });

  it("keeps whether the kit is public when isPublic is not given", async () => {
    const { store, sent } = storeWith(() => json({ data: rowOf(kitFrom()) }));
    await store.update(DOCUMENT_ID, kitFrom());
    expect(Object.keys((bodyOf(sent[0]) as { data: object }).data)).not.toContain("isPublic");
  });

  it("refuses a summary, or a kit spread from one, which would clear the logo and mark", async () => {
    const { store, sent } = storeWith(() => json(page([rowOf(kitFrom())])));
    const [item] = (await store.list()).results;
    if (item?.ok !== true) throw new Error("expected a summary");
    const { summary } = item.record;
    // @ts-expect-error A summary is not a kit: it has no logo or mark to send.
    const asIs = await rejection(store.update(DOCUMENT_ID, summary));
    // @ts-expect-error Nor is a kit spread from one, which keeps the summary's marker.
    const spread = await rejection(store.update(DOCUMENT_ID, { ...summary, name: "Renamed" }));
    expect(asIs).toMatchObject({ code: "validation", fields: ["logo", "mark"] });
    expect(spread).toMatchObject({ code: "validation", fields: ["logo", "mark"] });
    expect(sent).toHaveLength(1);
  });

  it("refuses a bad id without sending anything", async () => {
    const { store, sent } = storeWith(() => json({}));
    expect((await rejection(store.update("../x", kitFrom()))).code).toBe("validation");
    expect(sent).toEqual([]);
  });
});

describe("remove", () => {
  it("deletes the kit, with or without an answer body", async () => {
    const empty = storeWith(() => new Response(null, { status: 204 }));
    await expect(empty.store.remove(DOCUMENT_ID)).resolves.toBeUndefined();
    expect(empty.sent[0]?.url).toBe(`${KITS}/${DOCUMENT_ID}`);
    expect(empty.sent[0]?.init.method).toBe("DELETE");
    const answered = storeWith(() => json({ data: rowOf(kitFrom()) }));
    await expect(answered.store.remove(DOCUMENT_ID)).resolves.toBeUndefined();
  });

  it("does not report a kit it could not delete as deleted", async () => {
    const { store } = storeWith(() => json({ data: null, error: { status: 403 } }, 403));
    expect((await rejection(store.remove(DOCUMENT_ID))).code).toBe("forbidden");
  });
});

describe("public kits", () => {
  it("lists public kits through the public fetch, without credentials", async () => {
    const row = rowOf(kitFrom(), { isPublic: true });
    const { store, sent, publicSent } = storeWith(
      () => json({}),
      () => json(page([row])),
    );
    const result = await store.listPublic();
    expect(sent).toEqual([]);
    const url = new URL(publicSent[0]?.url ?? "");
    expect(url.searchParams.get("filters[isPublic][$eq]")).toBe("true");
    expect(publicSent[0]?.init.credentials).toBe("omit");
    expect(headerOf(publicSent[0], "Authorization")).toBeNull();
    expect(result.results).toEqual([
      {
        ok: true,
        record: { documentId: DOCUMENT_ID, isPublic: true, summary: summaryOf(kitFrom()) },
      },
    ]);
  });

  it("refuses a kit in the public list that is not public", async () => {
    const { store } = storeWith(
      () => json({}),
      () => json(page([rowOf(kitFrom(), { isPublic: false })])),
    );
    const { results } = await store.listPublic();
    expect(results[0]).toMatchObject({
      ok: false,
      index: 0,
      errors: [{ path: "isPublic", code: "not-allowed" }],
    });
  });

  it("reads one public kit through the public fetch", async () => {
    const { store, sent, publicSent } = storeWith(
      () => json({}),
      () => json({ data: rowOf(kitFrom(), { isPublic: true }) }),
    );
    const result = await store.getPublic(DOCUMENT_ID);
    expect(sent).toEqual([]);
    expect(publicSent[0]?.url).toBe(`${KITS}/${DOCUMENT_ID}`);
    expect(result.ok).toBe(true);
  });

  it("refuses a private kit read as a public one", async () => {
    const { store } = storeWith(
      () => json({}),
      () => json({ data: rowOf(kitFrom()) }),
    );
    expect(await store.getPublic(DOCUMENT_ID)).toMatchObject({
      ok: false,
      errors: [{ path: "isPublic", code: "not-allowed" }],
    });
  });
});

describe("failures", () => {
  it.each([
    [401, "unauthorized"],
    [403, "forbidden"],
    [404, "not-found"],
    [400, "unexpected-status"],
    [409, "unexpected-status"],
    [500, "unexpected-status"],
    [503, "unexpected-status"],
  ])("reads a %i answer as %s, without its body", async (status, code) => {
    const { store } = storeWith(() =>
      json({ data: null, error: { status, name: "Error", message: SECRET } }, status),
    );
    const error = await rejection(store.get(DOCUMENT_ID));
    expect(error).toBeInstanceOf(BrandKitStoreError);
    expect(error.code).toBe(code);
    expect(error.message).not.toContain(SECRET);
    expect(JSON.stringify(error)).not.toContain(SECRET);
    if (code === "unexpected-status") expect(error.status).toBe(status);
  });

  it("names the fields a validation error names, and only the kit's own", async () => {
    const { store } = storeWith(() =>
      json(
        {
          data: null,
          error: {
            status: 400,
            name: "ValidationError",
            message: SECRET,
            details: {
              errors: [
                { path: ["brandId"], message: SECRET, value: SECRET },
                { path: ["primaryColor"], message: SECRET },
                { path: ["brandId"], message: "again" },
                { path: [SECRET], message: SECRET },
                { path: "name", message: "not a list" },
                { path: ["owner"], message: SECRET },
              ],
            },
          },
        },
        400,
      ),
    );
    const error = await rejection(store.create(kitFrom()));
    expect(error.code).toBe("validation");
    expect(error.fields).toEqual(["brandId", "primaryColor"]);
    expect(JSON.stringify(error)).not.toContain(SECRET);
  });

  it.each([
    ["30", 30],
    ["0", 1],
    ["99999", 3600],
    ["soon", 60],
    [null, 60],
  ])("waits %s seconds of Retry-After as %i", async (header, seconds) => {
    const headers: Record<string, string> = header === null ? {} : { "Retry-After": header };
    const { store } = storeWith(() => json({ data: null }, 429, headers));
    expect(await rejection(store.list())).toMatchObject({
      code: "rate-limited",
      retryAfterSeconds: seconds,
    });
  });

  it("reads a Retry-After date", async () => {
    const date = new Date(Date.now() + 120_000).toUTCString();
    const { store } = storeWith(() => json({ data: null }, 429, { "Retry-After": date }));
    const error = await rejection(store.list());
    expect(error.retryAfterSeconds).toBeGreaterThanOrEqual(118);
    expect(error.retryAfterSeconds).toBeLessThanOrEqual(120);
  });

  it("reads a fetch that rejects as a network error", async () => {
    const { store } = storeWith(() => Promise.reject(new TypeError(SECRET)));
    const error = await rejection(store.list());
    expect(error.code).toBe("network");
    expect(error.message).not.toContain(SECRET);
  });

  it("reads a fetch that refuses the request itself apart from an unreachable CMS", async () => {
    // The identity SDK's authorizedFetch refuses a URL outside its own base URL like this.
    const refused = Object.assign(new Error(SECRET), { code: "validation" });
    const { store } = storeWith(() => Promise.reject(refused));
    const error = await rejection(store.list());
    expect(error.code).toBe("request-refused");
    expect(error.message).not.toContain(SECRET);
    expect(JSON.stringify(error)).not.toContain(SECRET);
  });

  it.each([
    ["a TypeError", new TypeError("failed")],
    ["an AbortError", new DOMException("aborted", "AbortError")],
    ["a TimeoutError", new DOMException("timed out", "TimeoutError")],
    ["the identity SDK's network error", Object.assign(new Error("x"), { code: "network" })],
  ])("reads %s from fetch as a network error", async (_, thrown) => {
    const { store } = storeWith(() => Promise.reject(thrown));
    expect((await rejection(store.list())).code).toBe("network");
  });

  it("passes on a signed-out session from the identity SDK's authorised fetch", async () => {
    const signedOut = Object.assign(new Error("signed out"), { code: "unauthorized" });
    const { store } = storeWith(() => Promise.reject(signedOut));
    expect((await rejection(store.list())).code).toBe("unauthorized");
  });

  it("reads a redirect it did not follow as an unexpected status", async () => {
    const { store } = storeWith(
      () => new Response(null, { status: 302, headers: { Location: "https://evil.example" } }),
    );
    expect((await rejection(store.list())).code).toBe("unexpected-status");
  });

  it("asks fetch never to follow a redirect or send cookies", async () => {
    const { store, sent } = storeWith(() => json(page([])));
    await store.list();
    expect(sent[0]?.init).toMatchObject({
      redirect: "error",
      credentials: "omit",
      cache: "no-store",
    });
  });
});

describe("hostile answers", () => {
  it("refuses a body declared larger than a record may be, without reading it", async () => {
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(new Uint8Array(1024));
      },
    });
    const { store } = storeWith(
      () =>
        new Response(body, {
          headers: {
            "Content-Type": "application/json",
            "Content-Length": String(MAX_RECORD_BYTES + 1),
          },
        }),
    );
    expect((await rejection(store.get(DOCUMENT_ID))).code).toBe("malformed-response");
    expect(pulled).toBeLessThanOrEqual(1);
  });

  it("stops reading an endless body at the bound", async () => {
    let pulled = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(new TextEncoder().encode(" ".repeat(64 * 1024)));
      },
      cancel() {
        cancelled = true;
      },
    });
    const { store } = storeWith(
      () => new Response(body, { headers: { "Content-Type": "application/json" } }),
    );
    expect((await rejection(store.get(DOCUMENT_ID))).code).toBe("malformed-response");
    expect(cancelled).toBe(true);
    expect(pulled * 64 * 1024).toBeLessThanOrEqual(MAX_RECORD_BYTES + 2 * 64 * 1024);
  });

  it.each([
    ["text/html", "<html>"],
    ["application/json-patch+json", "{}"],
    ["", JSON.stringify({ data: null })],
  ])("refuses a %j answer", async (contentType, body) => {
    const { store } = storeWith(
      () =>
        new Response(body, { headers: contentType === "" ? {} : { "Content-Type": contentType } }),
    );
    expect((await rejection(store.get(DOCUMENT_ID))).code).toBe("malformed-response");
  });

  it.each(["{", "", "﻿{}", "null"])("refuses the body %j", async (text) => {
    const { store } = storeWith(
      () => new Response(text, { headers: { "Content-Type": "application/json" } }),
    );
    expect((await rejection(store.get(DOCUMENT_ID))).code).toBe("malformed-response");
  });

  it("refuses a body that is not UTF-8", async () => {
    const { store } = storeWith(
      () =>
        new Response(new Uint8Array([0x7b, 0x22, 0xff, 0x22, 0x7d]), {
          headers: { "Content-Type": "application/json" },
        }),
    );
    expect((await rejection(store.get(DOCUMENT_ID))).code).toBe("malformed-response");
  });

  it("keeps prototype keys in an answer from polluting anything", async () => {
    const row = JSON.stringify(rowOf(kitFrom()));
    const text = `{"__proto__":{"polluted":true},"data":[{"__proto__":{"polluted":true},${row.slice(1)},${row}],"meta":${JSON.stringify(page([]).meta)}}`;
    const { store } = storeWith(
      () => new Response(text, { headers: { "Content-Type": "application/json" } }),
    );
    const error = await rejection(store.list());
    expect(error.code).toBe("malformed-response");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("refuses one record with a prototype key and keeps the others", async () => {
    const row = JSON.stringify(rowOf(kitFrom()));
    const text = `{"data":[{"__proto__":{"polluted":true},${row.slice(1)},${row}],"meta":${JSON.stringify({ pagination: { page: 1, pageSize: 10, pageCount: 1, total: 2 } })}}`;
    const { store } = storeWith(
      () => new Response(text, { headers: { "Content-Type": "application/json" } }),
    );
    const { results } = await store.list();
    expect(results.map((result) => result.ok)).toEqual([false, true]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it.each([
    ["a number as the name", { name: 5 }, "name", "wrong-type"],
    ["an object as a colour", { primaryColor: { r: 1 } }, "primaryColor", "wrong-type"],
    ["a list as the logo", { logo: ["<svg/>"] }, "logo", "wrong-type"],
    ["a choice the package lacks", { corners: "pill" }, "corners", "not-allowed"],
    ["a theme it does not store", { themeTokens: { color: "red" } }, "themeTokens", "unknown-key"],
  ])("refuses a record with %s", async (_, change, path, code) => {
    const { store } = storeWith(() => json({ data: rowOf(kitFrom(), change) }));
    const result = await store.get(DOCUMENT_ID);
    expect(result).toMatchObject({ ok: false, errors: [{ path, code }] });
  });
});

describe("aborting", () => {
  it("passes the signal on and reads an abort as a network error", async () => {
    const controller = new AbortController();
    const { store, sent } = storeWith(
      (_, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );
    const pending = store.list({ signal: controller.signal });
    controller.abort();
    expect((await rejection(pending)).code).toBe("network");
    expect(sent[0]?.init.signal).toBe(controller.signal);
  });

  it.each([
    ["an error", new Error("the user left the page")],
    ["a string", "the user left the page"],
  ])("reads an abort with %s as its reason as a network error", async (_kind, reason) => {
    const controller = new AbortController();
    // The platform's fetch rejects with the signal's reason, whatever it is.
    const { store } = storeWith(
      (_, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- as fetch does
            reject(init.signal?.reason);
          });
        }),
    );
    const pending = store.list({ signal: controller.signal });
    controller.abort(reason);
    expect((await rejection(pending)).code).toBe("network");
  });

  it("stops reading the body on abort, even when the fetch has let go of the signal", async () => {
    const controller = new AbortController();
    let cancelled = false;
    let answered = (): void => undefined;
    const headersArrived = new Promise<void>((resolve) => {
      answered = resolve;
    });
    // As the identity SDK's authorizedFetch does, the fetch drops the caller's signal once the
    // headers are in, so only the store can stop the body.
    const { store } = storeWith(() => {
      const body = new ReadableStream<Uint8Array>({
        start(stream) {
          stream.enqueue(new TextEncoder().encode('{"data":'));
        },
        pull: () => new Promise<void>(() => undefined),
        cancel() {
          cancelled = true;
        },
      });
      answered();
      return new Response(body, { headers: { "Content-Type": "application/json" } });
    });
    const pending = store.get(DOCUMENT_ID, { signal: controller.signal });
    await headersArrived;
    await new Promise((resolve) => setTimeout(resolve, 10));
    controller.abort();
    expect((await rejection(pending)).code).toBe("network");
    expect(cancelled).toBe(true);
  });

  it("reads an abort while a refusal's body is read as a network error", async () => {
    const controller = new AbortController();
    const { store } = storeWith(() => {
      const body = new ReadableStream<Uint8Array>({
        start(stream) {
          stream.enqueue(new TextEncoder().encode('{"error":'));
        },
        pull: () => new Promise<void>(() => undefined),
      });
      setTimeout(() => {
        controller.abort();
      }, 10);
      return new Response(body, { status: 400, headers: { "Content-Type": "application/json" } });
    });
    const error = await rejection(store.create(kitFrom(), { signal: controller.signal }));
    expect(error.code).toBe("network");
  });

  it("watches the signal without adding a reaction for every chunk of the body", async () => {
    // A server may send a body one byte at a time; what the store keeps per chunk is then
    // multiplied by up to 4 MiB. Each promise reaction goes through Promise.prototype.then.
    const reactionsWhileReading = async (chunks: number): Promise<number> => {
      const opening = new TextEncoder().encode(`{"data":{"documentId":"${DOCUMENT_ID}","x":"`);
      let pulled = 0;
      const { store } = storeWith(
        () =>
          new Response(
            new ReadableStream<Uint8Array>({
              pull(stream) {
                if (pulled === 0) stream.enqueue(opening);
                else if (pulled <= chunks) stream.enqueue(new Uint8Array([97]));
                else {
                  stream.enqueue(new TextEncoder().encode('"}}'));
                  stream.close();
                }
                pulled += 1;
              },
            }),
            { headers: { "Content-Type": "application/json" } },
          ),
      );
      const original = Object.getOwnPropertyDescriptor(Promise.prototype, "then");
      const then = original?.value as (this: unknown, ...handlers: unknown[]) => unknown;
      let reactions = 0;
      Reflect.defineProperty(Promise.prototype, "then", {
        ...original,
        value(this: unknown, ...handlers: unknown[]) {
          reactions += 1;
          return then.apply(this, handlers);
        },
      });
      try {
        await store.get(DOCUMENT_ID, { signal: new AbortController().signal });
        return reactions;
      } finally {
        if (original !== undefined) Reflect.defineProperty(Promise.prototype, "then", original);
      }
    };
    const few = await reactionsWhileReading(10);
    const many = await reactionsWhileReading(2010);
    expect(many - few).toBeLessThan(100);
  });

  it("sends nothing once the signal has aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const { store, sent } = storeWith(() => json(page([])));
    expect((await rejection(store.get(DOCUMENT_ID, { signal: controller.signal }))).code).toBe(
      "network",
    );
    expect(sent).toEqual([]);
  });

  it("refuses a signal that is not one", async () => {
    const { store } = storeWith(() => json(page([])));
    const options = { signal: {} } as unknown as { signal: AbortSignal };
    expect((await rejection(store.list(options))).code).toBe("validation");
  });
});

describe("BrandKitStoreError", () => {
  it("serialises its code and details only", () => {
    const error = new BrandKitStoreError("rate-limited", { retryAfterSeconds: 5 });
    expect(JSON.parse(JSON.stringify(error))).toEqual({
      name: "BrandKitStoreError",
      code: "rate-limited",
      retryAfterSeconds: 5,
    });
    expect(Object.isFrozen(new BrandKitStoreError("validation", { fields: ["name"] }).fields)).toBe(
      true,
    );
  });
});

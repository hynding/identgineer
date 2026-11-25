import { afterEach, describe, expect, it } from "vitest";
import {
  BrandKitStoreError,
  createBrandKitStore,
  parseBrandKit,
  sanitiseSvgLogo,
  type BrandKit,
  type BrandKitRecordResult,
  type BrandKitStore,
  type StoredBrandKit,
} from "../../../brand/src/index.ts";
import {
  createBrowser,
  disposeTabs,
  freshAccount,
  liveBackend,
  openTab,
  post,
  SKIP_NOTE,
  type LiveBackend,
} from "./live-backend.ts";

// The brand kit store of @identgineer/brand against strapi-php, sending with the identity SDK's
// authorizedFetch as an app does. It lives here to share this harness; the brand package does not
// depend on the identity package.

const backend = liveBackend ?? ({} as LiveBackend);

const kitOf = (fields: Record<string, unknown> = {}): BrandKit => {
  const result = parseBrandKit({
    id: "harbour-lights",
    name: "Harbour Lights",
    colors: { primary: "#f4c430", neutralTint: "#1b2a4a" },
    typography: "classic-serif",
    corners: "round",
    tone: "vivid",
    ...fields,
  });
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.kit;
};

const logo = (() => {
  const result = sanitiseSvgLogo(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40"><title>Harbour Lights</title><path d="M14 36h12l-3 -26h-6z" fill="#1b2a4a"/></svg>',
  );
  if (!result.ok) throw new Error("expected a logo");
  return result.svg;
})();

const recordOf = (result: BrandKitRecordResult): StoredBrandKit => {
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.record;
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

interface User {
  readonly id: number;
  readonly jwt: string;
  readonly store: BrandKitStore;
}

/** A user signed in through the identity SDK, with a store sending through its authorizedFetch. */
const signedInUser = async (label: string): Promise<User> => {
  const server = backend.servers.main;
  const account = freshAccount(label);
  const answer = await post(server, "/api/auth/local/register", account);
  expect(answer.status).toBe(200);
  const { jwt, user } = answer.body as { jwt: string; user: { id: number } };
  const browser = createBrowser(backend);
  const tab = openTab(server, browser);
  await tab.signIn({ identifier: account.email, password: account.password });
  const store = createBrandKitStore({
    baseUrl: server.url,
    fetch: tab.authorizedFetch,
    publicFetch: browser.fetch,
  });
  return { id: user.id, jwt, store };
};

/** A store for a visitor who is not signed in: the public fetch only. */
const visitorStore = (): BrandKitStore => {
  const browser = createBrowser(backend);
  const refuse = (): Promise<Response> => Promise.reject(new Error("no credentials here"));
  return createBrandKitStore({
    baseUrl: backend.servers.main.url,
    fetch: refuse,
    publicFetch: browser.fetch,
  });
};

/** Every document id a listing gives, page by page. */
const allDocumentIds = async (
  list: (options: { page: number }) => ReturnType<BrandKitStore["list"]>,
): Promise<string[]> => {
  const ids: string[] = [];
  for (let page = 1; ; page += 1) {
    const answer = await list({ page });
    for (const result of answer.results) if (result.ok) ids.push(result.record.documentId);
    if (page >= answer.pageCount) return ids;
  }
};

/** A raw request straight to the server, outside the store, with a token or as a guest. */
const raw = async (
  method: string,
  path: string,
  options: { readonly jwt?: string; readonly body?: unknown } = {},
): Promise<{ status: number; text: string }> => {
  const response = await fetch(`${backend.servers.main.url}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(options.jwt === undefined ? {} : { Authorization: `Bearer ${options.jwt}` }),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  return { status: response.status, text: await response.text() };
};

afterEach(disposeTabs);

describe.skipIf(liveBackend === undefined)(
  `the brand kit store against strapi-php ${liveBackend === undefined ? SKIP_NOTE : ""}`,
  () => {
    it("lets the owner create, list, read, update and delete a kit, its logo kept exactly", async () => {
      const owner = await signedInUser("kit-owner");
      const kit = kitOf({ tagline: "Light the way", logo, mark: logo });
      const created = recordOf(await owner.store.create(kit));
      expect(created).toMatchObject({ isPublic: false, kit });
      expect(created.kit.logo).toBe(logo);

      expect(await allDocumentIds(owner.store.list)).toEqual([created.documentId]);
      expect(recordOf(await owner.store.get(created.documentId)).kit).toEqual(kit);

      const renamed = kitOf({
        name: "Harbour Lights Studio",
        tagline: "Light the way",
        logo,
        mark: logo,
      });
      const updated = recordOf(
        await owner.store.update(created.documentId, renamed, { isPublic: true }),
      );
      expect(updated).toEqual({ documentId: created.documentId, isPublic: true, kit: renamed });
      expect(recordOf(await owner.store.get(created.documentId))).toEqual(updated);

      await owner.store.remove(created.documentId);
      expect((await rejection(owner.store.get(created.documentId))).code).toBe("not-found");
      expect(await allDocumentIds(owner.store.list)).toEqual([]);
    });

    // An expected failure until https://github.com/hynding/camis/issues/122 is fixed: strapi-php's
    // generated serializer drops every null of an update body (fromWire's array_filter), so a field
    // cannot be cleared, where Strapi clears it. Once camis clears it this test passes, `it.fails`
    // turns that red, and `.fails` comes off.
    it.fails("clears the optional fields an update no longer has, as Strapi does", async () => {
      const owner = await signedInUser("kit-clear");
      const full = kitOf({
        tagline: "Light the way",
        colors: { primary: "#f4c430", secondary: "#0b6e4f", neutralTint: "#1b2a4a" },
        logo,
        mark: logo,
      });
      const { documentId } = recordOf(await owner.store.create(full));
      const bare = kitOf({ colors: { primary: "#f4c430" } });
      expect(recordOf(await owner.store.update(documentId, bare)).kit).toEqual(bare);
      expect(recordOf(await owner.store.get(documentId)).kit).toEqual(bare);
    });

    it("hides a user's kits from another user, who can neither read, change nor delete them", async () => {
      const owner = await signedInUser("kit-mine");
      const other = await signedInUser("kit-other");
      const kit = kitOf();
      const { documentId } = recordOf(await owner.store.create(kit));

      expect(await allDocumentIds(other.store.list)).toEqual([]);
      expect((await rejection(other.store.get(documentId))).code).toBe("not-found");
      expect((await rejection(other.store.update(documentId, kitOf({ name: "Taken" })))).code).toBe(
        "not-found",
      );
      expect((await rejection(other.store.remove(documentId))).code).toBe("not-found");
      expect(recordOf(await owner.store.get(documentId)).kit).toEqual(kit);
    });

    it("shows a public kit to anyone without credentials, and lets no one else change it", async () => {
      const owner = await signedInUser("kit-public");
      const other = await signedInUser("kit-reader");
      const kit = kitOf({ logo });
      const { documentId } = recordOf(await owner.store.create(kit, { isPublic: true }));
      const visitor = visitorStore();

      expect(recordOf(await visitor.getPublic(documentId))).toEqual({
        documentId,
        isPublic: true,
        kit,
      });
      expect(await allDocumentIds(visitor.listPublic)).toContain(documentId);
      // A signed-in user reads public kits as the public role too, never through their own list.
      expect(recordOf(await other.store.getPublic(documentId)).kit).toEqual(kit);
      expect(await allDocumentIds(other.store.list)).toEqual([]);

      expect((await rejection(other.store.update(documentId, kitOf({ name: "Taken" })))).code).toBe(
        "not-found",
      );
      expect((await rejection(other.store.remove(documentId))).code).toBe("not-found");
      const change = { body: { data: { name: "Taken" } } };
      expect((await raw("PUT", `/api/brand-kits/${documentId}`, change)).status).toBe(403);
      expect((await raw("DELETE", `/api/brand-kits/${documentId}`)).status).toBe(403);
      expect((await raw("POST", "/api/brand-kits", { body: { data: {} } })).status).toBe(403);
      expect(recordOf(await owner.store.get(documentId)).kit).toEqual(kit);
    });

    it("keeps a private kit out of every public read", async () => {
      const owner = await signedInUser("kit-private");
      const { documentId } = recordOf(await owner.store.create(kitOf()));
      const visitor = visitorStore();

      expect((await rejection(visitor.getPublic(documentId))).code).toBe("not-found");
      expect(await allDocumentIds(visitor.listPublic)).not.toContain(documentId);
      const guest = await raw("GET", "/api/brand-kits?pagination[pageSize]=100");
      expect(guest.status).toBe(200);
      expect(guest.text).not.toContain(documentId);
    });

    it("shows nothing of a public kit's owner through populate", async () => {
      const owner = await signedInUser("kit-populate");
      const other = await signedInUser("kit-curious");
      const { documentId } = recordOf(await owner.store.create(kitOf(), { isPublic: true }));
      for (const query of ["populate=owner", "populate=*", "populate[owner][fields][0]=email"]) {
        for (const jwt of [undefined, other.jwt]) {
          const answer = await raw("GET", `/api/brand-kits/${documentId}?${query}`, {
            ...(jwt === undefined ? {} : { jwt }),
          });
          expect(answer.text).not.toContain("@example.test");
          expect(answer.text).not.toContain('"owner"');
          expect(answer.text).not.toContain('"email"');
        }
      }
    });

    it("sets the owner from the session, whatever owner a client sends", async () => {
      const owner = await signedInUser("kit-claim");
      const target = await signedInUser("kit-target");
      const data = {
        brandId: "claimed",
        name: "Claimed",
        primaryColor: "#4f46e5",
        typography: "system",
        corners: "soft",
        tone: "calm",
      };
      const created = await raw("POST", "/api/brand-kits", {
        jwt: owner.jwt,
        body: { data: { ...data, owner: target.id } },
      });
      expect(created.status).toBe(201);
      const { documentId } = (JSON.parse(created.text) as { data: { documentId: string } }).data;
      expect((await rejection(target.store.get(documentId))).code).toBe("not-found");
      expect(recordOf(await owner.store.get(documentId)).kit.id).toBe("claimed");

      const moved = await raw("PUT", `/api/brand-kits/${documentId}`, {
        jwt: owner.jwt,
        body: { data: { owner: target.id } },
      });
      expect(moved.status).toBe(200);
      expect((await rejection(target.store.get(documentId))).code).toBe("not-found");
      expect(await allDocumentIds(target.store.list)).toEqual([]);
      expect(await allDocumentIds(owner.store.list)).toEqual([documentId]);
    });

    it("refuses on the server what the content type refuses", async () => {
      const owner = await signedInUser("kit-invalid");
      const answer = await raw("POST", "/api/brand-kits", {
        jwt: owner.jwt,
        body: {
          data: {
            brandId: "Not An Id",
            name: "Acme",
            primaryColor: "red",
            typography: "comic",
            corners: "soft",
            tone: "calm",
            logo: "x".repeat(524_289),
          },
        },
      });
      expect(answer.status).toBe(400);
      const paths = (
        JSON.parse(answer.text) as { error: { details: { errors: { path: string[] }[] } } }
      ).error.details.errors.map((error) => error.path.join("."));
      expect(paths.sort()).toEqual(["brandId", "logo", "primaryColor", "typography"]);
    });
  },
);

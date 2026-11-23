import { describe, expect, it } from "vitest";
import { createIdentityClient } from "./identity-client.ts";
import { PASSWORD, START } from "./test-harness.ts";
import { createFakeIdentityApi } from "./testing/fake-identity-api.ts";
import { createManualClock } from "./testing/manual-clock.ts";

/** A client on a base URL with a path, in front of the fake API (which serves from the root). */
const underBasePath = async () => {
  const clock = createManualClock(START);
  const api = createFakeIdentityApi({ clock });
  api.addUser({ username: "ada", email: "ada@example.com", password: PASSWORD });
  const sent: { url: string; init: RequestInit }[] = [];
  const fetch = (url: string, init: RequestInit = {}): Promise<Response> => {
    sent.push({ url, init });
    return api.fetch(url.replace(`${api.baseUrl}/cms/`, `${api.baseUrl}/`), init);
  };
  const client = createIdentityClient({
    baseUrl: `${api.baseUrl}/cms`,
    fetch: fetch as unknown as typeof globalThis.fetch,
    clock,
    channelName: "identgineer-base-path",
  });
  await client.signIn({ identifier: "ada", password: PASSWORD });
  return { api, client, sent };
};

describe("authorizedFetch under a base path", () => {
  it("resolves a path under the base path", async () => {
    const { api, client, sent } = await underBasePath();
    try {
      await client.authorizedFetch("/api/users/me");
      await client.authorizedFetch(`${api.baseUrl}/cms/api/users/me`);
      expect(sent.slice(-2).map((entry) => entry.url)).toEqual([
        `${api.baseUrl}/cms/api/users/me`,
        `${api.baseUrl}/cms/api/users/me`,
      ]);
    } finally {
      client.dispose();
    }
  });

  it.each([
    "/../admin/secret",
    "/%2e%2e/admin/secret",
    "/.%2E/admin/secret",
    "/api/../../admin/secret",
    "/\\..\\admin",
    "https://cms.example.test/admin/secret",
    "https://cms.example.test/cms/../admin/secret",
    "https://cms.example.test/cmsfoo/secret",
    "/api/x/..%2F..%2Fadmin",
    "/api/x/..%2f..%2fadmin",
    "/api/x/..%5Cadmin",
    "/api/x/..%5cadmin",
    "/api/x%2Ejson",
    "/api/x%2ejson",
  ])("refuses %j, which leaves the base path", async (input) => {
    const { client, sent } = await underBasePath();
    try {
      const before = sent.length;
      await expect(client.authorizedFetch(input)).rejects.toMatchObject({ code: "validation" });
      expect(sent).toHaveLength(before);
    } finally {
      client.dispose();
    }
  });

  it("takes a URL object", async () => {
    const { api, client, sent } = await underBasePath();
    try {
      const response = await client.authorizedFetch(new URL(`${api.baseUrl}/cms/api/users/me`));
      expect(response.status).toBe(200);
      expect(sent.at(-1)?.url).toBe(`${api.baseUrl}/cms/api/users/me`);
    } finally {
      client.dispose();
    }
  });

  it.each<unknown>([
    42,
    null,
    undefined,
    {},
    new Request("https://cms.example.test/cms/api/users/me"),
  ])("refuses the input %s with a validation error", async (input) => {
    const { client, sent } = await underBasePath();
    try {
      const before = sent.length;
      await expect(client.authorizedFetch(input as string)).rejects.toMatchObject({
        code: "validation",
      });
      expect(sent).toHaveLength(before);
    } finally {
      client.dispose();
    }
  });

  it("never follows a redirect with the bearer token, whatever the caller asks", async () => {
    const { client, sent } = await underBasePath();
    try {
      await client.authorizedFetch("/api/users/me", { redirect: "follow" });
      expect(sent.at(-1)?.init.redirect).toBe("error");
    } finally {
      client.dispose();
    }
  });

  it.each([
    ["/api/articles?slug=a%2Eb%2Fc", "/cms/api/articles"],
    ["/api/articles#x%2e", "/cms/api/articles"],
    ["/api/a/./b", "/cms/api/a/b"],
    ["/api/a/../b", "/cms/api/b"],
    ["/api/x%252e", "/cms/api/x%252e"],
  ])(
    "sends %j, whose encodings stay out of the path or whose dots resolve inside the base",
    async (input, path) => {
      const { api, client, sent } = await underBasePath();
      try {
        await client.authorizedFetch(input);
        expect(new URL(sent.at(-1)?.url ?? api.baseUrl).pathname).toBe(path);
      } finally {
        client.dispose();
      }
    },
  );
});

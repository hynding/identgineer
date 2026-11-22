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

  it("never follows a redirect with the bearer token, whatever the caller asks", async () => {
    const { client, sent } = await underBasePath();
    try {
      await client.authorizedFetch("/api/users/me", { redirect: "follow" });
      expect(sent.at(-1)?.init.redirect).toBe("error");
    } finally {
      client.dispose();
    }
  });
});

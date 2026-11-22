import { describe, expect, it } from "vitest";
import { PASSWORD, settle, setup } from "./test-harness.ts";
import type { FakeIdentityApi } from "./testing/fake-identity-api.ts";

const REFUSED = {
  status: 401,
  body: {
    data: null,
    error: { status: 401, name: "UnauthorizedError", message: "x", details: {} },
  },
};

const pathsSince = (api: FakeIdentityApi, from: number): string[] =>
  api.requests.slice(from).map((request) => request.path);

describe("signing out when the cookie names another session than this tab's", () => {
  it("ends that session too, so nothing is left to resume in this browser", async () => {
    const { api, client, makeClient, signIn } = setup();
    api.addUser({ username: "bob", email: "bob@example.com", password: PASSWORD });
    await signIn();
    // A tab that does not share the channel, so this tab never hears of its sign-in.
    await makeClient().signIn({ identifier: "bob", password: PASSWORD });
    const sent = api.requests.length;
    await expect(client.signOut()).resolves.toEqual({ outcome: "signed-out" });
    expect(pathsSince(api, sent)).toEqual([
      "/api/auth/logout",
      "/api/auth/refresh",
      "/api/auth/logout",
    ]);
    expect(api.activeSessionCount("ada@example.com")).toBe(0);
    expect(api.activeSessionCount("bob@example.com")).toBe(0);
    expect(api.restorableSession()).toBe(false);
  });

  it("costs one refresh when the cookie was this tab's own", async () => {
    const { api, client, signIn } = setup();
    await signIn();
    const sent = api.requests.length;
    await expect(client.signOut()).resolves.toEqual({ outcome: "signed-out" });
    expect(pathsSince(api, sent)).toEqual(["/api/auth/logout", "/api/auth/refresh"]);
  });

  it("checks nothing more on a backend without sessions", async () => {
    const { api, client, signIn } = setup({ sessions: "legacy" });
    await signIn();
    const sent = api.requests.length;
    await client.signOut();
    expect(pathsSince(api, sent)).toEqual(["/api/auth/logout"]);
  });

  it("reports the server unreachable when the check cannot be made", async () => {
    const { api, client, makeClient, signIn } = setup();
    api.addUser({ username: "bob", email: "bob@example.com", password: PASSWORD });
    await signIn();
    await makeClient().signIn({ identifier: "bob", password: PASSWORD });
    api.respondNext("POST", "/api/auth/refresh", "network-error");
    await expect(client.signOut()).resolves.toEqual({ outcome: "server-unreachable" });
    expect(api.restorableSession()).toBe(true);
  });
});

describe("a cookie session whose found token the logout refuses", () => {
  /** Signs ada out here while bob's session, unknown to this tab, holds the cookie. */
  const signOutRefusing = async (refusals: number) => {
    const { api, client, makeClient, signIn } = setup();
    api.addUser({ username: "bob", email: "bob@example.com", password: PASSWORD });
    await signIn();
    await makeClient().signIn({ identifier: "bob", password: PASSWORD });
    const sent = api.requests.length;
    // The lookup's fresh token dies before its logout (expired tokens, a revoked token).
    const release = api.holdNext("POST", "/api/auth/refresh");
    const signingOut = client.signOut();
    await settle();
    for (let index = 0; index < refusals; index += 1) {
      api.respondNext("POST", "/api/auth/logout", REFUSED);
    }
    release();
    return { api, result: await signingOut, paths: pathsSince(api, sent) };
  };

  it("is looked up again and logged out with a new token", async () => {
    const { api, result, paths } = await signOutRefusing(1);
    expect(result).toEqual({ outcome: "signed-out" });
    expect(paths).toEqual([
      "/api/auth/logout",
      "/api/auth/refresh",
      "/api/auth/logout",
      "/api/auth/refresh",
      "/api/auth/logout",
    ]);
    expect(api.activeSessionCount("bob@example.com")).toBe(0);
    expect(api.restorableSession()).toBe(false);
  });

  it("is reported as possibly alive when the second logout is refused too", async () => {
    const { api, result } = await signOutRefusing(2);
    expect(result).toEqual({ outcome: "server-unreachable" });
    expect(api.restorableSession()).toBe(true);
  });
});

describe("a session whose refresh token came in a body, its access token dead", () => {
  const signedUpThenExpired = async () => {
    const context = setup();
    await context.client.register({
      username: "eve",
      email: "eve@example.com",
      password: PASSWORD,
    });
    context.api.expireAccessTokens();
    return context;
  };

  it("is refreshed outside the session and logged out with the new token", async () => {
    const { api, client } = await signedUpThenExpired();
    const sent = api.requests.length;
    await expect(client.signOut()).resolves.toEqual({ outcome: "signed-out" });
    expect(pathsSince(api, sent)).toEqual([
      "/api/auth/logout",
      "/api/auth/refresh",
      "/api/auth/logout",
      "/api/auth/refresh",
    ]);
    expect(api.activeSessionCount("eve@example.com")).toBe(0);
  });

  it("is reported as possibly alive when that refresh cannot reach the server", async () => {
    const { api, client } = await signedUpThenExpired();
    api.respondNext("POST", "/api/auth/refresh", "network-error");
    await expect(client.signOut()).resolves.toEqual({ outcome: "server-unreachable" });
    expect(api.activeSessionCount("eve@example.com")).toBe(1);
  });
});

describe("the logout's answer", () => {
  const answer = (status: number) => ({
    status,
    body: { data: null, error: { status, name: "x", message: "x", details: {} } },
    headers: status === 429 ? { "Retry-After": "30" } : {},
  });

  it.each([400, 403, 409, 429, 500, 503])(
    "reports the server unreachable when it is %i, as the session may live on",
    async (status) => {
      const { api, client, signIn } = setup();
      await signIn();
      api.respondNext("POST", "/api/auth/logout", answer(status));
      await expect(client.signOut()).resolves.toEqual({ outcome: "server-unreachable" });
      expect(api.restorableSession()).toBe(true);
    },
  );

  it("lets the cookie lookup decide when the access token was already dead (401)", async () => {
    const { api, client, signIn } = setup();
    await signIn();
    api.expireAccessTokens();
    const sent = api.requests.length;
    await expect(client.signOut()).resolves.toEqual({ outcome: "signed-out" });
    expect(pathsSince(api, sent)).toEqual([
      "/api/auth/logout",
      "/api/auth/refresh",
      "/api/auth/logout",
    ]);
    expect(api.restorableSession()).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { PASSWORD, rejection, settle, setup } from "./test-harness.ts";

const paths = (requests: readonly { path: string }[]): string[] =>
  requests.map((request) => request.path);

describe("restore", () => {
  it("resumes a session from the HttpOnly refresh cookie after a reload", async () => {
    const { api, signIn, makeClient } = setup();
    await signIn();
    const reloaded = makeClient();
    const state = await reloaded.restore();
    expect(state).toMatchObject({ status: "signed-in", user: { username: "ada" } });
    const refresh = api.requests.find((request) => request.path === "/api/auth/refresh");
    expect(refresh?.method).toBe("POST");
    expect(refresh?.credentials).toBe("include");
    expect(refresh?.headers.get("x-requested-with")).toBe("identgineer");
    expect(refresh?.headers.get("x-strapi-refresh-cookie")).toBe("httpOnly");
    expect(refresh?.headers.has("authorization")).toBe(false);
    expect(refresh?.body).toEqual({});
  });

  it("is signed out with no session when there is no cookie", async () => {
    const { client, states } = setup();
    expect(await client.restore()).toEqual({ status: "signed-out", reason: "no-session" });
    expect(states).toEqual([{ status: "signed-out", reason: "no-session" }]);
  });

  it("is signed out on a backend without sessions", async () => {
    const { client } = setup({ sessions: "legacy" });
    expect(await client.restore()).toEqual({ status: "signed-out", reason: "no-session" });
  });

  it("stays unknown and reports a network failure", async () => {
    const { api, client } = setup();
    api.respondNext("POST", "/api/auth/refresh", "network-error");
    await expect(client.restore()).rejects.toMatchObject({ code: "network" });
    expect(client.getState()).toEqual({ status: "unknown" });
  });

  it("keeps a signed-in session as it is", async () => {
    const { api, client, signIn } = setup();
    await signIn();
    const sent = api.requests.length;
    expect((await client.restore()).status).toBe("signed-in");
    expect(api.requests).toHaveLength(sent);
  });

  it("cannot resume a session whose refresh token came in a body (memory only)", async () => {
    const { api, client, makeClient } = setup();
    await client.register({ username: "grace", email: "grace@example.com", password: PASSWORD });
    expect(api.refreshCookie()).toBeUndefined();
    expect(await makeClient().restore()).toEqual({ status: "signed-out", reason: "no-session" });
  });
});

describe("authorizedFetch", () => {
  it("adds the bearer token to a path under the base URL, without cookies", async () => {
    const { api, client, signIn } = setup();
    await signIn();
    const response = await client.authorizedFetch("/api/users/me");
    expect(response.status).toBe(200);
    const request = api.requests.at(-1);
    expect(request?.headers.get("authorization")).toMatch(/^Bearer /);
    expect(request?.credentials).toBe("omit");
  });

  it("accepts an absolute URL on the base URL's origin and keeps the caller's options", async () => {
    const { api, client, signIn } = setup();
    await signIn();
    await client.authorizedFetch(`${api.baseUrl}/api/profiles`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer forged" },
      body: JSON.stringify({ data: { displayName: "Ada" } }),
    });
    const request = api.requests.at(-1);
    expect(request?.method).toBe("POST");
    expect(request?.headers.get("content-type")).toBe("application/json");
    expect(request?.headers.get("authorization")).not.toBe("Bearer forged");
  });

  it.each([
    "https://evil.example/api/users/me",
    "//evil.example/api/users/me",
    "http://cms.example.test/api/users/me",
    "javascript:alert(1)",
    "api/users/me",
  ])("never sends the token to %s", async (target) => {
    const { api, client, signIn } = setup();
    await signIn();
    const sent = api.requests.length;
    await expect(client.authorizedFetch(target)).rejects.toMatchObject({ code: "validation" });
    expect(api.requests).toHaveLength(sent);
  });

  it("refreshes once on a 401, checks the cookie's user, and retries", async () => {
    const { api, client, signIn } = setup();
    await signIn();
    const sent = api.requests.length;
    api.expireAccessTokens();
    const response = await client.authorizedFetch("/api/profiles");
    expect(response.status).toBe(200);
    expect(paths(api.requests.slice(sent))).toEqual([
      "/api/profiles",
      "/api/auth/refresh",
      "/api/users/me",
      "/api/profiles",
    ]);
  });

  it("refuses without a session", async () => {
    const { client } = setup();
    await expect(client.authorizedFetch("/api/users/me")).rejects.toMatchObject({
      code: "unauthorized",
    });
  });
});

describe("single-flight refresh", () => {
  it("shares one refresh among concurrent 401s", async () => {
    const { api, client, signIn } = setup();
    await signIn();
    api.expireAccessTokens();
    const responses = await Promise.all([
      client.authorizedFetch("/api/users/me"),
      client.currentUser(),
      client.authorizedFetch("/api/profiles"),
      client.authorizedFetch("/api/auth/sessions"),
    ]);
    expect(responses).toHaveLength(4);
    expect(paths(api.requests).filter((path) => path === "/api/auth/refresh")).toHaveLength(1);
    expect(client.getState().status).toBe("signed-in");
  });

  it("signs out once, with the reason, when the shared refresh is refused", async () => {
    const { api, client, states, signIn } = setup();
    await signIn();
    api.expireAccessTokens();
    api.clearCookies();
    const results = await Promise.allSettled([client.currentUser(), client.currentUser()]);
    expect(results.map((result) => result.status)).toEqual(["rejected", "rejected"]);
    expect(paths(api.requests).filter((path) => path === "/api/auth/refresh")).toHaveLength(1);
    expect(client.getState()).toEqual({ status: "signed-out", reason: "expired" });
    expect(states.filter((state) => state.status === "signed-out")).toHaveLength(1);
  });

  it("returns the 401 to an authorizedFetch caller when the refresh is refused", async () => {
    const { api, client, signIn } = setup();
    await signIn();
    api.expireAccessTokens();
    api.clearCookies();
    const response = await client.authorizedFetch("/api/users/me");
    expect(response.status).toBe(401);
    expect(client.getState()).toEqual({ status: "signed-out", reason: "expired" });
  });

  it("refreshes a body-held refresh token in the body, without cookies", async () => {
    const { api, client } = setup();
    await client.register({ username: "grace", email: "grace@example.com", password: PASSWORD });
    api.expireAccessTokens();
    await client.currentUser();
    const refresh = api.requests.find((request) => request.path === "/api/auth/refresh");
    expect(refresh?.credentials).toBe("omit");
    expect(refresh?.body).toMatchObject({ refreshToken: expect.stringMatching(/\./) as unknown });
    api.expireAccessTokens();
    await expect(client.currentUser()).resolves.toMatchObject({ username: "grace" });
  });
});

describe("scheduled refresh", () => {
  it("refreshes before a JWT access token expires", async () => {
    const { api, clock, signIn } = setup({ accessTokenLifetimeSeconds: 600 });
    await signIn();
    clock.advance(569_000);
    await settle();
    expect(paths(api.requests)).not.toContain("/api/auth/refresh");
    clock.advance(1_000);
    await settle();
    expect(paths(api.requests)).toContain("/api/auth/refresh");
  });

  it("keeps refreshing on schedule", async () => {
    const { api, clock, signIn } = setup({ accessTokenLifetimeSeconds: 600 });
    await signIn();
    for (let round = 0; round < 3; round += 1) {
      clock.advance(570_000);
      await settle();
    }
    expect(paths(api.requests).filter((path) => path === "/api/auth/refresh")).toHaveLength(3);
  });

  it("signs out with the reason when the scheduled refresh is refused", async () => {
    const { api, clock, client, signIn } = setup({ accessTokenLifetimeSeconds: 600 });
    await signIn();
    api.clearCookies();
    clock.advance(570_000);
    await settle();
    expect(client.getState()).toEqual({ status: "signed-out", reason: "expired" });
  });

  it("signs out at a known expiry on a backend that cannot refresh", async () => {
    const { clock, client, signIn } = setup({
      sessions: "legacy",
      accessTokens: "jwt",
      accessTokenLifetimeSeconds: 120,
    });
    await signIn();
    clock.advance(90_000);
    await settle();
    expect(client.getState().status).toBe("signed-in");
    clock.advance(30_000);
    await settle();
    expect(client.getState()).toEqual({ status: "signed-out", reason: "expired" });
  });

  it("retries a refresh that could not reach the server, and signs out once expired", async () => {
    const { api, clock, client, signIn } = setup({ accessTokenLifetimeSeconds: 600 });
    await signIn();
    api.respondNext("POST", "/api/auth/refresh", "network-error");
    clock.advance(570_000);
    await settle();
    expect(client.getState().status).toBe("signed-in");
    clock.advance(30_000);
    await settle();
    expect(client.getState().status).toBe("signed-in");
    expect(paths(api.requests).filter((path) => path === "/api/auth/refresh")).toHaveLength(2);
  });

  it("signs out when a known expiry passed and the server is still unreachable", async () => {
    const { api, clock, client, signIn } = setup({
      accessTokens: "jwt",
      accessTokenLifetimeSeconds: 600,
    });
    await signIn();
    api.respondNext("POST", "/api/auth/refresh", "network-error");
    api.respondNext("POST", "/api/auth/refresh", "network-error");
    clock.advance(570_000);
    await settle();
    clock.advance(30_000);
    await settle();
    expect(client.getState()).toEqual({ status: "signed-out", reason: "expired" });
  });

  it("stops the schedule on sign-out and on dispose", async () => {
    const { clock, client, signIn } = setup();
    await signIn();
    await client.signOut();
    expect(clock.pendingTimers()).toBe(0);
    await signIn();
    client.dispose();
    expect(clock.pendingTimers()).toBe(0);
  });
});

describe("cross-tab sign-out", () => {
  it("drops the session in other tabs when one tab signs out", async () => {
    const { api, client, makeClient, signIn } = setup();
    const other = makeClient({ sharedChannel: true });
    await signIn();
    await other.restore();
    expect(other.getState().status).toBe("signed-in");
    await client.signOut();
    await settle();
    expect(other.getState()).toEqual({ status: "signed-out", reason: "other-tab" });
    const sent = api.requests.length;
    expect(await rejection(other.currentUser())).toMatchObject({ code: "unauthorized" });
    expect(api.requests).toHaveLength(sent);
  });
});

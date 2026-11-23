import { describe, expect, it } from "vitest";
import { IdentityError } from "./identity-error.ts";
import { PASSWORD, rejection, settle, setup } from "./test-harness.ts";
import type { FakeIdentityApi } from "./testing/fake-identity-api.ts";

const refreshes = (api: FakeIdentityApi): number =>
  api.requests.filter((request) => request.path === "/api/auth/refresh").length;

const unauthorizedAnswer = {
  status: 401,
  body: {
    data: null,
    error: { status: 401, name: "UnauthorizedError", message: "x", details: {} },
  },
};

const addBob = (api: FakeIdentityApi) =>
  api.addUser({ username: "bob", email: "bob@example.com", password: PASSWORD });

describe("sign-out racing a sign-in", () => {
  it("stays signed out and ends the session the late answer opened", async () => {
    const { api, client, signIn } = setup();
    const release = api.holdNext("POST", "/api/auth/local");
    const signingIn = rejection(signIn());
    await settle();
    const signingOut = client.signOut();
    release();
    await signingOut;
    expect(await signingIn).toMatchObject({ code: "unauthorized" });
    expect(client.getState()).toEqual({ status: "signed-out", reason: "user" });
    expect(api.activeSessionCount("ada@example.com")).toBe(0);
    expect(api.refreshCookie()).toBeUndefined();
  });

  it("stays signed out when another tab signs out during the sign-in", async () => {
    const { api, client, makeClient, signIn } = setup();
    const other = makeClient({ sharedChannel: true });
    const release = api.holdNext("POST", "/api/auth/local");
    const signingIn = signIn().catch((error: unknown) => error);
    await settle();
    await other.signOut();
    await settle();
    release();
    await signingIn;
    await settle();
    expect(client.getState()).toMatchObject({ status: "signed-out" });
    expect(api.activeSessionCount("ada@example.com")).toBe(0);
  });
});

describe("a restore finishing during a sign-in", () => {
  it("keeps the explicit sign-in, not the cookie's earlier user", async () => {
    const { api, client, makeClient } = setup();
    addBob(api);
    const previousPage = makeClient();
    await previousPage.signIn({ identifier: "ada", password: PASSWORD });
    previousPage.dispose();
    const release = api.holdNext("POST", "/api/auth/local");
    const signingIn = client.signIn({ identifier: "bob", password: PASSWORD });
    await settle();
    const restoring = client.restore();
    await settle();
    release();
    await expect(signingIn).resolves.toMatchObject({ username: "bob" });
    expect(await restoring).toMatchObject({ status: "signed-in", user: { username: "bob" } });
    expect(client.getState()).toMatchObject({ status: "signed-in", user: { username: "bob" } });
    expect(api.refreshCookie()).toBeDefined();
    expect(await makeClient().restore()).toMatchObject({ user: { username: "bob" } });
  });

  it("keeps the sign-in when another tab's sign-in notice arrives during it", async () => {
    const { api, client, makeClient } = setup();
    addBob(api);
    await client.restore();
    const release = api.holdNext("POST", "/api/auth/local");
    const signingIn = client.signIn({ identifier: "bob", password: PASSWORD });
    await settle();
    await makeClient({ sharedChannel: true }).signIn({ identifier: "ada", password: PASSWORD });
    await settle();
    release();
    await expect(signingIn).resolves.toMatchObject({ username: "bob" });
    await settle();
    await settle();
    expect(client.getState()).toMatchObject({ status: "signed-in", user: { username: "bob" } });
  });

  it("is still cancelled by a sign-out", async () => {
    const { api, client, signIn } = setup();
    const release = api.holdNext("POST", "/api/auth/local");
    const signingIn = rejection(signIn());
    await settle();
    const restoring = client.restore();
    const signingOut = client.signOut();
    release();
    await signingOut;
    await restoring;
    expect(await signingIn).toMatchObject({ code: "unauthorized" });
    expect(client.getState()).toEqual({ status: "signed-out", reason: "user" });
    expect(api.activeSessionCount("ada@example.com")).toBe(0);
  });
});

describe("overlapping sign-ins", () => {
  it("lets the later call win, even when the earlier answer comes last", async () => {
    const { api, client, makeClient } = setup();
    addBob(api);
    const release = api.holdNext("POST", "/api/auth/local");
    const first = client.signIn({ identifier: "ada", password: PASSWORD });
    const second = client.signIn({ identifier: "bob", password: PASSWORD });
    await settle();
    release();
    await Promise.all([first, second]);
    expect(client.getState()).toMatchObject({ status: "signed-in", user: { username: "bob" } });
    expect(await makeClient().restore()).toMatchObject({ user: { username: "bob" } });
  });
});

describe("dispose", () => {
  it("arms no timer and sets no tokens when a sign-in answers after it", async () => {
    const { api, clock, client, signIn } = setup();
    const release = api.holdNext("POST", "/api/auth/local");
    const signingIn = rejection(signIn());
    await settle();
    client.dispose();
    release();
    expect(await signingIn).toBeInstanceOf(IdentityError);
    expect(clock.pendingTimers()).toBe(0);
    clock.advance(600_000);
    await settle();
    expect(refreshes(api)).toBe(0);
  });

  it("arms no timer when a refresh answers after it", async () => {
    const { api, clock, client, signIn } = setup();
    await signIn();
    const release = api.holdNext("POST", "/api/auth/refresh");
    clock.advance(570_000);
    await settle();
    client.dispose();
    release();
    await settle();
    expect(clock.pendingTimers()).toBe(0);
  });

  it("arms no retry when a scheduled refresh fails after it", async () => {
    const { api, clock, client, signIn } = setup();
    await signIn();
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    api.respondNext("POST", "/api/auth/refresh", async () => {
      await gate;
      throw new TypeError("offline");
    });
    clock.advance(570_000);
    await settle();
    client.dispose();
    release();
    await settle();
    expect(clock.pendingTimers()).toBe(0);
  });

  it("makes every later call reject with an IdentityError", async () => {
    const { api, client, signIn } = setup();
    await signIn();
    client.dispose();
    const sent = api.requests.length;
    for (const call of [
      () => client.signOut(),
      () => client.signIn({ identifier: "ada", password: PASSWORD }),
      () => client.restore(),
      () => client.currentUser(),
      () => client.authorizedFetch("/api/users/me"),
      () => client.getProfile(),
    ]) {
      const error = await rejection(call());
      expect(error).toBeInstanceOf(IdentityError);
      expect(error).toMatchObject({ code: "unknown" });
    }
    expect(() => client.providerSignInUrl("github")).toThrow(IdentityError);
    expect(api.requests).toHaveLength(sent);
  });
});

describe("a request answered after the user changed (same tab)", () => {
  it("is not refreshed and retried with the new user's token", async () => {
    const { api, client, signIn } = setup();
    addBob(api);
    await signIn();
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    api.respondNext("POST", "/api/profiles", async () => {
      await gate;
      return unauthorizedAnswer;
    });
    const pending = client.authorizedFetch("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: { displayName: "Ada's secret" } }),
    });
    await settle();
    await client.signOut();
    await client.signIn({ identifier: "bob", password: PASSWORD });
    const sent = api.requests.length;
    release();
    expect((await pending).status).toBe(401);
    expect(api.requests).toHaveLength(sent);
    expect(client.getState()).toMatchObject({ status: "signed-in", user: { username: "bob" } });
  });

  it("rejects an SDK call instead of retrying it as the new user", async () => {
    const { api, client, signIn } = setup();
    addBob(api);
    await signIn();
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    api.respondNext("GET", "/api/users/me", async () => {
      await gate;
      return unauthorizedAnswer;
    });
    const pending = rejection(client.currentUser());
    await settle();
    await client.signOut();
    await client.signIn({ identifier: "bob", password: PASSWORD });
    const sent = api.requests.length;
    release();
    expect(await pending).toMatchObject({ code: "unauthorized" });
    expect(api.requests).toHaveLength(sent);
    expect(client.getState()).toMatchObject({ status: "signed-in", user: { username: "bob" } });
  });
});

describe("another tab signing in as someone else", () => {
  it("signs this tab out when its cookie refresh turns out to be another user", async () => {
    const { api, client, makeClient, signIn } = setup();
    addBob(api);
    await signIn();
    await makeClient().signIn({ identifier: "bob", password: PASSWORD });
    api.expireAccessTokens();
    const response = await client.authorizedFetch("/api/users/me");
    expect(response.status).toBe(401);
    expect(client.getState()).toEqual({ status: "signed-out", reason: "user-changed" });
  });

  it("keeps this tab's own user when the user check after a refresh fails", async () => {
    const { api, client, makeClient, signIn } = setup();
    addBob(api);
    await signIn();
    api.respondNext("GET", "/api/users/me", "network-error");
    await makeClient({ sharedChannel: true }).signIn({ identifier: "bob", password: PASSWORD });
    await settle();
    await settle();
    const response = await client.authorizedFetch("/api/users/me");
    expect(((await response.json()) as { username: string }).username).toBe("ada");
  });

  it("re-checks at once when told another tab signed in", async () => {
    const { api, client, makeClient, signIn } = setup();
    addBob(api);
    await signIn();
    await makeClient({ sharedChannel: true }).signIn({ identifier: "bob", password: PASSWORD });
    await settle();
    await settle();
    expect(client.getState()).toEqual({ status: "signed-out", reason: "user-changed" });
  });

  it("keeps the session when the other tab signed in as the same user", async () => {
    const { client, makeClient, signIn } = setup();
    await signIn();
    await makeClient({ sharedChannel: true }).signIn({ identifier: "ada", password: PASSWORD });
    await settle();
    await settle();
    expect(client.getState()).toMatchObject({ status: "signed-in", user: { username: "ada" } });
    await expect(client.currentUser()).resolves.toMatchObject({ username: "ada" });
  });

  it("signs a signed-out tab in when another tab signs in", async () => {
    const { client, makeClient } = setup();
    await client.restore();
    await makeClient({ sharedChannel: true }).signIn({ identifier: "ada", password: PASSWORD });
    await settle();
    await settle();
    expect(client.getState()).toMatchObject({ status: "signed-in", user: { username: "ada" } });
  });
});

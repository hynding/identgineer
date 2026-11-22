import { describe, expect, it } from "vitest";
import type { IdentityState } from "./session.ts";
import { PASSWORD, settle, setup } from "./test-harness.ts";
import type { FakeIdentityApi } from "./testing/fake-identity-api.ts";

const addBob = (api: FakeIdentityApi) =>
  api.addUser({ username: "bob", email: "bob@example.com", password: PASSWORD });

const refused = {
  status: 401,
  body: {
    data: null,
    error: { status: 401, name: "UnauthorizedError", message: "x", details: {} },
  },
};

const twoTabs = async () => {
  const context = setup();
  addBob(context.api);
  const other = context.makeClient({ sharedChannel: true });
  await other.restore();
  await context.signIn();
  await settle();
  const heard: IdentityState[] = [];
  other.subscribe((state) => heard.push(state));
  return { ...context, other, heard };
};

describe("a sign-in in another tab during a sign-out (the later action wins)", () => {
  it("stands when it lands while the logout is under way", async () => {
    const { api, client, other, heard } = await twoTabs();
    const releaseLogout = api.holdNext("POST", "/api/auth/logout");
    const signingOut = client.signOut();
    await settle();
    await expect(other.signIn({ identifier: "bob", password: PASSWORD })).resolves.toMatchObject({
      username: "bob",
    });
    await settle();
    releaseLogout();
    await expect(signingOut).resolves.toEqual({ outcome: "superseded" });
    await settle();
    await settle();
    expect(other.getState()).toMatchObject({ status: "signed-in", user: { username: "bob" } });
    expect(heard.map((state) => state.status)).not.toContain("signed-out");
    // The residual window: the logout already in flight carried the old cookie, so the backend
    // cleared the cookie the newer sign-in had set when it ended the old session. That tab stays
    // signed in on its tokens, but no tab can resume from the cookie, so this one stays out.
    expect(api.activeSessionCount("bob@example.com")).toBe(1);
    expect(api.restorableSession()).toBe(false);
    expect(client.getState()).toEqual({ status: "signed-out", reason: "user" });
  });

  it("stands when it lands while the cookie lookup is under way", async () => {
    const { api, client, other, heard } = await twoTabs();
    const releaseLookup = api.holdNext("POST", "/api/auth/refresh");
    const signingOut = client.signOut();
    await settle();
    await other.signIn({ identifier: "bob", password: PASSWORD });
    await settle();
    releaseLookup();
    await expect(signingOut).resolves.toEqual({ outcome: "superseded" });
    await settle();
    await settle();
    expect(other.getState()).toMatchObject({ status: "signed-in", user: { username: "bob" } });
    expect(heard.map((state) => state.status)).not.toContain("signed-out");
    expect(client.getState()).toMatchObject({ status: "signed-in", user: { username: "bob" } });
    expect(api.activeSessionCount("bob@example.com")).toBe(1);
  });

  it("is not logged out by the lookup when its notice came first", async () => {
    const { api, client, other } = await twoTabs();
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    // A logout that leaves the cookie alone, so the lookup would find the newer session.
    api.respondNext("POST", "/api/auth/logout", async () => {
      await gate;
      return { status: 200, body: { ok: true } };
    });
    const signingOut = client.signOut();
    await settle();
    await other.signIn({ identifier: "bob", password: PASSWORD });
    await settle();
    const sent = api.requests.length;
    release();
    await expect(signingOut).resolves.toEqual({ outcome: "superseded" });
    const afterLogout = api.requests.slice(sent).map((request) => request.path);
    expect(afterLogout).not.toContain("/api/auth/logout");
    expect(api.activeSessionCount("bob@example.com")).toBe(1);
    expect(api.restorableSession()).toBe(true);
  });
});

describe("a sign-in heard of while the cookie lookup finds a session", () => {
  it("leaves the session the lookup found alone", async () => {
    const { api, client, makeClient, other } = await twoTabs();
    // A tab apart, whose session the cookie names when the lookup reads it.
    await makeClient().signIn({ identifier: "bob", password: PASSWORD });
    const releaseLookup = api.holdNext("POST", "/api/auth/refresh");
    const signingOut = client.signOut();
    await settle();
    const sent = api.requests.length;
    await other.signIn({ identifier: "bob", password: PASSWORD });
    await settle();
    releaseLookup();
    await expect(signingOut).resolves.toEqual({ outcome: "superseded" });
    const logouts = api.requests
      .slice(sent)
      .filter((request) => request.path === "/api/auth/logout");
    expect(logouts).toEqual([]);
    expect(api.activeSessionCount("bob@example.com")).toBe(2);
  });
});

describe("a sign-in asked for in the same tab during its sign-out", () => {
  it("waits for the sign-out, which finishes and tells the other tabs, then signs in", async () => {
    const { api, client, other, heard } = await twoTabs();
    const releaseLogout = api.holdNext("POST", "/api/auth/logout");
    const signingOut = client.signOut();
    await settle();
    const signingIn = client.signIn({ identifier: "bob", password: PASSWORD });
    releaseLogout();
    await expect(signingOut).resolves.toEqual({ outcome: "signed-out" });
    expect(api.activeSessionCount("ada@example.com")).toBe(0);
    await expect(signingIn).resolves.toMatchObject({ username: "bob" });
    await settle();
    await settle();
    expect(heard).toContainEqual({ status: "signed-out", reason: "other-tab" });
    expect(client.getState()).toMatchObject({ status: "signed-in", user: { username: "bob" } });
    expect(other.getState()).toMatchObject({ status: "signed-in", user: { username: "bob" } });
  });

  it("that fails leaves the sign-out to finish and tell the other tabs", async () => {
    const { api, client, other } = await twoTabs();
    const releaseLogout = api.holdNext("POST", "/api/auth/logout");
    const signingOut = client.signOut();
    await settle();
    const failing = client.signIn({ identifier: "bob", password: "a wrong password" });
    releaseLogout();
    await expect(signingOut).resolves.toEqual({ outcome: "signed-out" });
    await expect(failing).rejects.toMatchObject({ code: "invalid-credentials" });
    await settle();
    expect(other.getState()).toEqual({ status: "signed-out", reason: "other-tab" });
  });

  it("that fails leaves nothing to resume when this tab's token was already dead", async () => {
    const { api, client } = await twoTabs();
    api.expireAccessTokens();
    const releaseLogout = api.holdNext("POST", "/api/auth/logout");
    const signingOut = client.signOut();
    await settle();
    const failing = client.signIn({ identifier: "bob", password: "a wrong password" });
    releaseLogout();
    await expect(signingOut).resolves.toEqual({ outcome: "signed-out" });
    await failing.catch(() => undefined);
    expect(api.restorableSession()).toBe(false);
  });

  it("that registers without signing in leaves the sign-out to finish", async () => {
    const { api, client } = setup({ emailConfirmation: true });
    await client.signIn({ identifier: "ada", password: PASSWORD });
    const releaseLogout = api.holdNext("POST", "/api/auth/logout");
    const signingOut = client.signOut();
    await settle();
    const registering = client.register({
      username: "carol",
      email: "carol@example.com",
      password: PASSWORD,
    });
    releaseLogout();
    await expect(signingOut).resolves.toEqual({ outcome: "signed-out" });
    await expect(registering).resolves.toEqual({ outcome: "check-email" });
  });
});

describe("another tab that signs in and out again during a sign-out", () => {
  it("does not supersede it: the sign-out finishes and ends what the cookie names", async () => {
    const { api, client, other } = await twoTabs();
    const releaseLogout = api.holdNext("POST", "/api/auth/logout");
    const signingOut = client.signOut();
    await settle();
    await other.signIn({ identifier: "bob", password: PASSWORD });
    await settle();
    await other.signOut();
    await settle();
    releaseLogout();
    await expect(signingOut).resolves.toEqual({ outcome: "signed-out" });
    expect(api.restorableSession()).toBe(false);
  });
});

describe("a re-check that finds no session after this tab signed out", () => {
  it("keeps the reason the user signed out for", async () => {
    const { api, client, makeClient, signIn } = setup();
    addBob(api);
    await signIn();
    await client.signOut();
    api.respondNext("POST", "/api/auth/refresh", refused);
    api.respondNext("POST", "/api/auth/refresh", refused);
    await makeClient({ sharedChannel: true }).signIn({ identifier: "bob", password: PASSWORD });
    await settle();
    await settle();
    expect(client.getState()).toEqual({ status: "signed-out", reason: "user" });
  });
});

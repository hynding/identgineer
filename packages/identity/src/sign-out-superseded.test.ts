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

describe("a sign-in asked for in the same tab during its sign-out", () => {
  it("makes the sign-out superseded, and no other tab is told of a sign-out", async () => {
    const { api, client, heard } = await twoTabs();
    const releaseLogout = api.holdNext("POST", "/api/auth/logout");
    const signingOut = client.signOut();
    await settle();
    const signingIn = client.signIn({ identifier: "bob", password: PASSWORD });
    releaseLogout();
    await expect(signingOut).resolves.toEqual({ outcome: "superseded" });
    await expect(signingIn).resolves.toMatchObject({ username: "bob" });
    await settle();
    expect(heard).not.toContainEqual({ status: "signed-out", reason: "other-tab" });
    expect(client.getState()).toMatchObject({ status: "signed-in", user: { username: "bob" } });
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

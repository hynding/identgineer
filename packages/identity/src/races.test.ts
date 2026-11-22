import { describe, expect, it } from "vitest";
import { IdentityError } from "./identity-error.ts";
import type { IdentityState } from "./session.ts";
import { PASSWORD, rejection, settle, setup } from "./test-harness.ts";
import type { FakeIdentityApi } from "./testing/fake-identity-api.ts";

const paths = (api: FakeIdentityApi, from = 0): string[] =>
  api.requests.slice(from).map((request) => request.path);

const addBob = (api: FakeIdentityApi) =>
  api.addUser({ username: "bob", email: "bob@example.com", password: PASSWORD });

/** A refresh answer that fails as a lost network would, once `release` is called. */
const failingLater = (api: FakeIdentityApi): (() => void) => {
  let release = (): void => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  api.respondNext("POST", "/api/auth/refresh", async () => {
    await gate;
    throw new TypeError("Failed to fetch");
  });
  return release;
};

describe("a scheduled refresh still under way at sign-out", () => {
  it("arms no retry and puts no token in the signed-out tab when it fails", async () => {
    const { api, client, clock, signIn } = setup(
      { httpOnlyCookies: true },
      { requestTimeoutMs: 1000 },
    );
    await signIn();
    api.respondNext("POST", "/api/auth/refresh", "hang");
    clock.advance(570_000);
    await settle();
    api.respondNext("POST", "/api/auth/logout", "network-error");
    await client.signOut();
    clock.advance(1000);
    await settle();
    const sent = api.requests.length;
    for (let round = 0; round < 3; round += 1) {
      clock.advance(300_000);
      await settle();
    }
    expect(paths(api, sent)).toEqual([]);
    expect(clock.pendingTimers()).toBe(0);
    await expect(client.authorizedFetch("/api/users/me")).rejects.toMatchObject({
      code: "unauthorized",
    });
    expect(client.getState()).toEqual({ status: "signed-out", reason: "user" });
  });

  it("keeps the user's own sign-out reason when it is refused afterwards", async () => {
    const { api, client, clock, signIn } = setup();
    await signIn();
    const release = api.holdNext("POST", "/api/auth/refresh");
    clock.advance(570_000);
    await settle();
    api.respondNext("POST", "/api/auth/logout", "network-error");
    await client.signOut();
    api.clearCookies();
    release();
    await settle();
    expect(client.getState()).toEqual({ status: "signed-out", reason: "user" });
  });

  it("never adopts the token of a user who signed in elsewhere afterwards", async () => {
    const { api, client, clock, makeClient, signIn } = setup();
    addBob(api);
    await signIn();
    const release = failingLater(api);
    clock.advance(570_000);
    await settle();
    api.respondNext("POST", "/api/auth/logout", "network-error");
    await client.signOut();
    await makeClient().signIn({ identifier: "bob", password: PASSWORD });
    release();
    for (let round = 0; round < 3; round += 1) {
      clock.advance(60_000);
      await settle();
    }
    await expect(client.authorizedFetch("/api/users/me")).rejects.toMatchObject({
      code: "unauthorized",
    });
    expect(client.getState()).toEqual({ status: "signed-out", reason: "user" });
  });
});

describe("a sign-out made while a sign-in waits its turn", () => {
  it("cancels a sign-in queued behind a restore before it starts", async () => {
    const { api, client, makeClient } = setup({ httpOnlyCookies: true });
    const previousPage = makeClient();
    await previousPage.signIn({ identifier: "ada", password: PASSWORD });
    previousPage.dispose();
    const release = api.holdNext("POST", "/api/auth/refresh");
    const restoring = client.restore().catch(() => undefined);
    await settle();
    const signingIn = rejection(client.signIn({ identifier: "ada", password: PASSWORD }));
    await settle();
    const signingOut = client.signOut();
    const sent = api.requests.length;
    release();
    await expect(signingOut).resolves.toEqual({ outcome: "signed-out" });
    await restoring;
    expect(await signingIn).toMatchObject({ code: "unauthorized" });
    await settle();
    expect(paths(api, sent)).not.toContain("/api/auth/local");
    expect(client.getState()).toEqual({ status: "signed-out", reason: "user" });
    expect(api.restorableSession()).toBe(false);
  });

  it("cancels a provider sign-in queued the same way", async () => {
    const { api, client } = setup();
    api.completeProviderRoundTrip("github", "ada@example.com");
    const release = api.holdNext("POST", "/api/auth/refresh");
    const restoring = client.restore().catch(() => undefined);
    await settle();
    const completing = rejection(client.completeProviderSignIn("github"));
    await settle();
    const signingOut = client.signOut();
    release();
    await signingOut;
    await restoring;
    expect(await completing).toMatchObject({ code: "unauthorized" });
    expect(client.getState()).toEqual({ status: "signed-out", reason: "user" });
  });
});

describe("work requested during a sign-out", () => {
  it("runs a restore only once the sign-out has finished, finding nothing to resume", async () => {
    const { api, makeClient, signIn } = setup({ httpOnlyCookies: true });
    await signIn();
    const tab = makeClient();
    const release = api.holdNext("POST", "/api/auth/logout");
    const signingOut = tab.signOut();
    await settle();
    await settle();
    const restoring = tab.restore();
    await settle();
    release();
    await expect(signingOut).resolves.toEqual({ outcome: "signed-out" });
    expect(await restoring).toEqual({ status: "signed-out", reason: "no-session" });
    expect(tab.getState()).toEqual({ status: "signed-out", reason: "no-session" });
    expect(api.activeSessionCount("ada@example.com")).toBe(0);
  });

  it("runs a sign-in once the sign-out has finished, and keeps it", async () => {
    const { api, client, signIn } = setup();
    addBob(api);
    await signIn();
    const release = api.holdNext("POST", "/api/auth/logout");
    const signingOut = client.signOut();
    await settle();
    const signingIn = client.signIn({ identifier: "bob", password: PASSWORD });
    await settle();
    expect(paths(api).filter((path) => path === "/api/auth/local")).toHaveLength(1);
    release();
    await signingOut;
    await expect(signingIn).resolves.toMatchObject({ username: "bob" });
    expect(client.getState()).toMatchObject({ status: "signed-in", user: { username: "bob" } });
  });

  it("runs another tab's re-check only once the sign-out has finished", async () => {
    const { api, client, makeClient, signIn } = setup();
    await signIn();
    const other = makeClient({ sharedChannel: true });
    const release = api.holdNext("POST", "/api/auth/logout");
    const signingOut = client.signOut();
    await settle();
    await other.signIn({ identifier: "ada", password: PASSWORD });
    await settle();
    release();
    await expect(signingOut).resolves.toEqual({ outcome: "signed-out" });
    await settle();
    await settle();
    expect(client.getState().status).toBe("signed-out");
  });
});

describe("a listener that signs out when told of a sign-in", () => {
  it("hears each transition in order, and the sign-in rejects", async () => {
    const { client } = setup();
    const first: IdentityState[] = [];
    const second: IdentityState[] = [];
    client.subscribe((state) => {
      first.push(state);
      if (state.status === "signed-in") void client.signOut();
    });
    client.subscribe((state) => second.push(state));
    const error = await rejection(client.signIn({ identifier: "ada", password: PASSWORD }));
    expect(error).toBeInstanceOf(IdentityError);
    expect(error).toMatchObject({ code: "unauthorized" });
    await settle();
    for (const heard of [first, second]) {
      expect(heard.map((state) => state.status)).toEqual(["signed-in", "signed-out"]);
    }
    expect(client.getState()).toEqual({ status: "signed-out", reason: "user" });
  });
});

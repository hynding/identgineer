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

  it("runs another tab's re-check only once the sign-out has finished, which that sign-in supersedes", async () => {
    const { api, client, makeClient, signIn } = setup();
    await signIn();
    const other = makeClient({ sharedChannel: true });
    const releaseLookup = api.holdNext("POST", "/api/auth/refresh");
    const signingOut = client.signOut();
    await settle();
    await other.signIn({ identifier: "ada", password: PASSWORD });
    await settle();
    expect(client.getState().status).toBe("signed-out");
    releaseLookup();
    await expect(signingOut).resolves.toEqual({ outcome: "superseded" });
    await settle();
    await settle();
    expect(client.getState()).toMatchObject({ status: "signed-in", user: { username: "ada" } });
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

describe("a password change under way at sign-out", () => {
  it("is waited for, cancelled, and its new session ended before the sign-out resolves", async () => {
    const { api, client, signIn } = setup();
    await signIn();
    const release = api.holdNext("POST", "/api/auth/change-password");
    const changing = rejection(
      client.changePassword({
        currentPassword: PASSWORD,
        password: "another long password 123",
        passwordConfirmation: "another long password 123",
      }),
    );
    await settle();
    let resolved = false;
    const signingOut = client.signOut().then((result) => {
      resolved = true;
      return { result, sessions: api.activeSessionCount("ada@example.com") };
    });
    await settle();
    expect(resolved).toBe(false);
    release();
    await expect(signingOut).resolves.toEqual({ result: { outcome: "signed-out" }, sessions: 0 });
    expect(await changing).toMatchObject({ code: "unauthorized" });
  });
});

describe("a sign-in cancelled by a sign-out whose session cannot be ended", () => {
  it("makes the sign-out report the server unreachable", async () => {
    const { api, client } = setup();
    const release = api.holdNext("POST", "/api/auth/local");
    const signingIn = rejection(client.signIn({ identifier: "ada", password: PASSWORD }));
    await settle();
    const signingOut = client.signOut();
    await settle();
    api.respondNext("POST", "/api/auth/logout", "network-error");
    release();
    await expect(signingOut).resolves.toEqual({ outcome: "server-unreachable" });
    expect(await signingIn).toMatchObject({ code: "unauthorized" });
    expect(api.restorableSession()).toBe(true);
  });
});

describe("dispose during a sign-out", () => {
  it("still tells the other tabs before it closes the channel", async () => {
    const { api, client, makeClient, signIn } = setup();
    await signIn();
    const other = makeClient({ sharedChannel: true });
    await other.restore();
    const release = api.holdNext("POST", "/api/auth/logout");
    const signingOut = client.signOut().catch(() => undefined);
    await settle();
    client.dispose();
    await settle();
    expect(other.getState()).toEqual({ status: "signed-out", reason: "other-tab" });
    release();
    await signingOut;
  });
});

describe("a restore while an older session's refresh is under way", () => {
  it("does not take that refresh's answer, and finds the cookie's session itself", async () => {
    const { api, client, clock, makeClient } = setup();
    addBob(api);
    // A session whose refresh token came in the body, refreshed on its schedule.
    await client.register({ username: "eve", email: "eve@example.com", password: PASSWORD });
    const release = api.holdNext("POST", "/api/auth/refresh");
    clock.advance(570_000);
    await settle();
    api.respondNext("POST", "/api/auth/logout", "network-error");
    await client.signOut();
    await makeClient().signIn({ identifier: "bob", password: PASSWORD });
    const restoring = client.restore();
    await settle();
    release();
    expect(await restoring).toMatchObject({ status: "signed-in", user: { username: "bob" } });
  });
});

const REFUSED = {
  status: 401,
  body: {
    data: null,
    error: { status: 401, name: "UnauthorizedError", message: "x", details: {} },
  },
};

/** Refuses the next refresh once `release` is called, and the one after at once. */
const refusingLater = (api: FakeIdentityApi): (() => void) => {
  let release = (): void => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  api.respondNext("POST", "/api/auth/refresh", async () => {
    await gate;
    return REFUSED;
  });
  api.respondNext("POST", "/api/auth/refresh", REFUSED);
  return release;
};

describe("an old session's refresh refused after another tab signed out and this one in again", () => {
  const signedOutElsewhere = async (channelName: string) => {
    const channel = new BroadcastChannel(channelName);
    channel.postMessage({ type: "signed-out" });
    channel.close();
    await settle();
  };

  it("does not end the new session when the refresh was asked for by a request", async () => {
    const { api, client, signIn, channelName } = setup();
    addBob(api);
    await signIn();
    api.expireAccessTokens();
    const release = refusingLater(api);
    const fetching = client.authorizedFetch("/api/users/me").catch(() => undefined);
    await settle();
    await signedOutElsewhere(channelName);
    expect(client.getState()).toEqual({ status: "signed-out", reason: "other-tab" });
    await client.signIn({ identifier: "bob", password: PASSWORD });
    release();
    await fetching;
    await settle();
    expect(client.getState()).toMatchObject({ status: "signed-in", user: { username: "bob" } });
  });

  it("does not end the new session when the refresh was scheduled", async () => {
    const { api, client, clock, signIn, channelName } = setup();
    addBob(api);
    await signIn();
    const release = refusingLater(api);
    clock.advance(570_000);
    await settle();
    await signedOutElsewhere(channelName);
    await client.signIn({ identifier: "bob", password: PASSWORD });
    release();
    await settle();
    expect(client.getState()).toMatchObject({ status: "signed-in", user: { username: "bob" } });
  });
});

describe("a sign-in queued before a sign-out", () => {
  it("is waited for and rejected, and its session ended before the sign-out resolves", async () => {
    const { api, client } = setup();
    const release = api.holdNext("POST", "/api/auth/local");
    const signingIn = rejection(client.signIn({ identifier: "ada", password: PASSWORD }));
    await settle();
    let resolved = false;
    const signingOut = client.signOut().then((result) => {
      resolved = true;
      return result;
    });
    await settle();
    expect(resolved).toBe(false);
    release();
    await expect(signingOut).resolves.toEqual({ outcome: "signed-out" });
    expect(await signingIn).toMatchObject({ code: "unauthorized" });
    expect(api.activeSessionCount("ada@example.com")).toBe(0);
  });
});

describe("a password change asked for before a sign-in in the same tab", () => {
  it("is not sent for the account that sign-in brought", async () => {
    const { api, client, signIn } = setup();
    addBob(api);
    await signIn();
    const release = api.holdNext("POST", "/api/auth/local");
    const signingIn = client.signIn({ identifier: "bob", password: PASSWORD });
    await settle();
    const changing = rejection(
      client.changePassword({
        currentPassword: PASSWORD,
        password: "another long password 123",
        passwordConfirmation: "another long password 123",
      }),
    );
    release();
    await signingIn;
    expect(await changing).toMatchObject({ code: "unauthorized" });
    expect(paths(api)).not.toContain("/api/auth/change-password");
  });
});

describe("a sign-out whose own logout fails while a sign-in it cancelled is ended", () => {
  it("reports the server unreachable", async () => {
    const { api, client, signIn } = setup();
    await signIn();
    const release = api.holdNext("POST", "/api/auth/local");
    const signingIn = rejection(client.signIn({ identifier: "ada", password: PASSWORD }));
    await settle();
    api.respondNext("POST", "/api/auth/logout", "network-error");
    const signingOut = client.signOut();
    await settle();
    release();
    await expect(signingOut).resolves.toEqual({ outcome: "server-unreachable" });
    expect(await signingIn).toMatchObject({ code: "unauthorized" });
  });
});

describe("a restore while an older cookie session's refresh is under way", () => {
  it("does not share that refresh, though both present the cookie", async () => {
    const { api, client, clock, makeClient, signIn } = setup();
    addBob(api);
    await signIn();
    const release = api.holdNext("POST", "/api/auth/refresh");
    clock.advance(570_000);
    await settle();
    api.respondNext("POST", "/api/auth/logout", "network-error");
    await client.signOut();
    await makeClient().signIn({ identifier: "bob", password: PASSWORD });
    const restoring = client.restore();
    await settle();
    release();
    await expect(restoring).resolves.toMatchObject({
      status: "signed-in",
      user: { username: "bob" },
    });
  });
});

describe("a sign-out in a tab disposed before its cookie lookup", () => {
  it("looks nothing up: the tab can no longer hear of a newer sign-in it would end", async () => {
    const { api, client, signIn } = setup();
    await signIn();
    const releaseLogout = api.holdNext("POST", "/api/auth/logout");
    const signingOut = client.signOut();
    await settle();
    client.dispose();
    const sent = api.requests.length;
    releaseLogout();
    await expect(signingOut).resolves.toEqual({ outcome: "server-unreachable" });
    expect(paths(api, sent)).toEqual([]);
  });

  it("logs out nothing the lookup found once disposed during it", async () => {
    const { api, client, makeClient, signIn } = setup();
    addBob(api);
    await signIn();
    await makeClient().signIn({ identifier: "bob", password: PASSWORD });
    const releaseLookup = api.holdNext("POST", "/api/auth/refresh");
    const signingOut = client.signOut();
    await settle();
    client.dispose();
    const sent = api.requests.length;
    releaseLookup();
    await expect(signingOut).resolves.toEqual({ outcome: "server-unreachable" });
    expect(paths(api, sent)).toEqual([]);
    expect(api.restorableUser()).toBe("bob@example.com");
  });
});

describe("dispose of a superseded sign-out", () => {
  it("tells no tab of a sign-out", async () => {
    const { api, client, makeClient, signIn } = setup();
    addBob(api);
    const other = makeClient({ sharedChannel: true });
    await signIn();
    await settle();
    const release = api.holdNext("POST", "/api/auth/logout");
    const signingOut = client.signOut();
    await settle();
    await other.signIn({ identifier: "bob", password: PASSWORD });
    await settle();
    client.dispose();
    await settle();
    release();
    await signingOut;
    await settle();
    expect(other.getState()).toMatchObject({ status: "signed-in", user: { username: "bob" } });
  });
});

describe("a sign-in queued when the client is disposed", () => {
  it("rejects unknown without a request", async () => {
    const { api, client } = setup();
    addBob(api);
    const release = api.holdNext("POST", "/api/auth/local");
    const first = rejection(client.signIn({ identifier: "ada", password: PASSWORD }));
    const queued = rejection(client.signIn({ identifier: "bob", password: PASSWORD }));
    await settle();
    client.dispose();
    release();
    expect(await queued).toMatchObject({ code: "unknown" });
    expect(await first).toMatchObject({ code: "unknown" });
    expect(paths(api).filter((path) => path === "/api/auth/local")).toHaveLength(1);
  });
});

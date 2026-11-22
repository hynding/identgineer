import { describe, expect, it } from "vitest";
import type { LockManagerLike } from "./locks.ts";
import { PASSWORD, settle, setup } from "./test-harness.ts";
import { createMemoryLocks } from "./testing/memory-locks.ts";

/** A lock manager that records the names asked for. */
const recordingLocks = () => {
  const memory = createMemoryLocks();
  const names: string[] = [];
  const locks: LockManagerLike = {
    request: (name, callback) => {
      names.push(name);
      return memory.request(name, callback);
    },
  };
  return { locks, names };
};

/** A tab on the channel, its access token dead, signing out while another tab signs bob in. */
const signOutBesideSignIn = async (
  locks: LockManagerLike | null,
  tokenless: boolean,
  hold: "lookup" | "logout" = "lookup",
) => {
  const context = setup({}, { locks });
  const { api, client, makeClient } = context;
  api.addUser({ username: "bob", email: "bob@example.com", password: PASSWORD });
  const other = makeClient({ sharedChannel: true });
  await other.restore();
  if (tokenless) {
    // A tab apart signs ada in: the cookie names a session this tab never heard of.
    await makeClient().signIn({ identifier: "ada@example.com", password: PASSWORD });
  } else {
    await context.signIn();
    await settle();
    api.expireAccessTokens();
  }
  const release = api.holdNext(
    "POST",
    hold === "lookup" ? "/api/auth/refresh" : "/api/auth/logout",
  );
  const signingOut = client.signOut();
  await settle();
  const signingIn = other.signIn({ identifier: "bob", password: PASSWORD }).catch(() => undefined);
  await settle();
  release();
  const result = await signingOut;
  await signingIn;
  await settle();
  await settle();
  return { ...context, other, result };
};

describe("the cookie lock", () => {
  it("is taken by sign-in, provider sign-in, cookie refresh and logout", async () => {
    const { locks, names } = recordingLocks();
    const { api, client } = setup({}, { locks });
    await client.signIn({ identifier: "ada", password: PASSWORD });
    expect(names).toEqual(["identgineer-identity-cookie"]);
    await client.signOut();
    expect(names).toHaveLength(2);
    api.completeProviderRoundTrip("github", "lin@example.com");
    await client.completeProviderSignIn("github", { search: "" });
    expect(names).toHaveLength(3);
    await client.restore();
    expect(new Set(names)).toEqual(new Set(["identgineer-identity-cookie"]));
  });

  it("is held once across a sign-out's logout, lookup and logout of what it found", async () => {
    const { locks, names } = recordingLocks();
    const { api, client, makeClient, signIn } = setup({}, { locks });
    api.addUser({ username: "bob", email: "bob@example.com", password: PASSWORD });
    await signIn();
    await makeClient().signIn({ identifier: "bob", password: PASSWORD });
    const before = names.length;
    await expect(client.signOut()).resolves.toEqual({ outcome: "signed-out" });
    expect(names.length - before).toBe(1);
  });
});

describe.each([
  ["with Web Locks", createMemoryLocks],
  ["without Web Locks", () => null],
])("a sign-in in another tab while a sign-out's lookup is in flight, %s", (_name, locks) => {
  it.each([
    ["a tab without a token", true],
    ["a tab whose token is dead", false],
  ])("never brings %s back into the session it signed out of", async (_kind, tokenless) => {
    const { client, other } = await signOutBesideSignIn(locks(), tokenless);
    // It may join the newer sign-in's session (the later action wins), never ada's again.
    for (const state of [client.getState(), other.getState()]) {
      if (state.status === "signed-in") expect(state.user.username).toBe("bob");
    }
  });
});

describe("with Web Locks, a sign-in in another tab during a sign-out", () => {
  it.each([
    ["lookup", true],
    ["lookup", false],
    ["logout", false],
  ] as const)(
    "waits for its cookie requests (held %s): the old session ends and the cookie never names it",
    async (hold, tokenless) => {
      const { api } = await signOutBesideSignIn(createMemoryLocks(), tokenless, hold);
      expect(api.activeSessionCount("ada@example.com")).toBe(0);
      expect([undefined, "bob@example.com"]).toContain(api.restorableUser());
    },
  );
});

describe("with Web Locks, a refresh in flight when another tab signs in", () => {
  it("does not overwrite that sign-in's cookie", async () => {
    const { api, client, makeClient, signIn } = setup({}, { locks: createMemoryLocks() });
    api.addUser({ username: "bob", email: "bob@example.com", password: PASSWORD });
    const other = makeClient({ sharedChannel: true });
    await other.restore();
    await signIn();
    await settle();
    api.expireAccessTokens();
    const release = api.holdNext("POST", "/api/auth/refresh");
    const reading = client.currentUser().catch(() => undefined);
    await settle();
    const signingIn = other.signIn({ identifier: "bob", password: PASSWORD });
    await settle();
    release();
    await reading;
    await signingIn;
    await settle();
    await settle();
    expect(api.restorableUser()).toBe("bob@example.com");
    api.expireAccessTokens();
    await other.currentUser();
    expect(other.getState()).toMatchObject({ status: "signed-in", user: { username: "bob" } });
  });
});

describe("a newer sign-in heard of while the found session's logout is in flight", () => {
  it("does not make the sign-out superseded: it ended that session, and says so", async () => {
    const { api, client, makeClient, channelName } = setup();
    api.addUser({ username: "bob", email: "bob@example.com", password: PASSWORD });
    await client.restore();
    await makeClient().signIn({ identifier: "bob", password: PASSWORD });
    const release = api.holdNext("POST", "/api/auth/logout");
    const signingOut = client.signOut();
    await settle();
    const channel = new BroadcastChannel(channelName);
    channel.postMessage({ type: "signed-in" });
    channel.close();
    await settle();
    release();
    await expect(signingOut).resolves.toEqual({ outcome: "signed-out" });
    expect(api.activeSessionCount("bob@example.com")).toBe(0);
  });
});

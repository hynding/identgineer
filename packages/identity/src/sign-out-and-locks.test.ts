import { afterEach, describe, expect, it, vi } from "vitest";
import { settle, setup } from "./test-harness.ts";
import type { FakeIdentityApi } from "./testing/fake-identity-api.ts";
import { createMemoryLocks } from "./testing/memory-locks.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

const refreshes = (api: FakeIdentityApi): number =>
  api.requests.filter((request) => request.path === "/api/auth/refresh").length;

describe("signing out a cookie session the tab has no token for", () => {
  it("ends the session when the sign-out comes while a restore is in flight", async () => {
    const { api, makeClient, signIn } = setup({ httpOnlyCookies: true });
    await signIn();
    const tab = makeClient();
    const release = api.holdNext("POST", "/api/auth/refresh");
    const restoring = tab.restore();
    await settle();
    const signingOut = tab.signOut();
    release();
    await signingOut;
    expect((await restoring).status).toBe("signed-out");
    expect(tab.getState()).toEqual({ status: "signed-out", reason: "user" });
    expect(api.refreshCookie()).toBeUndefined();
    expect(await makeClient().restore()).toEqual({ status: "signed-out", reason: "no-session" });
  });

  it("finds and ends the cookie session from an unknown state", async () => {
    const { api, makeClient, signIn } = setup();
    await signIn();
    const tab = makeClient();
    await tab.signOut();
    expect(api.requests.at(-1)?.path).toBe("/api/auth/logout");
    expect(api.refreshCookie()).toBeUndefined();
    expect(api.activeSessionCount("ada@example.com")).toBe(0);
    expect(await makeClient().restore()).toEqual({ status: "signed-out", reason: "no-session" });
  });
});

describe("cookie refreshes from several tabs", () => {
  it("retries a refresh that lost the race for a rotating cookie once", async () => {
    const { api, makeClient, signIn } = setup({}, { locks: null });
    await signIn();
    const first = makeClient();
    const second = makeClient();
    const releaseFirst = api.holdNext("POST", "/api/auth/refresh");
    const releaseSecond = api.holdNext("POST", "/api/auth/refresh");
    const restoring = [first.restore(), second.restore()];
    await settle();
    releaseFirst();
    await settle();
    releaseSecond();
    const states = await Promise.all(restoring);
    expect(states.map((state) => state.status)).toEqual(["signed-in", "signed-in"]);
    expect(refreshes(api)).toBe(3);
  });

  it("takes turns through a shared lock, so no tab presents a rotated cookie", async () => {
    const locks = createMemoryLocks();
    const { api, makeClient, signIn } = setup({}, { locks });
    await signIn();
    const first = makeClient();
    const second = makeClient();
    const release = api.holdNext("POST", "/api/auth/refresh");
    const restoring = [first.restore(), second.restore()];
    await settle();
    expect(refreshes(api)).toBe(1);
    release();
    const states = await Promise.all(restoring);
    expect(states.map((state) => state.status)).toEqual(["signed-in", "signed-in"]);
    expect(refreshes(api)).toBe(2);
  });

  it("uses navigator.locks where the browser has it", async () => {
    const memory = createMemoryLocks();
    const names: string[] = [];
    vi.stubGlobal("navigator", {
      locks: {
        request: <T>(name: string, callback: () => Promise<T>): Promise<T> => {
          names.push(name);
          return memory.request(name, callback);
        },
      },
    });
    const { client, signIn, makeClient } = setup();
    await signIn();
    await makeClient().restore();
    expect(names).toContain("identgineer-identity-refresh");
    expect(client.getState().status).toBe("signed-in");
  });
});

describe("a lock manager that fails", () => {
  const refusing = {
    request: (): Promise<never> => Promise.reject(new DOMException("denied", "SecurityError")),
  };
  const throwing = {
    request: (): Promise<never> => {
      throw new DOMException("denied", "SecurityError");
    },
  };

  it.each([
    ["rejects", refusing],
    ["throws", throwing],
  ])("restores without the lock when the lock manager %s", async (_name, locks) => {
    const { makeClient, signIn } = setup({}, { locks });
    await signIn();
    const tab = makeClient();
    expect(await tab.restore()).toMatchObject({ status: "signed-in" });
    expect(await makeClient().restore()).toMatchObject({ status: "signed-in" });
  });

  it("reports no session, not the lock's error, when there is no cookie", async () => {
    const { client } = setup({}, { locks: refusing });
    expect(await client.restore()).toEqual({ status: "signed-out", reason: "no-session" });
  });

  it("stops waiting for a lock that is never granted after the request timeout", async () => {
    const never = { request: (): Promise<never> => new Promise<never>(() => undefined) };
    const { api, clock, makeClient, signIn } = setup({}, { locks: never, requestTimeoutMs: 5_000 });
    await signIn();
    const tab = makeClient();
    let restored: unknown;
    void tab.restore().then((state) => {
      restored = state;
    });
    await settle();
    expect(restored).toBeUndefined();
    clock.advance(5_000);
    await settle();
    await settle();
    expect(restored).toMatchObject({ status: "signed-in" });
    await tab.signOut();
    const unknownTab = makeClient();
    let signedOut = false;
    void unknownTab.signOut().then(() => {
      signedOut = true;
    });
    await settle();
    expect(signedOut).toBe(false);
    clock.advance(5_000);
    for (let round = 0; round < 3; round += 1) await settle();
    expect(signedOut).toBe(true);
    expect(api.requests.at(-1)?.path).toBe("/api/auth/refresh");
  });
});

import { describe, expect, it } from "vitest";
import { IdentityError } from "./identity-error.ts";
import { withLock, type LockManagerLike } from "./locks.ts";
import { PASSWORD, rejection, settle, setup } from "./test-harness.ts";
import { createManualClock } from "./testing/manual-clock.ts";
import { createMemoryLocks } from "./testing/memory-locks.ts";

const TIMEOUT = 10_000;
const never: LockManagerLike = { request: () => new Promise<never>(() => undefined) };

describe("a lock that is never granted", () => {
  it("fails a sign-in closed after the holder bound and one request timeout: network, nothing sent", async () => {
    const { api, clock, client } = setup({}, { locks: never, requestTimeoutMs: TIMEOUT });
    let outcome: unknown;
    void rejection(client.signIn({ identifier: "ada", password: PASSWORD })).then((error) => {
      outcome = error;
    });
    await settle();
    clock.advance(4 * TIMEOUT - 1);
    await settle();
    expect(outcome).toBeUndefined();
    clock.advance(1);
    await settle();
    expect(outcome).toMatchObject({ code: "network" });
    expect(api.requests).toHaveLength(0);
    expect(client.retryAfterSeconds()).toBe(0);
  });

  it("fails a restore closed: it rejects network and leaves the state unknown", async () => {
    const { api, clock, client } = setup({}, { locks: never, requestTimeoutMs: TIMEOUT });
    const restoring = rejection(client.restore());
    await settle();
    clock.advance(4 * TIMEOUT);
    expect(await restoring).toMatchObject({ code: "network" });
    expect(client.getState().status).toBe("unknown");
    expect(api.requests).toHaveLength(0);
  });

  it("fails a sign-out's server work closed: server-unreachable, nothing sent", async () => {
    const { api, clock, client } = setup({}, { locks: never, requestTimeoutMs: TIMEOUT });
    const signingOut = client.signOut();
    await settle();
    clock.advance(4 * TIMEOUT);
    await expect(signingOut).resolves.toEqual({ outcome: "server-unreachable" });
    expect(api.requests).toHaveLength(0);
  });
});

describe("a sign-out's cookie section that outlasts its bound", () => {
  it("is cut off at three request timeouts: server-unreachable, and a waiting sign-in runs locked", async () => {
    const { api, clock, client, makeClient, signIn } = setup(
      {},
      { locks: createMemoryLocks(), requestTimeoutMs: TIMEOUT },
    );
    api.addUser({ username: "bob", email: "bob@example.com", password: PASSWORD });
    await signIn();
    await settle();
    // A tab apart signs ada in again: the cookie names a session this tab never heard of.
    await makeClient().signIn({ identifier: "ada@example.com", password: PASSWORD });
    // Four requests, each answered within the request timeout: own logout, a lookup that loses a
    // rotation (401) and its retry, which finds the session, then that session's logout.
    const holds = [
      api.holdNext("POST", "/api/auth/logout"),
      api.holdNext("POST", "/api/auth/refresh"),
      api.holdNext("POST", "/api/auth/refresh"),
      api.holdNext("POST", "/api/auth/logout"),
    ];
    api.respondNext("POST", "/api/auth/refresh", { status: 401, body: {} });
    let result: unknown;
    void client.signOut().then((outcome) => {
      result = outcome;
    });
    await settle();
    const other = makeClient();
    let signedIn: unknown;
    void other.signIn({ identifier: "bob", password: PASSWORD }).then(
      (user) => (signedIn = user.username),
      (error: unknown) => (signedIn = error),
    );
    for (const release of holds.slice(0, 3)) {
      clock.advance(TIMEOUT - 1_000);
      release();
      await settle();
    }
    expect(result).toBeUndefined();
    expect(signedIn).toBeUndefined();
    clock.advance(3_000);
    await settle();
    await settle();
    expect(result).toEqual({ outcome: "server-unreachable" });
    expect(signedIn).toBe("bob");
    holds[3]?.();
    await settle();
    expect(api.restorableUser()).toBe("bob@example.com");
  });
});

describe("without a lock manager, a cookie section", () => {
  it("is still cut off at its bound: a cancelled sign-in's logout leaves the sign-out server-unreachable", async () => {
    const { api, clock, client } = setup({}, { locks: null, requestTimeoutMs: TIMEOUT });
    const releaseSignIn = api.holdNext("POST", "/api/auth/local");
    const signingIn = rejection(client.signIn({ identifier: "ada", password: PASSWORD }));
    await settle();
    let result: unknown;
    void client.signOut().then((outcome) => {
      result = outcome;
    });
    await settle();
    const releaseLogout = api.holdNext("POST", "/api/auth/logout");
    releaseSignIn();
    await settle();
    expect(api.requests.at(-1)?.path).toBe("/api/auth/logout");
    clock.advance(3 * TIMEOUT);
    await settle();
    expect(result).toEqual({ outcome: "server-unreachable" });
    expect(await signingIn).toMatchObject({ code: "unauthorized" });
    releaseLogout();
  });
});

describe("with Web Locks, a sign-out slower in total than one request timeout", () => {
  it.each([
    ["a tab without a token", true],
    ["a tab with a token", false],
  ])(
    "never lets another tab's sign-in run unlocked (%s): the cookie never names the old session",
    async (_kind, tokenless) => {
      const { api, clock, client, makeClient, signIn } = setup(
        {},
        { locks: createMemoryLocks(), requestTimeoutMs: TIMEOUT },
      );
      api.addUser({ username: "bob", email: "bob@example.com", password: PASSWORD });
      const other = makeClient({ sharedChannel: true });
      await other.restore();
      if (!tokenless) {
        await signIn();
        await settle();
      }
      await makeClient().signIn({ identifier: "ada@example.com", password: PASSWORD });
      const releaseLogout = tokenless ? () => undefined : api.holdNext("POST", "/api/auth/logout");
      const releaseLookup = api.holdNext("POST", "/api/auth/refresh");
      const signingOut = client.signOut();
      await settle();
      const signingIn = other.signIn({ identifier: "bob", password: PASSWORD }).then(
        () => "ok",
        (error: unknown) => error,
      );
      await settle();
      if (!tokenless) {
        clock.advance(TIMEOUT - 2_000);
        releaseLogout();
        await settle();
      }
      clock.advance(TIMEOUT - 2_000);
      await settle();
      releaseLookup();
      await signingOut;
      expect(await signingIn).toBe("ok");
      await settle();
      await settle();
      expect(api.activeSessionCount("ada@example.com")).toBe(0);
      expect(api.restorableUser()).toBe("bob@example.com");
    },
  );
});

describe("withLock", () => {
  const bounds = (clock: ReturnType<typeof createManualClock>) => ({
    clock,
    holdMs: 3 * TIMEOUT,
    waitMs: 4 * TIMEOUT,
  });

  it("aborts a section at its deadline, rejects network and lets the next holder in", async () => {
    const clock = createManualClock(0);
    const locks = createMemoryLocks();
    let aborted = false;
    const first = rejection(
      withLock(locks, "cookie", bounds(clock), (section) => {
        section.signal.addEventListener("abort", () => {
          aborted = true;
        });
        return new Promise<never>(() => undefined);
      }),
    );
    const second = withLock(locks, "cookie", bounds(clock), () => Promise.resolve("second"));
    await settle();
    clock.advance(3 * TIMEOUT);
    expect(await first).toBeInstanceOf(IdentityError);
    expect(await first).toMatchObject({ code: "network" });
    expect(aborted).toBe(true);
    expect(await second).toBe("second");
  });

  it("never runs the task once it gave up, even when the manager later grants or rejects", async () => {
    const clock = createManualClock(0);
    let grant = (): Promise<unknown> => Promise.resolve();
    let refuse = (): void => undefined;
    const late: LockManagerLike = {
      request: (_name, callback) =>
        new Promise((resolve, reject) => {
          grant = () => callback().then(resolve);
          refuse = () => {
            reject(new DOMException("denied", "SecurityError"));
          };
        }),
    };
    let runs = 0;
    const task = () => {
      runs += 1;
      return Promise.resolve();
    };
    const granted = rejection(withLock(late, "cookie", bounds(clock), task));
    clock.advance(4 * TIMEOUT);
    expect(await granted).toMatchObject({ code: "network" });
    await grant();
    const refused = rejection(withLock(late, "cookie", bounds(clock), task));
    clock.advance(4 * TIMEOUT);
    expect(await refused).toMatchObject({ code: "network" });
    refuse();
    await settle();
    expect(runs).toBe(0);
  });

  it("runs the task once, unlocked, when the manager rejects, and never again on a late timer", async () => {
    const clock = createManualClock(0);
    const refusing: LockManagerLike = {
      request: () => Promise.reject(new DOMException("denied", "SecurityError")),
    };
    let runs = 0;
    await withLock(refusing, "cookie", bounds(clock), () => {
      runs += 1;
      return Promise.resolve();
    });
    clock.advance(10 * TIMEOUT);
    await settle();
    expect(runs).toBe(1);
  });
});

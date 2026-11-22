import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Clock } from "./clock.ts";
import type { RegisterResult } from "./account-operations.ts";
import { createIdentityClient, type IdentityClient } from "./identity-client.ts";
import type { LockManagerLike } from "./locks.ts";
import { PASSWORD, START } from "./test-harness.ts";
import { createFakeIdentityApi, type FakeIdentityApi } from "./testing/fake-identity-api.ts";
import { createManualClock, type ManualClock } from "./testing/manual-clock.ts";
import { createMemoryLocks } from "./testing/memory-locks.ts";

/** A small seeded generator, so every interleaving can be replayed from its seed. */
const seeded = (seed: number) => {
  let state = seed >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
};

const tick = (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

const ticks = async (count: number): Promise<void> => {
  for (let index = 0; index < count; index += 1) await tick();
};

/**
 * The request timeout (and cross-tab lock wait) these tabs use: a request in flight arms it, so
 * the timers judged below leave it out. No session timer uses this delay.
 */
const REQUEST_TIMEOUT_MS = 14_999;

/** Lets the fake's answers, their latency and the client's promise chains run. */
const flush = (): Promise<void> => ticks(16);

/**
 * Who posted each notice: every channel a tab opens is tagged with the tab, and its posts are
 * queued per channel name in the order the listeners receive them.
 */
const NativeChannel = globalThis.BroadcastChannel;
let opening: string | undefined;
const senders = new Map<string, (string | undefined)[]>();
class TaggedChannel extends NativeChannel {
  readonly #owner = opening;
  override postMessage(message: unknown): void {
    const queue = senders.get(this.name) ?? [];
    queue.push(this.#owner);
    senders.set(this.name, queue);
    super.postMessage(message);
  }
}
beforeAll(() => {
  globalThis.BroadcastChannel = TaggedChannel;
});
afterAll(() => {
  globalThis.BroadcastChannel = NativeChannel;
});

interface Tab {
  readonly name: string;
  readonly client: IdentityClient;
  /** The session timers (not request timeouts) this tab armed and has not seen fire or cleared. */
  readonly timers: Set<unknown>;
  /** The `online` listeners this tab has subscribed and not yet unsubscribed. */
  readonly online: Set<() => void>;
}

interface World {
  readonly api: FakeIdentityApi;
  readonly clock: ManualClock;
  readonly locks: LockManagerLike;
  readonly channel: string;
  readonly latency: () => number;
}

/** A tab whose requests and lock grants arrive after a random number of ticks. */
const openTab = (name: string, world: World): Tab => {
  const { api, clock, locks, latency } = world;
  const timers = new Set<unknown>();
  const online = new Set<() => void>();
  const tracked: Clock = {
    now: clock.now,
    setTimeout: (callback, ms) => {
      const timer: unknown = clock.setTimeout(() => {
        timers.delete(timer);
        callback();
      }, ms);
      if (ms !== REQUEST_TIMEOUT_MS) timers.add(timer);
      return timer;
    },
    clearTimeout: (timer) => {
      timers.delete(timer);
      clock.clearTimeout(timer);
    },
  };
  opening = name;
  const client = createIdentityClient({
    baseUrl: api.baseUrl,
    fetch: async (input, init) => {
      await ticks(latency());
      const response = await api.fetch(input, init);
      await ticks(latency());
      return response;
    },
    clock: tracked,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    channelName: world.channel,
    locks: {
      request: async (lock, callback) => {
        await ticks(latency());
        return locks.request(lock, callback);
      },
    },
    onOnline: (listener) => {
      online.add(listener);
      return () => {
        online.delete(listener);
      };
    },
  });
  opening = undefined;
  return { name, client, timers, online };
};

const REFUSAL = {
  status: 429,
  body: { data: null, error: { status: 429, name: "RateLimitError", message: "x", details: {} } },
  headers: { "Retry-After": "30" },
};

/** A sign-in, registration, reset, provider sign-in or password change: each opens a session. */
interface SessionOpening {
  readonly tab: Tab;
  /** The account a cookie sign-in opens a session for; undefined for one without the cookie. */
  readonly cookieUser: string | undefined;
  /** A sign-out in the same tab was asked for while it was under way: it must reject. */
  cancelled: boolean;
  /** When it was asked for, and when it resolved having opened a session (marks in event order). */
  readonly startedAt: number;
  succeededAt: number | undefined;
  failedAt: number | undefined;
  settled: boolean;
}

const runScenario = async (seed: number, steps: number): Promise<void> => {
  const random = seeded(seed);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
  const clock = createManualClock(START);
  const api = createFakeIdentityApi({ clock });
  api.addUser({ username: "ada", email: "ada@example.com", password: PASSWORD });
  api.addUser({ username: "bob", email: "bob@example.com", password: PASSWORD });
  const world: World = {
    api,
    clock,
    locks: createMemoryLocks(),
    channel: `identgineer-invariants-${String(seed)}`,
    latency: () => Math.floor(random() * 4),
  };
  let events = 0;
  /*
   * Every notice on the channel. Opened before any tab, this listener hears each notice first,
   * and every tab hears it before any later step of its own can run.
   */
  const notices: { readonly type: unknown; readonly at: number; readonly from: unknown }[] = [];
  const spy = new BroadcastChannel(world.channel);
  spy.onmessage = (event: MessageEvent) => {
    events += 1;
    const from = senders.get(world.channel)?.shift();
    notices.push({ type: (event.data as { type?: unknown }).type, at: events, from });
  };
  const tabs = ["A", "B", "C"].map((name) => openTab(name, world));
  const closed: Tab[] = [];
  const openings: SessionOpening[] = [];
  const violations: string[] = [];
  let serial = 0;

  const signedInBy = (result: RegisterResult): boolean => result.outcome === "signed-in";

  const passwordOf = (email: string): string => api.findUser(email)?.password ?? PASSWORD;

  /** Tracks an operation that opens a session, and judges how it settled. */
  const opening = <T>(
    tab: Tab,
    cookieUser: string | undefined,
    step: number,
    run: () => Promise<T>,
    opened: (value: T) => boolean = () => true,
  ) => {
    events += 1;
    const entry: SessionOpening = {
      tab,
      cookieUser,
      startedAt: events,
      cancelled: false,
      succeededAt: undefined,
      failedAt: undefined,
      settled: false,
    };
    openings.push(entry);
    return run().then(
      (value) => {
        entry.settled = true;
        if (!opened(value)) return;
        events += 1;
        entry.succeededAt = events;
        if (entry.cancelled) {
          violations.push(
            `seed ${String(seed)} step ${String(step)}: ${tab.name} opened a session asked for before its own sign-out`,
          );
        }
      },
      () => {
        entry.settled = true;
        events += 1;
        entry.failedAt = events;
      },
    );
  };

  const signIn = (tab: Tab, step: number) => {
    const email = pick(["ada@example.com", "bob@example.com"]);
    return opening(tab, email, step, () =>
      tab.client.signIn({ identifier: email, password: passwordOf(email) }),
    );
  };

  const wrongPassword = (tab: Tab, step: number) =>
    opening(tab, "ada@example.com", step, () =>
      tab.client.signIn({ identifier: "ada@example.com", password: "not the password at all" }),
    );

  /** Taken names resolve as `check-email` without a session, as an unknown one would. */
  const registerTaken = (tab: Tab, step: number) =>
    opening(
      tab,
      undefined,
      step,
      () => tab.client.register({ username: "ada", email: "ada@example.com", password: PASSWORD }),
      signedInBy,
    );

  const wrongResetCode = (tab: Tab, step: number) =>
    opening(tab, undefined, step, () =>
      tab.client.resetPassword({
        code: "not a code",
        password: `${PASSWORD} x`,
        passwordConfirmation: `${PASSWORD} x`,
      }),
    );

  /** A callback without the provider round trip's session fails. */
  const providerWithoutRoundTrip = (tab: Tab, step: number) =>
    opening(tab, "lin@example.com", step, () =>
      tab.client.completeProviderSignIn("github", { search: "" }),
    );

  const register = (tab: Tab, step: number) => {
    serial += 1;
    const username = `user${String(serial)}`;
    return opening(
      tab,
      undefined,
      step,
      () => tab.client.register({ username, email: `${username}@example.com`, password: PASSWORD }),
      signedInBy,
    );
  };

  const resetPassword = async (tab: Tab, step: number) => {
    const email = pick(["ada@example.com", "bob@example.com"]);
    await tab.client.requestPasswordReset({ email });
    serial += 1;
    const password = `${PASSWORD} ${String(serial)}`;
    const code = api.findUser(email)?.resetCode ?? "none";
    return opening(tab, undefined, step, () =>
      tab.client.resetPassword({ code, password, passwordConfirmation: password }),
    );
  };

  const providerSignIn = (tab: Tab, step: number) => {
    api.completeProviderRoundTrip("github", "lin@example.com");
    return opening(tab, "lin@example.com", step, () =>
      tab.client.completeProviderSignIn("github", { search: "" }),
    );
  };

  const changePassword = (tab: Tab, step: number) => {
    const state = tab.client.getState();
    if (state.status !== "signed-in") return undefined;
    serial += 1;
    const password = `${PASSWORD} ${String(serial)}`;
    return opening(tab, undefined, step, () =>
      tab.client.changePassword({
        currentPassword: passwordOf(state.user.email),
        password,
        passwordConfirmation: password,
      }),
    );
  };

  /**
   * Judges a sign-out against what happened while it was under way. The later action wins:
   * another tab's cookie sign-in that succeeded meanwhile (and was announced) may supersede it,
   * and is then the only session left to resume. Otherwise it leaves no session a reload could
   * resume, unless such a sign-in succeeded while it ran (the documented window: a notice that
   * has not arrived yet). A sign-in in its own tab, failing or not, never supersedes it.
   */
  const signOut = (tab: Tab, step: number) => {
    const where = `seed ${String(seed)} step ${String(step)}: ${tab.name}.signOut`;
    const before = openings.filter((entry) => !entry.settled);
    for (const entry of before) if (entry.tab === tab) entry.cancelled = true;
    events += 1;
    const began = events;
    return tab.client.signOut().then(async (result) => {
      events += 1;
      const ended = events;
      const restorable = api.restorableUser();
      // It waits for the work it cancelled, and ends the sessions that work opened.
      const unsettled = before.filter((entry) => entry.tab === tab && !entry.settled).length;
      if (unsettled > 0) {
        violations.push(`${where} resolved before ${String(unsettled)} sign-ins it cancelled`);
      }
      // A sign-in whose answer landed before the sign-out resolved may resolve just after it.
      await flush();
      const later = api.restorableUser();
      const elsewhere = openings.filter(
        (entry) => entry.tab !== tab && entry.cookieUser !== undefined && entry.startedAt < ended,
      );
      const standing = elsewhere.filter(
        (entry) => entry.succeededAt !== undefined && entry.succeededAt > began,
      );
      /**
       * Whether the session left is another tab's sign-in of the window: one that stands, or one
       * its tab then dropped (cancelled by this sign-out's notice) whose session was ended since.
       */
      const fromWindow = (user: string): boolean =>
        standing.some((entry) => entry.cookieUser === user) ||
        (later !== user &&
          elsewhere.some(
            (entry) =>
              entry.cookieUser === user && entry.failedAt !== undefined && entry.failedAt > began,
          ));
      const standingNotice = notices.some(
        (notice) =>
          notice.from !== tab.name &&
          notice.at > began &&
          notice.at < ended &&
          notice.type === "signed-in" &&
          !notices.some(
            (after) =>
              after.type === "signed-out" &&
              after.from !== tab.name &&
              after.at > notice.at &&
              after.at < ended,
          ),
      );
      if (result.outcome === "signed-out") {
        if (restorable !== undefined && !fromWindow(restorable)) {
          violations.push(`${where} resolved signed-out with ${restorable}'s session to resume`);
        }
        if (standingNotice) {
          violations.push(`${where} resolved signed-out after a standing sign-in's notice`);
        }
      }
      if (result.outcome === "superseded") {
        if (standing.length === 0) {
          violations.push(`${where} resolved superseded with no other tab's sign-in`);
        } else if (restorable !== undefined && !fromWindow(restorable)) {
          violations.push(`${where} resolved superseded leaving ${restorable}'s session`);
        }
      }
    });
  };

  const reopen = (tab: Tab): void => {
    tab.client.dispose();
    closed.push(tab);
    const index = tabs.indexOf(tab);
    tabs[index] = openTab(`${tab.name}'`, world);
  };

  const operations: ((step: number) => Promise<unknown> | undefined)[] = [
    (step) => signIn(pick(tabs), step),
    (step) => signIn(pick(tabs), step),
    (step) => signOut(pick(tabs), step),
    (step) => signOut(pick(tabs), step),
    () => pick(tabs).client.restore(),
    (step) => register(pick(tabs), step),
    (step) => resetPassword(pick(tabs), step),
    (step) => providerSignIn(pick(tabs), step),
    (step) => changePassword(pick(tabs), step),
    (step) => wrongPassword(pick(tabs), step),
    (step) => registerTaken(pick(tabs), step),
    (step) => wrongResetCode(pick(tabs), step),
    (step) => providerWithoutRoundTrip(pick(tabs), step),
    () => {
      reopen(pick(tabs));
      return undefined;
    },
    () => {
      clock.advance(pick([1_000, 5_000, 30_000, 300_000, 600_000, 2_000_000]));
      return undefined;
    },
    () => {
      api.respondNext("POST", "/api/auth/refresh", "network-error");
      return undefined;
    },
    () => {
      api.respondNext("POST", "/api/auth/refresh", REFUSAL);
      return undefined;
    },
    () => {
      api.respondNext("POST", "/api/auth/logout", "network-error");
      return undefined;
    },
    () => {
      for (const tab of tabs) for (const callback of [...tab.online]) callback();
      return undefined;
    },
    () => {
      api.expireAccessTokens();
      return undefined;
    },
    () => pick(tabs).client.authorizedFetch("/api/users/me"),
  ];

  const check = async (step: number): Promise<void> => {
    for (const tab of closed) {
      if (tab.timers.size > 0 || tab.online.size > 0) {
        violations.push(`seed ${String(seed)} step ${String(step)}: closed ${tab.name} armed`);
      }
    }
    for (const tab of tabs) {
      const state = tab.client.getState();
      const where = `seed ${String(seed)} step ${String(step)} tab ${tab.name} (${JSON.stringify(state).slice(0, 60)})`;
      if (state.status === "signed-in") {
        const response = await tab.client.authorizedFetch("/api/users/me").catch(() => undefined);
        if (response?.status === 200) {
          const { username } = (await response.json()) as { username: string };
          const now = tab.client.getState();
          if (now.status === "signed-in" && now.user.username !== username) {
            violations.push(`${where}: holds ${username}'s token`);
          }
        }
        continue;
      }
      if (tab.timers.size > 0) violations.push(`${where}: ${String(tab.timers.size)} timers armed`);
      if (tab.online.size > 0) violations.push(`${where}: online listener armed`);
      const sent = api.requests.length;
      const error = await tab.client.authorizedFetch("/api/users/me").then(
        () => "resolved",
        (failure: unknown) => (failure as { code?: string }).code,
      );
      const bearers = api.requests
        .slice(sent)
        .filter((request) => request.headers.has("Authorization")).length;
      if (error !== "unauthorized") violations.push(`${where}: authorizedFetch ${String(error)}`);
      if (bearers > 0) violations.push(`${where}: sent a bearer token`);
    }
    await flush();
  };

  for (let step = 0; step < steps; step += 1) {
    const pending: Promise<unknown>[] = [];
    const count = 1 + Math.floor(random() * 4);
    for (let index = 0; index < count; index += 1) {
      const result = pick(operations)(step);
      if (result !== undefined) pending.push(result.catch(() => undefined));
      await ticks(Math.floor(random() * 6));
    }
    await Promise.all(pending);
    await flush();
    await check(step);
  }
  for (const tab of tabs) tab.client.dispose();
  spy.close();
  expect(violations).toEqual([]);
};

describe("session invariants under interleaved operations in three tabs", () => {
  it.each(Array.from({ length: 200 }, (_, index) => index + 1))(
    "hold for seed %i",
    async (seed) => {
      await runScenario(seed, 30);
    },
    30_000,
  );
});

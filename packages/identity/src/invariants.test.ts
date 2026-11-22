import { describe, expect, it } from "vitest";
import type { Clock } from "./clock.ts";
import { createIdentityClient, type IdentityClient } from "./identity-client.ts";
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

/** Lets the fake's answers and the client's promise chains run, without real waiting. */
const flush = async (): Promise<void> => {
  for (let round = 0; round < 6; round += 1) {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
};

interface Tab {
  readonly name: string;
  readonly client: IdentityClient;
  /** The timers this tab has armed and not yet seen fire or cleared. */
  readonly timers: Set<unknown>;
  /** The `online` listeners this tab has subscribed and not yet unsubscribed. */
  readonly online: Set<() => void>;
}

const openTab = (
  name: string,
  api: FakeIdentityApi,
  clock: ManualClock,
  locks: ReturnType<typeof createMemoryLocks>,
  channelName: string,
): Tab => {
  const timers = new Set<unknown>();
  const online = new Set<() => void>();
  const tracked: Clock = {
    now: clock.now,
    setTimeout: (callback, ms) => {
      const timer: unknown = clock.setTimeout(() => {
        timers.delete(timer);
        callback();
      }, ms);
      timers.add(timer);
      return timer;
    },
    clearTimeout: (timer) => {
      timers.delete(timer);
      clock.clearTimeout(timer);
    },
  };
  const client = createIdentityClient({
    baseUrl: api.baseUrl,
    fetch: api.fetch,
    clock: tracked,
    channelName,
    locks,
    onOnline: (listener) => {
      online.add(listener);
      return () => {
        online.delete(listener);
      };
    },
  });
  return { name, client, timers, online };
};

const REFUSAL = {
  status: 429,
  body: { data: null, error: { status: 429, name: "RateLimitError", message: "x", details: {} } },
  headers: { "Retry-After": "30" },
};

const runScenario = async (seed: number, steps: number): Promise<void> => {
  const random = seeded(seed);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
  const clock = createManualClock(START);
  const api = createFakeIdentityApi({ clock });
  api.addUser({ username: "ada", email: "ada@example.com", password: PASSWORD });
  api.addUser({ username: "bob", email: "bob@example.com", password: PASSWORD });
  const locks = createMemoryLocks();
  const channel = `identgineer-invariants-${String(seed)}`;
  const tabs = [openTab("A", api, clock, locks, channel), openTab("B", api, clock, locks, channel)];
  const signInsInFlight = new Map<Tab, number>(tabs.map((tab) => [tab, 0]));
  const signInsStarted = new Map<Tab, number>(tabs.map((tab) => [tab, 0]));
  const violations: string[] = [];
  const others = (tab: Tab): Tab[] => tabs.filter((other) => other !== tab);

  const signIn = (tab: Tab): Promise<unknown> => {
    signInsInFlight.set(tab, (signInsInFlight.get(tab) ?? 0) + 1);
    signInsStarted.set(tab, (signInsStarted.get(tab) ?? 0) + 1);
    return tab.client
      .signIn({ identifier: pick(["ada", "bob"]), password: PASSWORD })
      .finally(() => {
        signInsInFlight.set(tab, (signInsInFlight.get(tab) ?? 1) - 1);
      });
  };

  const signOut = (tab: Tab, step: number): Promise<unknown> => {
    // Another tab's sign-in may legitimately open a session meanwhile; only judge without one.
    const quiet = others(tab).every((other) => signInsInFlight.get(other) === 0);
    const started = others(tab).map((other) => signInsStarted.get(other));
    return tab.client.signOut().then((result) => {
      const stillQuiet = others(tab).every(
        (other, index) => signInsStarted.get(other) === started[index],
      );
      if (result.outcome === "signed-out" && quiet && stillQuiet && api.restorableSession()) {
        violations.push(
          `step ${String(step)}: ${tab.name}.signOut resolved signed-out with a session to resume`,
        );
      }
    });
  };

  const operations: ((step: number) => Promise<unknown> | undefined)[] = [
    () => signIn(pick(tabs)),
    (step) => signOut(pick(tabs), step),
    () => pick(tabs).client.restore(),
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
      for (const tab of tabs) for (const listener of [...tab.online]) listener();
      return undefined;
    },
    () => {
      api.expireAccessTokens();
      return undefined;
    },
    () => pick(tabs).client.authorizedFetch("/api/users/me"),
  ];

  const check = async (step: number): Promise<void> => {
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
    const count = 1 + Math.floor(random() * 3);
    for (let index = 0; index < count; index += 1) {
      const result = pick(operations)(step);
      if (result !== undefined) pending.push(result.catch(() => undefined));
      if (random() < 0.5) await flush();
    }
    await Promise.all(pending);
    await flush();
    await check(step);
  }
  for (const tab of tabs) tab.client.dispose();
  expect(violations).toEqual([]);
};

describe("session invariants under interleaved operations", () => {
  it.each(Array.from({ length: 24 }, (_, index) => index + 1))(
    "hold for seed %i",
    async (seed) => {
      await runScenario(seed, 30);
    },
    20_000,
  );
});

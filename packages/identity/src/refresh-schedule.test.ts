import { describe, expect, it } from "vitest";
import type { Clock } from "./clock.ts";
import { createIdentityClient } from "./identity-client.ts";
import { PASSWORD, START, settle, setup } from "./test-harness.ts";
import { createFakeIdentityApi, type FakeIdentityApi } from "./testing/fake-identity-api.ts";
import { createManualClock } from "./testing/manual-clock.ts";

const MAX_TIMER_MS = 2 ** 31 - 1;
const DAY = 86_400_000;

const refreshes = (api: FakeIdentityApi): number =>
  api.requests.filter((request) => request.path === "/api/auth/refresh").length;

const spin = async (clock: { advance: (ms: number) => void }, rounds = 10): Promise<void> => {
  for (let round = 0; round < rounds; round += 1) {
    clock.advance(0);
    await settle();
  }
};

describe("scheduled refresh timing", () => {
  it("does not storm when the client clock runs an hour ahead of the server", async () => {
    const apiClock = createManualClock(START);
    const clientClock = createManualClock(START + 3_600_000);
    const api = createFakeIdentityApi({ clock: apiClock, accessTokens: "jwt" });
    api.addUser({ username: "ada", email: "ada@example.com", password: PASSWORD });
    const client = createIdentityClient({
      baseUrl: api.baseUrl,
      fetch: api.fetch,
      clock: clientClock,
      channelName: "identgineer-skew",
    });
    try {
      await client.signIn({ identifier: "ada", password: PASSWORD });
      await spin(clientClock);
      expect(refreshes(api)).toBe(0);
      clientClock.advance(570_000);
      await settle();
      expect(refreshes(api)).toBe(1);
    } finally {
      client.dispose();
    }
  });

  it("does not storm when the token lives less than the refresh margin", async () => {
    const { api, clock, signIn } = setup({ accessTokens: "jwt", accessTokenLifetimeSeconds: 20 });
    await signIn();
    await spin(clock);
    expect(refreshes(api)).toBe(0);
    clock.advance(10_000);
    await settle();
    expect(refreshes(api)).toBe(1);
    await spin(clock);
    expect(refreshes(api)).toBe(1);
  });

  it("waits at least five seconds between refreshes, backing off while tokens stay short", async () => {
    const { api, clock, signIn } = setup({ accessTokens: "jwt", accessTokenLifetimeSeconds: 2 });
    await signIn();
    clock.advance(4_999);
    await settle();
    expect(refreshes(api)).toBe(0);
    clock.advance(1);
    await settle();
    expect(refreshes(api)).toBe(1);
    clock.advance(5_000);
    await settle();
    expect(refreshes(api)).toBe(1);
    clock.advance(5_000);
    await settle();
    expect(refreshes(api)).toBe(2);
  });

  it("refreshes 8-second tokens every 5 seconds, before each one expires", async () => {
    const { api, clock, signIn } = setup(
      { accessTokenLifetimeSeconds: 8 },
      { accessTokenLifetimeSeconds: 8 },
    );
    await signIn();
    const times: number[] = [];
    for (let second = 1; second <= 60; second += 1) {
      const before = refreshes(api);
      clock.advance(1000);
      await settle();
      if (refreshes(api) > before) times.push(second);
    }
    expect(times).toEqual([5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]);
  });

  it("never asks for a timer longer than setTimeout can hold (30-day legacy JWT)", async () => {
    const delays: number[] = [];
    const manual = createManualClock(START);
    const clock: Clock & { advance: (ms: number) => void } = {
      now: manual.now,
      setTimeout: (callback, delayMs) => {
        delays.push(delayMs);
        return manual.setTimeout(callback, delayMs);
      },
      clearTimeout: manual.clearTimeout,
      advance: manual.advance,
    };
    const api = createFakeIdentityApi({ clock: manual, sessions: "legacy", accessTokens: "jwt" });
    api.addUser({ username: "ada", email: "ada@example.com", password: PASSWORD });
    const client = createIdentityClient({
      baseUrl: api.baseUrl,
      fetch: api.fetch,
      clock,
      channelName: "identgineer-overflow",
    });
    try {
      await client.signIn({ identifier: "ada", password: PASSWORD });
      clock.advance(25 * DAY);
      await settle();
      expect(client.getState().status).toBe("signed-in");
      expect(refreshes(api)).toBe(0);
      clock.advance(5 * DAY - 30_000);
      await settle();
      expect(refreshes(api)).toBe(1);
      expect(client.getState().status).toBe("signed-in");
      clock.advance(30_000);
      await settle();
      expect(client.getState()).toEqual({ status: "signed-out", reason: "expired" });
      expect(Math.max(...delays)).toBeLessThanOrEqual(MAX_TIMER_MS);
    } finally {
      client.dispose();
    }
  });

  it("stays signed in right after a 30-day legacy sign-in on real timers", async () => {
    const api = createFakeIdentityApi({ sessions: "legacy", accessTokens: "jwt" });
    api.addUser({ username: "ada", email: "ada@example.com", password: PASSWORD });
    const client = createIdentityClient({
      baseUrl: api.baseUrl,
      fetch: api.fetch,
      channelName: "identgineer-real-timers",
    });
    try {
      await client.signIn({ identifier: "ada", password: PASSWORD });
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(client.getState().status).toBe("signed-in");
      expect(refreshes(api)).toBe(0);
    } finally {
      client.dispose();
    }
  });
});

describe("scheduled refresh of opaque tokens", () => {
  it("issues opaque tokens by default, as strapi-php does", async () => {
    const { api, signIn } = setup();
    await signIn();
    expect(api.requests.at(-1)?.path).toBe("/api/auth/local");
    expect(api.refreshCookie()).toBeDefined();
  });

  it("refreshes from the configured lifetime (camis' 600 s by default)", async () => {
    const { api, clock, signIn } = setup();
    await signIn();
    clock.advance(569_000);
    await settle();
    expect(refreshes(api)).toBe(0);
    clock.advance(1_000);
    await settle();
    expect(refreshes(api)).toBe(1);
  });

  it("takes a configured lifetime", async () => {
    const { api, clock, signIn } = setup(
      { accessTokenLifetimeSeconds: 120 },
      { accessTokenLifetimeSeconds: 120 },
    );
    await signIn();
    clock.advance(90_000);
    await settle();
    expect(refreshes(api)).toBe(1);
  });

  it("follows the backend's expiresIn over the configured lifetime", async () => {
    const { api, clock, signIn } = setup({
      accessTokenLifetimeSeconds: 300,
      reportExpiresIn: true,
    });
    await signIn();
    clock.advance(270_000);
    await settle();
    expect(refreshes(api)).toBe(1);
  });

  it("signs out when the refresh session has ended", async () => {
    const { api, clock, client, signIn } = setup();
    await signIn();
    api.clearCookies();
    clock.advance(570_000);
    await settle();
    expect(client.getState()).toEqual({ status: "signed-out", reason: "expired" });
  });

  it("keeps a legacy session whose lifetime it only guessed, until the server refuses the token", async () => {
    const { api, clock, client, signIn } = setup({ sessions: "legacy" });
    await signIn();
    clock.advance(570_000);
    await settle();
    expect(refreshes(api)).toBe(1);
    clock.advance(10 * DAY);
    await settle();
    expect(client.getState().status).toBe("signed-in");
    expect(refreshes(api)).toBe(1);
    api.expireAccessTokens();
    await client.currentUser().catch(() => undefined);
    expect(client.getState()).toEqual({ status: "signed-out", reason: "expired" });
  });

  it("keeps the session after a sleep when the first refresh finds no network", async () => {
    const base = createManualClock(START);
    let slept = 0;
    const sleepy: Clock = {
      now: () => base.now() + slept,
      setTimeout: base.setTimeout,
      clearTimeout: base.clearTimeout,
    };
    const api = createFakeIdentityApi({ clock: sleepy, accessTokens: "jwt" });
    api.addUser({ username: "ada", email: "ada@example.com", password: PASSWORD });
    const client = createIdentityClient({
      baseUrl: api.baseUrl,
      fetch: api.fetch,
      clock: sleepy,
      channelName: "identgineer-sleep",
    });
    try {
      await client.signIn({ identifier: "ada", password: PASSWORD });
      slept = 3_600_000;
      api.respondNext("POST", "/api/auth/refresh", "network-error");
      base.advance(570_000);
      await spin(base, 3);
      expect(client.getState()).toMatchObject({ status: "signed-in" });
      base.advance(30_000);
      await settle();
      await expect(client.currentUser()).resolves.toMatchObject({ username: "ada" });
    } finally {
      client.dispose();
    }
  });

  it("refreshes before sending a request when the token's known expiry has passed", async () => {
    const base = createManualClock(START);
    let slept = 0;
    const sleepy: Clock = {
      now: () => base.now() + slept,
      setTimeout: base.setTimeout,
      clearTimeout: base.clearTimeout,
    };
    const api = createFakeIdentityApi({ clock: sleepy, accessTokens: "jwt" });
    api.addUser({ username: "ada", email: "ada@example.com", password: PASSWORD });
    const client = createIdentityClient({
      baseUrl: api.baseUrl,
      fetch: api.fetch,
      clock: sleepy,
      channelName: "identgineer-sleep-request",
    });
    try {
      await client.signIn({ identifier: "ada", password: PASSWORD });
      slept = 3_600_000;
      const sent = api.requests.length;
      const response = await client.authorizedFetch("/api/users/me");
      expect(response.status).toBe(200);
      expect(api.requests.slice(sent).map((request) => request.path)).toEqual([
        "/api/auth/refresh",
        "/api/users/me",
        "/api/users/me",
      ]);
    } finally {
      client.dispose();
    }
  });
});

import { describe, expect, it } from "vitest";
import { rejection, settle, setup } from "./test-harness.ts";
import type { FakeIdentityApi } from "./testing/fake-identity-api.ts";

const refreshTimes = (api: FakeIdentityApi, times: number[], now: number, before: number): void => {
  const count = api.requests.filter((request) => request.path === "/api/auth/refresh").length;
  if (count > before) times.push(now);
};

const refreshes = (api: FakeIdentityApi): number =>
  api.requests.filter((request) => request.path === "/api/auth/refresh").length;

const throttledAnswer = (seconds: number) => ({
  status: 429,
  body: { data: null, error: { status: 429, name: "RateLimitError", message: "x", details: {} } },
  headers: { "Retry-After": String(seconds) },
});

describe("looking up the cookie session at sign-out", () => {
  it.each([
    ["throttled", throttledAnswer(30)],
    ["a server error", { status: 503, body: { data: null, error: { status: 503 } } }],
    ["a success without tokens", { status: 200, body: { nothing: true } }],
    ["an unexpected answer", { status: 409, body: { data: null, error: { status: 409 } } }],
  ])("reports the server unreachable when it is %s", async (_name, answer) => {
    const { api, makeClient, signIn } = setup({ httpOnlyCookies: true });
    await signIn();
    const tab = makeClient();
    api.respondNext("POST", "/api/auth/refresh", answer);
    await expect(tab.signOut()).resolves.toEqual({ outcome: "server-unreachable" });
    expect(api.restorableSession()).toBe(true);
  });

  it.each([400, 401, 403, 404])("takes a %i as no session to end", async (status) => {
    const { api, client } = setup();
    api.respondNext("POST", "/api/auth/refresh", {
      status,
      body: { data: null, error: { status, name: "x", message: "x", details: {} } },
    });
    await expect(client.signOut()).resolves.toEqual({ outcome: "signed-out" });
  });
});

describe("a refresh the server throttles", () => {
  it("rejects a request that needs it with throttled and the server's wait", async () => {
    const { api, client, clock, signIn } = setup({ reportExpiresIn: true });
    await signIn();
    api.respondNext("POST", "/api/auth/refresh", "network-error");
    clock.advance(570_000);
    await settle();
    api.respondNext("POST", "/api/auth/refresh", throttledAnswer(30));
    clock.advance(31_000);
    await settle();
    api.respondNext("POST", "/api/auth/refresh", throttledAnswer(30));
    const error = await rejection(client.currentUser());
    expect(error).toMatchObject({ code: "throttled", retryAfterSeconds: 30 });
    expect(client.getState().status).toBe("signed-in");
  });

  it("waits the server's Retry-After before the scheduled refresh tries again", async () => {
    const { api, clock, signIn } = setup();
    await signIn();
    api.respondNext("POST", "/api/auth/refresh", throttledAnswer(120));
    clock.advance(570_000);
    await settle();
    const before = refreshes(api);
    clock.advance(119_000);
    await settle();
    expect(refreshes(api)).toBe(before);
    clock.advance(1_000);
    await settle();
    expect(refreshes(api)).toBe(before + 1);
  });
});

describe("the browser going on and off line", () => {
  it("retries no more often than every five seconds however often it comes back online", async () => {
    let fireOnline = (): void => undefined;
    const { api, clock, signIn } = setup(
      {},
      {
        onOnline: (listener) => {
          fireOnline = listener;
          return () => {
            fireOnline = () => undefined;
          };
        },
      },
    );
    await signIn();
    api.respondNext("POST", "/api/auth/refresh", "network-error");
    clock.advance(570_000);
    await settle();
    const times: number[] = [];
    for (let second = 1; second <= 20; second += 1) {
      api.respondNext("POST", "/api/auth/refresh", "network-error");
      const before = refreshes(api);
      fireOnline();
      clock.advance(1_000);
      await settle();
      refreshTimes(api, times, second, before);
    }
    expect(times.length).toBeGreaterThan(0);
    for (let index = 1; index < times.length; index += 1) {
      expect((times[index] ?? 0) - (times[index - 1] ?? 0)).toBeGreaterThanOrEqual(5);
    }
  });
});

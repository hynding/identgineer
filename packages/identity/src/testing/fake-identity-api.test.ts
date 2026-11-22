import { describe, expect, it } from "vitest";
import { createFakeIdentityApi, type FakeIdentityApiOptions } from "./fake-identity-api.ts";
import { createManualClock } from "./manual-clock.ts";

const PASSWORD = "correct horse battery staple";
const START = Date.UTC(2026, 0, 1, 12, 0, 0);

interface Call {
  readonly body?: unknown;
  readonly bearer?: string;
  readonly cookies?: boolean;
  readonly headers?: Record<string, string>;
}

const fakeApi = (options: FakeIdentityApiOptions = {}) => {
  const clock = createManualClock(START);
  const api = createFakeIdentityApi({ clock, ...options });
  api.addUser({ username: "ada", email: "ada@example.com", password: PASSWORD });
  api.addUser({ username: "bob", email: "bob@example.com", password: PASSWORD });
  const post = async (path: string, call: Call = {}) => {
    const response = await api.fetch(`${api.baseUrl}${path}`, {
      method: "POST",
      credentials: call.cookies === false ? "omit" : "include",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "identgineer",
        "x-strapi-refresh-cookie": "httpOnly",
        ...(call.bearer === undefined ? {} : { Authorization: `Bearer ${call.bearer}` }),
        ...call.headers,
      },
      body: JSON.stringify(call.body ?? {}),
    });
    return {
      status: response.status,
      headers: response.headers,
      body: (await response.json()) as Record<string, unknown>,
    };
  };
  const signIn = async (identifier: string): Promise<string> => {
    const answer = await post("/api/auth/local", { body: { identifier, password: PASSWORD } });
    return answer.body.jwt as string;
  };
  return { api, clock, post, signIn };
};

describe("the fake's logout, as camis' SessionController::logout", () => {
  it("ends only the bearer token itself when it names no session", async () => {
    const { api, post, signIn } = fakeApi();
    await signIn("ada");
    const lasting = api.issueLastingToken("ada@example.com");
    expect((await post("/api/auth/logout", { bearer: lasting })).status).toBe(200);
    expect(api.activeSessionCount("ada@example.com")).toBe(1);
    expect((await post("/api/auth/logout", { bearer: lasting })).status).toBe(401);
  });

  it("ends the bearer token's own session and keeps a cookie that names another session", async () => {
    const { api, post, signIn } = fakeApi();
    const ada = await signIn("ada");
    await signIn("bob");
    const bobsCookie = api.refreshCookie();
    expect((await post("/api/auth/logout", { bearer: ada })).status).toBe(200);
    expect(api.activeSessionCount("ada@example.com")).toBe(0);
    expect(api.activeSessionCount("bob@example.com")).toBe(1);
    expect(api.refreshCookie()).toBe(bobsCookie);
  });

  it("clears the cookie when the cookie's session is the one it ended", async () => {
    const { api, post, signIn } = fakeApi();
    const ada = await signIn("ada");
    await post("/api/auth/logout", { bearer: ada });
    expect(api.refreshCookie()).toBeUndefined();
  });

  it("clears a cookie that names no usable session", async () => {
    const { api, post, signIn } = fakeApi();
    const first = await signIn("ada");
    await post("/api/auth/refresh");
    await post("/api/auth/logout", { bearer: first, body: { scope: "all" } });
    const second = await signIn("bob");
    api.setRefreshCookie("unknown.secret");
    await post("/api/auth/logout", { bearer: second });
    expect(api.refreshCookie()).toBeUndefined();
  });

  it("ends every session of the account and clears the cookie for scope all", async () => {
    const { api, post, signIn } = fakeApi();
    await signIn("ada");
    const ada = await signIn("ada");
    expect(api.activeSessionCount("ada@example.com")).toBe(2);
    await post("/api/auth/logout", { bearer: ada, body: { scope: "all" } });
    expect(api.activeSessionCount("ada@example.com")).toBe(0);
    expect(api.refreshCookie()).toBeUndefined();
  });
});

describe("the fake's throttle, as camis' StrapiRateLimits", () => {
  it("keeps one bucket per group of routes", async () => {
    const { post } = fakeApi({ throttlePerMinute: 2 });
    const wrong = { body: { identifier: "ada", password: "wrong" } };
    await post("/api/auth/local", wrong);
    await post("/api/auth/local", wrong);
    const throttled = await post("/api/auth/local", wrong);
    expect(throttled.status).toBe(429);
    expect(throttled.body).toMatchObject({ error: { status: 429, name: "RateLimitError" } });
    expect(throttled.headers.get("Retry-After")).toBe("60");
    const register = await post("/api/auth/local/register", {
      body: { username: "eve", email: "eve@example.com", password: PASSWORD },
    });
    expect(register.status).toBe(200);
    expect(
      (await post("/api/auth/forgot-password", { body: { email: "a@example.com" } })).status,
    ).toBe(200);
  });

  it("counts sign-ins per account named, under a ceiling for the address", async () => {
    const { post } = fakeApi({ throttlePerMinute: 2, addressThrottlePerMinute: 3 });
    const wrong = (identifier: string) => ({ body: { identifier, password: "wrong" } });
    await post("/api/auth/local", wrong("ada"));
    await post("/api/auth/local", wrong("ada"));
    expect((await post("/api/auth/local", wrong(" ADA "))).status).toBe(429);
    // Another account has its own bucket, until the address meets its ceiling.
    expect((await post("/api/auth/local", wrong("bob"))).status).toBe(400);
    expect((await post("/api/auth/local", wrong("eve"))).status).toBe(429);
  });

  it("gives a password reset a bucket apart from the reset email", async () => {
    const { post } = fakeApi({ throttlePerMinute: 1 });
    await post("/api/auth/forgot-password", { body: { email: "ada@example.com" } });
    expect(
      (await post("/api/auth/forgot-password", { body: { email: "ada@example.com" } })).status,
    ).toBe(429);
    const reset = { body: { code: "x", password: PASSWORD, passwordConfirmation: PASSWORD } };
    expect((await post("/api/auth/reset-password", reset)).status).toBe(400);
    expect((await post("/api/auth/reset-password", reset)).status).toBe(429);
  });

  it("never refuses a valid refresh token, and counts only failed refreshes", async () => {
    const { post, signIn } = fakeApi({ refreshThrottlePerMinute: 2 });
    await signIn("ada");
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await post("/api/auth/refresh")).status).toBe(200);
    }
    await post("/api/auth/refresh", { cookies: false });
    await post("/api/auth/refresh", { cookies: false });
    expect((await post("/api/auth/refresh", { cookies: false })).status).toBe(429);
    expect((await post("/api/auth/refresh")).status).toBe(200);
  });

  it("throttles refreshes in their own bucket, 60 a minute by default", async () => {
    const { clock, post } = fakeApi({ throttlePerMinute: 1 });
    for (let attempt = 0; attempt < 60; attempt += 1) {
      expect((await post("/api/auth/refresh")).status).toBe(400);
    }
    expect((await post("/api/auth/refresh")).status).toBe(429);
    clock.advance(60_000);
    expect((await post("/api/auth/refresh")).status).toBe(400);
  });

  it("takes a refresh rate", async () => {
    const { post } = fakeApi({ refreshThrottlePerMinute: 1 });
    await post("/api/auth/refresh");
    expect((await post("/api/auth/refresh")).status).toBe(429);
  });
});

describe("the fake's refresh cookie origin check, as camis' refuseForeignCookie", () => {
  it("refuses the cookie from another origin", async () => {
    const { post, signIn } = fakeApi();
    await signIn("ada");
    const answer = await post("/api/auth/refresh", {
      headers: { Origin: "https://evil.example" },
    });
    expect(answer.status).toBe(403);
    expect(answer.body).toMatchObject({ error: { name: "ForbiddenError" } });
  });

  it("takes it from the CMS's own origin or an allowed one", async () => {
    const { api, post, signIn } = fakeApi({ allowedOrigins: ["https://app.example"] });
    await signIn("ada");
    expect((await post("/api/auth/refresh", { headers: { Origin: api.baseUrl } })).status).toBe(
      200,
    );
    expect(
      (await post("/api/auth/refresh", { headers: { Origin: "https://app.example" } })).status,
    ).toBe(200);
  });

  it("refuses it without an Origin unless a header only a page of the site can send is there", async () => {
    const { api, signIn } = fakeApi();
    await signIn("ada");
    const response = await api.fetch(`${api.baseUrl}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(response.status).toBe(403);
  });

  it("does not refuse a request without the cookie", async () => {
    const { post } = fakeApi();
    expect(
      (await post("/api/auth/refresh", { headers: { Origin: "https://evil.example" } })).status,
    ).toBe(400);
  });
});

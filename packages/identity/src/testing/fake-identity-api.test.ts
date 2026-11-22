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

describe("the fake's session list, as camis' StrapiSessions::list", () => {
  it("lists the current session first, then the others latest used first", async () => {
    const { api, clock, signIn } = fakeApi();
    await signIn("ada");
    clock.advance(1_000);
    const middle = await signIn("ada");
    clock.advance(1_000);
    await signIn("ada");
    const response = await api.fetch(`${api.baseUrl}/api/auth/sessions`, {
      headers: { Authorization: `Bearer ${middle}` },
    });
    const { data } = (await response.json()) as {
      data: { current: boolean; lastActiveAt: string }[];
    };
    expect(data.map((session) => session.current)).toEqual([true, false, false]);
    expect(data.map((session) => session.lastActiveAt)).toEqual([
      new Date(START + 1_000).toISOString(),
      new Date(START + 2_000).toISOString(),
      new Date(START).toISOString(),
    ]);
  });
});

describe("the fake's session metadata, as camis' StrapiSessions", () => {
  const listSessions = async (api: ReturnType<typeof fakeApi>["api"], jwt: string) => {
    const response = await api.fetch(`${api.baseUrl}/api/auth/sessions`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    return ((await response.json()) as { data: Record<string, unknown>[] }).data;
  };

  it("names the device of a registration's session, as of a sign-in's", async () => {
    const { api, post } = fakeApi();
    const answer = await post("/api/auth/local/register", {
      cookies: false,
      body: { username: "eve", email: "eve@example.com", password: PASSWORD },
    });
    const [session] = await listSessions(api, answer.body.jwt as string);
    expect(session).toMatchObject({ deviceName: "Firefox on Linux" });
    expect(session?.deviceId).toEqual(expect.any(String));
  });

  it("gives the session a password change opens no device name and no sign-in time", async () => {
    const { api, post, signIn } = fakeApi();
    const jwt = await signIn("ada");
    const changed = await post("/api/auth/change-password", {
      bearer: jwt,
      body: {
        currentPassword: PASSWORD,
        password: "another password",
        passwordConfirmation: "another password",
      },
    });
    const [session] = await listSessions(api, changed.body.jwt as string);
    expect(Object.keys(session ?? {}).sort()).toEqual([
      "current",
      "deviceId",
      "id",
      "lastActiveAt",
    ]);
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
    const { post } = fakeApi({ throttlePerMinute: 2, addressThrottlePerMinute: 4 });
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

describe("the fake's restorable user", () => {
  it("names the account whose session the refresh cookie resumes, if any", async () => {
    const { api, post, signIn } = fakeApi();
    expect(api.restorableUser()).toBeUndefined();
    const ada = await signIn("ada");
    expect(api.restorableUser()).toBe("ada@example.com");
    await signIn("bob");
    expect(api.restorableUser()).toBe("bob@example.com");
    await post("/api/auth/logout", { bearer: ada });
    expect(api.restorableUser()).toBe("bob@example.com");
    api.clearCookies();
    expect(api.restorableUser()).toBeUndefined();
  });
});

describe("the fake's strict validation, as camis' StrapiUsers::validate", () => {
  const errorMessage = (answer: { body: Record<string, unknown> }): unknown =>
    (answer.body.error as { message?: unknown } | undefined)?.message;

  it("refuses a field that is not a string before a sign-in takes a turn", async () => {
    const { post } = fakeApi({ throttlePerMinute: 1 });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const answer = await post("/api/auth/local", { body: { identifier: 5, password: "x" } });
      expect(answer.status).toBe(400);
      expect(errorMessage(answer)).toBe(
        "identifier must be a `string` type, but the final value was: `5`.",
      );
    }
    const wrong = await post("/api/auth/local", { body: { identifier: "ada", password: "x" } });
    expect(wrong.status).toBe(400);
  });

  it("refuses an identifier over 255 characters before a turn or a lookup", async () => {
    const { post } = fakeApi({ throttlePerMinute: 1 });
    const long = { body: { identifier: "a".repeat(256), password: "x" } };
    expect(errorMessage(await post("/api/auth/local", long))).toBe(
      "Invalid identifier or password",
    );
    expect((await post("/api/auth/local", long)).status).toBe(400);
  });

  it("refuses a recovery email that is not a string before a turn", async () => {
    const { post } = fakeApi({ throttlePerMinute: 1, addressThrottlePerMinute: 1 });
    await post("/api/auth/forgot-password", { body: { email: ["ada@example.com"] } });
    const answer = await post("/api/auth/forgot-password", { body: { email: "ada@example.com" } });
    expect(answer.status).toBe(200);
  });

  it("refuses a username or email over 255 characters on registration", async () => {
    const { post } = fakeApi();
    const answer = await post("/api/auth/local/register", {
      body: { username: "u".repeat(256), email: "eve@example.com", password: PASSWORD },
    });
    expect(errorMessage(answer)).toBe("username must be at most 255 characters");
    const email = await post("/api/auth/local/register", {
      body: { username: "eve", email: `${"e".repeat(250)}@example.com`, password: PASSWORD },
    });
    expect(errorMessage(email)).toBe("email must be at most 255 characters");
  });

  it("counts a password's length in bytes", async () => {
    const { post } = fakeApi();
    const answer = await post("/api/auth/local/register", {
      body: { username: "eve", email: "eve@example.com", password: "é".repeat(37) },
    });
    expect(errorMessage(answer)).toBe("Password must be less than 73 bytes");
  });
});

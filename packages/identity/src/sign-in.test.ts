import { describe, expect, it, vi } from "vitest";
import { createIdentityClient } from "./identity-client.ts";
import { IdentityError } from "./identity-error.ts";
import { PASSWORD, rejection, setup } from "./test-harness.ts";

describe("createIdentityClient", () => {
  it("refuses a base URL that is not https", () => {
    expect(() => createIdentityClient({ baseUrl: "http://cms.example.com" })).toThrow(TypeError);
  });

  it("starts with an unknown session", () => {
    const { client } = setup();
    expect(client.getState()).toEqual({ status: "unknown" });
  });

  it("returns an API object with no token anywhere on it", async () => {
    const { client, signIn } = setup();
    await signIn();
    const seen = JSON.stringify(Object.getOwnPropertyNames(client)) + JSON.stringify(client);
    expect(seen).not.toMatch(/eyJ|token/i);
    expect(JSON.stringify(client.getState())).not.toMatch(/eyJ|jwt|token/i);
  });
});

describe("signIn", () => {
  it("signs in with an identifier and password, and announces the user", async () => {
    const { client, states, signIn } = setup();
    const user = await signIn();
    expect(user).toMatchObject({ username: "ada", email: "ada@example.com" });
    expect(client.getState()).toEqual({ status: "signed-in", user });
    expect(states).toEqual([{ status: "signed-in", user }]);
    expect(Object.isFrozen(client.getState())).toBe(true);
  });

  it("posts only the identifier and password, asking for the refresh token as a cookie", async () => {
    const { api, signIn } = setup();
    await signIn();
    const request = api.requests[0];
    expect(request?.method).toBe("POST");
    expect(request?.path).toBe("/api/auth/local");
    expect(request?.body).toEqual({ identifier: "ada@example.com", password: PASSWORD });
    expect(request?.credentials).toBe("include");
    expect(request?.headers.get("x-requested-with")).toBe("identgineer");
    expect(request?.headers.get("x-strapi-refresh-cookie")).toBe("httpOnly");
    expect(request?.headers.get("content-type")).toBe("application/json");
    expect(api.refreshCookie()).toMatch(/\./);
  });

  it.each([
    ["a wrong password", { identifier: "ada@example.com", password: "wrong" }],
    ["an unknown account", { identifier: "nobody@example.com", password: PASSWORD }],
    ["an empty identifier", { identifier: "", password: PASSWORD }],
  ])("maps %s to one generic error", async (_label, credentials) => {
    const { client } = setup();
    const error = await rejection(client.signIn(credentials));
    expect(error).toBeInstanceOf(IdentityError);
    expect(error).toMatchObject({ code: "invalid-credentials" });
    expect((error as Error).message).not.toMatch(/identifier|password|exist/i);
    expect(client.getState()).toEqual({ status: "unknown" });
  });

  it("maps a blocked account to the same generic error", async () => {
    const { api, client } = setup();
    api.addUser({ username: "bob", email: "bob@example.com", password: PASSWORD, blocked: true });
    await expect(
      client.signIn({ identifier: "bob@example.com", password: PASSWORD }),
    ).rejects.toMatchObject({ code: "invalid-credentials" });
  });

  it("says the email is not confirmed only after correct credentials", async () => {
    const { api, client } = setup({ emailConfirmation: true });
    api.addUser({ username: "cy", email: "cy@example.com", password: PASSWORD, confirmed: false });
    await expect(
      client.signIn({ identifier: "cy@example.com", password: PASSWORD }),
    ).rejects.toMatchObject({ code: "email-not-confirmed" });
    await expect(
      client.signIn({ identifier: "cy@example.com", password: "wrong" }),
    ).rejects.toMatchObject({ code: "invalid-credentials" });
  });

  it("reports a network failure", async () => {
    const { api, signIn } = setup();
    api.respondNext("POST", "/api/auth/local", "network-error");
    await expect(signIn()).rejects.toMatchObject({ code: "network" });
  });

  it("aborts a request that hangs past the timeout", async () => {
    const { api, clock, signIn } = setup({}, { requestTimeoutMs: 1000 });
    api.respondNext("POST", "/api/auth/local", "hang");
    const pending = rejection(signIn());
    await Promise.resolve();
    clock.advance(1000);
    expect(await pending).toMatchObject({ code: "network" });
  });

  it("maps a server error to unknown", async () => {
    const { api, signIn } = setup();
    api.respondNext("POST", "/api/auth/local", { status: 500, body: { message: "boom" } });
    await expect(signIn()).rejects.toMatchObject({ code: "unknown" });
  });

  it("refuses a malformed success answer", async () => {
    const { api, client, signIn } = setup();
    api.respondNext("POST", "/api/auth/local", { status: 200, body: { jwt: 5, user: "ada" } });
    await expect(signIn()).rejects.toMatchObject({ code: "unknown" });
    expect(client.getState().status).toBe("unknown");
  });

  it("keeps the backend's own message out of the error", async () => {
    const { api, signIn } = setup();
    api.respondNext("POST", "/api/auth/local", {
      status: 400,
      body: {
        data: null,
        error: {
          status: 400,
          name: "ApplicationError",
          message: "ada@example.com exists",
          details: {},
        },
      },
    });
    const error = await rejection(signIn());
    expect(JSON.stringify(error) + String(error)).not.toContain("ada@example.com");
  });
});

describe("subscribe", () => {
  it("stops calling a listener once unsubscribed", async () => {
    const { client, signIn } = setup();
    const listener = vi.fn();
    const unsubscribe = client.subscribe(listener);
    unsubscribe();
    await signIn();
    expect(listener).not.toHaveBeenCalled();
  });

  it("keeps calling other listeners when one throws", async () => {
    const { client, signIn } = setup();
    const after = vi.fn();
    client.subscribe(() => {
      throw new Error("listener bug");
    });
    client.subscribe(after);
    await signIn();
    expect(after).toHaveBeenCalledTimes(1);
  });
});

describe("currentUser", () => {
  it("reads the account and refreshes the state's user", async () => {
    const { api, client, signIn } = setup();
    await signIn();
    const user = await client.currentUser();
    expect(user.email).toBe("ada@example.com");
    const request = api.requests.at(-1);
    expect(request?.path).toBe("/api/users/me");
    expect(request?.headers.get("authorization")).toMatch(/^Bearer /);
    expect(request?.credentials).toBe("omit");
    expect(request?.headers.has("x-strapi-refresh-cookie")).toBe(false);
  });

  it("refuses without a session", async () => {
    const { api, client } = setup();
    await expect(client.currentUser()).rejects.toMatchObject({ code: "unauthorized" });
    expect(api.requests).toHaveLength(0);
  });
});

describe("signOut", () => {
  it("ends the session on the server, clears the cookie and announces the reason", async () => {
    const { api, client, states, signIn } = setup();
    await signIn();
    await client.signOut();
    const request = api.requests.find((sent) => sent.path === "/api/auth/logout");
    expect(request?.path).toBe("/api/auth/logout");
    expect(request?.method).toBe("POST");
    expect(request?.credentials).toBe("include");
    expect(request?.headers.get("x-requested-with")).toBe("identgineer");
    expect(request?.headers.get("authorization")).toMatch(/^Bearer /);
    expect(api.refreshCookie()).toBeUndefined();
    expect(api.activeSessionCount("ada@example.com")).toBe(0);
    expect(client.getState()).toEqual({ status: "signed-out", reason: "user" });
    expect(states.at(-1)).toEqual({ status: "signed-out", reason: "user" });
  });

  it("can end every session of the account", async () => {
    const { api, client, makeClient, signIn } = setup();
    await makeClient().signIn({ identifier: "ada", password: PASSWORD });
    await signIn();
    expect(api.activeSessionCount("ada@example.com")).toBe(2);
    await client.signOut({ everywhere: true });
    expect(api.requests.find((sent) => sent.path === "/api/auth/logout")?.body).toMatchObject({
      scope: "all",
    });
    expect(api.activeSessionCount("ada@example.com")).toBe(0);
  });

  it("resolves to say whether the server session was ended, and nothing more", async () => {
    const { client, signIn } = setup();
    await signIn();
    const result = await client.signOut();
    expect(result).toEqual({ outcome: "signed-out" });
    expect(JSON.stringify(result)).toBe('{"outcome":"signed-out"}');
    expect(Object.isFrozen(result)).toBe(true);
    expect(JSON.stringify(client)).not.toMatch(/token/i);
  });

  it("signs out locally even when the server cannot be reached, and says so", async () => {
    const { api, client, signIn } = setup();
    await signIn();
    api.respondNext("POST", "/api/auth/logout", "network-error");
    await expect(client.signOut()).resolves.toEqual({ outcome: "server-unreachable" });
    expect(client.getState()).toEqual({ status: "signed-out", reason: "user" });
    await expect(client.currentUser()).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("signs out locally on a backend without sessions (legacy tokens)", async () => {
    const { client, signIn } = setup({ sessions: "legacy" });
    await signIn();
    await expect(client.signOut()).resolves.toEqual({ outcome: "signed-out" });
    expect(client.getState()).toEqual({ status: "signed-out", reason: "user" });
  });

  it("finds the session through the cookie when the access token has expired", async () => {
    const { api, client, signIn } = setup();
    await signIn();
    api.expireAccessTokens();
    await client.signOut();
    // The dead token's logout, then the cookie lookup finds the session and logs it out.
    expect(api.requests.map((request) => request.path).slice(-3)).toEqual([
      "/api/auth/logout",
      "/api/auth/refresh",
      "/api/auth/logout",
    ]);
    expect(api.activeSessionCount("ada@example.com")).toBe(0);
  });

  it("looks for a cookie session even when already signed out", async () => {
    const { api, client } = setup();
    await client.restore();
    const sent = api.requests.length;
    await expect(client.signOut()).resolves.toEqual({ outcome: "signed-out" });
    expect(api.requests.slice(sent).map((request) => request.path)).toEqual(["/api/auth/refresh"]);
    expect(client.getState()).toEqual({ status: "signed-out", reason: "user" });
  });

  it("only looks for a cookie session when the state is unknown and there is none", async () => {
    const { api, client } = setup();
    await client.signOut();
    expect(api.requests.map((request) => request.path)).toEqual(["/api/auth/refresh"]);
    expect(client.getState()).toEqual({ status: "signed-out", reason: "user" });
  });
});

import { describe, expect, it } from "vitest";
import { PASSWORD, rejection, setup } from "./test-harness.ts";

describe("listSessions", () => {
  it("lists the account's sessions, the current one marked", async () => {
    const { api, client, makeClient, signIn } = setup();
    await makeClient().signIn({ identifier: "ada", password: PASSWORD });
    await signIn();
    const sessions = await client.listSessions();
    expect(sessions).toHaveLength(2);
    expect(sessions.filter((session) => session.current)).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ current: true, deviceName: "Firefox on Linux" });
    const request = api.requests.at(-1);
    expect(request?.path).toBe("/api/auth/sessions");
    expect(request?.credentials).toBe("omit");
  });

  it("refuses a malformed list", async () => {
    const { api, client, signIn } = setup();
    await signIn();
    api.respondNext("GET", "/api/auth/sessions", { status: 200, body: { data: [{ id: 3 }] } });
    await expect(client.listSessions()).rejects.toMatchObject({ code: "unknown" });
  });
});

describe("revokeSession", () => {
  it("ends another session by its id", async () => {
    const { api, client, makeClient, signIn } = setup();
    await makeClient().signIn({ identifier: "ada", password: PASSWORD });
    await signIn();
    const other = (await client.listSessions()).find((session) => !session.current);
    await client.revokeSession(other?.id ?? "");
    expect(api.requests.at(-1)).toMatchObject({
      method: "DELETE",
      path: `/api/auth/sessions/${other?.id ?? ""}`,
      credentials: "omit",
    });
    expect(api.activeSessionCount("ada@example.com")).toBe(1);
  });

  it.each(["../users/me", "a/b", "x?y", "", "%2e%2e"])(
    "refuses the hostile id %j without a request",
    async (id) => {
      const { api, client, signIn } = setup();
      await signIn();
      const sent = api.requests.length;
      await expect(client.revokeSession(id)).rejects.toMatchObject({ code: "validation" });
      expect(api.requests).toHaveLength(sent);
    },
  );

  it("reports an unknown session as unknown", async () => {
    const { client, signIn } = setup();
    await signIn();
    await expect(client.revokeSession("deadbeef")).rejects.toMatchObject({ code: "unknown" });
  });
});

describe("providerSignInUrl", () => {
  it("builds the connect URL for a provider", () => {
    const { api, client } = setup();
    expect(client.providerSignInUrl("github")).toBe(`${api.baseUrl}/api/connect/github`);
  });

  it("adds an encoded front-end callback", () => {
    const { api, client } = setup();
    expect(
      client.providerSignInUrl("github", { callback: "https://app.example/auth/github?x=1&y=2" }),
    ).toBe(
      `${api.baseUrl}/api/connect/github?callback=${encodeURIComponent("https://app.example/auth/github?x=1&y=2")}`,
    );
  });

  it.each(["javascript:alert(1)", "//evil.example", "/relative", "http://evil.example/cb"])(
    "refuses the callback %j",
    (callback) => {
      const { client } = setup();
      expect(() => client.providerSignInUrl("github", { callback })).toThrow(
        expect.objectContaining({ code: "validation" }),
      );
    },
  );

  it.each(["../admin", "git/hub", "GitHub", "github?x", "local", ""])(
    "refuses the provider %j",
    (provider) => {
      const { client } = setup();
      expect(() => client.providerSignInUrl(provider)).toThrow(
        expect.objectContaining({ code: "validation" }),
      );
    },
  );
});

describe("completeProviderSignIn", () => {
  it("signs in with the provider round trip's session and returns a safe redirect", async () => {
    const { api, client } = setup();
    api.completeProviderRoundTrip("github", "lin@example.com");
    const result = await client.completeProviderSignIn("github", {
      search: "",
      returnTo: "/account",
    });
    expect(result.user).toMatchObject({ email: "lin@example.com", provider: "github" });
    expect(result.redirectTo).toBe("/account");
    expect(client.getState().status).toBe("signed-in");
    const request = api.requests.at(-1);
    expect(request?.method).toBe("GET");
    expect(request?.path).toBe("/api/auth/github/callback");
    expect(request?.credentials).toBe("include");
    expect(request?.headers.get("x-requested-with")).toBe("identgineer");
    expect(api.refreshCookie()).toBeDefined();
  });

  it.each(["//evil.example", "https://evil.example", "/\\evil.example", "javascript:alert(1)"])(
    "replaces the unsafe redirect %j with /",
    async (returnTo) => {
      const { api, client } = setup();
      api.completeProviderRoundTrip("github", "lin@example.com");
      const result = await client.completeProviderSignIn("github", { search: "", returnTo });
      expect(result.redirectTo).toBe("/");
    },
  );

  it("passes a provider access token from the callback query on (Strapi's flow)", async () => {
    const { api, client } = setup();
    api.completeProviderRoundTrip("github", "lin@example.com");
    await client.completeProviderSignIn("github", {
      search: "?access_token=abc&id_token=def&raw[x]=1&other=2",
    });
    const query = api.requests.at(-1)?.query;
    expect(query?.get("access_token")).toBe("abc");
    expect(query?.get("id_token")).toBe("def");
    expect(query?.has("other")).toBe(false);
    expect(query?.has("raw[x]")).toBe(false);
  });

  it("fails with a generic error when the provider reported one, without a request", async () => {
    const { api, client } = setup();
    const error = await rejection(
      client.completeProviderSignIn("github", {
        search: "?error=access_denied&error_description=User+lin%40example.com+denied",
      }),
    );
    expect(error).toMatchObject({ code: "invalid-credentials" });
    expect(JSON.stringify(error) + String(error)).not.toContain("lin");
    expect(api.requests).toHaveLength(0);
  });

  it("fails with a generic error without a completed round trip", async () => {
    const { client } = setup();
    await expect(client.completeProviderSignIn("github", { search: "" })).rejects.toMatchObject({
      code: "invalid-credentials",
    });
  });

  it("refuses a hostile provider name", async () => {
    const { api, client } = setup();
    await expect(client.completeProviderSignIn("../local", { search: "" })).rejects.toMatchObject({
      code: "validation",
    });
    expect(api.requests).toHaveLength(0);
  });
});

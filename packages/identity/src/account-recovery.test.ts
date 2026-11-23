import { describe, expect, it } from "vitest";
import { PASSWORD, rejection, setup } from "./test-harness.ts";

const NEW_ACCOUNT = { username: "grace", email: "grace@example.com", password: PASSWORD };
const EXISTING_ACCOUNT = { username: "ada2", email: "ada@example.com", password: PASSWORD };

describe("register", () => {
  it("signs a new account in when the backend needs no confirmation", async () => {
    const { api, client } = setup();
    const result = await client.register(NEW_ACCOUNT);
    expect(result).toMatchObject({ outcome: "signed-in", user: { username: "grace" } });
    expect(client.getState().status).toBe("signed-in");
    const request = api.requests[0];
    expect(request?.path).toBe("/api/auth/local/register");
    expect(request?.body).toEqual(NEW_ACCOUNT);
    expect(request?.credentials).toBe("omit");
  });

  it("asks the user to check their email when the backend confirms addresses", async () => {
    const { client } = setup({ emailConfirmation: true });
    expect(await client.register(NEW_ACCOUNT)).toEqual({ outcome: "check-email" });
    expect(client.getState().status).toBe("unknown");
  });

  it("validates the input locally and names only the fields", async () => {
    const { api, client } = setup();
    const error = await rejection(
      client.register({ username: " ", email: "not-an-email", password: "x".repeat(73) }),
    );
    expect(error).toMatchObject({ code: "validation", fields: ["username", "email", "password"] });
    expect(api.requests).toHaveLength(0);
  });

  it("counts the password limit in bytes, as the backend does", async () => {
    const { client } = setup();
    await expect(
      client.register({ ...NEW_ACCOUNT, password: "é".repeat(37) }),
    ).rejects.toMatchObject({ code: "validation", fields: ["password"] });
  });

  it("passes on the field names of a server-side validation error", async () => {
    const { api, client } = setup();
    api.respondNext("POST", "/api/auth/local/register", {
      status: 400,
      body: {
        data: null,
        error: {
          status: 400,
          name: "ValidationError",
          message: "email must be a valid email",
          details: { errors: [{ path: ["email"], message: "email must be a valid email" }] },
        },
      },
    });
    await expect(client.register(NEW_ACCOUNT)).rejects.toMatchObject({
      code: "validation",
      fields: ["email"],
    });
  });
});

describe("requestPasswordReset", () => {
  it("posts the email and resolves to a neutral result", async () => {
    const { api, client } = setup();
    expect(await client.requestPasswordReset({ email: "ada@example.com" })).toEqual({
      outcome: "accepted",
    });
    expect(api.requests[0]?.path).toBe("/api/auth/forgot-password");
    expect(api.requests[0]?.body).toEqual({ email: "ada@example.com" });
    expect(api.requests[0]?.credentials).toBe("omit");
    expect(api.findUser("ada@example.com")?.resetCode).toBeDefined();
  });

  it("refuses a malformed email locally", async () => {
    const { api, client } = setup();
    await expect(client.requestPasswordReset({ email: "nope" })).rejects.toMatchObject({
      code: "validation",
    });
    expect(api.requests).toHaveLength(0);
  });

  it("stays neutral when the server fails only for an existing account", async () => {
    const { api, client } = setup();
    api.respondNext("POST", "/api/auth/forgot-password", { status: 500 });
    expect(await client.requestPasswordReset({ email: "ada@example.com" })).toEqual({
      outcome: "accepted",
    });
  });
});

describe("enumeration resistance (acceptance)", () => {
  const shape = (value: unknown): string => JSON.stringify(value);

  it("gives the same registration result for an existing and a new account", async () => {
    const { client } = setup({ emailConfirmation: true });
    const fresh = await client.register(NEW_ACCOUNT);
    const existing = await client.register(EXISTING_ACCOUNT);
    expect(existing).toEqual(fresh);
    expect(shape(existing)).toBe(shape(fresh));
    expect(Object.keys(existing)).toEqual(Object.keys(fresh));
    expect(client.getState()).toEqual({ status: "unknown" });
  });

  it("gives the same password reset result for an existing and an unknown account", async () => {
    const { client } = setup();
    const known = await client.requestPasswordReset({ email: "ada@example.com" });
    const unknown = await client.requestPasswordReset({ email: "nobody@example.com" });
    expect(unknown).toEqual(known);
    expect(shape(unknown)).toBe(shape(known));
  });

  it("gives the same resend result for unknown, unconfirmed, confirmed and blocked accounts", async () => {
    const { api, client } = setup({ emailConfirmation: true });
    api.addUser({ username: "u", email: "u@example.com", password: PASSWORD, confirmed: false });
    api.addUser({
      username: "b",
      email: "b@example.com",
      password: PASSWORD,
      blocked: true,
      confirmed: false,
    });
    const results = await Promise.all(
      ["nobody@example.com", "u@example.com", "ada@example.com", "b@example.com"].map((email) =>
        client.resendConfirmation({ email }),
      ),
    );
    for (const result of results) expect(shape(result)).toBe(shape({ outcome: "accepted" }));
  });
});

describe("resetPassword", () => {
  it("resets with the emailed code and signs in", async () => {
    const { api, client } = setup();
    await client.requestPasswordReset({ email: "ada@example.com" });
    const code = api.findUser("ada@example.com")?.resetCode ?? "";
    const user = await client.resetPassword({
      code,
      password: "a new password",
      passwordConfirmation: "a new password",
    });
    expect(user.email).toBe("ada@example.com");
    expect(client.getState().status).toBe("signed-in");
    expect(api.requests.at(-1)?.body).toEqual({
      code,
      password: "a new password",
      passwordConfirmation: "a new password",
    });
    expect(api.requests.at(-1)?.credentials).toBe("omit");
  });

  it("maps a wrong code to invalid credentials", async () => {
    const { client } = setup();
    await expect(
      client.resetPassword({ code: "wrong", password: "pw", passwordConfirmation: "pw" }),
    ).rejects.toMatchObject({ code: "invalid-credentials" });
  });

  it("refuses mismatched passwords locally", async () => {
    const { api, client } = setup();
    await expect(
      client.resetPassword({ code: "c", password: "one", passwordConfirmation: "two" }),
    ).rejects.toMatchObject({ code: "validation" });
    expect(api.requests).toHaveLength(0);
  });
});

describe("confirmEmail", () => {
  it("confirms with the emailed token without following the redirect", async () => {
    const { api, client } = setup({ emailConfirmation: true });
    await client.register(NEW_ACCOUNT);
    const confirmation = api.findUser("grace@example.com")?.confirmationCode ?? "";
    await client.confirmEmail({ confirmation });
    expect(api.findUser("grace@example.com")?.confirmed).toBe(true);
    const request = api.requests.at(-1);
    expect(request?.method).toBe("GET");
    expect(request?.query.get("confirmation")).toBe(confirmation);
    expect(request?.redirect).toBe("manual");
    expect(request?.credentials).toBe("omit");
  });

  it("encodes the token into the query", async () => {
    const { api, client } = setup();
    await rejection(client.confirmEmail({ confirmation: "a&b=c#d" }));
    expect(api.requests.at(-1)?.query.get("confirmation")).toBe("a&b=c#d");
    expect(api.requests.at(-1)?.query.has("b")).toBe(false);
  });

  it("maps an invalid token to invalid credentials", async () => {
    const { client } = setup();
    await expect(client.confirmEmail({ confirmation: "nope" })).rejects.toMatchObject({
      code: "invalid-credentials",
    });
  });

  it("refuses an empty token locally", async () => {
    const { api, client } = setup();
    await expect(client.confirmEmail({ confirmation: "" })).rejects.toMatchObject({
      code: "validation",
    });
    expect(api.requests).toHaveLength(0);
  });
});

describe("resendConfirmation", () => {
  it("posts the email", async () => {
    const { api, client } = setup({ emailConfirmation: true });
    api.addUser({ username: "u", email: "u@example.com", password: PASSWORD, confirmed: false });
    await client.resendConfirmation({ email: "u@example.com" });
    expect(api.requests[0]?.path).toBe("/api/auth/send-email-confirmation");
    expect(api.requests[0]?.body).toEqual({ email: "u@example.com" });
  });
});

describe("changePassword", () => {
  it("changes the password and keeps the user signed in with new tokens", async () => {
    const { api, client, signIn } = setup();
    await signIn();
    await client.changePassword({
      currentPassword: PASSWORD,
      password: "another password",
      passwordConfirmation: "another password",
    });
    const request = api.requests.at(-1);
    expect(request?.path).toBe("/api/auth/change-password");
    expect(request?.body).toEqual({
      currentPassword: PASSWORD,
      password: "another password",
      passwordConfirmation: "another password",
    });
    expect(request?.credentials).toBe("omit");
    expect(client.getState().status).toBe("signed-in");
    await expect(client.currentUser()).resolves.toMatchObject({ username: "ada" });
  });

  it("maps a wrong current password to invalid credentials", async () => {
    const { client, signIn } = setup();
    await signIn();
    await expect(
      client.changePassword({
        currentPassword: "wrong",
        password: "pw1",
        passwordConfirmation: "pw1",
      }),
    ).rejects.toMatchObject({ code: "invalid-credentials" });
  });

  it("refuses an unchanged password locally", async () => {
    const { client, signIn } = setup();
    await signIn();
    await expect(
      client.changePassword({
        currentPassword: PASSWORD,
        password: PASSWORD,
        passwordConfirmation: PASSWORD,
      }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("needs a session", async () => {
    const { client } = setup();
    await expect(
      client.changePassword({ currentPassword: "a", password: "b", passwordConfirmation: "b" }),
    ).rejects.toMatchObject({ code: "unauthorized" });
  });
});

describe("throttling", () => {
  it("reports the server's wait from Retry-After and refuses attempts locally until it passes", async () => {
    const { api, clock, client, signIn } = setup({ throttlePerMinute: 1 });
    // The CMS counts sign-ins per account named, so both attempts name the same one.
    await rejection(client.signIn({ identifier: "ada@example.com", password: "wrong" }));
    const error = await rejection(signIn());
    expect(error).toMatchObject({ code: "throttled", retryAfterSeconds: 60 });
    const sent = api.requests.length;
    clock.advance(15_000);
    expect(client.retryAfterSeconds()).toBe(45);
    expect(
      await rejection(client.requestPasswordReset({ email: "ada@example.com" })),
    ).toMatchObject({
      code: "throttled",
      retryAfterSeconds: 45,
    });
    expect(api.requests).toHaveLength(sent);
    clock.advance(45_000);
    expect(client.retryAfterSeconds()).toBe(0);
    await expect(signIn()).resolves.toMatchObject({ username: "ada" });
  });

  it("waits the throttle window when the 429 does not say how long", async () => {
    const { client } = setup({ throttlePerMinute: 0, retryAfterHeader: false });
    await expect(client.requestPasswordReset({ email: "a@b.co" })).rejects.toMatchObject({
      code: "throttled",
      retryAfterSeconds: 60,
    });
  });

  it("fails and backs off the same way for a missing account and a wrong password", async () => {
    const outcomes = async (identifier: string): Promise<string[]> => {
      const { client } = setup();
      const seen: string[] = [];
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const error = (await rejection(
          client.signIn({ identifier, password: "wrong-password" }),
        )) as { code: string; retryAfterSeconds?: number };
        seen.push(`${error.code}:${String(error.retryAfterSeconds)}`);
      }
      return seen;
    };
    expect(await outcomes("nobody@example.com")).toEqual(await outcomes("ada@example.com"));
  });

  it("backs off after repeated failed sign-ins and counts down", async () => {
    const { api, clock, client } = setup();
    const wrong = () => client.signIn({ identifier: "ada", password: "wrong" });
    await rejection(wrong());
    await rejection(wrong());
    await rejection(wrong());
    expect(client.retryAfterSeconds()).toBe(2);
    const sent = api.requests.length;
    expect(await rejection(wrong())).toMatchObject({ code: "throttled", retryAfterSeconds: 2 });
    expect(api.requests).toHaveLength(sent);
    clock.advance(1000);
    expect(client.retryAfterSeconds()).toBe(1);
    clock.advance(1000);
    expect(await rejection(wrong())).toMatchObject({ code: "invalid-credentials" });
    expect(client.retryAfterSeconds()).toBe(4);
  });
});

import { describe, expect, it } from "vitest";
import { isEmail } from "./input-checks.ts";
import type { IdentityClient } from "./identity-client.ts";
import { PASSWORD, rejection, setup } from "./test-harness.ts";

/** What a JavaScript caller, with no types to stop it, can pass. */
const loose = (value: unknown): never => value as never;

const calls: [string, (client: IdentityClient) => Promise<unknown>][] = [
  ["register(null)", (client) => client.register(loose(null))],
  [
    "register with a numeric username",
    (client) => client.register(loose({ username: 5, email: "a@example.com", password: PASSWORD })),
  ],
  ["signIn(null)", (client) => client.signIn(loose(null))],
  [
    "signIn with an object identifier",
    (client) => client.signIn(loose({ identifier: { toString: () => "ada" }, password: PASSWORD })),
  ],
  [
    "signIn with a numeric password",
    (client) => client.signIn(loose({ identifier: "ada", password: 12345678 })),
  ],
  ["signOut(null)", (client) => client.signOut(loose(null))],
  ["signOut with a string everywhere", (client) => client.signOut(loose({ everywhere: "yes" }))],
  ["requestPasswordReset(null)", (client) => client.requestPasswordReset(loose(null))],
  [
    "requestPasswordReset with a numeric email",
    (client) => client.requestPasswordReset(loose({ email: 1 })),
  ],
  ["resendConfirmation(undefined)", (client) => client.resendConfirmation(loose(undefined))],
  ["resetPassword(null)", (client) => client.resetPassword(loose(null))],
  [
    "resetPassword with a numeric code",
    (client) =>
      client.resetPassword(loose({ code: 1, password: PASSWORD, passwordConfirmation: PASSWORD })),
  ],
  ["confirmEmail(null)", (client) => client.confirmEmail(loose(null))],
  ["confirmEmail with an array", (client) => client.confirmEmail(loose({ confirmation: ["x"] }))],
  ["changePassword(null)", (client) => client.changePassword(loose(null))],
  ["revokeSession with a number", (client) => client.revokeSession(loose(1))],
  ["saveProfile(null)", (client) => client.saveProfile(loose(null))],
  ["completeProviderSignIn with a number", (client) => client.completeProviderSignIn(loose(1))],
  [
    "completeProviderSignIn with null options",
    (client) => client.completeProviderSignIn("github", loose(null)),
  ],
  [
    "completeProviderSignIn with a numeric search",
    (client) => client.completeProviderSignIn("github", loose({ search: 1 })),
  ],
  [
    "completeProviderSignIn with a numeric returnTo",
    (client) => client.completeProviderSignIn("github", loose({ search: "", returnTo: 1 })),
  ],
  ["authorizedFetch with null init", (client) => client.authorizedFetch("/api/x", loose(null))],
];

describe("inputs a JavaScript caller gets wrong", () => {
  it.each(calls)("%s rejects validation without a request", async (_label, call) => {
    const { api, client } = setup();
    await client.signIn({ identifier: "ada", password: PASSWORD });
    const sent = api.requests.length;
    const error = await rejection(call(client));
    expect(error).toMatchObject({ code: "validation" });
    expect(api.requests.length).toBe(sent);
  });

  it.each([
    [
      "providerSignInUrl with a number",
      (client: IdentityClient) => client.providerSignInUrl(loose(1)),
    ],
    [
      "providerSignInUrl with null options",
      (client: IdentityClient) => client.providerSignInUrl("github", loose(null)),
    ],
    [
      "providerSignInUrl with a numeric callback",
      (client: IdentityClient) => client.providerSignInUrl("github", loose({ callback: 1 })),
    ],
  ])("%s throws validation", (_label, call) => {
    const { client } = setup();
    expect(() => call(client)).toThrow(expect.objectContaining({ code: "validation" }));
  });

  it("does not count a malformed sign-in as a failed attempt", async () => {
    const { client } = setup();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await rejection(client.signIn(loose({ identifier: {}, password: PASSWORD })));
    }
    expect(client.retryAfterSeconds()).toBe(0);
    await expect(client.signIn({ identifier: "ada", password: PASSWORD })).resolves.toMatchObject({
      username: "ada",
    });
  });
});

const LONE = "pw\ud800pw-long-enough";
const PROFILE = { displayName: "Ada" };

const malformed: [string, (client: IdentityClient) => Promise<unknown>][] = [
  [
    "register with a lone surrogate in the username",
    (client) =>
      client.register({ username: "ad\ud800", email: "n@example.com", password: PASSWORD }),
  ],
  [
    "register with a lone surrogate in the password",
    (client) => client.register({ username: "nia", email: "n@example.com", password: LONE }),
  ],
  [
    "signIn with a lone surrogate in the identifier",
    (client) => client.signIn({ identifier: "ada\udc00", password: PASSWORD }),
  ],
  [
    "signIn with a lone surrogate in the password",
    (client) => client.signIn({ identifier: "ada", password: LONE }),
  ],
  [
    "requestPasswordReset with a lone surrogate",
    (client) => client.requestPasswordReset({ email: "ada\ud800@example.com" }),
  ],
  [
    "resetPassword with a lone surrogate in the code",
    (client) =>
      client.resetPassword({ code: "c\ud800", password: PASSWORD, passwordConfirmation: PASSWORD }),
  ],
  [
    "resetPassword with a lone surrogate in the password",
    (client) => client.resetPassword({ code: "c", password: LONE, passwordConfirmation: LONE }),
  ],
  [
    "confirmEmail with a lone surrogate",
    (client) => client.confirmEmail({ confirmation: "x\ud800" }),
  ],
  [
    "changePassword with a lone surrogate in the current password",
    (client) =>
      client.changePassword({
        currentPassword: LONE,
        password: `${PASSWORD}!`,
        passwordConfirmation: `${PASSWORD}!`,
      }),
  ],
  [
    "saveProfile with a lone surrogate in the display name",
    (client) => client.saveProfile({ displayName: "Ada\ud800" }),
  ],
  [
    "saveProfile with a lone surrogate in the bio",
    (client) => client.saveProfile({ ...PROFILE, bio: "\udfff" }),
  ],
  [
    "completeProviderSignIn with a lone surrogate in the search",
    (client) => client.completeProviderSignIn("github", { search: "?access_token=\ud800" }),
  ],
  [
    "completeProviderSignIn with a lone surrogate in returnTo",
    (client) => client.completeProviderSignIn("github", { search: "", returnTo: "/a\ud800" }),
  ],
  [
    "authorizedFetch with numeric headers",
    (client) => client.authorizedFetch("/api/x", { headers: loose(5) }),
  ],
  [
    "authorizedFetch with a header value carrying a line break",
    (client) => client.authorizedFetch("/api/x", { headers: { "X-Note": "a\r\nb" } }),
  ],
  [
    "authorizedFetch with a signal that is not an AbortSignal",
    (client) => client.authorizedFetch("/api/x", { signal: loose({}) }),
  ],
  [
    "authorizedFetch with an event target that is not an AbortSignal",
    (client) => client.authorizedFetch("/api/x", { signal: loose(new EventTarget()) }),
  ],
  [
    "completeProviderSignIn with a null returnTo",
    (client) => client.completeProviderSignIn("github", loose({ search: "", returnTo: null })),
  ],
  [
    "completeProviderSignIn with a null search",
    (client) => client.completeProviderSignIn("github", loose({ search: null })),
  ],
  ["signOut with a null everywhere", (client) => client.signOut(loose({ everywhere: null }))],
  [
    "register with an empty password",
    (client) => client.register({ username: "nia", email: "n@example.com", password: "" }),
  ],
  [
    "resetPassword with an empty password",
    (client) => client.resetPassword({ code: "c", password: "", passwordConfirmation: "" }),
  ],
  [
    "changePassword with an empty password",
    (client) =>
      client.changePassword({ currentPassword: PASSWORD, password: "", passwordConfirmation: "" }),
  ],
  [
    "signIn with an identifier over 255 characters",
    (client) => client.signIn({ identifier: "é".repeat(256), password: PASSWORD }),
  ],
  [
    "register with a username over 255 characters",
    (client) =>
      client.register({ username: "n".repeat(256), email: "n@example.com", password: PASSWORD }),
  ],
  [
    "register with an email over 255 characters",
    (client) =>
      client.register({
        username: "nia",
        email: `${"n".repeat(244)}@example.com`,
        password: PASSWORD,
      }),
  ],
  [
    "resetPassword with a code over 512 characters",
    (client) =>
      client.resetPassword({
        code: "c".repeat(513),
        password: PASSWORD,
        passwordConfirmation: PASSWORD,
      }),
  ],
  [
    "confirmEmail with a token over 512 characters",
    (client) => client.confirmEmail({ confirmation: "x".repeat(513) }),
  ],
  [
    "completeProviderSignIn with a search over 16 KiB",
    (client) =>
      client.completeProviderSignIn("github", { search: `?id_token=${"t".repeat(16_384)}` }),
  ],
  [
    "completeProviderSignIn with a returnTo over 2048 characters",
    (client) =>
      client.completeProviderSignIn("github", { search: "", returnTo: `/${"a".repeat(2048)}` }),
  ],
  [
    "register with a 73-byte password",
    (client) =>
      client.register({ username: "nia", email: "n@example.com", password: `${"😀".repeat(18)}a` }),
  ],
  [
    "resetPassword with a 73-byte password",
    (client) =>
      client.resetPassword({
        code: "c",
        password: `${"é".repeat(36)}a`,
        passwordConfirmation: `${"é".repeat(36)}a`,
      }),
  ],
  [
    "changePassword with a 73-byte password",
    (client) =>
      client.changePassword({
        currentPassword: PASSWORD,
        password: "a".repeat(73),
        passwordConfirmation: "a".repeat(73),
      }),
  ],
];

describe("malformed, over-long or misshapen strings", () => {
  it.each(malformed)(
    "%s rejects validation without a request or a counted failure",
    async (_label, call) => {
      const { api, client } = setup();
      await client.signIn({ identifier: "ada", password: PASSWORD });
      const sent = api.requests.length;
      const error = await rejection(call(client));
      expect(error).toMatchObject({ code: "validation" });
      expect(api.requests.length).toBe(sent);
      expect(client.retryAfterSeconds()).toBe(0);
    },
  );

  it.each([
    [
      "providerSignInUrl with a lone surrogate in the callback",
      (client: IdentityClient) =>
        client.providerSignInUrl("github", { callback: "https://app.example.com/cb\ud800" }),
    ],
    [
      "providerSignInUrl with a null callback",
      (client: IdentityClient) => client.providerSignInUrl("github", loose({ callback: null })),
    ],
    ["subscribe with a number", (client: IdentityClient) => client.subscribe(loose(5))],
  ])("%s throws validation", (_label, call) => {
    const { client } = setup();
    expect(() => call(client)).toThrow(expect.objectContaining({ code: "validation" }));
  });
});

describe("without String.prototype.isWellFormed", () => {
  it("still finds a lone surrogate, high or low, and accepts a pair", () => {
    const native = Object.getOwnPropertyDescriptor(String.prototype, "isWellFormed");
    Reflect.deleteProperty(String.prototype, "isWellFormed");
    try {
      expect(isEmail("ada\ud800@example.com")).toBe(false);
      expect(isEmail("ada\udc00@example.com")).toBe(false);
      expect(isEmail("a\udc00\ud800@example.com")).toBe(false);
      expect(isEmail("ada😀@example.com")).toBe(true);
    } finally {
      if (native !== undefined) Object.defineProperty(String.prototype, "isWellFormed", native);
    }
  });
});

describe("values at the limits", () => {
  it("sends a password of exactly 72 bytes on registration, reset and change", async () => {
    const { api, client } = setup({ emailConfirmation: false });
    const exact = "😀".repeat(18);
    await expect(
      client.register({ username: "nia", email: "nia@example.com", password: exact }),
    ).resolves.toMatchObject({ outcome: "signed-in" });
    await client.changePassword({
      currentPassword: exact,
      password: "é".repeat(36),
      passwordConfirmation: "é".repeat(36),
    });
    const sent = api.requests.length;
    await rejection(
      client.resetPassword({ code: "wrong", password: exact, passwordConfirmation: exact }),
    );
    expect(api.requests.length).toBe(sent + 1);
  });

  it("sends an identifier of exactly 255 characters", async () => {
    const { api, client } = setup();
    const error = await rejection(
      client.signIn({ identifier: "é".repeat(255), password: PASSWORD }),
    );
    expect(error).toMatchObject({ code: "invalid-credentials" });
    expect(api.requests.at(-1)?.path).toBe("/api/auth/local");
  });

  it("refuses a pathological address quickly", () => {
    const started = performance.now();
    expect(isEmail(`a@${"a.".repeat(40_000)}@`)).toBe(false);
    expect(isEmail(`a@${"a".repeat(80_000)}`)).toBe(false);
    expect(performance.now() - started).toBeLessThan(100);
  });

  it.each([
    ["Zoe+tag@example.com", true],
    ["a@b.co", true],
    ["a@b..c", true],
    [`${"n".repeat(243)}@example.com`, true],
    ["a@b", false],
    ["a@.b", false],
    ["a@b.", false],
    ["a b@example.com", false],
    ["a@@example.com", false],
    ["@example.com", false],
  ])("reads %s as an address: %s", (address, expected) => {
    expect(isEmail(address)).toBe(expected);
  });
});

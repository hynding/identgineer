import { describe, expect, it } from "vitest";
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

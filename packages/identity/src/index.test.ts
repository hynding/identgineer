import { describe, expect, it } from "vitest";
import type { OnlineSubscription } from "./index.ts";
import * as identity from "./index.ts";
import * as testing from "./testing/index.ts";
import type { MemoryLocksOptions } from "./testing/index.ts";

describe("the public API", () => {
  it("exports the documented surface and nothing else", () => {
    expect(Object.keys(identity).sort()).toEqual(
      [
        "IDENTITY_ERROR_CODES",
        "IdentityError",
        "createIdentityClient",
        "passkeysSupported",
        "safeRedirectPath",
      ].sort(),
    );
  });

  it("gives the client exactly the documented methods", () => {
    const client = identity.createIdentityClient({ baseUrl: "https://cms.example.com" });
    try {
      expect(Object.keys(client).sort()).toEqual(
        [
          "authorizedFetch",
          "changePassword",
          "completeProviderSignIn",
          "confirmEmail",
          "currentUser",
          "dispose",
          "getProfile",
          "getState",
          "listSessions",
          "providerSignInUrl",
          "register",
          "requestPasswordReset",
          "resendConfirmation",
          "resetPassword",
          "restore",
          "retryAfterSeconds",
          "revokeSession",
          "saveProfile",
          "signIn",
          "signOut",
          "subscribe",
        ].sort(),
      );
      expect(Object.isFrozen(client)).toBe(true);
    } finally {
      client.dispose();
    }
  });

  it("exports the fake API and manual clock from the testing entry", () => {
    expect(Object.keys(testing).sort()).toEqual([
      "createFakeIdentityApi",
      "createManualClock",
      "createMemoryLocks",
    ]);
  });
});

describe("the online subscription type", () => {
  it("is exported for callers that supply their own", () => {
    const noOnline: OnlineSubscription = () => () => undefined;
    expect(typeof noOnline(() => undefined)).toBe("function");
  });
});

describe("the memory lock options type", () => {
  it("is exported from the testing entry", () => {
    const options: MemoryLocksOptions = { detectNested: false };
    expect(testing.createMemoryLocks(options)).toHaveProperty("request");
  });
});

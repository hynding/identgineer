import { afterEach, describe, expect, it, vi } from "vitest";
import { passkeysSupported } from "./passkeys.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("passkeysSupported", () => {
  it("is false without WebAuthn", async () => {
    vi.stubGlobal("PublicKeyCredential", undefined);
    expect(await passkeysSupported()).toBe(false);
  });

  it("is false without a secure context", async () => {
    vi.stubGlobal("PublicKeyCredential", {
      isUserVerifyingPlatformAuthenticatorAvailable: () => Promise.resolve(true),
    });
    vi.stubGlobal("isSecureContext", false);
    expect(await passkeysSupported()).toBe(false);
  });

  it("asks the browser for a user-verifying authenticator", async () => {
    vi.stubGlobal("isSecureContext", true);
    vi.stubGlobal("PublicKeyCredential", {
      isUserVerifyingPlatformAuthenticatorAvailable: () => Promise.resolve(true),
    });
    expect(await passkeysSupported()).toBe(true);
    vi.stubGlobal("PublicKeyCredential", {
      isUserVerifyingPlatformAuthenticatorAvailable: () => Promise.resolve(false),
    });
    expect(await passkeysSupported()).toBe(false);
  });

  it("is false when the browser check fails", async () => {
    vi.stubGlobal("isSecureContext", true);
    vi.stubGlobal("PublicKeyCredential", {
      isUserVerifyingPlatformAuthenticatorAvailable: () => Promise.reject(new Error("no")),
    });
    expect(await passkeysSupported()).toBe(false);
  });
});

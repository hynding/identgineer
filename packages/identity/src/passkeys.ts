interface PasskeyCapableCredential {
  readonly isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean>;
}

/**
 * Whether this browser can use a passkey (a user-verifying platform authenticator in a secure
 * context). Detection only: the CMS has no WebAuthn endpoints yet, so there is no passkey sign-in.
 * When it gains registration and assertion endpoints, a passkey sign-in belongs beside `signIn`
 * as one more credential operation: fetch the server's challenge, run
 * `navigator.credentials.get()`, post the assertion through the same throttled transport and
 * sign in from the token answer, so tokens and errors stay as they are for passwords.
 */
export const passkeysSupported = async (): Promise<boolean> => {
  const credential = (globalThis as { PublicKeyCredential?: PasskeyCapableCredential })
    .PublicKeyCredential;
  const check = credential?.isUserVerifyingPlatformAuthenticatorAvailable;
  // Typed as always present, but absent outside browsers: read as unknown and checked.
  const secure: unknown = globalThis.isSecureContext;
  if (secure !== true || typeof check !== "function") return false;
  try {
    const available: unknown = await check.call(credential);
    return available === true;
  } catch {
    return false;
  }
};

export { createIdentityClient } from "./identity-client.ts";
export type { IdentityClient, IdentityClientOptions } from "./identity-client.ts";
export { IDENTITY_ERROR_CODES, IdentityError } from "./identity-error.ts";
export type { IdentityErrorCode, IdentityErrorDetails } from "./identity-error.ts";
export type {
  ChangePasswordInput,
  ConfirmEmailInput,
  EmailInput,
  RegisterInput,
  RegisterResult,
  RequestAccepted,
  ResetPasswordInput,
} from "./account-operations.ts";
export type { Clock } from "./clock.ts";
export type { SignInInput } from "./credential-operations.ts";
export { passkeysSupported } from "./passkeys.ts";
export type {
  CompleteProviderSignInOptions,
  ProviderSignInResult,
  ProviderSignInUrlOptions,
} from "./provider-operations.ts";
export { safeRedirectPath } from "./safe-redirect.ts";
export type { SignOutOptions } from "./session-operations.ts";
export type { IdentityState, IdentityStateListener, SignOutReason } from "./session.ts";
export type { IdentitySession, IdentityUser, Profile, ProfileInput } from "./types.ts";

import {
  changePassword,
  confirmEmail,
  register,
  requestPasswordReset,
  resendConfirmation,
  resetPassword,
  type ChangePasswordInput,
  type ConfirmEmailInput,
  type EmailInput,
  type RegisterInput,
  type RegisterResult,
  type RequestAccepted,
  type ResetPasswordInput,
} from "./account-operations.ts";
import { authorizedFetch } from "./authorized-fetch.ts";
import { IdentityError } from "./identity-error.ts";
import { createClientContext, type IdentityClientOptions } from "./client-context.ts";
import { signIn, type SignInInput } from "./credential-operations.ts";
import { getProfile, saveProfile } from "./profile-operations.ts";
import {
  completeProviderSignIn,
  providerSignInUrl,
  type CompleteProviderSignInOptions,
  type ProviderSignInResult,
  type ProviderSignInUrlOptions,
} from "./provider-operations.ts";
import {
  currentUser,
  listSessions,
  reevaluate,
  restore,
  revokeSession,
  signOut,
  type SignOutOptions,
} from "./session-operations.ts";
import type { IdentityState, IdentityStateListener } from "./session.ts";
import type { IdentitySession, IdentityUser, Profile, ProfileInput } from "./types.ts";

export type { IdentityClientOptions } from "./client-context.ts";

/** The identity client's API. Every method rejects with an `IdentityError` only. */
export interface IdentityClient {
  /** Creates an account. The result does not tell whether the address was already registered. */
  readonly register: (input: RegisterInput) => Promise<RegisterResult>;
  readonly signIn: (input: SignInInput) => Promise<IdentityUser>;
  readonly signOut: (options?: SignOutOptions) => Promise<void>;
  /** Asks for a reset email. Resolves the same whether or not the account exists. */
  readonly requestPasswordReset: (input: EmailInput) => Promise<RequestAccepted>;
  /** Sets a new password with the emailed code, and signs in. */
  readonly resetPassword: (input: ResetPasswordInput) => Promise<IdentityUser>;
  readonly confirmEmail: (input: ConfirmEmailInput) => Promise<void>;
  /** Asks for another confirmation email. Resolves the same whatever the account's state. */
  readonly resendConfirmation: (input: EmailInput) => Promise<RequestAccepted>;
  /** Changes the password. The server ends every other session; this one continues. */
  readonly changePassword: (input: ChangePasswordInput) => Promise<void>;
  /** Seconds until credential requests are accepted again (0 when they are), for a countdown. */
  readonly retryAfterSeconds: () => number;
  /** Reads the signed-in account again from the server. */
  readonly currentUser: () => Promise<IdentityUser>;
  /** The account's sessions, this one marked `current` (backends with sessions only). */
  readonly listSessions: () => Promise<readonly IdentitySession[]>;
  /** Ends one of the account's other sessions by its id. */
  readonly revokeSession: (id: string) => Promise<void>;
  /** The owner's profile, or null before one is saved. */
  readonly getProfile: () => Promise<Profile | null>;
  /** Creates or updates the owner's profile. */
  readonly saveProfile: (input: ProfileInput) => Promise<Profile>;
  /** The CMS URL that starts a provider sign-in; send the browser there. */
  readonly providerSignInUrl: (provider: string, options?: ProviderSignInUrlOptions) => string;
  /** Finishes a provider sign-in on the callback page. */
  readonly completeProviderSignIn: (
    provider: string,
    options?: CompleteProviderSignInOptions,
  ) => Promise<ProviderSignInResult>;
  /** Resumes the session from the refresh cookie after a reload; call once at start. */
  readonly restore: () => Promise<IdentityState>;
  /**
   * `fetch` for requests to the CMS under the base URL: adds the bearer token and refreshes once
   * on a 401. Refuses any other origin, so the token never leaves the CMS.
   */
  readonly authorizedFetch: (input: string | URL, init?: RequestInit) => Promise<Response>;
  readonly getState: () => IdentityState;
  /** Calls the listener on every change of state; returns the function that stops it. */
  readonly subscribe: (listener: IdentityStateListener) => () => void;
  /**
   * Stops timers and the cross-tab channel and drops the tokens. Every later call rejects with
   * an `unknown` IdentityError. It does not sign out: the refresh cookie stays for the next page.
   */
  readonly dispose: () => void;
}

/** A client for the CMS's users-permissions API. Tokens are kept in this closure only. */
export const createIdentityClient = (options: IdentityClientOptions): IdentityClient => {
  const context = createClientContext(options);
  const disposedError = (): IdentityError => new IdentityError("unknown");
  // After dispose every operation is refused before it touches the network or the state.
  const live =
    <A extends unknown[], R>(operation: (...args: A) => Promise<R>) =>
    (...args: A): Promise<R> =>
      context.isActive() ? operation(...args) : Promise.reject(disposedError());
  const liveSync =
    <A extends unknown[], R>(operation: (...args: A) => R) =>
    (...args: A): R => {
      if (!context.isActive()) throw disposedError();
      return operation(...args);
    };
  const reevaluateOnSignIn = reevaluate(context);
  context.onOtherTabSignedIn(() => {
    reevaluateOnSignIn().catch(() => undefined);
  });
  return Object.freeze({
    register: live(register(context)),
    signIn: live(signIn(context)),
    signOut: live(signOut(context)),
    requestPasswordReset: live(requestPasswordReset(context)),
    resetPassword: live(resetPassword(context)),
    confirmEmail: live(confirmEmail(context)),
    resendConfirmation: live(resendConfirmation(context)),
    changePassword: live(changePassword(context)),
    retryAfterSeconds: context.throttle.remainingSeconds,
    currentUser: live(currentUser(context)),
    listSessions: live(listSessions(context)),
    revokeSession: live(revokeSession(context)),
    getProfile: live(getProfile(context)),
    saveProfile: live(saveProfile(context)),
    providerSignInUrl: liveSync(providerSignInUrl(context)),
    completeProviderSignIn: live(completeProviderSignIn(context)),
    restore: live(restore(context)),
    authorizedFetch: live(authorizedFetch(context)),
    getState: context.session.getState,
    subscribe: context.session.subscribe,
    dispose: context.dispose,
  });
};

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
import { createClientContext, type IdentityClientOptions } from "./client-context.ts";
import { signIn, type SignInInput } from "./credential-operations.ts";
import { currentUser, signOut, type SignOutOptions } from "./session-operations.ts";
import type { IdentityState, IdentityStateListener } from "./session.ts";
import type { IdentityUser } from "./types.ts";

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
  readonly getState: () => IdentityState;
  /** Calls the listener on every change of state; returns the function that stops it. */
  readonly subscribe: (listener: IdentityStateListener) => () => void;
  /** Stops timers and the cross-tab channel. The client is not usable afterwards. */
  readonly dispose: () => void;
}

/** A client for the CMS's users-permissions API. Tokens are kept in this closure only. */
export const createIdentityClient = (options: IdentityClientOptions): IdentityClient => {
  const context = createClientContext(options);
  return Object.freeze({
    register: register(context),
    signIn: signIn(context),
    signOut: signOut(context),
    requestPasswordReset: requestPasswordReset(context),
    resetPassword: resetPassword(context),
    confirmEmail: confirmEmail(context),
    resendConfirmation: resendConfirmation(context),
    changePassword: changePassword(context),
    retryAfterSeconds: context.throttle.remainingSeconds,
    currentUser: currentUser(context),
    getState: context.session.getState,
    subscribe: context.session.subscribe,
    dispose: () => {
      context.refresher.cancel();
      context.crossTab.close();
    },
  });
};

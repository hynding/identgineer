import { createClientContext, type IdentityClientOptions } from "./client-context.ts";
import { signIn, type SignInInput } from "./credential-operations.ts";
import { currentUser, signOut, type SignOutOptions } from "./session-operations.ts";
import type { IdentityState, IdentityStateListener } from "./session.ts";
import type { IdentityUser } from "./types.ts";

export type { IdentityClientOptions } from "./client-context.ts";

/** The identity client's API. Every method rejects with an `IdentityError` only. */
export interface IdentityClient {
  readonly signIn: (input: SignInInput) => Promise<IdentityUser>;
  readonly signOut: (options?: SignOutOptions) => Promise<void>;
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
    signIn: signIn(context),
    signOut: signOut(context),
    currentUser: currentUser(context),
    getState: context.session.getState,
    subscribe: context.session.subscribe,
    dispose: () => {
      context.refresher.cancel();
      context.crossTab.close();
    },
  });
};

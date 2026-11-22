import type { IdentityUser } from "./types.ts";

/** Why the client is signed out: by the user, because the session ran out, in another tab, or at start. */
export type SignOutReason = "user" | "expired" | "other-tab" | "no-session";

export type IdentityState =
  | { readonly status: "unknown" }
  | { readonly status: "signed-out"; readonly reason: SignOutReason }
  | { readonly status: "signed-in"; readonly user: IdentityUser };

export type IdentityStateListener = (state: IdentityState) => void;

export interface Tokens {
  readonly accessToken: string;
  /** Only when the backend returned it in a body; a cookie-held one is never seen. */
  readonly refreshToken?: string;
}

const UNKNOWN: IdentityState = Object.freeze({ status: "unknown" });

/**
 * The session's tokens and public state. The tokens live only in this closure: nothing returned
 * from here or announced to listeners carries them.
 */
export const createSession = () => {
  let tokens: Tokens | undefined;
  let state: IdentityState = UNKNOWN;
  let generation = 0;
  const listeners = new Set<IdentityStateListener>();
  const announce = (next: IdentityState): void => {
    state = Object.freeze(next);
    for (const listener of [...listeners]) {
      try {
        listener(state);
      } catch {
        // One faulty listener must not stop the others from hearing about a sign-out.
      }
    }
  };
  return {
    getState: (): IdentityState => state,
    subscribe: (listener: IdentityStateListener): (() => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    accessToken: (): string | undefined => tokens?.accessToken,
    refreshToken: (): string | undefined => tokens?.refreshToken,
    /** Bumped whenever the session is replaced or ended, so stale refreshes can be ignored. */
    generation: (): number => generation,
    setTokens: (next: Tokens): void => {
      tokens = next;
    },
    signIn: (next: Tokens, user: IdentityUser): void => {
      generation += 1;
      tokens = next;
      announce({ status: "signed-in", user });
    },
    setUser: (user: IdentityUser): void => {
      if (state.status === "signed-in") announce({ status: "signed-in", user });
    },
    signOut: (reason: SignOutReason): void => {
      generation += 1;
      tokens = undefined;
      announce({ status: "signed-out", reason });
    },
  };
};

export type Session = ReturnType<typeof createSession>;

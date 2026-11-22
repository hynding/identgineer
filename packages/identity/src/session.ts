import type { TokenLifetime } from "./token-lifetime.ts";
import type { IdentityUser } from "./types.ts";

/**
 * Why the client is signed out: by the user, because the session ran out, in another tab, at
 * start with no session to resume, or because the shared refresh cookie now belongs to another
 * user (another tab signed in as someone else).
 */
export type SignOutReason = "user" | "expired" | "other-tab" | "no-session" | "user-changed";

export type IdentityState =
  | { readonly status: "unknown" }
  | { readonly status: "signed-out"; readonly reason: SignOutReason }
  | { readonly status: "signed-in"; readonly user: IdentityUser };

export type IdentityStateListener = (state: IdentityState) => void;

export interface Tokens {
  readonly accessToken: string;
  /** Only when the backend returned it in a body; a cookie-held one is never seen. */
  readonly refreshToken?: string;
  readonly lifetime: TokenLifetime;
  /** When the access token runs out, by the client's clock (receipt time plus the lifetime). */
  readonly expiresAt: number;
}

/**
 * What a piece of asynchronous work may still do to the session, taken when its caller asks for
 * it, before any queueing or waiting. A `session` ticket lasts while the session identity (the
 * epoch) it was taken in does: any sign-in, sign-out or restore ends it. A `sign-in` ticket lasts
 * until a sign-out (here or in another tab) or dispose, so that a sign-in still replaces whatever
 * session came and went while it was under way, and the later of two sign-ins wins.
 */
export interface Ticket {
  readonly kind: "session" | "sign-in";
  readonly epoch: number;
  readonly cancellations: number;
}

const UNKNOWN: IdentityState = Object.freeze({ status: "unknown" });

/**
 * The session's tokens and public state. The tokens live only in this closure: nothing returned
 * from here or announced to listeners carries them. Tokens enter only through `adopt`, which
 * refuses a stale ticket, and a refresh's tokens only while signed in: a signed-out session never
 * holds a token.
 */
export const createSession = () => {
  let tokens: Tokens | undefined;
  let state: IdentityState = UNKNOWN;
  let epoch = 0;
  let cancellations = 0;
  let disposed = false;
  const listeners = new Set<IdentityStateListener>();
  const queue: IdentityState[] = [];
  let delivering = false;

  /**
   * Every listener hears every transition, in order, as the snapshot of that transition, even
   * when a listener causes the next one while hearing this one.
   */
  const announce = (next: IdentityState): void => {
    state = Object.freeze(next);
    queue.push(state);
    if (delivering) return;
    delivering = true;
    try {
      for (let heard = queue.shift(); heard !== undefined; heard = queue.shift()) {
        for (const listener of [...listeners]) {
          try {
            listener(heard);
          } catch {
            // One faulty listener must not stop the others from hearing about a sign-out.
          }
        }
      }
    } finally {
      delivering = false;
    }
  };

  const ticket = (kind: Ticket["kind"]): Ticket => Object.freeze({ kind, epoch, cancellations });

  const valid = (held: Ticket): boolean =>
    !disposed &&
    (held.kind === "sign-in" ? held.cancellations === cancellations : held.epoch === epoch);

  return {
    getState: (): IdentityState => state,
    subscribe: (listener: IdentityStateListener): (() => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    tokens: (): Tokens | undefined => tokens,
    refreshToken: (): string | undefined => tokens?.refreshToken,
    ticket,
    valid,
    /**
     * The one way tokens enter the session. With a user, a sign-in or restore: the session
     * identity changes (a new epoch) and the state becomes signed in. Without, a refresh of the
     * session that is signed in now. Refused (undefined) when the ticket is stale. Returns the
     * new session's ticket, taken before listeners hear of it, so the caller can tell whether a
     * listener has already signed out again.
     */
    adopt: (held: Ticket, next: Tokens, user?: IdentityUser): Ticket | undefined => {
      if (!valid(held)) return undefined;
      if (user === undefined) {
        if (state.status !== "signed-in") return undefined;
        tokens = next;
        return ticket("session");
      }
      epoch += 1;
      tokens = next;
      const adopted = ticket("session");
      announce({ status: "signed-in", user });
      return adopted;
    },
    setUser: (user: IdentityUser): void => {
      if (state.status === "signed-in") announce({ status: "signed-in", user });
    },
    /** A sign-out here or in another tab: every sign-in under way is cancelled. */
    cancelSignIns: (): void => {
      cancellations += 1;
    },
    signOut: (reason: SignOutReason): void => {
      epoch += 1;
      tokens = undefined;
      // Concurrent requests that all find the session over report it once.
      if (state.status === "signed-out" && state.reason === reason) return;
      announce({ status: "signed-out", reason });
    },
    /** Drops tokens and listeners without announcing anything: the client is being disposed. */
    dispose: (): void => {
      disposed = true;
      epoch += 1;
      cancellations += 1;
      tokens = undefined;
      listeners.clear();
    },
  };
};

export type Session = ReturnType<typeof createSession>;

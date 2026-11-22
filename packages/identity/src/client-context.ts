import { parseBaseUrl } from "./base-url.ts";
import { systemClock, type Clock } from "./clock.ts";
import { createCrossTab, type CrossTab } from "./cross-tab.ts";
import { IdentityError } from "./identity-error.ts";
import { THROTTLED_STATUS, throttledError } from "./map-error.ts";
import { resolveLocks, type LockManagerLike } from "./locks.ts";
import { resolveOnline, type OnlineSubscription } from "./online.ts";
import { createRefresher, type Refresher } from "./refresher.ts";
import { createSession, type Session, type SignOutReason, type Tokens } from "./session.ts";
import { createThrottle, type Throttle } from "./throttle.ts";
import { createTransport, type ApiRequest, type ApiResponse, type Transport } from "./transport.ts";
import { readUser } from "./shapes.ts";
import type { IdentityUser } from "./types.ts";

export const DEFAULT_TIMEOUT_MS = 15_000;
export const DEFAULT_CHANNEL_NAME = "identgineer-identity";
export const DEFAULT_ACCESS_TOKEN_LIFETIME_SECONDS = 600;

export interface IdentityClientOptions {
  /** The CMS's address: `https:`, or `http:` on localhost or 127.0.0.1 for development. */
  readonly baseUrl: string;
  readonly fetch?: typeof globalThis.fetch;
  /** Time and timers; tests and countdowns inject their own. */
  readonly clock?: Clock;
  /** How long a request may take before it is aborted. */
  readonly requestTimeoutMs?: number;
  /** The BroadcastChannel name the page's tabs share sign-outs on. */
  readonly channelName?: string;
  /**
   * How long an access token lives when neither the answer (`expiresIn`, `expiresAt`) nor the
   * token (a JWT's `exp`) says: camis' `CAMIS_ACCESS_TOKEN_LIFESPAN`, 600 seconds by default.
   */
  readonly accessTokenLifetimeSeconds?: number;
  /**
   * Serialises cookie refreshes across the page's tabs, since the refresh token rotates once.
   * Defaults to `navigator.locks` where available; `null` turns it off.
   */
  readonly locks?: LockManagerLike | null;
  /**
   * Subscribes to the browser coming back online, so a refresh that could not reach the server
   * runs again at once. Defaults to the window's `online` event; `null` turns it off.
   */
  readonly onOnline?: OnlineSubscription | null;
}

/** Whether the operation that took it may still change the session. */
export type Ticket = () => boolean;

/** Whether the server session a sign-out tried to end is gone, or may live on. */
export type ServerSignOut = "ended" | "unreachable";

/** What every operation of the client shares. Internal: never handed to callers. */
export interface ClientContext {
  readonly base: URL;
  readonly clock: Clock;
  readonly fetch: typeof globalThis.fetch;
  readonly timeoutMs: number;
  /** The access token lifetime assumed when nothing says otherwise. */
  readonly tokenLifetimeMs: number;
  readonly transport: Transport;
  readonly session: Session;
  readonly throttle: Throttle;
  readonly refresher: Refresher;
  readonly crossTab: CrossTab;
  readonly isActive: () => boolean;
  /**
   * An access token to send: the current one, or, once its known expiry has passed, a refreshed
   * one (rejecting `network` when the server cannot be reached, `unauthorized` without a session).
   */
  readonly accessToken: () => Promise<string>;
  /** A credential request: held back while throttled, and a 429 starts the hold. */
  readonly credentialRequest: (request: ApiRequest) => Promise<ApiResponse>;
  /**
   * A request with the bearer token, refreshed and retried once on a 401, unless the session
   * changed while it was under way (it is then never replayed as the new session).
   */
  readonly authorizedRequest: (request: ApiRequest) => Promise<ApiResponse>;
  /** Refreshes the session, signing out if it is over; true when there are fresh tokens. */
  readonly refreshSession: () => Promise<boolean>;
  /**
   * For a sign-in: valid until a sign-out (here or in another tab) or dispose. A restore, an
   * expiry or a user change of the session it replaces does not cancel it.
   */
  readonly signInTicket: () => Ticket;
  /** For an operation on the current session: valid while that session lasts. */
  readonly sessionTicket: () => Ticket;
  /**
   * Adopts a sign-in's tokens if its ticket is still valid; otherwise ends the server session
   * they opened and rejects.
   */
  readonly acceptSignIn: (tokens: Tokens, user: IdentityUser, ticket: Ticket) => Promise<void>;
  /** Ends the server session these tokens belong to (and its cookie); never rejects. */
  readonly endServerSession: (tokens: Tokens, everywhere: boolean) => Promise<ServerSignOut>;
  /** A sign-out here or in another tab: cancels every sign-in under way. */
  readonly cancelSignIns: () => void;
  /**
   * Runs sign-ins and restores one at a time, in call order, so the last sign-in's session is
   * the one kept and a restore never replaces a sign-in under way.
   */
  readonly exclusive: <T>(task: () => Promise<T>) => Promise<T>;
  /** Settles once every sign-in started so far has finished. */
  readonly settleSignIns: () => Promise<unknown>;
  readonly signedOut: (reason: SignOutReason) => void;
  /** What to do when another tab signs in (set by the client). */
  readonly onOtherTabSignedIn: (handler: () => void) => void;
  readonly dispose: () => void;
}

/** A numeric option, refused at creation unless it is a positive finite number. */
const positiveOption = (name: string, value: number | undefined, fallback: number): number => {
  const chosen = value ?? fallback;
  if (!Number.isFinite(chosen) || chosen <= 0) {
    throw new TypeError(`${name} must be a positive finite number`);
  }
  return chosen;
};

export const createClientContext = (options: IdentityClientOptions): ClientContext => {
  const base = parseBaseUrl(options.baseUrl);
  const clock = options.clock ?? systemClock;
  const fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = positiveOption(
    "requestTimeoutMs",
    options.requestTimeoutMs,
    DEFAULT_TIMEOUT_MS,
  );
  const tokenLifetimeMs =
    positiveOption(
      "accessTokenLifetimeSeconds",
      options.accessTokenLifetimeSeconds,
      DEFAULT_ACCESS_TOKEN_LIFETIME_SECONDS,
    ) * 1000;
  const transport = createTransport({ base, fetch, clock, timeoutMs });
  const session = createSession();
  const throttle = createThrottle(clock);
  let disposed = false;
  let otherTabSignedIn = (): void => undefined;
  let signInChain: Promise<unknown> = Promise.resolve();
  // Counts sign-outs and dispose only: the sign-ins under way they cancel.
  let cancellations = 0;
  const cancelSignIns = (): void => {
    cancellations += 1;
  };
  const isActive = (): boolean => !disposed;

  const signedOut = (reason: SignOutReason): void => {
    refresher.cancel();
    session.signOut(reason);
  };

  const verifyUser = async (accessToken: string): Promise<boolean | undefined> => {
    const state = session.getState();
    if (state.status !== "signed-in") return undefined;
    const response = await transport.send({ method: "GET", path: "/api/users/me", accessToken });
    if (!response.ok) throw new IdentityError("unknown");
    return readUser(response.body).id === state.user.id;
  };

  const refresher = createRefresher({
    transport,
    session,
    clock,
    tokenLifetimeMs,
    locks: resolveLocks(options.locks),
    lockWaitMs: timeoutMs,
    onOnline: resolveOnline(options.onOnline),
    isActive,
    verifyUser,
    onExpired: () => {
      signedOut("expired");
    },
    onUserChanged: () => {
      signedOut("user-changed");
    },
  });
  const crossTab = createCrossTab(options.channelName ?? DEFAULT_CHANNEL_NAME, {
    onSignedOut: () => {
      if (disposed) return;
      cancelSignIns();
      signedOut("other-tab");
    },
    onSignedIn: () => {
      if (!disposed) otherTabSignedIn();
    },
  });

  const credentialRequest = async (request: ApiRequest): Promise<ApiResponse> => {
    throttle.check();
    const response = await transport.send(request);
    if (response.status === THROTTLED_STATUS) {
      const error = throttledError(response, clock.now());
      throttle.serverThrottled(error.retryAfterSeconds ?? 0);
      throw error;
    }
    return response;
  };

  const unexpiredToken = (): string | undefined => {
    const tokens = session.tokens();
    if (tokens === undefined) return undefined;
    return tokens.lifetime.known && clock.now() >= tokens.expiresAt
      ? undefined
      : tokens.accessToken;
  };

  const accessToken = async (): Promise<string> => {
    const current = unexpiredToken();
    if (current !== undefined) return current;
    // An expired token is never sent: the refresh that replaces it reports a network failure.
    if (session.tokens() !== undefined && (await refreshSession())) {
      const refreshed = unexpiredToken();
      if (refreshed !== undefined) return refreshed;
    }
    throw new IdentityError("unauthorized");
  };

  const withToken = async (request: ApiRequest): Promise<ApiResponse> =>
    transport.send({ ...request, accessToken: await accessToken() });

  const refreshSession = async (): Promise<boolean> => {
    const generation = session.generation();
    const outcome = await refresher.refresh();
    if (session.generation() !== generation) return false;
    if (outcome === "refreshed") return true;
    if (outcome === "switched") signedOut("user-changed");
    else if (outcome !== "superseded") signedOut("expired");
    return false;
  };

  const authorizedRequest = async (request: ApiRequest): Promise<ApiResponse> => {
    const generation = session.generation();
    const response = await withToken(request);
    if (response.status !== 401) return response;
    if (session.generation() !== generation) throw new IdentityError("unauthorized");
    const refreshed = await refreshSession();
    if (!refreshed || session.generation() !== generation) {
      throw new IdentityError("unauthorized");
    }
    return withToken(request);
  };

  const endServerSession = async (tokens: Tokens, everywhere: boolean): Promise<ServerSignOut> => {
    const logout = (accessToken: string): Promise<ApiResponse> =>
      transport.send({
        method: "POST",
        path: "/api/auth/logout",
        accessToken,
        cookie: true,
        body: {
          ...(everywhere ? { scope: "all" } : {}),
          ...(tokens.refreshToken === undefined ? {} : { refreshToken: tokens.refreshToken }),
        },
      });
    // A server error may have left the session in place; any other answer means it is gone
    // (404: a backend without sessions, whose tokens cannot be revoked).
    const outcomeOf = (response: ApiResponse): ServerSignOut =>
      response.status >= 500 ? "unreachable" : "ended";
    try {
      const response = await logout(tokens.accessToken);
      if (response.status !== 401) return outcomeOf(response);
      // The access token expired: the logout route needs a live one, so refresh outside the session.
      const fresh = await refresher.detached(tokens.refreshToken);
      if (fresh === "refused") return "ended";
      if (fresh === "unreachable") return "unreachable";
      return outcomeOf(await logout(fresh.accessToken));
    } catch {
      // The local sign-out stands, and the server session runs out on its own.
      return "unreachable";
    }
  };

  const signInTicket = (): Ticket => {
    const at = cancellations;
    return () => cancellations === at;
  };

  const sessionTicket = (): Ticket => {
    const at = session.generation();
    return () => session.generation() === at;
  };

  const acceptSignIn = async (
    tokens: Tokens,
    user: IdentityUser,
    ticket: Ticket,
  ): Promise<void> => {
    if (disposed) throw new IdentityError("unknown");
    if (!ticket()) {
      await endServerSession(tokens, false);
      throw new IdentityError("unauthorized");
    }
    session.signIn(tokens, user);
    refresher.schedule();
  };

  const exclusive = <T>(task: () => Promise<T>): Promise<T> => {
    const run = signInChain.then(task, task);
    signInChain = run.catch(() => undefined);
    return run;
  };

  return {
    base,
    clock,
    fetch,
    timeoutMs,
    tokenLifetimeMs,
    transport,
    session,
    throttle,
    refresher,
    crossTab,
    isActive,
    accessToken,
    credentialRequest,
    authorizedRequest,
    refreshSession,
    signInTicket,
    sessionTicket,
    acceptSignIn,
    endServerSession,
    cancelSignIns,
    exclusive,
    settleSignIns: () => signInChain,
    signedOut,
    onOtherTabSignedIn: (handler) => {
      otherTabSignedIn = handler;
    },
    dispose: () => {
      disposed = true;
      cancelSignIns();
      refresher.cancel();
      crossTab.close();
      session.dispose();
    },
  };
};

import { parseBaseUrl } from "./base-url.ts";
import { systemClock, type Clock } from "./clock.ts";
import { createCrossTab, type CrossTab } from "./cross-tab.ts";
import { IdentityError } from "./identity-error.ts";
import { THROTTLED_STATUS, throttledError } from "./map-error.ts";
import { resolveLocks, type LockManagerLike } from "./locks.ts";
import { resolveOnline, type OnlineSubscription } from "./online.ts";
import { createRefresher, type Refresher, type RefreshResult } from "./refresher.ts";
import {
  createSession,
  type Session,
  type SignOutReason,
  type Ticket,
  type Tokens,
} from "./session.ts";
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

/**
 * Whether the server session a sign-out tried to end is gone, may live on, or was never one
 * (a backend without sessions, whose tokens cannot be revoked).
 */
export type ServerSignOut = "ended" | "unreachable" | "no-sessions";

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
   * An access token to send for the session `ticket` names: the current one, or, once its known
   * expiry has passed, a refreshed one (rejecting `network` when the server cannot be reached,
   * `unauthorized` without a session or once that session is over).
   */
  readonly accessToken: (ticket: Ticket) => Promise<string>;
  /** A credential request: held back while throttled, and a 429 starts the hold. */
  readonly credentialRequest: (request: ApiRequest) => Promise<ApiResponse>;
  /**
   * A request with the bearer token, refreshed and retried once on a 401, unless the session
   * changed while it was under way (it is then never replayed as the new session).
   */
  readonly authorizedRequest: (request: ApiRequest) => Promise<ApiResponse>;
  /**
   * Refreshes the session `ticket` names, signing out if it is over; true when it holds fresh
   * tokens. Nothing happens once that session is no longer current.
   */
  readonly refreshSession: (ticket: Ticket) => Promise<boolean>;
  /**
   * Adopts a sign-in's or restore's tokens through the session's gate. A stale ticket ends the
   * server session the tokens opened and rejects; so does a sign-out made while listeners heard
   * of the sign-in.
   */
  readonly acceptSignIn: (tokens: Tokens, user: IdentityUser, ticket: Ticket) => Promise<void>;
  /** Ends the server session these tokens belong to (and its cookie); never rejects. */
  readonly endServerSession: (tokens: Tokens, everywhere: boolean) => Promise<ServerSignOut>;
  /**
   * Runs sign-ins, restores and re-checks one at a time, in call order, behind any sign-out
   * under way. Each takes its ticket before it is queued and checks it when its turn comes.
   */
  readonly exclusive: <T>(task: () => Promise<T>) => Promise<T>;
  /**
   * Starts a sign-out's server work: everything queued afterwards waits for it. Resolves with
   * whether it and the work queued before it (sign-ins it cancelled, whose server sessions are
   * then ended) left no server session behind.
   */
  readonly signOutBarrier: (work: () => Promise<ServerSignOut>) => Promise<ServerSignOut>;
  readonly signedOut: (reason: SignOutReason) => void;
  /**
   * Counts the sign-ins this tab knows of: another tab's (by its notice) and this tab's own (when
   * asked for). A sign-out compares it before and after, since the later action wins.
   */
  readonly signInsSeen: () => number;
  readonly noteSignIn: () => void;
  /**
   * Registers a sign-out under way (`superseded` says whether a later sign-in won), so that a
   * dispose before it finishes still tells the other tabs. Returns its removal.
   */
  readonly signOutPending: (superseded: () => boolean) => () => void;
  /** What to do when another tab signs in (set by the client). */
  readonly onOtherTabSignedIn: (handler: () => void) => void;
  readonly dispose: () => void;
}

/** The longest delay a timer keeps: setTimeout fires at once beyond it. */
const MAX_TIMER_MS = 2 ** 31 - 1;

/**
 * A duration option, refused at creation unless it is positive and short enough for a timer
 * (`unitMs` converts it to milliseconds).
 */
const durationOption = (
  name: string,
  value: number | undefined,
  fallback: number,
  unitMs = 1,
): number => {
  const chosen = (value ?? fallback) * unitMs;
  if (!Number.isFinite(chosen) || chosen <= 0 || chosen > MAX_TIMER_MS) {
    throw new TypeError(`${name} must be positive and at most ${String(MAX_TIMER_MS)} ms`);
  }
  return chosen;
};

const worse = (left: ServerSignOut, right: ServerSignOut): ServerSignOut =>
  left === "unreachable" || right === "unreachable" ? "unreachable" : "ended";

export const createClientContext = (options: IdentityClientOptions): ClientContext => {
  const base = parseBaseUrl(options.baseUrl);
  const clock = options.clock ?? systemClock;
  const fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = durationOption(
    "requestTimeoutMs",
    options.requestTimeoutMs,
    DEFAULT_TIMEOUT_MS,
  );
  const tokenLifetimeMs = durationOption(
    "accessTokenLifetimeSeconds",
    options.accessTokenLifetimeSeconds,
    DEFAULT_ACCESS_TOKEN_LIFETIME_SECONDS,
    1000,
  );
  const transport = createTransport({ base, fetch, clock, timeoutMs });
  const session = createSession();
  const throttle = createThrottle(clock);
  let disposed = false;
  let otherTabSignedIn = (): void => undefined;
  let signInsSeen = 0;
  let queue: Promise<unknown> = Promise.resolve();
  // Each sign-out under way collects the endings of the sessions its cancelled work opened.
  const collectors = new Set<Promise<ServerSignOut>[]>();
  // The sign-outs under way, each with whether a later sign-in has superseded it.
  const pendingSignOuts = new Set<() => boolean>();
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

  /** A refresh's result for the session `ticket` names, which the caller checked is current. */
  const applyRefresh = (ticket: Ticket, result: RefreshResult, scheduled: boolean): boolean => {
    switch (result.outcome) {
      case "refreshed": {
        const adopted = session.adopt(ticket, result.tokens);
        if (adopted === undefined) return false;
        refresher.schedule(adopted);
        return true;
      }
      case "switched":
        signedOut("user-changed");
        return false;
      case "rejected":
        signedOut("expired");
        return false;
      case "unavailable": {
        // Without sessions a known expiry still ends the session; a guessed one waits for a 401.
        const tokens = session.tokens();
        if (!scheduled) signedOut("expired");
        else if (tokens?.lifetime.known === true) refresher.expireAt(ticket, tokens.expiresAt);
        return false;
      }
    }
  };

  const refresher = createRefresher({
    transport,
    session,
    clock,
    tokenLifetimeMs,
    locks: resolveLocks(options.locks),
    lockWaitMs: timeoutMs,
    onOnline: resolveOnline(options.onOnline),
    verifyUser,
    applyScheduled: (ticket, result) => {
      applyRefresh(ticket, result, true);
    },
    onExpired: () => {
      signedOut("expired");
    },
  });
  const crossTab = createCrossTab(options.channelName ?? DEFAULT_CHANNEL_NAME, {
    onSignedOut: () => {
      if (disposed) return;
      session.cancelSignIns();
      signedOut("other-tab");
    },
    onSignedIn: () => {
      if (disposed) return;
      signInsSeen += 1;
      otherTabSignedIn();
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

  const refreshSession = async (ticket: Ticket): Promise<boolean> => {
    if (!session.valid(ticket)) return false;
    const result = await refresher.refresh(ticket);
    return session.valid(ticket) && applyRefresh(ticket, result, false);
  };

  const unexpiredToken = (): string | undefined => {
    const tokens = session.tokens();
    if (tokens === undefined) return undefined;
    return tokens.lifetime.known && clock.now() >= tokens.expiresAt
      ? undefined
      : tokens.accessToken;
  };

  const accessToken = async (ticket: Ticket): Promise<string> => {
    if (!session.valid(ticket)) throw new IdentityError("unauthorized");
    const current = unexpiredToken();
    if (current !== undefined) return current;
    // An expired token is never sent: the refresh that replaces it reports a network failure.
    if (session.tokens() !== undefined && (await refreshSession(ticket))) {
      const refreshed = unexpiredToken();
      if (refreshed !== undefined && session.valid(ticket)) return refreshed;
    }
    throw new IdentityError("unauthorized");
  };

  const authorizedRequest = async (request: ApiRequest): Promise<ApiResponse> => {
    const ticket = session.ticket("session");
    const send = async (): Promise<ApiResponse> =>
      transport.send({ ...request, accessToken: await accessToken(ticket) });
    const response = await send();
    if (response.status !== 401) return response;
    if (!(await refreshSession(ticket))) throw new IdentityError("unauthorized");
    return send();
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
    // Only a success ended the session; 404 is a backend without sessions. Anything else (a
    // throttled, refused or failed logout) may have left the session in place.
    const outcomeOf = (response: ApiResponse): ServerSignOut => {
      if (response.ok) return "ended";
      return response.status === 404 ? "no-sessions" : "unreachable";
    };
    try {
      const response = await logout(tokens.accessToken);
      if (response.status !== 401) return outcomeOf(response);
      // The access token was already dead, so its session is over or only the refresh token can
      // still reach it: a cookie one is found by the cookie lookup that follows every logout, a
      // body one is refreshed outside the session to log out.
      if (tokens.refreshToken === undefined) return "ended";
      const fresh = await refresher.detached(tokens.refreshToken);
      if (fresh === "refused") return "ended";
      if (fresh === "unreachable") return "unreachable";
      return outcomeOf(await logout(fresh.accessToken));
    } catch {
      // The local sign-out stands, and the server session runs out on its own.
      return "unreachable";
    }
  };

  const abandon = async (tokens: Tokens): Promise<void> => {
    const ending = endServerSession(tokens, false);
    for (const collector of collectors) collector.push(ending);
    await ending;
  };

  const acceptSignIn = async (
    tokens: Tokens,
    user: IdentityUser,
    ticket: Ticket,
  ): Promise<void> => {
    const adopted = session.adopt(ticket, tokens, user);
    if (adopted === undefined) {
      await abandon(tokens);
      throw new IdentityError(disposed ? "unknown" : "unauthorized");
    }
    // A listener may already have signed out again on hearing of it.
    if (!session.valid(adopted)) throw new IdentityError("unauthorized");
    refresher.schedule(adopted);
  };

  const exclusive = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  };

  const signOutBarrier = (work: () => Promise<ServerSignOut>): Promise<ServerSignOut> => {
    const earlier = queue;
    const collected: Promise<ServerSignOut>[] = [];
    collectors.add(collected);
    const done = (async () => {
      try {
        let outcome = await work();
        await earlier;
        for (const ending of collected) outcome = worse(outcome, await ending);
        return outcome;
      } finally {
        collectors.delete(collected);
      }
    })();
    queue = Promise.all([earlier, done]).catch(() => undefined);
    return done;
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
    acceptSignIn,
    endServerSession,
    exclusive,
    signOutBarrier,
    signedOut,
    signInsSeen: () => signInsSeen,
    noteSignIn: () => {
      signInsSeen += 1;
    },
    signOutPending: (superseded) => {
      pendingSignOuts.add(superseded);
      return () => pendingSignOuts.delete(superseded);
    },
    onOtherTabSignedIn: (handler) => {
      otherTabSignedIn = handler;
    },
    dispose: () => {
      disposed = true;
      session.dispose();
      refresher.cancel();
      // The page is going: a sign-out still under way tells the other tabs now or never.
      if ([...pendingSignOuts].some((superseded) => !superseded())) {
        crossTab.announce("signed-out");
      }
      crossTab.close();
    },
  };
};

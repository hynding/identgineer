import { parseBaseUrl } from "./base-url.ts";
import { systemClock, type Clock } from "./clock.ts";
import { createCrossTab, type CrossTab } from "./cross-tab.ts";
import { IdentityError } from "./identity-error.ts";
import { THROTTLED_STATUS, throttledError } from "./map-error.ts";
import { resolveLocks, type LockManagerLike } from "./locks.ts";
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
}

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
   * Adopts a sign-in's tokens if the session is still the one the operation started in;
   * otherwise ends the server session they opened and rejects.
   */
  readonly acceptSignIn: (tokens: Tokens, user: IdentityUser, generation: number) => Promise<void>;
  /** Ends the server session these tokens belong to (and its cookie); never rejects. */
  readonly endServerSession: (tokens: Tokens, everywhere: boolean) => Promise<void>;
  /** Runs sign-ins one at a time, in call order, so the last call's session is the one kept. */
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
      if (!disposed) signedOut("other-tab");
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

  const withToken = (request: ApiRequest): Promise<ApiResponse> => {
    const accessToken = session.accessToken();
    if (accessToken === undefined) throw new IdentityError("unauthorized");
    return transport.send({ ...request, accessToken });
  };

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

  const endServerSession = async (tokens: Tokens, everywhere: boolean): Promise<void> => {
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
    try {
      const response = await logout(tokens.accessToken);
      if (response.status !== 401) return;
      // The access token expired: the logout route needs a live one, so refresh outside the session.
      const fresh = await refresher.detached(tokens.refreshToken);
      if (fresh !== undefined) await logout(fresh.accessToken);
    } catch {
      // Unreachable: the local sign-out stands, and the server session runs out on its own.
    }
  };

  const acceptSignIn = async (
    tokens: Tokens,
    user: IdentityUser,
    generation: number,
  ): Promise<void> => {
    if (disposed) throw new IdentityError("unknown");
    if (session.generation() !== generation) {
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
    credentialRequest,
    authorizedRequest,
    refreshSession,
    acceptSignIn,
    endServerSession,
    exclusive,
    settleSignIns: () => signInChain,
    signedOut,
    onOtherTabSignedIn: (handler) => {
      otherTabSignedIn = handler;
    },
    dispose: () => {
      disposed = true;
      refresher.cancel();
      crossTab.close();
      session.dispose();
    },
  };
};

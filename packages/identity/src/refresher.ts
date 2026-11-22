import { createAlarm } from "./alarm.ts";
import type { Clock } from "./clock.ts";
import { IdentityError } from "./identity-error.ts";
import { REFRESH_LOCK, withLock, type LockManagerLike } from "./locks.ts";
import { THROTTLED_STATUS, throttledError } from "./map-error.ts";
import type { OnlineSubscription } from "./online.ts";
import type { Session, Ticket, Tokens } from "./session.ts";
import { readAuthResponse } from "./shapes.ts";
import { tokensFrom } from "./tokens.ts";
import type { ApiRequest, Transport } from "./transport.ts";

/** How long before the access token's expiry the scheduled refresh runs (at most half its life). */
export const REFRESH_MARGIN_MS = 30_000;
/**
 * The shortest wait between scheduled refreshes. Tokens that live less than this are refreshed
 * with a doubling wait instead, for as long as the server keeps issuing them.
 */
export const MIN_REFRESH_DELAY_MS = 5_000;
const MAX_REFRESH_BACKOFF_MS = 300_000;
/** How soon a scheduled refresh that could not reach the server first tries again (then doubled). */
export const REFRESH_RETRY_MS = 30_000;

/**
 * `refreshed`: new tokens, not yet in the session (the caller adopts them through the session's
 * gate). `rejected`: the refresh session is over. `unavailable`: the backend has no sessions
 * (legacy tokens), so nothing can be refreshed. `switched`: the shared refresh cookie now belongs
 * to another user than the one signed in.
 */
export type RefreshResult =
  | { readonly outcome: "refreshed"; readonly tokens: Tokens }
  | { readonly outcome: "rejected" | "unavailable" | "switched" };

export interface Refresher {
  /**
   * Refreshes the session `ticket` names. Callers for the same session and refresh token share
   * the request in flight; one for another session never takes an older session's answer. It
   * changes nothing in the session; it rejects with an IdentityError when the server cannot
   * answer.
   */
  readonly refresh: (ticket: Ticket) => Promise<RefreshResult>;
  /** Plans the next refresh of the session `ticket` names, from its tokens' lifetime. */
  readonly schedule: (ticket: Ticket) => void;
  /** Signs that session out at `at` (a known expiry on a backend that cannot refresh). */
  readonly expireAt: (ticket: Ticket, at: number) => void;
  /** Clears every timer and listener: nothing armed before can run afterwards. */
  readonly cancel: () => void;
  /**
   * A refresh outside the session (for signing out): its tokens, `refused` when there is no
   * session to refresh, or `unreachable` when the server could not say.
   */
  readonly detached: (
    refreshToken: string | undefined,
  ) => Promise<Tokens | "refused" | "unreachable">;
}

export interface RefresherOptions {
  readonly transport: Transport;
  readonly session: Session;
  readonly clock: Clock;
  readonly tokenLifetimeMs: number;
  readonly locks: LockManagerLike | null;
  /** How long to wait for the cross-tab lock before refreshing without it. */
  readonly lockWaitMs: number;
  /** Lets a refresh that could not reach the server run again as soon as the browser is online. */
  readonly onOnline: OnlineSubscription | null;
  /**
   * After a cookie refresh: whether the new token is still the signed-in user's (true), another
   * user's (false), or there is no user to compare with (undefined).
   */
  readonly verifyUser: (accessToken: string) => Promise<boolean | undefined>;
  /** A scheduled refresh's result, for a session that is still the one it was planned for. */
  readonly applyScheduled: (ticket: Ticket, result: RefreshResult) => void;
  /** A known expiry passed on a backend that cannot refresh, for a session still current. */
  readonly onExpired: (ticket: Ticket) => void;
}

const REJECTED_STATUSES = new Set([400, 401, 403]);
const UNAVAILABLE_STATUS = 404;
/** The answers that clearly say there is no session to refresh; anything else is unclear. */
const NO_SESSION_STATUSES = new Set([...REJECTED_STATUSES, UNAVAILABLE_STATUS]);

/**
 * A refresh token held in memory (the backend returned it in a body) is sent in the body without
 * cookies; otherwise the HttpOnly cookie is presented, which page script never sees.
 */
const refreshRequest = (refreshToken: string | undefined): ApiRequest =>
  refreshToken === undefined
    ? { method: "POST", path: "/api/auth/refresh", body: {}, cookie: true }
    : { method: "POST", path: "/api/auth/refresh", body: { refreshToken } };

export const createRefresher = (options: RefresherOptions): Refresher => {
  const { clock, session } = options;
  const alarm = createAlarm(clock);
  let inFlight: { readonly key: string; readonly promise: Promise<RefreshResult> } | undefined;
  let shortStreak = 0;
  let unreachableStreak = 0;
  let stopListening = (): void => undefined;
  let lastAttemptAt = Number.NEGATIVE_INFINITY;

  const tokensOf = (body: unknown): Tokens => {
    const tokens = tokensFrom(readAuthResponse(body), {
      fallbackMs: options.tokenLifetimeMs,
      now: clock.now(),
    });
    if (tokens === undefined) throw new IdentityError("unknown");
    return tokens;
  };

  /**
   * A cookie refresh runs under the cross-tab lock, and is retried once when refused: another
   * tab may have rotated the cookie between this request reading it and the server seeing it.
   */
  const sendRefresh = (refreshToken: string | undefined) => {
    const send = () => options.transport.send(refreshRequest(refreshToken));
    if (refreshToken !== undefined) return send();
    const sendAndRetry = async () => {
      const response = await send();
      return response.status === 401 ? send() : response;
    };
    return withLock(
      options.locks,
      REFRESH_LOCK,
      { clock, waitMs: options.lockWaitMs },
      sendAndRetry,
    );
  };

  const run = async (): Promise<RefreshResult> => {
    const heldToken = session.refreshToken();
    const response = await sendRefresh(heldToken);
    if (response.status === UNAVAILABLE_STATUS) return { outcome: "unavailable" };
    if (REJECTED_STATUSES.has(response.status)) return { outcome: "rejected" };
    if (response.status === THROTTLED_STATUS) throw throttledError(response, clock.now());
    if (!response.ok) throw new IdentityError("unknown");
    const tokens = tokensOf(response.body);
    // A cookie is shared by every tab: another tab may have signed in as someone else since.
    const sameUser = heldToken === undefined ? await options.verifyUser(tokens.accessToken) : true;
    return sameUser === false ? { outcome: "switched" } : { outcome: "refreshed", tokens };
  };

  const detached = async (
    refreshToken: string | undefined,
  ): Promise<Tokens | "refused" | "unreachable"> => {
    let response;
    try {
      response = await sendRefresh(refreshToken);
    } catch {
      return "unreachable";
    }
    if (response.ok) {
      try {
        return tokensOf(response.body);
      } catch {
        // A success that carries no tokens says nothing about whether a session exists.
        return "unreachable";
      }
    }
    // Only a clear refusal means there is no session; a throttled or failed lookup may hide one.
    return NO_SESSION_STATUSES.has(response.status) ? "refused" : "unreachable";
  };

  const refresh = (ticket: Ticket): Promise<RefreshResult> => {
    const key = `${String(ticket.epoch)}:${session.refreshToken() ?? ""}`;
    if (inFlight?.key === key) return inFlight.promise;
    const promise = run().finally(() => {
      if (inFlight?.promise === promise) inFlight = undefined;
    });
    inFlight = { key, promise };
    return promise;
  };

  const cancel = (): void => {
    alarm.clear();
    stopListening();
    stopListening = () => undefined;
  };

  /** Every completion, success or failure, first checks that its session is still current. */
  const runScheduled = (ticket: Ticket): void => {
    lastAttemptAt = clock.now();
    refresh(ticket).then(
      (result) => {
        if (session.valid(ticket)) options.applyScheduled(ticket, result);
      },
      (error: unknown) => {
        if (session.valid(ticket)) retryLater(ticket, error);
      },
    );
  };

  /**
   * The server could not be reached (a laptop waking before its network): the refresh cookie may
   * well be valid, so the session stays, past even a known expiry (the expired token is no longer
   * sent), and the refresh is tried again with a doubling wait, or at once when back online.
   */
  const retryLater = (ticket: Ticket, error: unknown): void => {
    cancel();
    const backoff = Math.min(MAX_REFRESH_BACKOFF_MS, REFRESH_RETRY_MS * 2 ** unreachableStreak);
    unreachableStreak += 1;
    // A throttled refresh waits at least as long as the server asked.
    const serverWait =
      error instanceof IdentityError && error.code === "throttled"
        ? (error.retryAfterSeconds ?? 0) * 1000
        : 0;
    alarm.set(clock.now() + Math.max(backoff, serverWait), () => {
      runScheduled(ticket);
    });
    if (options.onOnline === null || serverWait > 0) return;
    const stop = options.onOnline(() => {
      stop();
      // An online event that keeps firing retries no more often than the refresh floor.
      const due = lastAttemptAt + MIN_REFRESH_DELAY_MS;
      if (due <= clock.now()) {
        alarm.clear();
        runScheduled(ticket);
      } else {
        alarm.set(due, () => {
          runScheduled(ticket);
        });
      }
    });
    stopListening = stop;
  };

  const schedule = (ticket: Ticket): void => {
    cancel();
    unreachableStreak = 0;
    if (!session.valid(ticket)) return;
    const lifetime = session.tokens()?.lifetime;
    if (lifetime === undefined) return;
    let delay = lifetime.ms - Math.min(REFRESH_MARGIN_MS, lifetime.ms / 2);
    // A token too short to wait for never makes the refreshes run back to back.
    if (lifetime.ms < MIN_REFRESH_DELAY_MS) {
      delay = Math.min(MAX_REFRESH_BACKOFF_MS, MIN_REFRESH_DELAY_MS * 2 ** shortStreak);
      shortStreak += 1;
    } else {
      delay = Math.max(delay, MIN_REFRESH_DELAY_MS);
      shortStreak = 0;
    }
    alarm.set(clock.now() + delay, () => {
      runScheduled(ticket);
    });
  };

  const expireAt = (ticket: Ticket, at: number): void => {
    cancel();
    alarm.set(at, () => {
      if (session.valid(ticket)) options.onExpired(ticket);
    });
  };

  return { refresh, schedule, expireAt, cancel, detached };
};

import { createAlarm } from "./alarm.ts";
import type { Clock } from "./clock.ts";
import { IdentityError } from "./identity-error.ts";
import { REFRESH_LOCK, type LockManagerLike } from "./locks.ts";
import type { Session, Tokens } from "./session.ts";
import { readAuthResponse } from "./shapes.ts";
import { tokensFrom } from "./tokens.ts";
import type { ApiRequest, Transport } from "./transport.ts";

/** How long before the access token's expiry the scheduled refresh runs (at most half its life). */
export const REFRESH_MARGIN_MS = 30_000;
/** The shortest wait between scheduled refreshes; doubled while tokens stay that short. */
export const MIN_REFRESH_DELAY_MS = 5_000;
const MAX_REFRESH_BACKOFF_MS = 300_000;
/** How soon a scheduled refresh that could not reach the server tries again. */
export const REFRESH_RETRY_MS = 30_000;

/**
 * `rejected`: the refresh session is over. `unavailable`: the backend has no sessions (legacy
 * tokens), so nothing can be refreshed. `switched`: the shared refresh cookie now belongs to
 * another user. `superseded`: the session was replaced or ended meanwhile.
 */
export type RefreshOutcome = "refreshed" | "rejected" | "unavailable" | "switched" | "superseded";

export interface Refresher {
  /** One refresh at a time: concurrent callers share the request in flight. */
  readonly refresh: () => Promise<RefreshOutcome>;
  /** Plans the next refresh from the current tokens' lifetime, measured from now. */
  readonly schedule: () => void;
  readonly cancel: () => void;
  /** The tokens the refresh in flight obtains, kept or not; undefined when none is in flight. */
  readonly pending: () => Promise<Tokens | undefined> | undefined;
  /** A refresh outside the session (for signing out): its tokens, or undefined if refused. */
  readonly detached: (refreshToken: string | undefined) => Promise<Tokens | undefined>;
}

export interface RefresherOptions {
  readonly transport: Transport;
  readonly session: Session;
  readonly clock: Clock;
  readonly tokenLifetimeMs: number;
  readonly locks: LockManagerLike | null;
  readonly isActive: () => boolean;
  /**
   * After a cookie refresh: whether the new token is still the signed-in user's (true), another
   * user's (false), or there is no user to compare with (undefined).
   */
  readonly verifyUser: (accessToken: string) => Promise<boolean | undefined>;
  /** A scheduled refresh found the session over, or a known expiry passed: sign out. */
  readonly onExpired: () => void;
  /** A scheduled refresh found the cookie belongs to another user: sign out. */
  readonly onUserChanged: () => void;
}

const REJECTED_STATUSES = new Set([400, 401, 403]);
const UNAVAILABLE_STATUS = 404;

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
  let inFlight: { promise: Promise<RefreshOutcome>; tokens?: Tokens } | undefined;
  let expiresAt = 0;
  let expiryKnown = false;
  let shortStreak = 0;

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
    return options.locks === null
      ? sendAndRetry()
      : options.locks.request(REFRESH_LOCK, sendAndRetry);
  };

  const run = async (record: { tokens?: Tokens }): Promise<RefreshOutcome> => {
    const generation = session.generation();
    if (!options.isActive()) return "superseded";
    const heldToken = session.refreshToken();
    const response = await sendRefresh(heldToken);
    if (session.generation() !== generation) return "superseded";
    if (response.status === UNAVAILABLE_STATUS) return "unavailable";
    if (REJECTED_STATUSES.has(response.status)) return "rejected";
    if (!response.ok) throw new IdentityError("unknown");
    const tokens = tokensOf(response.body);
    record.tokens = tokens;
    // A cookie is shared by every tab: another tab may have signed in as someone else since.
    const sameUser = heldToken === undefined ? await options.verifyUser(tokens.accessToken) : true;
    if (session.generation() !== generation) return "superseded";
    if (sameUser === false) return "switched";
    session.setTokens(tokens);
    schedule();
    return "refreshed";
  };

  const detached = async (refreshToken: string | undefined): Promise<Tokens | undefined> => {
    try {
      const response = await sendRefresh(refreshToken);
      return response.ok ? tokensOf(response.body) : undefined;
    } catch {
      return undefined;
    }
  };

  const refresh = (): Promise<RefreshOutcome> => {
    if (inFlight === undefined) {
      const record: { promise: Promise<RefreshOutcome>; tokens?: Tokens } = {
        promise: Promise.resolve<RefreshOutcome>("superseded"),
      };
      record.promise = run(record).finally(() => {
        if (inFlight === record) inFlight = undefined;
      });
      inFlight = record;
    }
    return inFlight.promise;
  };

  const pending = (): Promise<Tokens | undefined> | undefined => {
    const record = inFlight;
    return record?.promise.then(
      () => record.tokens,
      () => record.tokens,
    );
  };

  const runScheduled = (): void => {
    refresh().then(
      (outcome) => {
        if (outcome === "rejected") options.onExpired();
        if (outcome === "switched") options.onUserChanged();
        // Without sessions a known expiry still ends the session; a guessed one waits for a 401.
        if (outcome === "unavailable" && expiryKnown) alarm.set(expiresAt, options.onExpired);
      },
      () => {
        if (expiryKnown && clock.now() >= expiresAt) options.onExpired();
        else alarm.set(clock.now() + REFRESH_RETRY_MS, runScheduled);
      },
    );
  };

  function schedule(): void {
    alarm.clear();
    if (!options.isActive()) return;
    const lifetime = session.tokens()?.lifetime;
    if (lifetime === undefined) return;
    const now = clock.now();
    expiresAt = now + lifetime.ms;
    expiryKnown = lifetime.known;
    let delay = lifetime.ms - Math.min(REFRESH_MARGIN_MS, lifetime.ms / 2);
    // A token too short to wait for never makes the refreshes run back to back.
    if (delay < MIN_REFRESH_DELAY_MS) {
      delay = Math.min(MAX_REFRESH_BACKOFF_MS, MIN_REFRESH_DELAY_MS * 2 ** shortStreak);
      shortStreak += 1;
    } else {
      shortStreak = 0;
    }
    alarm.set(now + delay, runScheduled);
  }

  return { refresh, schedule, cancel: alarm.clear, pending, detached };
};

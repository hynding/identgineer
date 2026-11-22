import { createAlarm } from "./alarm.ts";
import type { Clock } from "./clock.ts";
import { IdentityError } from "./identity-error.ts";
import type { Session } from "./session.ts";
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
 * tokens), so nothing can be refreshed. `superseded`: the session was replaced or ended meanwhile.
 */
export type RefreshOutcome = "refreshed" | "rejected" | "unavailable" | "superseded";

export interface Refresher {
  /** One refresh at a time: concurrent callers share the request in flight. */
  readonly refresh: () => Promise<RefreshOutcome>;
  /** Plans the next refresh from the current tokens' lifetime, measured from now. */
  readonly schedule: () => void;
  readonly cancel: () => void;
}

export interface RefresherOptions {
  readonly transport: Transport;
  readonly session: Session;
  readonly clock: Clock;
  readonly tokenLifetimeMs: number;
  /** A scheduled refresh found the session over, or a known expiry passed: sign out. */
  readonly onExpired: () => void;
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
  let inFlight: Promise<RefreshOutcome> | undefined;
  let expiresAt = 0;
  let expiryKnown = false;
  let shortStreak = 0;

  const run = async (): Promise<RefreshOutcome> => {
    const generation = session.generation();
    const response = await options.transport.send(refreshRequest(session.refreshToken()));
    if (session.generation() !== generation) return "superseded";
    if (response.status === UNAVAILABLE_STATUS) return "unavailable";
    if (REJECTED_STATUSES.has(response.status)) return "rejected";
    if (!response.ok) throw new IdentityError("unknown");
    const tokens = tokensFrom(readAuthResponse(response.body), {
      fallbackMs: options.tokenLifetimeMs,
      now: clock.now(),
    });
    if (tokens === undefined) throw new IdentityError("unknown");
    session.setTokens(tokens);
    schedule();
    return "refreshed";
  };

  const refresh = (): Promise<RefreshOutcome> => {
    inFlight ??= run().finally(() => {
      inFlight = undefined;
    });
    return inFlight;
  };

  const runScheduled = (): void => {
    refresh().then(
      (outcome) => {
        if (outcome === "rejected") options.onExpired();
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

  return { refresh, schedule, cancel: alarm.clear };
};

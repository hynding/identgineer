import type { Clock } from "./clock.ts";
import { IdentityError } from "./identity-error.ts";
import type { Session } from "./session.ts";
import { readAuthResponse } from "./shapes.ts";
import { readTokenExpiry } from "./token-expiry.ts";
import type { ApiRequest, Transport } from "./transport.ts";

/** How long before the access token's expiry the scheduled refresh runs. */
export const REFRESH_MARGIN_MS = 30_000;
/** How soon a scheduled refresh that could not reach the server tries again. */
export const REFRESH_RETRY_MS = 30_000;

/** `superseded`: the session was replaced or ended while the refresh was under way. */
export type RefreshOutcome = "refreshed" | "rejected" | "superseded";

export interface Refresher {
  /** One refresh at a time: concurrent callers share the request in flight. */
  readonly refresh: () => Promise<RefreshOutcome>;
  readonly schedule: () => void;
  readonly cancel: () => void;
}

export interface RefresherOptions {
  readonly transport: Transport;
  readonly session: Session;
  readonly clock: Clock;
  /** The server refused to refresh while a scheduled refresh ran: the session is over. */
  readonly onExpired: () => void;
}

const REJECTED_STATUSES = new Set([400, 401, 403, 404]);

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
  let inFlight: Promise<RefreshOutcome> | undefined;
  let timer: unknown;

  const cancel = (): void => {
    if (timer !== undefined) clock.clearTimeout(timer);
    timer = undefined;
  };

  const run = async (): Promise<RefreshOutcome> => {
    const generation = session.generation();
    const response = await options.transport.send(refreshRequest(session.refreshToken()));
    if (session.generation() !== generation) return "superseded";
    if (REJECTED_STATUSES.has(response.status)) return "rejected";
    if (!response.ok) throw new IdentityError("unknown");
    const { accessToken, refreshToken } = readAuthResponse(response.body);
    if (accessToken === undefined) throw new IdentityError("unknown");
    session.setTokens(refreshToken === undefined ? { accessToken } : { accessToken, refreshToken });
    schedule();
    return "refreshed";
  };

  const refresh = (): Promise<RefreshOutcome> => {
    inFlight ??= run().finally(() => {
      inFlight = undefined;
    });
    return inFlight;
  };

  const runScheduled = (expiresAt: number): void => {
    timer = undefined;
    refresh().then(
      (outcome) => {
        if (outcome === "rejected") options.onExpired();
      },
      () => {
        if (clock.now() >= expiresAt) options.onExpired();
        else
          timer = clock.setTimeout(() => {
            runScheduled(expiresAt);
          }, REFRESH_RETRY_MS);
      },
    );
  };

  /** Plans a refresh shortly before a JWT access token says it expires; opaque tokens get none. */
  function schedule(): void {
    cancel();
    const accessToken = session.accessToken();
    const expiresAt = accessToken === undefined ? undefined : readTokenExpiry(accessToken);
    if (expiresAt === undefined) return;
    timer = clock.setTimeout(
      () => {
        runScheduled(expiresAt);
      },
      Math.max(0, expiresAt - clock.now() - REFRESH_MARGIN_MS),
    );
  }

  return { refresh, schedule, cancel };
};

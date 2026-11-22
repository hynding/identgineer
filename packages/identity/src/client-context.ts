import { parseBaseUrl } from "./base-url.ts";
import { systemClock, type Clock } from "./clock.ts";
import { createCrossTab, type CrossTab } from "./cross-tab.ts";
import { IdentityError } from "./identity-error.ts";
import { THROTTLED_STATUS, throttledError } from "./map-error.ts";
import { createRefresher, type Refresher } from "./refresher.ts";
import { createSession, type Session, type SignOutReason, type Tokens } from "./session.ts";
import { createThrottle, type Throttle } from "./throttle.ts";
import { createTransport, type ApiRequest, type ApiResponse, type Transport } from "./transport.ts";
import type { IdentityUser } from "./types.ts";

export const DEFAULT_TIMEOUT_MS = 15_000;
export const DEFAULT_CHANNEL_NAME = "identgineer-identity";

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
}

/** What every operation of the client shares. Internal: never handed to callers. */
export interface ClientContext {
  readonly base: URL;
  readonly clock: Clock;
  readonly transport: Transport;
  readonly session: Session;
  readonly throttle: Throttle;
  readonly refresher: Refresher;
  readonly crossTab: CrossTab;
  /** A credential request: held back while throttled, and a 429 starts the hold. */
  readonly credentialRequest: (request: ApiRequest) => Promise<ApiResponse>;
  /** A request with the bearer token, refreshed and retried once on a 401. */
  readonly authorizedRequest: (request: ApiRequest) => Promise<ApiResponse>;
  readonly signedIn: (tokens: Tokens, user: IdentityUser) => void;
  readonly signedOut: (reason: SignOutReason) => void;
}

export const createClientContext = (options: IdentityClientOptions): ClientContext => {
  const base = parseBaseUrl(options.baseUrl);
  const clock = options.clock ?? systemClock;
  const transport = createTransport({
    base,
    fetch: options.fetch ?? globalThis.fetch.bind(globalThis),
    clock,
    timeoutMs: options.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS,
  });
  const session = createSession();
  const throttle = createThrottle(clock);

  const signedOut = (reason: SignOutReason): void => {
    refresher.cancel();
    session.signOut(reason);
  };
  const refresher = createRefresher({
    transport,
    session,
    clock,
    onExpired: () => {
      signedOut("expired");
    },
  });
  const crossTab = createCrossTab(options.channelName ?? DEFAULT_CHANNEL_NAME, () => {
    signedOut("other-tab");
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

  const authorizedRequest = async (request: ApiRequest): Promise<ApiResponse> => {
    const response = await withToken(request);
    if (response.status !== 401) return response;
    const outcome = await refresher.refresh();
    if (outcome === "refreshed") return withToken(request);
    if (outcome === "rejected") signedOut("expired");
    throw new IdentityError("unauthorized");
  };

  const signedIn = (tokens: Tokens, user: IdentityUser): void => {
    session.signIn(tokens, user);
    refresher.schedule();
  };

  return {
    base,
    clock,
    transport,
    session,
    throttle,
    refresher,
    crossTab,
    credentialRequest,
    authorizedRequest,
    signedIn,
    signedOut,
  };
};

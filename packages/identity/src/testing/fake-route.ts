import type { FakeRequest, FakeResponse } from "./fake-http.ts";
import type { FakeStore, FakeUser, IssuedTokens } from "./fake-store.ts";

/** How the fake backend is configured, as strapi-php's `config/camis.php` would be. */
export interface FakeSettings {
  /** `jwt_management`: `refresh` (sessions, rotating refresh tokens) or `legacy` (one token). */
  readonly sessions: "refresh" | "legacy";
  readonly emailConfirmation: boolean;
  /** `sessions.http_only`: the refresh token always goes in a cookie, not only when asked. */
  readonly httpOnlyCookies: boolean;
  readonly refreshCookieName: string;
  readonly providers: readonly string[];
  readonly throttlePerMinute: number;
  /** Whether a 429 carries a `Retry-After` the client can read. */
  readonly retryAfterHeader: boolean;
}

export interface RouteContext {
  readonly store: FakeStore;
  readonly settings: FakeSettings;
  readonly request: FakeRequest;
  readonly params: readonly string[];
  /** The cookies the browser sent (only with `credentials: "include"`). */
  readonly cookies: ReadonlyMap<string, string>;
  readonly jsonBody: () => Readonly<Record<string, unknown>>;
  /** The authenticated route's user. */
  readonly user: () => FakeUser;
  /** The session behind the request's access token, if it has one. */
  readonly currentSession: () => string | undefined;
  readonly cookieMode: () => boolean;
  /** Tokens in the body, or the refresh token in a cookie in cookie mode. */
  readonly tokenAnswer: (
    tokens: IssuedTokens,
    extra?: Readonly<Record<string, unknown>>,
  ) => FakeResponse;
}

export interface FakeRoute {
  readonly method: string;
  readonly path: RegExp;
  /** A public-role route that refuses a request carrying a session. */
  readonly guest?: boolean;
  readonly authenticated?: boolean;
  readonly throttled?: boolean;
  /** Served in refresh mode only, as users-permissions' session routes are. */
  readonly refreshOnly?: boolean;
  readonly handle: (context: RouteContext) => FakeResponse;
}

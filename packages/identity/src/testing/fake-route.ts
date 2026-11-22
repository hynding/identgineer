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
  /** Each group's credential attempts a minute (`CAMIS_AUTH_THROTTLE_PER_MINUTE`). */
  readonly throttlePerMinute: number;
  /** Sign-in, recovery or confirmation turns a minute for the client address, across every account it names (50). */
  readonly addressThrottlePerMinute: number;
  /** Failed refreshes a minute, in their own bucket (`CAMIS_REFRESH_THROTTLE_PER_MINUTE`, 60). */
  readonly refreshThrottlePerMinute: number;
  /** Origins besides the CMS's own that CORS lets send credentials (`cors.allowed_origins`). */
  readonly allowedOrigins: readonly string[];
  /** Whether a 429 carries a `Retry-After` the client can read. */
  readonly retryAfterHeader: boolean;
  /**
   * `CAMIS_AUTH_HIDE_ACCOUNT_EXISTENCE` (on by default): with email confirmation on, every
   * registration and every confirmation resend is answered alike, and a username naming another
   * address is refused. Off, Strapi's answers, which tell a taken or confirmed account apart.
   */
  readonly hideAccountExistence: boolean;
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
  /** Counts a failed attempt in the group's bucket: the 429 to answer instead once it is full. */
  readonly refuseFailure: (group: ThrottleGroup) => FakeResponse | undefined;
  /** Ends the request's own access token alone. */
  readonly dropAccessToken: () => void;
  /** Whether the request came from a page the refresh cookie may be taken from. */
  readonly fromOwnPage: () => boolean;
  /** Tokens in the body, or the refresh token in a cookie in cookie mode. */
  readonly tokenAnswer: (
    tokens: IssuedTokens,
    extra?: Readonly<Record<string, unknown>>,
  ) => FakeResponse;
}

export type ThrottleGroup =
  | "sign-in"
  | "register"
  | "recovery"
  | "password-reset"
  | "confirmation"
  | "provider"
  | "refresh"
  | "password-change";

export interface FakeRoute {
  readonly method: string;
  readonly path: RegExp;
  /** A public-role route that refuses a request carrying a session. */
  readonly guest?: boolean;
  readonly authenticated?: boolean;
  /** The throttle bucket the route counts against, as camis groups its routes. */
  readonly throttled?: ThrottleGroup;
  /**
   * The body checks camis makes before the throttle turn (for the groups its controller counts
   * per name given): a refused body takes no turn.
   */
  readonly validates?: (context: RouteContext) => FakeResponse | undefined;
  /** Served in refresh mode only, as users-permissions' session routes are. */
  readonly refreshOnly?: boolean;
  readonly handle: (context: RouteContext) => FakeResponse;
}

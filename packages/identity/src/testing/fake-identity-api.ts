import { systemClock, type Clock } from "../clock.ts";
import { AUTH_ROUTES } from "./fake-auth-routes.ts";
import {
  forbidden,
  notFound,
  ok,
  strapiError,
  unauthorized,
  type FakeRequest,
  type FakeResponse,
} from "./fake-http.ts";
import { PROFILE_ROUTES } from "./fake-profile-routes.ts";
import type { FakeRoute, FakeSettings, RouteContext, ThrottleGroup } from "./fake-route.ts";
import { PROVIDER_SESSION_COOKIE, SESSION_ROUTES } from "./fake-session-routes.ts";
import { createFakeStore, type FakeUser, type IssuedTokens } from "./fake-store.ts";

export interface FakeIdentityApiOptions extends Partial<FakeSettings> {
  readonly baseUrl?: string;
  readonly clock?: Clock;
  /** `opaque` (default) as strapi-php's Sanctum tokens; `jwt` as Strapi's. */
  readonly accessTokens?: "jwt" | "opaque";
  /** Defaults to camis': 600 s in refresh mode, 30 days for legacy tokens. */
  readonly accessTokenLifetimeSeconds?: number;
  /** Adds `expiresIn` (seconds) to every token answer, as a backend that reports it would. */
  readonly reportExpiresIn?: boolean;
}

export interface FakeUserInput {
  readonly username: string;
  readonly email: string;
  readonly password: string;
  readonly confirmed?: boolean;
  readonly blocked?: boolean;
}

/** A one-off answer in place of the route's, or a fault. */
export type FakeOverride =
  FakeResponse | "network-error" | "hang" | ((request: FakeRequest) => Promise<FakeResponse>);

// camis' defaults: CAMIS_ACCESS_TOKEN_LIFESPAN and CAMIS_JWT_LIFESPAN.
const ACCESS_LIFETIME_SECONDS = 600;
const LEGACY_LIFETIME_SECONDS = 2_592_000;

const ROUTES: readonly FakeRoute[] = [...AUTH_ROUTES, ...SESSION_ROUTES, ...PROFILE_ROUTES];

/** The groups counted per account named, by the body field that names it. */
const IDENTIFIED: Partial<Record<ThrottleGroup, string>> = {
  "sign-in": "identifier",
  recovery: "email",
  confirmation: "email",
};

const DEFAULT_SETTINGS: FakeSettings = {
  sessions: "refresh",
  emailConfirmation: false,
  httpOnlyCookies: false,
  refreshCookieName: "strapi_up_refresh",
  providers: ["github"],
  throttlePerMinute: Number.POSITIVE_INFINITY,
  refreshThrottlePerMinute: 60,
  addressThrottlePerMinute: 50,
  allowedOrigins: [],
  retryAfterHeader: true,
};

const readRequest = (url: URL, init: RequestInit): FakeRequest => {
  let body: unknown;
  if (typeof init.body === "string") {
    try {
      body = JSON.parse(init.body) as unknown;
    } catch {
      body = init.body;
    }
  }
  return {
    method: (init.method ?? "GET").toUpperCase(),
    path: url.pathname,
    query: url.searchParams,
    headers: new Headers(init.headers),
    credentials: init.credentials ?? "same-origin",
    redirect: init.redirect ?? "follow",
    body,
  };
};

const toResponse = (answer: FakeResponse): Response =>
  new Response(answer.body === undefined ? null : JSON.stringify(answer.body), {
    status: answer.status,
    headers: {
      ...(answer.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...answer.headers,
    },
  });

const abortError = (): DOMException => new DOMException("The operation was aborted.", "AbortError");

/**
 * An in-memory stand-in for the CMS's users-permissions API (strapi-php's behaviour), served
 * through an injectable `fetch`. It keeps a browser-like cookie jar: cookies go out and are set
 * only on `credentials: "include"` requests, and nothing in it is readable by page script.
 */
export const createFakeIdentityApi = (options: FakeIdentityApiOptions = {}) => {
  const base = new URL(options.baseUrl ?? "https://cms.example.test");
  const clock = options.clock ?? systemClock;
  const settings: FakeSettings = { ...DEFAULT_SETTINGS, ...options };
  const lifetimeSeconds =
    options.accessTokenLifetimeSeconds ??
    (settings.sessions === "legacy" ? LEGACY_LIFETIME_SECONDS : ACCESS_LIFETIME_SECONDS);
  const store = createFakeStore({
    clock,
    accessTokens: options.accessTokens ?? "opaque",
    accessTokenLifetimeSeconds: lifetimeSeconds,
  });
  const cookieJar = new Map<string, string>();
  const requests: FakeRequest[] = [];
  const overrides: { method: string; path: string; answer: FakeOverride }[] = [];
  // The cookies each request carried, read when it was sent, as a browser does.
  const sentCookies = new WeakMap<FakeRequest, ReadonlyMap<string, string>>();
  const holds: { method: string; path: string; gate: Promise<void> }[] = [];
  const throttleWindows = new Map<string, { start: number; count: number }>();

  /** A turn of one bucket: undefined when allowed, else the seconds until the next one. */
  const take = (key: string, rate: number): number | undefined => {
    const now = clock.now();
    let window = throttleWindows.get(key);
    if (window === undefined || now - window.start >= 60_000) {
      window = { start: now, count: 0 };
      throttleWindows.set(key, window);
    }
    window.count += 1;
    if (window.count <= rate) return undefined;
    return Math.max(1, Math.ceil((window.start + 60_000 - now) / 1000));
  };

  const tooMany = (wait: number): FakeResponse => {
    const answer = strapiError(429, "RateLimitError", "Too Many Attempts.");
    return settings.retryAfterHeader
      ? { ...answer, headers: { "Retry-After": String(wait) } }
      : answer;
  };

  /**
   * As camis' StrapiRateLimits (the fake has one client address): a bucket per group, and for
   * sign-in, recovery and confirmation one per account the body names, under a ceiling for the
   * address across every name.
   */
  const throttle = (group: ThrottleGroup, request: FakeRequest): FakeResponse | undefined => {
    const rate =
      group === "refresh" ? settings.refreshThrottlePerMinute : settings.throttlePerMinute;
    const field = IDENTIFIED[group];
    if (field === undefined) {
      const wait = take(group, rate);
      return wait === undefined ? undefined : tooMany(wait);
    }
    const body = typeof request.body === "object" && request.body !== null ? request.body : {};
    const value = (body as Record<string, unknown>)[field];
    const name = typeof value === "string" ? value.trim().toLowerCase() : "";
    const named = take(`${group}|id:${name}`, rate);
    const ceiling = take(group, Math.max(rate, settings.addressThrottlePerMinute));
    if (named === undefined && ceiling === undefined) return undefined;
    return tooMany(Math.max(named ?? 0, ceiling ?? 0));
  };

  const contextFor = (request: FakeRequest, params: readonly string[]): RouteContext => {
    const cookies = sentCookies.get(request) ?? new Map<string, string>();
    const bearer = /^Bearer (.+)$/.exec(request.headers.get("Authorization") ?? "")?.[1];
    const token = bearer === undefined ? undefined : store.verifyAccessToken(bearer);
    const cookieMode = (): boolean =>
      settings.httpOnlyCookies || request.headers.get("x-strapi-refresh-cookie") === "httpOnly";
    return {
      store,
      settings,
      request,
      params,
      cookies,
      jsonBody: () =>
        typeof request.body === "object" && request.body !== null
          ? (request.body as Readonly<Record<string, unknown>>)
          : {},
      user: () => {
        const user = token === undefined ? undefined : store.users.get(token.userId);
        if (user === undefined) throw new Error("the route is not authenticated");
        return user;
      },
      currentSession: () => token?.sessionId ?? undefined,
      cookieMode,
      refuseFailure: (group) => throttle(group, request),
      dropAccessToken: () => {
        if (bearer !== undefined) store.dropAccessToken(bearer);
      },
      fromOwnPage: () => {
        const origin = request.headers.get("Origin");
        if (origin === null) {
          return (
            request.headers.has("X-Requested-With") ||
            request.headers.has("x-strapi-refresh-cookie")
          );
        }
        return origin === base.origin || settings.allowedOrigins.includes(origin);
      },
      tokenAnswer: (tokens: IssuedTokens, extra = {}) =>
        cookieMode()
          ? ok(
              { jwt: tokens.jwt, ...extra },
              { cookies: [{ name: settings.refreshCookieName, value: tokens.refreshToken }] },
            )
          : ok({ ...tokens, ...extra }),
    };
  };

  /** users-permissions' gates in its order: credentials, mode, throttle. */
  const gate = (route: FakeRoute, context: RouteContext): FakeResponse | undefined => {
    const bearer = context.request.headers.get("Authorization");
    const verified = (): boolean => {
      try {
        context.user();
        return true;
      } catch {
        return false;
      }
    };
    if (route.guest === true && bearer !== null) return verified() ? forbidden() : unauthorized();
    if (route.authenticated === true) {
      if (bearer === null) return forbidden();
      if (!verified()) return unauthorized();
      if (context.user().blocked) return unauthorized();
    }
    if (route.refreshOnly === true && settings.sessions !== "refresh") return notFound();
    return route.throttled === undefined ? undefined : throttle(route.throttled, context.request);
  };

  const route = (request: FakeRequest): FakeResponse => {
    for (const candidate of ROUTES) {
      const match = candidate.method === request.method ? candidate.path.exec(request.path) : null;
      if (match === null) continue;
      const context = contextFor(request, match.slice(1));
      return gate(candidate, context) ?? candidate.handle(context);
    }
    return notFound();
  };

  const withExpiresIn = (result: FakeResponse): FakeResponse => {
    const body = result.body as { jwt?: unknown } | undefined;
    if (options.reportExpiresIn !== true || typeof body?.jwt !== "string") return result;
    return { ...result, body: { ...body, expiresIn: lifetimeSeconds } };
  };

  const applyCookies = (request: FakeRequest, answer: FakeResponse): void => {
    if (request.credentials !== "include") return;
    for (const cookie of answer.cookies ?? []) {
      if (cookie.value === null) cookieJar.delete(cookie.name);
      else cookieJar.set(cookie.name, cookie.value);
    }
  };

  const takeOverride = (request: FakeRequest): FakeOverride | undefined => {
    const index = overrides.findIndex(
      (entry) => entry.method === request.method && entry.path === request.path,
    );
    return index === -1 ? undefined : overrides.splice(index, 1)[0]?.answer;
  };

  const answer = async (
    request: FakeRequest,
    signal: AbortSignal | null,
  ): Promise<FakeResponse> => {
    const override = takeOverride(request);
    if (override === "network-error") throw new TypeError("Failed to fetch");
    if (override === "hang") {
      return new Promise<FakeResponse>((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          reject(abortError());
        });
      });
    }
    if (typeof override === "function") return override(request);
    return override ?? route(request);
  };

  const fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin !== base.origin) throw new TypeError(`unexpected request to ${url.origin}`);
    const request = readRequest(url, init);
    requests.push(request);
    if (request.credentials === "include") sentCookies.set(request, new Map(cookieJar));
    const hold = holds.findIndex(
      (entry) => entry.method === request.method && entry.path === request.path,
    );
    if (hold !== -1) await holds.splice(hold, 1)[0]?.gate;
    await Promise.resolve();
    if (init.signal?.aborted === true) throw abortError();
    const result = withExpiresIn(await answer(request, init.signal ?? null));
    applyCookies(request, result);
    return toResponse(result);
  };

  return {
    baseUrl: base.origin,
    fetch: fetch,
    settings,
    /** Every request received, in order. */
    requests: requests as readonly FakeRequest[],
    addUser: (input: FakeUserInput): FakeUser =>
      store.addUser({
        username: input.username,
        email: input.email.toLowerCase(),
        password: input.password,
        provider: "local",
        confirmed: input.confirmed ?? true,
        blocked: input.blocked ?? false,
      }),
    findUser: (email: string): FakeUser | undefined =>
      store.findUser((user) => user.email === email.toLowerCase()),
    /** Answers the next matching request with `answer` instead of the route. */
    respondNext: (method: string, path: string, answer: FakeOverride): void => {
      overrides.push({ method, path, answer });
    },
    /**
     * Holds the next matching request after it is sent (its cookies already read) until the
     * returned function is called, so tests can interleave requests.
     */
    holdNext: (method: string, path: string): (() => void) => {
      let release = (): void => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      holds.push({ method, path, gate });
      return release;
    },
    /** Leaves the provider round trip's grant in the browser's session, as `/connect` would. */
    completeProviderRoundTrip: (provider: string, email: string): void => {
      cookieJar.set(PROVIDER_SESSION_COOKIE, `${provider}:${email.toLowerCase()}`);
    },
    /** The HttpOnly refresh cookie in the browser's jar (tests only: page script cannot see it). */
    refreshCookie: (): string | undefined => cookieJar.get(settings.refreshCookieName),
    /** An access token naming no session, as one issued before refresh mode would be. */
    issueLastingToken: (email: string): string => {
      const user = store.findUser((candidate) => candidate.email === email.toLowerCase());
      if (user === undefined) throw new Error(`no account ${email}`);
      return store.lastingToken(user.id);
    },
    /** Puts a refresh cookie in the jar, as a stale or foreign one would be. */
    setRefreshCookie: (value: string): void => {
      cookieJar.set(settings.refreshCookieName, value);
    },
    /** Whether the jar's refresh cookie names a session a reload could resume. */
    restorableSession: (): boolean => {
      const cookie = cookieJar.get(settings.refreshCookieName);
      return cookie !== undefined && store.sessionOf(cookie) !== undefined;
    },
    clearCookies: (): void => {
      cookieJar.clear();
    },
    /** Makes every issued access token invalid, as their expiry would. */
    expireAccessTokens: store.expireAccessTokens,
    activeSessionCount: (email: string): number => {
      const user = store.findUser((candidate) => candidate.email === email.toLowerCase());
      return user === undefined ? 0 : store.activeSessions(user.id).length;
    },
  };
};

export type FakeIdentityApi = ReturnType<typeof createFakeIdentityApi>;

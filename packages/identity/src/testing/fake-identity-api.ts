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
import type { FakeRoute, FakeSettings, RouteContext } from "./fake-route.ts";
import { PROVIDER_SESSION_COOKIE, SESSION_ROUTES } from "./fake-session-routes.ts";
import { createFakeStore, type FakeUser, type IssuedTokens } from "./fake-store.ts";

export interface FakeIdentityApiOptions extends Partial<FakeSettings> {
  readonly baseUrl?: string;
  readonly clock?: Clock;
  readonly accessTokens?: "jwt" | "opaque";
  readonly accessTokenLifetimeSeconds?: number;
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

const ROUTES: readonly FakeRoute[] = [...AUTH_ROUTES, ...SESSION_ROUTES, ...PROFILE_ROUTES];

const DEFAULT_SETTINGS: FakeSettings = {
  sessions: "refresh",
  emailConfirmation: false,
  httpOnlyCookies: false,
  refreshCookieName: "strapi_up_refresh",
  providers: ["github"],
  throttlePerMinute: Number.POSITIVE_INFINITY,
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
  const store = createFakeStore({
    clock,
    accessTokens: options.accessTokens ?? "jwt",
    accessTokenLifetimeSeconds: options.accessTokenLifetimeSeconds ?? 600,
  });
  const cookieJar = new Map<string, string>();
  const requests: FakeRequest[] = [];
  const overrides: { method: string; path: string; answer: FakeOverride }[] = [];
  let throttleWindow = { start: Number.NEGATIVE_INFINITY, count: 0 };

  const throttle = (): FakeResponse | undefined => {
    const now = clock.now();
    if (now - throttleWindow.start >= 60_000) throttleWindow = { start: now, count: 0 };
    throttleWindow.count += 1;
    if (throttleWindow.count <= settings.throttlePerMinute) return undefined;
    const wait = Math.ceil((throttleWindow.start + 60_000 - now) / 1000);
    const answer = strapiError(429, "HttpError", "Too Many Attempts.");
    return settings.retryAfterHeader
      ? { ...answer, headers: { "Retry-After": String(wait) } }
      : answer;
  };

  const contextFor = (request: FakeRequest, params: readonly string[]): RouteContext => {
    const cookies =
      request.credentials === "include" ? new Map(cookieJar) : new Map<string, string>();
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
    return route.throttled === true ? throttle() : undefined;
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
    await Promise.resolve();
    if (init.signal?.aborted === true) throw abortError();
    const result = await answer(request, init.signal ?? null);
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
    /** Leaves the provider round trip's grant in the browser's session, as `/connect` would. */
    completeProviderRoundTrip: (provider: string, email: string): void => {
      cookieJar.set(PROVIDER_SESSION_COOKIE, `${provider}:${email.toLowerCase()}`);
    },
    /** The HttpOnly refresh cookie in the browser's jar (tests only: page script cannot see it). */
    refreshCookie: (): string | undefined => cookieJar.get(settings.refreshCookieName),
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

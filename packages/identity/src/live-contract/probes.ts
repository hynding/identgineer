import { systemClock } from "../clock.ts";
import {
  readAuthResponse,
  readErrorEnvelope,
  readProfileList,
  readSessions,
  readUser,
} from "../shapes.ts";
import { createFakeIdentityApi } from "../testing/fake-identity-api.ts";
import {
  createBrowser,
  freshAccount,
  linkParameter,
  type LiveBackend,
  type LiveServer,
} from "./live-backend.ts";

/**
 * The raw requests the SDK makes, and their failures, sent in one scenario to the real server and
 * to the fake configured as it is, so each answer can be compared as far as the SDK reads it.
 */

const REFRESH_COOKIE = "strapi_up_refresh";
const COOKIE_HEADERS = { "x-strapi-refresh-cookie": "httpOnly", "X-Requested-With": "identgineer" };

export interface ProbeRequest {
  readonly method: "GET" | "POST" | "PUT" | "DELETE";
  readonly path: string;
  readonly body?: unknown;
  readonly token?: string;
  /** Send and keep cookies, as the SDK's cookie requests do (`credentials: "include"`). */
  readonly cookie?: boolean;
  readonly headers?: Readonly<Record<string, string>>;
  /** The page the request comes from; the site's own page by default. */
  readonly page?: string;
}

export interface ProbeAnswer {
  readonly status: number;
  readonly body: unknown;
  readonly retryAfter: string | null;
}

export interface ProbeTarget {
  readonly send: (request: ProbeRequest) => Promise<ProbeAnswer>;
  readonly refreshCookie: () => string | undefined;
  readonly resetCode: (email: string) => string;
  readonly confirmation: (email: string) => string;
}

/** How the SDK reads a successful answer. */
type Reader = "auth" | "user" | "sessions" | "profiles" | "raw";

/** What of one answer the SDK depends on. */
export interface Observation {
  readonly status: number;
  readonly error?: {
    readonly name: string;
    readonly fields: readonly string[];
    readonly message?: string;
  };
  readonly shape?: unknown;
  readonly cookie: "set" | "cleared" | "unchanged";
  readonly retryAfter?: boolean;
}

/** The type outline of a value: object keys (sorted) to outlines, an array's first entry. */
const outline = (value: unknown): unknown => {
  if (value === null) return "null";
  if (Array.isArray(value)) return value.length === 0 ? [] : [outline(value[0])];
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, outline((value as Record<string, unknown>)[key])]),
    );
  }
  return typeof value;
};

const read = (reader: Reader, body: unknown): unknown => {
  try {
    switch (reader) {
      case "auth":
        return outline(readAuthResponse(body));
      case "user":
        return outline(readUser(body));
      case "sessions":
        return readSessions(body).map((session) => outline(session));
      case "profiles":
        return outline(readProfileList(body));
      case "raw":
        return outline(body);
    }
  } catch {
    return "malformed";
  }
};

interface Step {
  readonly name: string;
  readonly reader?: Reader;
  /** The SDK reads this error's message (the not-confirmed sign-in). */
  readonly message?: true;
  readonly retryAfter?: true;
  /** Why the real server is expected to differ from the fake: a camis gap, named. */
  readonly gap?: string;
  readonly request: (state: State) => ProbeRequest;
  readonly keep?: (state: State, body: unknown) => void;
}

interface State {
  readonly account: { username: string; email: string; password: string };
  readonly unknownEmail: string;
  readonly tokens: Record<string, string>;
  target: ProbeTarget;
}

const jwtOf = (body: unknown): string => String((body as { jwt?: unknown }).jwt);
const refreshOf = (body: unknown): string =>
  String((body as { refreshToken?: unknown }).refreshToken);
const keepJwt = (name: string) => (state: State, body: unknown) => {
  state.tokens[name] = jwtOf(body);
};

const signIn = (state: State, password = state.account.password): ProbeRequest => ({
  method: "POST",
  path: "/api/auth/local",
  body: { identifier: state.account.email, password },
});

const NEW_PASSWORD = "another correct horse battery";

const MAIN_STEPS: readonly Step[] = [
  {
    name: "register: a new account",
    reader: "auth",
    request: (s) => ({ method: "POST", path: "/api/auth/local/register", body: s.account }),
  },
  {
    name: "register: a taken account",
    request: (s) => ({ method: "POST", path: "/api/auth/local/register", body: s.account }),
  },
  {
    name: "register: no email",
    request: (s) => ({
      method: "POST",
      path: "/api/auth/local/register",
      body: { username: `${s.account.username}x`, password: s.account.password },
    }),
  },
  {
    name: "register: a username that is not a string",
    request: (s) => ({
      method: "POST",
      path: "/api/auth/local/register",
      body: { username: 42, email: `x${s.account.email}`, password: s.account.password },
    }),
  },
  {
    name: "register: a password over 72 bytes",
    request: (s) => ({
      method: "POST",
      path: "/api/auth/local/register",
      body: {
        username: `${s.account.username}y`,
        email: `y${s.account.email}`,
        password: "p".repeat(73),
      },
    }),
  },
  {
    name: "sign-in: cookie mode",
    reader: "auth",
    request: (s) => ({ ...signIn(s), cookie: true, headers: COOKIE_HEADERS }),
    keep: keepJwt("cookieSession"),
  },
  {
    name: "sign-in: body mode",
    reader: "auth",
    request: (s) => signIn(s),
    keep: (s, body) => {
      s.tokens.bodyRefresh = refreshOf(body);
    },
  },
  { name: "sign-in: wrong password", request: (s) => signIn(s, "not the password") },
  {
    name: "sign-in: unknown account",
    request: (s) => ({
      ...signIn(s, "not the password"),
      body: { identifier: s.unknownEmail, password: "x" },
    }),
  },
  {
    name: "sign-in: an identifier over 255 characters",
    request: (s) => ({ ...signIn(s), body: { identifier: "a".repeat(256), password: "x" } }),
  },
  {
    name: "sign-in: a valid bearer token on the guest route",
    request: (s) => ({ ...signIn(s), token: s.tokens.cookieSession ?? "" }),
  },
  {
    name: "sign-in: an invalid bearer token on the guest route",
    request: (s) => ({ ...signIn(s), token: "1|not-a-token" }),
  },
  {
    name: "current user: with the token",
    reader: "user",
    request: (s) => ({ method: "GET", path: "/api/users/me", token: s.tokens.cookieSession ?? "" }),
  },
  { name: "current user: no token", request: () => ({ method: "GET", path: "/api/users/me" }) },
  {
    name: "current user: an invalid token",
    request: () => ({ method: "GET", path: "/api/users/me", token: "1|not-a-token" }),
  },
  {
    name: "refresh: the cookie, from the listed page",
    reader: "auth",
    request: () => ({
      method: "POST",
      path: "/api/auth/refresh",
      cookie: true,
      headers: COOKIE_HEADERS,
      body: {},
    }),
    keep: keepJwt("refreshed"),
  },
  {
    name: "refresh: the cookie, from a same-site page CORS does not list",
    request: () => ({
      method: "POST",
      path: "/api/auth/refresh",
      cookie: true,
      headers: COOKIE_HEADERS,
      body: {},
      page: "http://127.0.0.1:6666",
    }),
  },
  {
    name: "refresh: a refresh token in the body",
    reader: "auth",
    request: (s) => ({
      method: "POST",
      path: "/api/auth/refresh",
      body: { refreshToken: s.tokens.bodyRefresh },
    }),
  },
  {
    name: "refresh: the same body token again",
    request: (s) => ({
      method: "POST",
      path: "/api/auth/refresh",
      body: { refreshToken: s.tokens.bodyRefresh },
    }),
  },
  {
    name: "refresh: nothing presented",
    request: () => ({ method: "POST", path: "/api/auth/refresh", body: {} }),
  },
  {
    name: "sessions: list",
    reader: "sessions",
    request: (s) => ({
      method: "GET",
      path: "/api/auth/sessions",
      token: s.tokens.refreshed ?? "",
    }),
    keep: (s, body) => {
      const other = readSessions(body).find((session) => !session.current);
      s.tokens.otherSession = other?.id ?? "";
    },
  },
  {
    name: "sessions: revoke an unknown session",
    request: (s) => ({
      method: "DELETE",
      path: "/api/auth/sessions/0123456789abcdef0123456789abcdef",
      token: s.tokens.refreshed ?? "",
    }),
  },
  {
    name: "sessions: revoke another session",
    reader: "raw",
    request: (s) => ({
      method: "DELETE",
      path: `/api/auth/sessions/${s.tokens.otherSession ?? ""}`,
      token: s.tokens.refreshed ?? "",
    }),
  },
  {
    name: "change password: wrong current password",
    request: (s) => ({
      method: "POST",
      path: "/api/auth/change-password",
      token: s.tokens.refreshed ?? "",
      body: {
        currentPassword: "not the password",
        password: NEW_PASSWORD,
        passwordConfirmation: NEW_PASSWORD,
      },
    }),
  },
  {
    name: "change password: a confirmation that differs",
    request: (s) => ({
      method: "POST",
      path: "/api/auth/change-password",
      token: s.tokens.refreshed ?? "",
      body: {
        currentPassword: s.account.password,
        password: NEW_PASSWORD,
        passwordConfirmation: "other",
      },
    }),
  },
  {
    name: "change password: accepted",
    reader: "auth",
    request: (s) => ({
      method: "POST",
      path: "/api/auth/change-password",
      token: s.tokens.refreshed ?? "",
      body: {
        currentPassword: s.account.password,
        password: NEW_PASSWORD,
        passwordConfirmation: NEW_PASSWORD,
      },
    }),
    keep: keepJwt("changed"),
  },
  {
    name: "sessions: list after the password change",
    reader: "sessions",
    request: (s) => ({ method: "GET", path: "/api/auth/sessions", token: s.tokens.changed ?? "" }),
  },
  {
    name: "current user: a token of a session the password change ended",
    request: (s) => ({ method: "GET", path: "/api/users/me", token: s.tokens.refreshed ?? "" }),
  },
  {
    name: "forgot password: a known address",
    reader: "raw",
    request: (s) => ({
      method: "POST",
      path: "/api/auth/forgot-password",
      body: { email: s.account.email },
    }),
  },
  {
    name: "forgot password: an unknown address",
    reader: "raw",
    request: (s) => ({
      method: "POST",
      path: "/api/auth/forgot-password",
      body: { email: s.unknownEmail },
    }),
  },
  {
    name: "reset password: a wrong code",
    request: () => ({
      method: "POST",
      path: "/api/auth/reset-password",
      body: { code: "f".repeat(128), password: NEW_PASSWORD, passwordConfirmation: NEW_PASSWORD },
    }),
  },
  {
    name: "reset password: the mailed code",
    reader: "auth",
    request: (s) => ({
      method: "POST",
      path: "/api/auth/reset-password",
      body: {
        code: s.target.resetCode(s.account.email),
        password: NEW_PASSWORD,
        passwordConfirmation: NEW_PASSWORD,
      },
    }),
    keep: keepJwt("reset"),
  },
  {
    name: "profiles: none yet",
    reader: "profiles",
    request: (s) => ({ method: "GET", path: "/api/profiles", token: s.tokens.reset ?? "" }),
  },
  {
    name: "profiles: create",
    reader: "raw",
    gap: "strapi-php validates the assigned owner as a required body field (400 ValidationError owner)",
    request: (s) => ({
      method: "POST",
      path: "/api/profiles",
      token: s.tokens.reset ?? "",
      body: {
        data: {
          displayName: "Ada",
          bio: null,
          locale: "en",
          timezone: "UTC",
          marketingOptIn: false,
        },
      },
    }),
  },
  {
    name: "logout: no token",
    request: () => ({ method: "POST", path: "/api/auth/logout", body: {} }),
  },
  {
    name: "sign-in: cookie mode, to log out",
    reader: "auth",
    request: (s) => ({ ...signIn(s, NEW_PASSWORD), cookie: true, headers: COOKIE_HEADERS }),
    keep: keepJwt("toLogOut"),
  },
  {
    name: "logout: the cookie's own session",
    reader: "raw",
    request: (s) => ({
      method: "POST",
      path: "/api/auth/logout",
      token: s.tokens.toLogOut ?? "",
      cookie: true,
      headers: COOKIE_HEADERS,
      body: {},
    }),
  },
  {
    name: "logout: a token already logged out",
    request: (s) => ({
      method: "POST",
      path: "/api/auth/logout",
      token: s.tokens.toLogOut ?? "",
      body: {},
    }),
  },
  {
    name: "logout: everywhere",
    reader: "raw",
    request: (s) => ({
      method: "POST",
      path: "/api/auth/logout",
      token: s.tokens.reset ?? "",
      body: { scope: "all" },
    }),
  },
  {
    name: "current user: after logging out everywhere",
    request: (s) => ({ method: "GET", path: "/api/users/me", token: s.tokens.reset ?? "" }),
  },
];

const CONFIRMATION_STEPS: readonly Step[] = [
  {
    name: "register: a new account",
    reader: "auth",
    request: (s) => ({ method: "POST", path: "/api/auth/local/register", body: s.account }),
  },
  {
    name: "register: a taken account",
    request: (s) => ({ method: "POST", path: "/api/auth/local/register", body: s.account }),
  },
  { name: "sign-in: before confirming", message: true, request: (s) => signIn(s) },
  {
    name: "sign-in: before confirming, wrong password",
    request: (s) => signIn(s, "not the password"),
  },
  {
    name: "resend: an unknown address",
    reader: "raw",
    request: (s) => ({
      method: "POST",
      path: "/api/auth/send-email-confirmation",
      body: { email: s.unknownEmail },
    }),
  },
  {
    name: "resend: an unconfirmed address",
    reader: "raw",
    request: (s) => ({
      method: "POST",
      path: "/api/auth/send-email-confirmation",
      body: { email: s.account.email },
    }),
  },
  {
    name: "confirm: a wrong token",
    request: () => ({
      method: "GET",
      path: `/api/auth/email-confirmation?confirmation=${"f".repeat(40)}`,
    }),
  },
  {
    name: "confirm: the mailed token",
    request: (s) => ({
      method: "GET",
      path: `/api/auth/email-confirmation?confirmation=${s.target.confirmation(s.account.email)}`,
    }),
  },
  {
    name: "resend: a confirmed address",
    request: (s) => ({
      method: "POST",
      path: "/api/auth/send-email-confirmation",
      body: { email: s.account.email },
    }),
  },
  { name: "sign-in: after confirming", reader: "auth", request: (s) => signIn(s) },
];

/** Enough wrong sign-ins at one name to fill its bucket, then one more. */
const throttledSteps = (rate: number): readonly Step[] => [
  ...Array.from({ length: rate }, (_unused, index): Step => ({
    name: `sign-in: wrong password ${String(index + 1)} of ${String(rate)}`,
    request: (s) => signIn(s, "not the password"),
  })),
  {
    name: "sign-in: over the rate",
    retryAfter: true,
    request: (s) => signIn(s, "not the password"),
  },
];

export const scenarios = (backend: LiveBackend) => ({
  main: { server: backend.servers.main, steps: MAIN_STEPS },
  confirmation: { server: backend.servers.confirmation, steps: CONFIRMATION_STEPS },
  throttled: {
    server: backend.servers.throttled,
    steps: throttledSteps(backend.servers.throttled.throttlePerMinute),
  },
});

export type Scenario = ReturnType<typeof scenarios>[keyof ReturnType<typeof scenarios>];

const observe = async (step: Step, state: State): Promise<Observation> => {
  const before = state.target.refreshCookie();
  const answer = await state.target.send(step.request(state));
  const after = state.target.refreshCookie();
  const cookie = after === before ? "unchanged" : after === undefined ? "cleared" : "set";
  const envelope = answer.status >= 400 ? readErrorEnvelope(answer.body) : undefined;
  const ok = answer.status >= 200 && answer.status < 300;
  if (ok) step.keep?.(state, answer.body);
  return {
    status: answer.status,
    ...(envelope === undefined
      ? {}
      : {
          error: {
            name: envelope.name,
            fields: [...envelope.fields].sort(),
            ...(step.message === true ? { message: envelope.message } : {}),
          },
        }),
    ...(ok && step.reader !== undefined ? { shape: read(step.reader, answer.body) } : {}),
    cookie,
    ...(step.retryAfter === true ? { retryAfter: answer.retryAfter !== null } : {}),
  };
};

/** Runs every step of `scenario` against `target`, each answer observed. */
export const runScenario = async (
  scenario: Scenario,
  target: ProbeTarget,
): Promise<Observation[]> => {
  const state: State = {
    account: freshAccount("probe"),
    unknownEmail: freshAccount("nobody").email,
    tokens: {},
    target,
  };
  const observations: Observation[] = [];
  for (const step of scenario.steps) observations.push(await observe(step, state));
  return observations;
};

const answerOf = async (response: Response): Promise<ProbeAnswer> => {
  const text = await response.text();
  let body: unknown;
  try {
    body = text === "" ? null : (JSON.parse(text) as unknown);
  } catch {
    body = text;
  }
  return { status: response.status, body, retryAfter: response.headers.get("Retry-After") };
};

const initOf = (request: ProbeRequest): RequestInit => ({
  method: request.method,
  headers: {
    Accept: "application/json",
    ...(request.body === undefined ? {} : { "Content-Type": "application/json" }),
    ...(request.token === undefined ? {} : { Authorization: `Bearer ${request.token}` }),
    ...request.headers,
  },
  ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
  credentials: request.cookie === true ? "include" : "omit",
  redirect: "manual",
});

/** The running server, through a browser of the site's page (CORS not enforced, to see answers). */
export const realTarget = (backend: LiveBackend, server: LiveServer): ProbeTarget => {
  const browser = createBrowser(backend, { cors: false });
  const pages = new Map<string, typeof fetch>();
  const pageFetch = (page: string | undefined): typeof fetch => {
    if (page === undefined) return browser.fetch;
    const existing = pages.get(page);
    if (existing !== undefined) return existing;
    const created = createBrowser(backend, {
      cors: false,
      pageOrigin: page,
      jar: browser.jar,
    }).fetch;
    pages.set(page, created);
    return created;
  };
  return {
    send: async (request) =>
      answerOf(await pageFetch(request.page)(`${server.url}${request.path}`, initOf(request))),
    refreshCookie: () => browser.jar.get(REFRESH_COOKIE)?.value,
    resetCode: (email) => linkParameter(backend, email, "code"),
    confirmation: (email) => linkParameter(backend, email, "confirmation"),
  };
};

/** The fake, set up as `server` is by cms/scripts/live-backend.js. */
export const fakeTarget = (backend: LiveBackend, server: LiveServer): ProbeTarget => {
  const api = createFakeIdentityApi({
    baseUrl: server.url,
    clock: systemClock,
    sessions: "refresh",
    emailConfirmation: server.emailConfirmation,
    throttlePerMinute: server.throttlePerMinute,
    addressThrottlePerMinute: server.addressThrottlePerMinute,
    refreshThrottlePerMinute: server.refreshThrottlePerMinute,
    allowedOrigins: [backend.siteOrigin],
  });
  return {
    send: async (request) => {
      const init = initOf(request);
      const headers = new Headers(init.headers);
      headers.set("Origin", request.page ?? backend.siteOrigin);
      return answerOf(await api.fetch(`${server.url}${request.path}`, { ...init, headers }));
    },
    refreshCookie: () => api.refreshCookie(),
    resetCode: (email) => api.findUser(email)?.resetCode ?? "",
    confirmation: (email) => api.findUser(email)?.confirmationCode ?? "",
  };
};

/** Each step's name and the gap it is expected to show, for the test titles. */
export const stepsOf = (scenario: Scenario): readonly Pick<Step, "name" | "gap">[] =>
  scenario.steps.map(({ name, gap }) => (gap === undefined ? { name } : { name, gap }));

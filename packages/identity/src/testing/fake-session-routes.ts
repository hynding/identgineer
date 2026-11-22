import { loginAnswer } from "./fake-auth-routes.ts";
import { applicationError, notFound, ok, strapiError, type FakeResponse } from "./fake-http.ts";
import type { FakeRoute, RouteContext } from "./fake-route.ts";

/** The provider round trip's session cookie, which the fake keeps its grant under. */
export const PROVIDER_SESSION_COOKIE = "laravel_session";

const presented = (context: RouteContext): string | undefined => {
  const cookie = context.cookies.get(context.settings.refreshCookieName);
  if (cookie !== undefined && cookie !== "") return cookie;
  const token = context.jsonBody().refreshToken;
  return typeof token === "string" && token !== "" ? token : undefined;
};

const refresh: FakeRoute = {
  method: "POST",
  path: /^\/api\/auth\/refresh$/,
  guest: true,
  refreshOnly: true,
  handle: (context) => {
    // Only a refresh that rotates nothing takes a turn, so a valid token is never refused.
    const failed = (answer: FakeResponse): FakeResponse =>
      context.refuseFailure("refresh") ?? answer;
    if (context.cookies.has(context.settings.refreshCookieName) && !context.fromOwnPage()) {
      return failed(
        strapiError(403, "ForbiddenError", "The refresh cookie is not accepted from this origin"),
      );
    }
    const token = presented(context);
    if (token === undefined) {
      return failed(strapiError(400, "BadRequestError", "Missing refresh token"));
    }
    const tokens = context.store.rotate(token);
    if (tokens === undefined) {
      return failed(strapiError(401, "UnauthorizedError", "Invalid refresh token"));
    }
    return context.tokenAnswer(tokens);
  },
};

const logout: FakeRoute = {
  method: "POST",
  path: /^\/api\/auth\/logout$/,
  authenticated: true,
  refreshOnly: true,
  handle: (context) => {
    const { store } = context;
    const user = context.user();
    const body = context.jsonBody();
    const cookieSession = store.sessionOf(presented(context));
    if (body.scope === "all") {
      store.invalidate(user.id);
    } else if (typeof body.deviceId === "string" && body.deviceId !== "") {
      store.invalidate(user.id, body.deviceId);
    } else {
      // The access token names the caller's own session; the cookie may be another tab's. A
      // token naming none, or a session already gone, ends itself alone.
      const session = context.currentSession();
      if (session === undefined || !store.revoke(user.id, session)) context.dropAccessToken();
    }
    // The cookie is cleared only when its session was the one ended, or was unusable already.
    const cookieEnded = cookieSession === undefined || !store.sessionExists(cookieSession);
    const cookies =
      context.cookieMode() && cookieEnded
        ? [{ name: context.settings.refreshCookieName, value: null }]
        : [];
    return ok({ ok: true }, { cookies });
  },
};

const sessions: FakeRoute = {
  method: "GET",
  path: /^\/api\/auth\/sessions$/,
  authenticated: true,
  refreshOnly: true,
  handle: (context) => {
    const current = context.currentSession();
    const data = context.store
      .activeSessions(context.user().id)
      .map((session) => ({
        id: session.sessionId,
        ...(session.deviceId === null ? {} : { deviceId: session.deviceId }),
        ...(session.deviceName === null ? {} : { deviceName: session.deviceName }),
        current: session.sessionId === current,
        loginAt: session.loginAt,
        lastActiveAt: session.createdAt,
      }))
      // camis' order: the current session, then the latest used (a stable sort keeps ties in order).
      .sort(
        (a, b) =>
          Number(b.current) - Number(a.current) || b.lastActiveAt.localeCompare(a.lastActiveAt),
      );
    return ok({ data });
  },
};

const revoke: FakeRoute = {
  method: "DELETE",
  path: /^\/api\/auth\/sessions\/([^/]+)$/,
  authenticated: true,
  refreshOnly: true,
  handle: (context) => {
    const sessionId = decodeURIComponent(context.params[0] ?? "");
    if (!context.store.revoke(context.user().id, sessionId)) return notFound("Session not found");
    return ok({ data: {} });
  },
};

const providerEnabled = (context: RouteContext, provider: string): FakeResponse | undefined =>
  context.settings.providers.includes(provider)
    ? undefined
    : applicationError("This provider is disabled");

const connect: FakeRoute = {
  method: "GET",
  path: /^\/api\/connect\/([^/]+)$/,
  guest: true,
  throttled: "provider",
  handle: (context) => {
    const provider = decodeURIComponent(context.params[0] ?? "");
    return (
      providerEnabled(context, provider) ?? {
        status: 302,
        headers: { Location: `https://${provider}.example/authorize?state=fake` },
      }
    );
  },
};

const providerCallback: FakeRoute = {
  method: "GET",
  path: /^\/api\/auth\/([^/]+)\/callback$/,
  guest: true,
  throttled: "sign-in",
  handle: (context) => {
    const provider = decodeURIComponent(context.params[0] ?? "");
    const disabled = providerEnabled(context, provider);
    if (disabled !== undefined) return disabled;
    const grant = context.cookies.get(PROVIDER_SESSION_COOKIE);
    const [grantProvider, email] = grant?.split(":", 2) ?? [];
    if (grantProvider !== provider || email === undefined) {
      return applicationError("OAuth authentication requires a completed provider session");
    }
    const { store } = context;
    const user =
      store.findUser((candidate) => candidate.email === email && candidate.provider === provider) ??
      store.addUser({
        username: email.split("@")[0] ?? email,
        email,
        password: null,
        provider,
        confirmed: true,
        blocked: false,
      });
    if (user.blocked) {
      return applicationError("Your account has been blocked by an administrator");
    }
    return loginAnswer(context, user);
  },
};

export const SESSION_ROUTES: readonly FakeRoute[] = [
  refresh,
  logout,
  sessions,
  revoke,
  connect,
  providerCallback,
];

import {
  applicationError,
  ok,
  strapiError,
  validationError,
  type FakeResponse,
  type FieldError,
} from "./fake-http.ts";
import type { FakeRoute, RouteContext } from "./fake-route.ts";
import type { FakeUser, IssuedTokens } from "./fake-store.ts";

type Rule = "required" | "email" | "maxPassword" | `same:${string}`;

const MESSAGES: Readonly<Record<string, (field: string) => string>> = {
  required: (field) => `${field} is a required field`,
  email: (field) => `${field} must be a valid email`,
  maxPassword: () => "Password must be less than 73 bytes",
  same: () => "Passwords do not match",
};

const present = (value: unknown): boolean => value !== undefined && value !== null && value !== "";

const fails = (body: Readonly<Record<string, unknown>>, field: string, rule: Rule): boolean => {
  const value = body[field];
  if (rule === "required") return !present(value);
  if (rule === "email") return present(value) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value));
  if (rule === "maxPassword") return typeof value === "string" && value.length > 72;
  return present(value) && value !== body[rule.slice("same:".length)];
};

/** users-permissions' body validation, with its messages and field paths. */
export const validate = (
  body: Readonly<Record<string, unknown>>,
  rules: Readonly<Record<string, readonly Rule[]>>,
): FakeResponse | undefined => {
  const errors: FieldError[] = [];
  for (const [field, checks] of Object.entries(rules)) {
    const failed = checks.find((rule) => fails(body, field, rule));
    if (failed === undefined) continue;
    const message = MESSAGES[failed.startsWith("same:") ? "same" : failed]?.(field) ?? "";
    errors.push({ field, message });
  }
  return errors.length === 0 ? undefined : validationError(errors);
};

const text = (value: unknown): string => (typeof value === "string" ? value : "");

/** A login's answer: the refresh token in the body, or in a cookie when one is asked for. */
export const loginAnswer = (context: RouteContext, user: FakeUser): FakeResponse => {
  const { store, settings, request } = context;
  const wire = { user: store.wire(user) };
  if (settings.sessions === "legacy") return ok({ jwt: store.lastingToken(user.id), ...wire });
  const deviceId = text((request.body as { deviceId?: unknown } | undefined)?.deviceId);
  const tokens = store.openSession(user.id, deviceId === "" ? null : deviceId, "Firefox on Linux");
  return context.tokenAnswer(tokens, wire);
};

const reissue = (context: RouteContext, user: FakeUser): FakeResponse => {
  const { store, settings } = context;
  const wire = { user: store.wire(user) };
  if (settings.sessions === "legacy") {
    store.dropLastingTokens(user.id);
    return ok({ jwt: store.lastingToken(user.id), ...wire });
  }
  store.invalidate(user.id);
  const tokens: IssuedTokens = store.openSession(user.id, `device${String(store.next())}`, null);
  return ok({ ...tokens, ...wire });
};

const byEmail = (context: RouteContext, email: unknown): FakeUser | undefined =>
  context.store.findUser((user) => user.email === text(email).toLowerCase());

const register: FakeRoute = {
  method: "POST",
  path: /^\/api\/auth\/local\/register$/,
  guest: true,
  throttled: "register",
  handle: (context) => {
    const { store, settings } = context;
    const body = context.jsonBody();
    const invalid = Object.keys(body).filter(
      (key) => !["username", "email", "password"].includes(key),
    );
    if (invalid.length > 0) {
      return strapiError(400, "ValidationError", `Invalid parameters: ${invalid.join(", ")}`);
    }
    const failure = validate(body, {
      email: ["required", "email"],
      username: ["required"],
      password: ["required", "maxPassword"],
    });
    if (failure !== undefined) return failure;
    const email = text(body.email).toLowerCase();
    const username = text(body.username);
    const taken = store.findUser((user) =>
      [email, username].some((name) => user.email === name || user.username === name),
    );
    if (taken !== undefined) return applicationError("Email or Username are already taken");
    const user = store.addUser({
      username,
      email,
      password: text(body.password),
      provider: "local",
      confirmed: !settings.emailConfirmation,
      blocked: false,
    });
    if (settings.emailConfirmation) {
      user.confirmationCode = `confirm${String(store.next())}`;
      return ok({ user: store.wire(user) });
    }
    if (settings.sessions === "legacy") {
      return ok({ jwt: store.lastingToken(user.id), user: store.wire(user) });
    }
    const tokens = store.openSession(user.id, `device${String(store.next())}`, null);
    return ok({ ...tokens, user: store.wire(user) });
  },
};

const login: FakeRoute = {
  method: "POST",
  path: /^\/api\/auth\/local$/,
  guest: true,
  throttled: "sign-in",
  handle: (context) => {
    const body = context.jsonBody();
    const failure = validate(body, { identifier: ["required"], password: ["required"] });
    if (failure !== undefined) return failure;
    const identifier = text(body.identifier);
    const user = context.store.findUser(
      (candidate) =>
        candidate.provider === "local" &&
        (candidate.email === identifier.toLowerCase() || candidate.username === identifier),
    );
    if (user?.password == null || user.password !== body.password) {
      return strapiError(400, "ValidationError", "Invalid identifier or password");
    }
    if (context.settings.emailConfirmation && !user.confirmed) {
      return applicationError("Your account email is not confirmed");
    }
    if (user.blocked) return applicationError("Your account has been blocked by an administrator");
    return loginAnswer(context, user);
  },
};

const forgotPassword: FakeRoute = {
  method: "POST",
  path: /^\/api\/auth\/forgot-password$/,
  guest: true,
  throttled: "recovery",
  handle: (context) => {
    const body = context.jsonBody();
    const failure = validate(body, { email: ["required", "email"] });
    if (failure !== undefined) return failure;
    const user = byEmail(context, body.email);
    if (user !== undefined && !user.blocked)
      user.resetCode = `reset${String(context.store.next())}`;
    return ok({ ok: true });
  },
};

const resetPassword: FakeRoute = {
  method: "POST",
  path: /^\/api\/auth\/reset-password$/,
  guest: true,
  throttled: "recovery",
  handle: (context) => {
    const body = context.jsonBody();
    const failure = validate(body, {
      password: ["required", "maxPassword"],
      passwordConfirmation: ["required", "same:password"],
      code: ["required"],
    });
    if (failure !== undefined) return failure;
    const user = context.store.findUser((candidate) => candidate.resetCode === body.code);
    if (user === undefined) return strapiError(400, "ValidationError", "Incorrect code provided");
    delete user.resetCode;
    user.password = text(body.password);
    return reissue(context, user);
  },
};

const emailConfirmation: FakeRoute = {
  method: "GET",
  path: /^\/api\/auth\/email-confirmation$/,
  guest: true,
  handle: (context) => {
    const code = context.request.query.get("confirmation") ?? "";
    const failure = validate({ confirmation: code }, { confirmation: ["required"] });
    if (failure !== undefined) return failure;
    const user = context.store.findUser((candidate) => candidate.confirmationCode === code);
    if (user === undefined) return strapiError(400, "ValidationError", "Invalid token");
    user.confirmed = true;
    delete user.confirmationCode;
    return { status: 302, headers: { Location: "/" } };
  },
};

const sendEmailConfirmation: FakeRoute = {
  method: "POST",
  path: /^\/api\/auth\/send-email-confirmation$/,
  guest: true,
  throttled: "confirmation",
  handle: (context) => {
    const body = context.jsonBody();
    const failure = validate(body, { email: ["required", "email"] });
    if (failure !== undefined) return failure;
    const user = byEmail(context, body.email);
    if (user === undefined) return ok({ email: body.email, sent: true });
    if (user.confirmed) return applicationError("Already confirmed");
    if (user.blocked) return applicationError("User blocked");
    user.confirmationCode = `confirm${String(context.store.next())}`;
    return ok({ email: user.email, sent: true });
  },
};

const changePassword: FakeRoute = {
  method: "POST",
  path: /^\/api\/auth\/change-password$/,
  throttled: "password-change",
  authenticated: true,
  handle: (context) => {
    const user = context.user();
    const body = context.jsonBody();
    const failure = validate(body, {
      password: ["required", "maxPassword"],
      passwordConfirmation: ["required", "same:password"],
      currentPassword: ["required"],
    });
    if (failure !== undefined) return failure;
    if (body.currentPassword !== user.password) {
      return strapiError(400, "ValidationError", "The provided current password is invalid");
    }
    if (body.currentPassword === body.password) {
      return strapiError(
        400,
        "ValidationError",
        "Your new password must be different than your current password",
      );
    }
    user.password = text(body.password);
    return reissue(context, user);
  },
};

const me: FakeRoute = {
  method: "GET",
  path: /^\/api\/users\/me$/,
  authenticated: true,
  handle: (context) => ok(context.store.wire(context.user())),
};

export const AUTH_ROUTES: readonly FakeRoute[] = [
  register,
  login,
  forgotPassword,
  resetPassword,
  emailConfirmation,
  sendEmailConfirmation,
  changePassword,
  me,
];

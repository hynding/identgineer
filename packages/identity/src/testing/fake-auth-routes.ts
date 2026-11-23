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

type Rule = "string" | "required" | "email" | "maxPassword" | `max:${number}` | `same:${string}`;

/** yup's printed value, as camis quotes it in a type error. */
const printed = (value: unknown): string =>
  typeof value === "string" ? `"${value}"` : JSON.stringify(value);

const messageOf = (rule: Rule, field: string, value: unknown): string => {
  if (rule === "string") {
    return `${field} must be a \`string\` type, but the final value was: \`${printed(value)}\`.`;
  }
  if (rule === "required") return `${field} is a required field`;
  if (rule === "email") return `${field} must be a valid email`;
  if (rule === "maxPassword") return "Password must be less than 73 bytes";
  if (rule.startsWith("max:")) return `${field} must be at most ${rule.slice(4)} characters`;
  return "Passwords do not match";
};

const present = (value: unknown): boolean => value !== undefined && value !== null && value !== "";

// mb_strlen: code points, not UTF-16 units.
const characters = (value: string): number => Array.from(value).length;

const fails = (body: Readonly<Record<string, unknown>>, field: string, rule: Rule): boolean => {
  const value = body[field];
  // Strapi validates strictly: a number, boolean or null is no string either.
  if (rule === "string") return Object.hasOwn(body, field) && typeof value !== "string";
  if (rule === "required") return !present(value);
  if (rule === "email") return present(value) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value));
  // bcrypt reads at most 72 bytes, so the limit counts bytes, not characters.
  if (rule === "maxPassword") {
    return typeof value === "string" && new TextEncoder().encode(value).length > 72;
  }
  if (rule.startsWith("max:")) {
    return typeof value === "string" && characters(value) > Number(rule.slice(4));
  }
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
    errors.push({ field, message: messageOf(failed, field, body[field]) });
  }
  return errors.length === 0 ? undefined : validationError(errors);
};

// camis' AuthController::MAX_IDENTIFIER_LENGTH.
const MAX_IDENTIFIER_LENGTH = 255;

const text = (value: unknown): string => (typeof value === "string" ? value : "");

/** The device name camis derives from the user agent of the browser the fake stands in for. */
const BROWSER_DEVICE = { deviceName: "Firefox on Linux" };

/** A login's answer: the refresh token in the body, or in a cookie when one is asked for. */
export const loginAnswer = (context: RouteContext, user: FakeUser): FakeResponse => {
  const { store, settings, request } = context;
  const wire = { user: store.wire(user) };
  if (settings.sessions === "legacy") return ok({ jwt: store.lastingToken(user.id), ...wire });
  const deviceId = text((request.body as { deviceId?: unknown } | undefined)?.deviceId);
  const tokens = store.openSession(user.id, deviceId === "" ? null : deviceId, BROWSER_DEVICE);
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
  // camis records no metadata for the session a password change or reset opens.
  const tokens: IssuedTokens = store.openSession(user.id, `device${String(store.next())}`, null);
  return ok({ ...tokens, ...wire });
};

/**
 * camis' StrapiRateLimits::folded: PHP's trim, compatibility decomposition, combining marks
 * stripped, case folded (upper then lower stands in for PHP's full case folding, ß to ss).
 * A fullwidth or small "@" folds to "@".
 */
const folded = (name: string): string =>
  name
    .replace(/^[ \t\n\r\0\v]+|[ \t\n\r\0\v]+$/g, "")
    .normalize("NFKD")
    .replace(/\p{Mn}+/gu, "")
    .toUpperCase()
    .toLowerCase();

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
      email: ["string", "required", "email", "max:255"],
      username: ["string", "required", "max:255"],
      password: ["string", "required", "maxPassword"],
    });
    if (failure !== undefined) return failure;
    const email = text(body.email).toLowerCase();
    const username = text(body.username);
    const foldedUsername = folded(username);
    if (
      settings.hideAccountExistence &&
      foldedUsername.includes("@") &&
      foldedUsername !== folded(email)
    ) {
      return strapiError(
        400,
        "ValidationError",
        "username must not be an email address other than the one registering",
      );
    }
    const taken = store.findUser((user) =>
      [email, username].some((name) => user.email === name || user.username === name),
    );
    // With confirmation on a new account's answer carries nothing of it, so a taken one can be
    // answered alike (and told by mail); without it the new account's session cannot be faked.
    const hidden = settings.emailConfirmation && settings.hideAccountExistence;
    if (taken !== undefined) {
      return hidden
        ? ok({ email, sent: true })
        : applicationError("Email or Username are already taken");
    }
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
      return hidden ? ok({ email, sent: true }) : ok({ user: store.wire(user) });
    }
    if (settings.sessions === "legacy") {
      return ok({ jwt: store.lastingToken(user.id), user: store.wire(user) });
    }
    const tokens = store.openSession(user.id, `device${String(store.next())}`, BROWSER_DEVICE);
    return ok({ ...tokens, user: store.wire(user) });
  },
};

const login: FakeRoute = {
  method: "POST",
  path: /^\/api\/auth\/local$/,
  guest: true,
  throttled: "sign-in",
  validates: (context) => {
    const body = context.jsonBody();
    const failure = validate(body, {
      identifier: ["string", "required"],
      password: ["string", "required"],
    });
    if (failure !== undefined) return failure;
    // Longer than any account's name: refused before a turn is taken or a lookup made.
    return characters(text(body.identifier)) > MAX_IDENTIFIER_LENGTH
      ? strapiError(400, "ValidationError", "Invalid identifier or password")
      : undefined;
  },
  handle: (context) => {
    const body = context.jsonBody();
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
  validates: (context) => validate(context.jsonBody(), { email: ["string", "required", "email"] }),
  handle: (context) => {
    const body = context.jsonBody();
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
  throttled: "password-reset",
  handle: (context) => {
    const body = context.jsonBody();
    const failure = validate(body, {
      password: ["string", "required", "maxPassword"],
      passwordConfirmation: ["string", "required", "same:password"],
      code: ["string", "required"],
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
    const failure = validate({ confirmation: code }, { confirmation: ["string", "required"] });
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
  validates: (context) => validate(context.jsonBody(), { email: ["string", "required", "email"] }),
  handle: (context) => {
    const body = context.jsonBody();
    const user = byEmail(context, body.email);
    if (context.settings.hideAccountExistence) {
      if (user !== undefined && !user.confirmed && !user.blocked) {
        user.confirmationCode = `confirm${String(context.store.next())}`;
      }
      return ok({ email: text(body.email).toLowerCase(), sent: true });
    }
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
      password: ["string", "required", "maxPassword"],
      passwordConfirmation: ["string", "required", "same:password"],
      currentPassword: ["string", "required"],
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

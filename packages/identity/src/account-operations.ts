import type { ClientContext } from "./client-context.ts";
import { signInFrom, tokensOf } from "./credential-operations.ts";
import { IdentityError } from "./identity-error.ts";
import { errorName, failureOf, fieldsOf } from "./map-error.ts";
import { isEmail, isFilled, isPassword, requireValid } from "./input-checks.ts";
import { readAuthResponse } from "./shapes.ts";
import type { ApiResponse } from "./transport.ts";
import type { IdentityUser } from "./types.ts";

export interface RegisterInput {
  readonly username: string;
  readonly email: string;
  readonly password: string;
}

/**
 * `check-email` is the neutral answer: a new account waiting for confirmation and an address or
 * username already taken look the same. `signed-in` comes only from a backend that confirms no
 * addresses, where a new account is signed in at once.
 */
export type RegisterResult =
  | { readonly outcome: "check-email" }
  | { readonly outcome: "signed-in"; readonly user: IdentityUser };

/** The same answer whether or not an account exists for the address. */
export interface RequestAccepted {
  readonly outcome: "accepted";
}

export interface EmailInput {
  readonly email: string;
}

export interface ResetPasswordInput {
  /** The code from the reset email. */
  readonly code: string;
  readonly password: string;
  readonly passwordConfirmation: string;
}

export interface ConfirmEmailInput {
  /** The token from the confirmation email. */
  readonly confirmation: string;
}

export interface ChangePasswordInput {
  readonly currentPassword: string;
  readonly password: string;
  readonly passwordConfirmation: string;
}

const CHECK_EMAIL: RegisterResult = Object.freeze({ outcome: "check-email" });
const ACCEPTED: RequestAccepted = Object.freeze({ outcome: "accepted" });
const REGISTER_FIELDS = ["username", "email", "password"] as const;

const isApplicationError = (response: ApiResponse): boolean =>
  response.status === 400 && errorName(response) === "ApplicationError";

/** A validation error without field errors is the backend refusing a code or a password. */
const isRefusedSecret = (response: ApiResponse): boolean =>
  response.status === 400 &&
  errorName(response) === "ValidationError" &&
  fieldsOf(response).length === 0;

export const register =
  (context: ClientContext) =>
  async (input: RegisterInput): Promise<RegisterResult> => {
    requireValid(
      {
        username: isFilled(input.username),
        email: isEmail(input.email),
        password: isPassword(input.password),
      },
      { nameFields: true },
    );
    const response = await context.credentialRequest({
      method: "POST",
      path: "/api/auth/local/register",
      body: { username: input.username, email: input.email, password: input.password },
    });
    // users-permissions answers a taken address or username with an ApplicationError, and so
    // does a failed confirmation email: both become the neutral answer.
    if (isApplicationError(response)) return CHECK_EMAIL;
    if (!response.ok) throw failureOf(response, context.clock.now(), REGISTER_FIELDS);
    const auth = readAuthResponse(response.body);
    if (tokensOf(context, auth) === undefined) return CHECK_EMAIL;
    return { outcome: "signed-in", user: signInFrom(context, response) };
  };

/**
 * An email request that must not tell whether the account exists: a refusal about the account
 * (already confirmed, blocked) and a server failure that only an existing account reaches (its
 * email could not be sent) both resolve like a success.
 */
const neutralEmailRequest =
  (context: ClientContext, path: string) =>
  async (input: EmailInput): Promise<RequestAccepted> => {
    requireValid({ email: isEmail(input.email) }, { nameFields: false });
    const response = await context.credentialRequest({
      method: "POST",
      path,
      body: { email: input.email },
    });
    if (response.ok || isApplicationError(response) || response.status >= 500) return ACCEPTED;
    throw failureOf(response, context.clock.now());
  };

export const requestPasswordReset = (context: ClientContext) =>
  neutralEmailRequest(context, "/api/auth/forgot-password");

export const resendConfirmation = (context: ClientContext) =>
  neutralEmailRequest(context, "/api/auth/send-email-confirmation");

export const resetPassword =
  (context: ClientContext) =>
  async (input: ResetPasswordInput): Promise<IdentityUser> => {
    requireValid(
      {
        code: isFilled(input.code),
        password: isPassword(input.password),
        passwordConfirmation: input.password === input.passwordConfirmation,
      },
      { nameFields: false },
    );
    const response = await context.credentialRequest({
      method: "POST",
      path: "/api/auth/reset-password",
      body: {
        code: input.code,
        password: input.password,
        passwordConfirmation: input.passwordConfirmation,
      },
    });
    if (isRefusedSecret(response)) throw new IdentityError("invalid-credentials");
    if (!response.ok) throw failureOf(response, context.clock.now());
    return signInFrom(context, response);
  };

/**
 * Confirms an address. users-permissions serves this as a GET that redirects; the redirect is
 * not followed, so the answer's location never matters here.
 */
export const confirmEmail =
  (context: ClientContext) =>
  async (input: ConfirmEmailInput): Promise<void> => {
    requireValid({ confirmation: isFilled(input.confirmation) }, { nameFields: false });
    const response = await context.transport.send({
      method: "GET",
      path: `/api/auth/email-confirmation?confirmation=${encodeURIComponent(input.confirmation)}`,
      redirect: "manual",
    });
    if (response.ok) return;
    if (response.status === 400) throw new IdentityError("invalid-credentials");
    throw failureOf(response, context.clock.now());
  };

export const changePassword =
  (context: ClientContext) =>
  async (input: ChangePasswordInput): Promise<void> => {
    requireValid(
      {
        currentPassword: isFilled(input.currentPassword),
        password: isPassword(input.password) && input.password !== input.currentPassword,
        passwordConfirmation: input.password === input.passwordConfirmation,
      },
      { nameFields: false },
    );
    context.throttle.check();
    const response = await context.authorizedRequest({
      method: "POST",
      path: "/api/auth/change-password",
      body: {
        currentPassword: input.currentPassword,
        password: input.password,
        passwordConfirmation: input.passwordConfirmation,
      },
    });
    if (isRefusedSecret(response)) {
      context.throttle.signInFailed();
      throw new IdentityError("invalid-credentials");
    }
    if (!response.ok) throw failureOf(response, context.clock.now());
    // Every session of the account ended on the server; this answer carries the new one.
    signInFrom(context, response);
  };

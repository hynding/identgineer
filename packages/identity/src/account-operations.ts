import type { ClientContext } from "./client-context.ts";
import { queuedSignIn, signInFrom, tokensOf } from "./credential-operations.ts";
import { IdentityError } from "./identity-error.ts";
import { errorName, failureOf, fieldsOf } from "./map-error.ts";
import {
  MAX_CODE_CHARACTERS,
  MAX_NAME_CHARACTERS,
  isCheckedPassword,
  isEmail,
  isFilled,
  isPassword,
  isTextWithin,
  requireObject,
  requireValid,
} from "./input-checks.ts";
import { readAuthResponse, readErrorEnvelope } from "./shapes.ts";
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

// camis refuses a username naming another address (looked up as one) by message alone.
const USERNAME_IS_ADDRESS = "username must not be an email address other than the one registering";

/** camis' answer to every registration with accounts hidden and confirmation on. */
const isNeutralRegistration = (body: unknown): boolean =>
  typeof body === "object" &&
  body !== null &&
  (body as { sent?: unknown }).sent === true &&
  !Object.hasOwn(body, "jwt") &&
  !Object.hasOwn(body, "user");

/** A validation error without field errors is the backend refusing a code or a password. */
const isRefusedSecret = (response: ApiResponse): boolean =>
  response.status === 400 &&
  errorName(response) === "ValidationError" &&
  fieldsOf(response).length === 0;

export const register =
  (context: ClientContext) =>
  async (input: RegisterInput): Promise<RegisterResult> => {
    requireObject(input);
    requireValid(
      {
        username: isFilled(input.username) && isTextWithin(input.username, MAX_NAME_CHARACTERS),
        email: isEmail(input.email),
        password: isPassword(input.password),
      },
      { nameFields: true },
    );
    return queuedSignIn(context, async (ticket) => {
      const response = await context.credentialRequest({
        method: "POST",
        path: "/api/auth/local/register",
        body: { username: input.username, email: input.email, password: input.password },
      });
      // With accounts hidden camis answers every address `{email, sent: true}`. Without, Strapi's
      // answers: a taken address or username, or a failed confirmation email, is an
      // ApplicationError, which becomes the same neutral answer.
      if (response.ok && isNeutralRegistration(response.body)) return CHECK_EMAIL;
      if (isApplicationError(response)) return CHECK_EMAIL;
      if (
        response.status === 400 &&
        errorName(response) === "ValidationError" &&
        readErrorEnvelope(response.body)?.message === USERNAME_IS_ADDRESS
      ) {
        throw new IdentityError("validation", { fields: ["username"] });
      }
      if (!response.ok) throw failureOf(response, context.clock.now(), REGISTER_FIELDS);
      const auth = readAuthResponse(response.body);
      if (tokensOf(context, auth) === undefined) return CHECK_EMAIL;
      return { outcome: "signed-in", user: await signInFrom(context, response, ticket) };
    });
  };

/**
 * An email request that must not tell whether the account exists: a refusal about the account
 * (already confirmed, blocked) and a server failure that only an existing account reaches (its
 * email could not be sent) both resolve like a success.
 */
const neutralEmailRequest =
  (context: ClientContext, path: string) =>
  async (input: EmailInput): Promise<RequestAccepted> => {
    requireObject(input);
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
    requireObject(input);
    requireValid(
      {
        code: isFilled(input.code) && isTextWithin(input.code, MAX_CODE_CHARACTERS),
        password: isPassword(input.password),
        passwordConfirmation: input.password === input.passwordConfirmation,
      },
      { nameFields: false },
    );
    return queuedSignIn(context, async (ticket) => {
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
      return signInFrom(context, response, ticket);
    });
  };

/**
 * Confirms an address. users-permissions serves this as a GET that redirects; the redirect is
 * not followed, so the answer's location never matters here.
 */
export const confirmEmail =
  (context: ClientContext) =>
  async (input: ConfirmEmailInput): Promise<void> => {
    requireObject(input);
    requireValid(
      {
        confirmation:
          isFilled(input.confirmation) && isTextWithin(input.confirmation, MAX_CODE_CHARACTERS),
      },
      { nameFields: false },
    );
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
    requireObject(input);
    requireValid(
      {
        currentPassword:
          isFilled(input.currentPassword) && isCheckedPassword(input.currentPassword),
        password: isPassword(input.password) && input.password !== input.currentPassword,
        passwordConfirmation: input.password === input.passwordConfirmation,
      },
      { nameFields: false },
    );
    context.throttle.check();
    // It opens a new session, so it takes its turn like a sign-in: a sign-out waits for it.
    const ticket = context.session.ticket("session");
    return context.exclusive(async () => {
      if (!context.session.valid(ticket)) throw new IdentityError("unauthorized");
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
      await signInFrom(context, response, ticket);
    });
  };

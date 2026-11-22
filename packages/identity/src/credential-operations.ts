import type { ClientContext } from "./client-context.ts";
import { IdentityError } from "./identity-error.ts";
import { errorName } from "./map-error.ts";
import { readErrorEnvelope, readAuthResponse, type AuthResponse } from "./shapes.ts";
import type { Ticket, Tokens } from "./session.ts";
import { tokensFrom } from "./tokens.ts";
import type { ApiResponse } from "./transport.ts";
import type { IdentityUser } from "./types.ts";

// users-permissions discloses this only once the password was right, so it may be passed on.
const NOT_CONFIRMED = "Your account email is not confirmed";

export interface SignInInput {
  /** The account's email address or username. */
  readonly identifier: string;
  readonly password: string;
}

export const tokensOf = (context: ClientContext, auth: AuthResponse): Tokens | undefined =>
  tokensFrom(auth, { fallbackMs: context.tokenLifetimeMs, now: context.clock.now() });

/**
 * Signs in from a token answer that must carry a user, and returns the user, if nothing has
 * cancelled the operation meanwhile (`ticket`).
 */
export const signInFrom = async (
  context: ClientContext,
  response: ApiResponse,
  ticket: Ticket,
): Promise<IdentityUser> => {
  const auth = readAuthResponse(response.body);
  const tokens = tokensOf(context, auth);
  if (tokens === undefined || auth.user === undefined) throw new IdentityError("unknown");
  await context.acceptSignIn(tokens, auth.user, ticket);
  return auth.user;
};

const signInFailure = (context: ClientContext, response: ApiResponse): IdentityError => {
  if (response.status >= 500) return new IdentityError("unknown");
  const envelope = readErrorEnvelope(response.body);
  if (errorName(response) === "ApplicationError" && envelope?.message === NOT_CONFIRMED) {
    return new IdentityError("email-not-confirmed");
  }
  if ([400, 401, 403].includes(response.status)) {
    context.throttle.signInFailed();
    return new IdentityError("invalid-credentials");
  }
  return new IdentityError("unknown");
};

/**
 * Runs a sign-in in its turn with the ticket taken now, when it is asked for: a sign-out made
 * before its turn comes cancels it without a request.
 */
export const queuedSignIn = <T>(
  context: ClientContext,
  task: (ticket: Ticket) => Promise<T>,
): Promise<T> => {
  const ticket = context.session.ticket("sign-in");
  context.noteSignIn();
  return context.exclusive(() => {
    if (!context.session.valid(ticket)) {
      return Promise.reject(new IdentityError(context.isActive() ? "unauthorized" : "unknown"));
    }
    return task(ticket);
  });
};

export const signIn =
  (context: ClientContext) =>
  (input: SignInInput): Promise<IdentityUser> =>
    queuedSignIn(context, async (ticket) => {
      const response = await context.credentialRequest({
        method: "POST",
        path: "/api/auth/local",
        body: { identifier: input.identifier, password: input.password },
        cookie: true,
      });
      if (!response.ok) throw signInFailure(context, response);
      const user = await signInFrom(context, response, ticket);
      context.throttle.signInSucceeded();
      // The refresh cookie every tab shares now names this session: let the others re-check.
      context.crossTab.announce("signed-in");
      return user;
    });

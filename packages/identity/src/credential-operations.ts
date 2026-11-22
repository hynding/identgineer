import type { ClientContext } from "./client-context.ts";
import { IdentityError } from "./identity-error.ts";
import { errorName } from "./map-error.ts";
import { readErrorEnvelope, readAuthResponse, type AuthResponse } from "./shapes.ts";
import type { Tokens } from "./session.ts";
import type { ApiResponse } from "./transport.ts";
import type { IdentityUser } from "./types.ts";

// users-permissions discloses this only once the password was right, so it may be passed on.
const NOT_CONFIRMED = "Your account email is not confirmed";

export interface SignInInput {
  /** The account's email address or username. */
  readonly identifier: string;
  readonly password: string;
}

export const tokensOf = (auth: AuthResponse): Tokens | undefined => {
  if (auth.accessToken === undefined) return undefined;
  return auth.refreshToken === undefined
    ? { accessToken: auth.accessToken }
    : { accessToken: auth.accessToken, refreshToken: auth.refreshToken };
};

/** Signs in from a token answer that must carry a user, and returns the user. */
export const signInFrom = (context: ClientContext, response: ApiResponse): IdentityUser => {
  const auth = readAuthResponse(response.body);
  const tokens = tokensOf(auth);
  if (tokens === undefined || auth.user === undefined) throw new IdentityError("unknown");
  context.signedIn(tokens, auth.user);
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

export const signIn =
  (context: ClientContext) =>
  async (input: SignInInput): Promise<IdentityUser> => {
    const response = await context.credentialRequest({
      method: "POST",
      path: "/api/auth/local",
      body: { identifier: input.identifier, password: input.password },
      cookie: true,
    });
    if (!response.ok) throw signInFailure(context, response);
    const user = signInFrom(context, response);
    context.throttle.signInSucceeded();
    return user;
  };

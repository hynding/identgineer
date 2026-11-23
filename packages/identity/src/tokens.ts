import type { Tokens } from "./session.ts";
import type { AuthResponse } from "./shapes.ts";
import { tokenLifetime } from "./token-lifetime.ts";

/** The tokens of an answer, with the access token's lifetime from now; undefined without one. */
export const tokensFrom = (
  auth: AuthResponse,
  options: { readonly fallbackMs: number; readonly now: number },
): Tokens | undefined => {
  const { accessToken, refreshToken } = auth;
  if (accessToken === undefined) return undefined;
  const lifetime = tokenLifetime(
    {
      accessToken,
      ...(auth.expiresIn === undefined ? {} : { expiresIn: auth.expiresIn }),
      ...(auth.expiresAt === undefined ? {} : { expiresAt: auth.expiresAt }),
    },
    options,
  );
  const expiresAt = options.now + lifetime.ms;
  return refreshToken === undefined
    ? { accessToken, lifetime, expiresAt }
    : { accessToken, refreshToken, lifetime, expiresAt };
};

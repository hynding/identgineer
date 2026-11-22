import { endpointUrl, isSecureOrLocal } from "./base-url.ts";
import type { ClientContext } from "./client-context.ts";
import { queuedSignIn, signInFrom } from "./credential-operations.ts";
import { providerSegment } from "./identifiers.ts";
import { IdentityError } from "./identity-error.ts";
import { isOptional, requireObject } from "./input-checks.ts";
import { failureOf } from "./map-error.ts";
import { safeRedirectPath } from "./safe-redirect.ts";
import type { IdentityUser } from "./types.ts";

export interface ProviderSignInUrlOptions {
  /**
   * The absolute front-end page the CMS sends the browser back to. The CMS accepts it only when
   * it is the provider's configured callback (same origin and path).
   */
  readonly callback?: string;
}

export interface CompleteProviderSignInOptions {
  /** The callback page's query string (`location.search`), which may carry the provider's error. */
  readonly search?: string;
  /** Where the app wants to go afterwards: kept only if it is a same-origin relative path. */
  readonly returnTo?: string;
}

export interface ProviderSignInResult {
  readonly user: IdentityUser;
  /** A same-origin relative path, `/` when `returnTo` was missing or unsafe. */
  readonly redirectTo: string;
}

// Strapi's own flow hands the provider's tokens to the callback page, which passes them on;
// strapi-php keeps them in the round trip's session instead and reads none of these.
const FORWARDED_PARAMS = ["access_token", "id_token", "access_secret"] as const;

const isAllowedCallback = (callback: string): boolean => {
  if (typeof callback !== "string") return false;
  try {
    return isSecureOrLocal(new URL(callback));
  } catch {
    return false;
  }
};

export const providerSignInUrl =
  (context: ClientContext) =>
  (provider: string, options: ProviderSignInUrlOptions = {}): string => {
    requireObject(options);
    const url = endpointUrl(context.base, `/api/connect/${providerSegment(provider)}`);
    if (options.callback === undefined) return url;
    if (!isAllowedCallback(options.callback)) throw new IdentityError("validation");
    return `${url}?callback=${encodeURIComponent(options.callback)}`;
  };

const callbackQuery = (search: string): string => {
  const received = new URLSearchParams(search);
  if (received.has("error")) throw new IdentityError("invalid-credentials");
  const forwarded = new URLSearchParams();
  for (const key of FORWARDED_PARAMS) {
    const value = received.get(key);
    if (value !== null && value !== "") forwarded.set(key, value);
  }
  const query = forwarded.toString();
  return query === "" ? "" : `?${query}`;
};

/**
 * Finishes a provider sign-in on the callback page. The provider's own error text is never passed
 * on (it can name the account); every failure is the generic `invalid-credentials`.
 */
export const completeProviderSignIn =
  (context: ClientContext) =>
  async (
    provider: string,
    options: CompleteProviderSignInOptions = {},
  ): Promise<ProviderSignInResult> => {
    const segment = providerSegment(provider);
    requireObject(options);
    if (!isOptional(options.search, "string") || !isOptional(options.returnTo, "string")) {
      throw new IdentityError("validation");
    }
    const query = callbackQuery(options.search ?? "");
    return queuedSignIn(context, async (ticket) => {
      const response = await context.credentialRequest({
        method: "GET",
        path: `/api/auth/${segment}/callback${query}`,
        cookie: true,
      });
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        throw new IdentityError("invalid-credentials");
      }
      if (!response.ok) throw failureOf(response, context.clock.now());
      const user = await signInFrom(context, response, ticket);
      context.crossTab.announce("signed-in");
      return { user, redirectTo: safeRedirectPath(options.returnTo) };
    });
  };

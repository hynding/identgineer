import type { ClientContext } from "./client-context.ts";
import { failureOf } from "./map-error.ts";
import { readUser } from "./shapes.ts";
import type { IdentityUser } from "./types.ts";

export interface SignOutOptions {
  /** Ends every session of the account, on every device. */
  readonly everywhere?: boolean;
}

/**
 * Ends the session on the server (and its refresh cookie), then locally whatever the server
 * said, and tells the other tabs.
 */
export const signOut =
  (context: ClientContext) =>
  async (options: SignOutOptions = {}): Promise<void> => {
    const { session } = context;
    if (session.accessToken() !== undefined) {
      const refreshToken = session.refreshToken();
      await context
        .authorizedRequest({
          method: "POST",
          path: "/api/auth/logout",
          body: {
            ...(options.everywhere === true ? { scope: "all" } : {}),
            ...(refreshToken === undefined ? {} : { refreshToken }),
          },
          cookie: true,
        })
        .catch(() => undefined);
    }
    context.signedOut("user");
    context.crossTab.announceSignedOut();
  };

export const currentUser = (context: ClientContext) => async (): Promise<IdentityUser> => {
  const response = await context.authorizedRequest({ method: "GET", path: "/api/users/me" });
  if (!response.ok) throw failureOf(response, context.clock.now());
  const user = readUser(response.body);
  context.session.setUser(user);
  return user;
};

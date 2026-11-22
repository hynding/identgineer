import type { ClientContext } from "./client-context.ts";
import { failureOf } from "./map-error.ts";
import type { IdentityState } from "./session.ts";
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

/**
 * Resumes a session after a reload from the HttpOnly refresh cookie, if the backend set one.
 * Without it (no cookie, a backend without sessions) the client is signed out; a network failure
 * leaves the state unknown and rejects, so the caller can try again.
 */
export const restore = (context: ClientContext) => async (): Promise<IdentityState> => {
  const { session } = context;
  if (session.getState().status === "signed-in") return session.getState();
  const outcome = await context.refresher.refresh();
  if (outcome === "superseded") return session.getState();
  const response =
    outcome === "refreshed"
      ? await context.authorizedRequest({ method: "GET", path: "/api/users/me" })
      : undefined;
  const accessToken = session.accessToken();
  if (response?.ok !== true || accessToken === undefined) {
    context.signedOut("no-session");
    return session.getState();
  }
  const refreshToken = session.refreshToken();
  context.signedIn(
    refreshToken === undefined ? { accessToken } : { accessToken, refreshToken },
    readUser(response.body),
  );
  return session.getState();
};

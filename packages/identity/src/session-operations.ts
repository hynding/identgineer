import type { ClientContext } from "./client-context.ts";
import { sessionSegment } from "./identifiers.ts";
import { failureOf } from "./map-error.ts";
import type { IdentityState } from "./session.ts";
import { readSessions, readUser } from "./shapes.ts";
import type { IdentitySession, IdentityUser } from "./types.ts";

export interface SignOutOptions {
  /** Ends every session of the account, on every device. */
  readonly everywhere?: boolean;
}

/**
 * Signs out here at once and tells the other tabs, then ends the server session (and its refresh
 * cookie) when the server can be reached, and waits for any sign-in still under way to settle.
 */
export const signOut =
  (context: ClientContext) =>
  async (options: SignOutOptions = {}): Promise<void> => {
    const tokens = context.session.tokens();
    context.signedOut("user");
    context.crossTab.announce("signed-out");
    if (tokens !== undefined) await context.endServerSession(tokens, options.everywhere === true);
    await context.settleSignIns();
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
  const generation = session.generation();
  const outcome = await context.refresher.refresh();
  const tokens = session.tokens();
  if (session.generation() !== generation) return session.getState();
  if (outcome !== "refreshed" || tokens === undefined) {
    context.signedOut("no-session");
    return session.getState();
  }
  const response = await context.transport.send({
    method: "GET",
    path: "/api/users/me",
    accessToken: tokens.accessToken,
  });
  if (session.generation() !== generation) return session.getState();
  if (!response.ok) {
    context.signedOut("no-session");
    return session.getState();
  }
  await context.acceptSignIn(tokens, readUser(response.body), generation);
  return session.getState();
};

/**
 * Another tab signed in, so the shared refresh cookie names a new session. A signed-in tab
 * holding a cookie session refreshes (which checks the user), a signed-out tab resumes it.
 */
export const reevaluate = (context: ClientContext) => async (): Promise<void> => {
  const { session } = context;
  const state = session.getState();
  if (state.status === "signed-in" && session.refreshToken() === undefined) {
    await context.refreshSession();
  } else if (state.status === "signed-out") {
    await restore(context)();
  }
};

export const listSessions =
  (context: ClientContext) => async (): Promise<readonly IdentitySession[]> => {
    const response = await context.authorizedRequest({ method: "GET", path: "/api/auth/sessions" });
    if (!response.ok) throw failureOf(response, context.clock.now());
    return readSessions(response.body);
  };

/** Ends one of the account's sessions. To end this one, use `signOut`. */
export const revokeSession =
  (context: ClientContext) =>
  async (id: string): Promise<void> => {
    const response = await context.authorizedRequest({
      method: "DELETE",
      path: `/api/auth/sessions/${sessionSegment(id)}`,
    });
    if (!response.ok) throw failureOf(response, context.clock.now());
  };

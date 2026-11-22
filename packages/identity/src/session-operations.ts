import type { ClientContext } from "./client-context.ts";
import { sessionSegment } from "./identifiers.ts";
import { failureOf } from "./map-error.ts";
import type { IdentityState, Tokens } from "./session.ts";
import { readSessions, readUser } from "./shapes.ts";
import type { IdentitySession, IdentityUser } from "./types.ts";

export interface SignOutOptions {
  /** Ends every session of the account, on every device. */
  readonly everywhere?: boolean;
}

/**
 * `signed-out`: no session is left on the server to resume. `server-unreachable`: signed out here
 * and in the other tabs, but the server could not be reached, so a session may live on there
 * until it expires (and a reload may resume it).
 */
export interface SignOutResult {
  readonly outcome: "signed-out" | "server-unreachable";
}

/** The tokens of the server session to end: this tab's, or the shared refresh cookie's. */
const sessionToEnd = async (
  context: ClientContext,
  own: Tokens | undefined,
): Promise<Tokens | "refused" | "unreachable"> => {
  if (own !== undefined) return own;
  // A refresh under way may be rotating the cookie: present the cookie it leaves.
  await context.refresher.settled();
  // Even a tab that knew it was signed out may share a cookie another tab signed in with.
  return context.refresher.detached(undefined);
};

/**
 * Signs out here at once and cancels any sign-in under way, then ends the server session (and its
 * refresh cookie), even one only the cookie holds, and only then tells the other tabs, so that no
 * tab is told of a sign-out a reload would undo. An unreachable server is reported, not thrown.
 */
export const signOut =
  (context: ClientContext) =>
  async (options: SignOutOptions = {}): Promise<SignOutResult> => {
    const own = context.session.tokens();
    context.cancelSignIns();
    context.signedOut("user");
    const tokens = await sessionToEnd(context, own);
    const server =
      typeof tokens === "string"
        ? tokens
        : await context.endServerSession(tokens, options.everywhere === true);
    context.crossTab.announce("signed-out");
    await context.settleSignIns();
    return Object.freeze({
      outcome: server === "unreachable" ? "server-unreachable" : "signed-out",
    });
  };

export const currentUser = (context: ClientContext) => async (): Promise<IdentityUser> => {
  const response = await context.authorizedRequest({ method: "GET", path: "/api/users/me" });
  if (!response.ok) throw failureOf(response, context.clock.now());
  const user = readUser(response.body);
  context.session.setUser(user);
  return user;
};

const restoreNow = async (context: ClientContext): Promise<IdentityState> => {
  const { session } = context;
  if (session.getState().status === "signed-in") return session.getState();
  const ticket = context.sessionTicket();
  const outcome = await context.refresher.refresh();
  const tokens = session.tokens();
  if (!ticket()) return session.getState();
  if (outcome !== "refreshed" || tokens === undefined) {
    context.signedOut("no-session");
    return session.getState();
  }
  const response = await context.transport.send({
    method: "GET",
    path: "/api/users/me",
    accessToken: tokens.accessToken,
  });
  if (!ticket()) return session.getState();
  if (!response.ok) {
    context.signedOut("no-session");
    return session.getState();
  }
  await context.acceptSignIn(tokens, readUser(response.body), ticket);
  return session.getState();
};

/**
 * Resumes a session after a reload from the HttpOnly refresh cookie, if the backend set one.
 * Without it (no cookie, a backend without sessions) the client is signed out; a network failure
 * leaves the state unknown and rejects, so the caller can try again. It waits for a sign-in under
 * way, which then decides the session, and does nothing after a sign-out made meanwhile.
 */
export const restore = (context: ClientContext) => (): Promise<IdentityState> => {
  const notSignedOutSince = context.signInTicket();
  return context.exclusive(() =>
    notSignedOutSince() ? restoreNow(context) : Promise.resolve(context.session.getState()),
  );
};

/**
 * Another tab signed in, so the shared refresh cookie names a new session. A signed-in tab
 * holding a cookie session refreshes (which checks the user), a signed-out tab resumes it. Like
 * a restore, it waits for a sign-in under way in this tab.
 */
export const reevaluate = (context: ClientContext) => (): Promise<void> => {
  const notSignedOutSince = context.signInTicket();
  return context.exclusive(async () => {
    if (!notSignedOutSince()) return;
    const { session } = context;
    const state = session.getState();
    if (state.status === "signed-in" && session.refreshToken() === undefined) {
      await context.refreshSession();
    } else if (state.status === "signed-out") {
      await restoreNow(context);
    }
  });
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

import type { ClientContext, ServerSignOut } from "./client-context.ts";
import { sessionSegment } from "./identifiers.ts";
import { failureOf } from "./map-error.ts";
import type { IdentityState, Ticket, Tokens } from "./session.ts";
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

/**
 * Ends the server session: this tab's own, or else whatever session the shared refresh cookie
 * names (looked up once any refresh under way has rotated it), so that a tab that knew it was
 * signed out still leaves nothing to resume.
 */
const endSessions = async (
  context: ClientContext,
  own: Tokens | undefined,
  everywhere: boolean,
): Promise<ServerSignOut> => {
  if (own !== undefined) return context.endServerSession(own, everywhere);
  await context.refresher.settled();
  const found = await context.refresher.detached(undefined);
  if (found === "refused") return "ended";
  if (found === "unreachable") return "unreachable";
  return context.endServerSession(found, everywhere);
};

/**
 * The strongest operation. At once: signs out here and cancels every sign-in, restore and
 * re-check asked for before it, so none of them can leave the tab signed in. Then ends the server
 * session (even one only the cookie holds), waits for the work it cancelled (ending the sessions
 * that work opened), and only then tells the other tabs, so no tab hears of a sign-out a reload
 * would undo. Work asked for meanwhile waits for it and then runs afresh. An unreachable server is
 * reported, not thrown.
 */
export const signOut =
  (context: ClientContext) =>
  async (options: SignOutOptions = {}): Promise<SignOutResult> => {
    const own = context.session.tokens();
    context.session.cancelSignIns();
    context.signedOut("user");
    const server = await context.signOutBarrier(() =>
      endSessions(context, own, options.everywhere === true),
    );
    context.crossTab.announce("signed-out");
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

const restoreNow = async (context: ClientContext, ticket: Ticket): Promise<IdentityState> => {
  const { session } = context;
  if (!session.valid(ticket) || session.getState().status === "signed-in") {
    return session.getState();
  }
  const result = await context.refresher.refresh();
  if (!session.valid(ticket)) return session.getState();
  if (result.outcome !== "refreshed") {
    context.signedOut("no-session");
    return session.getState();
  }
  const response = await context.transport.send({
    method: "GET",
    path: "/api/users/me",
    accessToken: result.tokens.accessToken,
  });
  if (!session.valid(ticket)) return session.getState();
  if (!response.ok) {
    context.signedOut("no-session");
    return session.getState();
  }
  await context.acceptSignIn(result.tokens, readUser(response.body), ticket);
  return session.getState();
};

/**
 * Resumes a session after a reload from the HttpOnly refresh cookie, if the backend set one.
 * Without it (no cookie, a backend without sessions) the client is signed out; a network failure
 * leaves the state unknown and rejects, so the caller can try again. It takes its turn behind
 * any sign-in or sign-out under way, and does nothing if the session changed since it was asked.
 */
export const restore = (context: ClientContext) => (): Promise<IdentityState> => {
  const ticket = context.session.ticket("session");
  return context.exclusive(() => restoreNow(context, ticket));
};

/**
 * Another tab signed in, so the shared refresh cookie names a new session. A signed-in tab
 * holding a cookie session refreshes (which checks the user), a signed-out tab resumes it. Like
 * a restore, it takes its turn and does nothing if the session changed since the notice.
 */
export const reevaluate = (context: ClientContext) => (): Promise<void> => {
  const ticket = context.session.ticket("session");
  return context.exclusive(async () => {
    const { session } = context;
    if (!session.valid(ticket)) return;
    const state = session.getState();
    if (state.status === "signed-in" && session.refreshToken() === undefined) {
      await context.refreshSession(ticket);
    } else if (state.status === "signed-out") {
      await restoreNow(context, ticket);
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

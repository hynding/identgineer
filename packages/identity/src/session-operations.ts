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
  readonly outcome: "signed-out" | "server-unreachable" | "superseded";
}

/**
 * Ends whatever session the shared refresh cookie names, unless a newer sign-in is known by
 * then: the cookie may be that sign-in's, and it stands.
 */
const endCookieSession = async (
  context: ClientContext,
  everywhere: boolean,
  newer: () => boolean,
): Promise<ServerSignOut> => {
  if (newer()) return "ended";
  const found = await context.refresher.detached(undefined);
  if (found === "refused") return "ended";
  if (found === "unreachable") return "unreachable";
  if (newer()) return "ended";
  return context.endServerSession(found, everywhere);
};

/**
 * Ends this tab's own server session, then whatever session the cookie still names: another
 * tab's sign-in this tab never heard of leaves the cookie on its session, and the logout clears
 * the cookie only with the session it names. Page script cannot see whether it did, so the cookie
 * is looked up once more (one refresh request, refused when nothing is left). A tab without a
 * token of its own starts there.
 */
const endSessions = async (
  context: ClientContext,
  own: Tokens | undefined,
  everywhere: boolean,
  newer: () => boolean,
): Promise<ServerSignOut> => {
  if (own === undefined) return endCookieSession(context, everywhere, newer);
  const ended = await context.endServerSession(own, everywhere);
  return ended === "ended" ? endCookieSession(context, everywhere, newer) : ended;
};

const SUPERSEDED: SignOutResult = Object.freeze({ outcome: "superseded" });

/**
 * The strongest operation in this tab. At once: signs out here and cancels every sign-in,
 * restore and re-check asked for before it, so none of them can leave the tab signed in. Then
 * ends the server session (and whatever session the cookie still names), waits for the work it
 * cancelled (ending the sessions that work opened), and only then tells the other tabs. Work
 * asked for meanwhile waits for it and then runs afresh.
 *
 * Across tabs the later action wins: a sign-in this tab hears of (or is asked for) after the
 * sign-out began stands. The sign-out then logs out no session it finds in the cookie, tells no
 * tab of a sign-out, and resolves `superseded`; the queued re-check brings this tab to the newer
 * session. An unreachable server is reported, not thrown.
 */
export const signOut =
  (context: ClientContext) =>
  async (options: SignOutOptions = {}): Promise<SignOutResult> => {
    const own = context.session.tokens();
    const seen = context.signInsSeen();
    const newer = (): boolean => context.signInsSeen() !== seen;
    context.session.cancelSignIns();
    context.signedOut("user");
    const settle = context.signOutPending(newer);
    const server = await context
      .signOutBarrier(() => endSessions(context, own, options.everywhere === true, newer))
      .finally(settle);
    if (newer()) return SUPERSEDED;
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

/**
 * `quiet`: a re-check, which leaves a signed-out state as it is (and its reason) when it finds
 * no session to resume.
 */
const restoreNow = async (
  context: ClientContext,
  ticket: Ticket,
  quiet = false,
): Promise<IdentityState> => {
  const { session } = context;
  if (!session.valid(ticket) || session.getState().status === "signed-in") {
    return session.getState();
  }
  const result = await context.refresher.refresh(ticket);
  if (!session.valid(ticket)) return session.getState();
  const signedOutAlready = session.getState().status === "signed-out";
  if (result.outcome !== "refreshed") {
    if (!(quiet && signedOutAlready)) context.signedOut("no-session");
    return session.getState();
  }
  const response = await context.transport.send({
    method: "GET",
    path: "/api/users/me",
    accessToken: result.tokens.accessToken,
  });
  if (!session.valid(ticket)) return session.getState();
  if (!response.ok) {
    if (!(quiet && signedOutAlready)) context.signedOut("no-session");
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
      await restoreNow(context, ticket, true);
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

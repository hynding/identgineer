import { describe, expect, it } from "vitest";
import { createSession, type IdentityState, type Tokens } from "./session.ts";
import type { IdentityUser } from "./types.ts";

const tokens = (accessToken: string): Tokens => ({
  accessToken,
  lifetime: { ms: 600_000, known: false },
  expiresAt: 600_000,
});

const user = (id: number): IdentityUser =>
  ({ id, documentId: `user${String(id)}`, username: `user${String(id)}` }) as IdentityUser;

describe("the session's gate", () => {
  it("offers no way to set tokens but adopt", () => {
    const session = createSession();
    // Readers, the gate, and the transitions that drop tokens: nothing else touches them.
    expect(Object.keys(session).sort()).toEqual([
      "adopt",
      "cancelSignIns",
      "dispose",
      "getState",
      "refreshToken",
      "setUser",
      "signOut",
      "subscribe",
      "ticket",
      "tokens",
      "valid",
    ]);
  });

  it("adopts a sign-in's tokens for a current ticket and refuses a stale one", () => {
    const session = createSession();
    const stale = session.ticket("session");
    expect(session.adopt(stale, tokens("a"), user(1))).toBeDefined();
    expect(session.adopt(stale, tokens("b"), user(2))).toBeUndefined();
    expect(session.tokens()?.accessToken).toBe("a");
  });

  it("never takes a refresh's tokens while signed out", () => {
    const session = createSession();
    session.signOut("user");
    expect(session.adopt(session.ticket("session"), tokens("a"))).toBeUndefined();
    expect(session.tokens()).toBeUndefined();
  });

  it("lets a sign-in ticket outlive other session changes, but not a sign-out's cancellation", () => {
    const session = createSession();
    const signIn = session.ticket("sign-in");
    session.adopt(session.ticket("session"), tokens("a"), user(1));
    session.signOut("expired");
    expect(session.valid(signIn)).toBe(true);
    session.cancelSignIns();
    expect(session.valid(signIn)).toBe(false);
  });

  it("refuses everything once disposed", () => {
    const session = createSession();
    const ticket = session.ticket("sign-in");
    session.dispose();
    expect(session.adopt(ticket, tokens("a"), user(1))).toBeUndefined();
  });

  it("tells every listener each transition in order, even one a listener causes", () => {
    const session = createSession();
    const heard: string[] = [];
    session.subscribe((state: IdentityState) => {
      heard.push(`first:${state.status}`);
      if (state.status === "signed-in") session.signOut("user");
    });
    session.subscribe((state: IdentityState) => heard.push(`second:${state.status}`));
    session.adopt(session.ticket("session"), tokens("a"), user(1));
    expect(heard).toEqual([
      "first:signed-in",
      "second:signed-in",
      "first:signed-out",
      "second:signed-out",
    ]);
  });
});

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { IdentityError } from "../identity-error.ts";
import type { Profile } from "../types.ts";
import {
  createBrowser,
  disposeTabs,
  freshAccount,
  linkParameter,
  liveBackend,
  openTab,
  PASSWORD,
  post,
  settledMailsTo,
  SKIP_NOTE,
  type LiveBackend,
} from "./live-backend.ts";

const backend = liveBackend ?? ({} as LiveBackend);
const REFRESH_COOKIE = "strapi_up_refresh";
const NEW_PASSWORD = "another correct horse battery";

const rejection = async (promise: Promise<unknown>): Promise<IdentityError> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof IdentityError) return error;
    throw error;
  }
  throw new Error("expected a rejection");
};

/** An account registered straight on the server (confirmed where confirmation is off). */
const registered = async (label: string, server = backend.servers.main) => {
  const account = freshAccount(label);
  const answer = await post(server, "/api/auth/local/register", account);
  expect(answer.status).toBe(200);
  return account;
};

/** A browser whose tab signed in with the refresh cookie. */
const signedIn = async (label: string) => {
  const account = await registered(label);
  const browser = createBrowser(backend);
  const tab = openTab(backend.servers.main, browser);
  await tab.signIn({ identifier: account.email, password: account.password });
  return { account, browser, tab };
};

/** The promise's outcome, never thrown: setup that a gap test only inspects. */
const settle = <T>(promise: Promise<T>): Promise<PromiseSettledResult<T>> =>
  promise.then(
    (value) => ({ status: "fulfilled", value }),
    (reason: unknown) => ({ status: "rejected", reason }),
  );

afterEach(disposeTabs);

describe.skipIf(liveBackend === undefined)(
  `the SDK against strapi-php ${liveBackend === undefined ? SKIP_NOTE : ""}`,
  () => {
    describe("without email confirmation", () => {
      it("registers and is signed in at once, its refresh token kept in memory", async () => {
        const browser = createBrowser(backend);
        const tab = openTab(backend.servers.main, browser);
        const account = freshAccount("register");
        const result = await tab.register(account);
        expect(result).toMatchObject({ outcome: "signed-in", user: { email: account.email } });
        expect(tab.getState()).toMatchObject({ status: "signed-in" });
        expect((await tab.currentUser()).username).toBe(account.username);
        // users-permissions answers a registration in the body, so no cookie: a reload ends it.
        expect(browser.jar.get(REFRESH_COOKIE)).toBeUndefined();
      });

      it("signs in and reads the current user, with the refresh cookie HttpOnly, Secure, Strict under /api/auth", async () => {
        const before = Date.now();
        const { account, browser, tab } = await signedIn("signin");
        expect(tab.getState()).toMatchObject({
          status: "signed-in",
          user: { email: account.email, username: account.username, confirmed: true },
        });
        expect((await tab.currentUser()).email).toBe(account.email);
        const cookie = browser.jar.get(REFRESH_COOKIE);
        expect(cookie).toMatchObject({
          path: "/api/auth",
          secure: true,
          httpOnly: true,
          sameSite: "strict",
          hostOnly: true,
        });
        // The session's absolute lifespan, CAMIS_MAX_REFRESH_TOKEN_LIFESPAN (30 days by default).
        const days = ((cookie?.expiresAt ?? 0) - before) / 86_400_000;
        expect(days).toBeGreaterThan(29.9);
        expect(days).toBeLessThan(30.1);
      });

      it("restores the session from the refresh cookie in a fresh client, as after a reload", async () => {
        const { account, browser } = await signedIn("restore");
        const reloaded = openTab(backend.servers.main, browser);
        expect(await reloaded.restore()).toMatchObject({
          status: "signed-in",
          user: { email: account.email },
        });
        const elsewhere = openTab(backend.servers.main, createBrowser(backend));
        expect(await elsewhere.restore()).toMatchObject({ status: "signed-out" });
      });

      it("refreshes the access token before it ends, rotating the cookie, and stays signed in", async () => {
        const account = await registered("refresh");
        const browser = createBrowser(backend);
        // A 6-second lifetime makes the client refresh after its 5-second floor.
        const tab = openTab(backend.servers.main, browser, { accessTokenLifetimeSeconds: 6 });
        await tab.signIn({ identifier: account.email, password: account.password });
        const first = browser.jar.get(REFRESH_COOKIE)?.value;
        expect(first).toBeDefined();
        await new Promise((resolve) => setTimeout(resolve, 6_500));
        const second = browser.jar.get(REFRESH_COOKIE)?.value;
        expect(second).toBeDefined();
        expect(second).not.toBe(first);
        expect(tab.getState()).toMatchObject({ status: "signed-in" });
        expect((await tab.currentUser()).email).toBe(account.email);
        // The rotated-away token cannot be used again.
        const replay = await fetch(`${backend.servers.main.url}/api/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: first }),
        });
        expect(replay.status).toBe(401);
      });

      it("reads no profile for an account that has none", async () => {
        const { tab } = await signedIn("profile");
        expect(await tab.getProfile()).toBeNull();
      });

      // camis gap: strapi-php checks a create's body for the required `owner` relation before the
      // grant's `assign` fills it from the session, so POST /api/profiles answers 400
      // ValidationError "owner must be defined." (core/validation.ts and core/controller.ts in
      // camis' adapter-filament strapi-api). Turns green when camis exempts assigned relations.
      describe("saving a profile (camis gap: assigned owner validated as required)", () => {
        const saved: {
          created?: PromiseSettledResult<Profile>;
          updated?: PromiseSettledResult<Profile>;
          read?: Profile | null;
        } = {};

        beforeAll(async () => {
          const { tab } = await signedIn("profile-save");
          saved.created = await settle(
            tab.saveProfile({ displayName: "Ada", bio: null, locale: "en" }),
          );
          if (saved.created.status === "rejected") return;
          saved.updated = await settle(
            tab.saveProfile({ displayName: "Ada L.", timezone: "Europe/London" }),
          );
          saved.read = await tab.getProfile();
        });

        // The SDK names no field outside the profile input; the agreement test pins `owner`.
        it("is refused today as a validation error naming no field the SDK sends", () => {
          expect(saved.created?.status).toBe("rejected");
          const error: unknown =
            saved.created?.status === "rejected" ? saved.created.reason : undefined;
          expect(error).toBeInstanceOf(IdentityError);
          expect(error).toMatchObject({ code: "validation" });
          expect(error).not.toHaveProperty("fields");
        });

        it.fails("saves a new profile and updates it", () => {
          expect(saved.created).toMatchObject({
            status: "fulfilled",
            value: { displayName: "Ada", bio: null, locale: "en" },
          });
          const documentId =
            saved.created?.status === "fulfilled" ? saved.created.value.documentId : undefined;
          expect(saved.updated).toMatchObject({
            status: "fulfilled",
            value: { documentId, displayName: "Ada L." },
          });
          expect(saved.read).toMatchObject({ displayName: "Ada L." });
        });
      });

      it("changes the password: the session goes on, the old password fails, the new one works", async () => {
        const { account, tab } = await signedIn("change");
        await tab.changePassword({
          currentPassword: account.password,
          password: NEW_PASSWORD,
          passwordConfirmation: NEW_PASSWORD,
        });
        expect(tab.getState()).toMatchObject({ status: "signed-in" });
        expect((await tab.currentUser()).email).toBe(account.email);
        const other = openTab(backend.servers.main, createBrowser(backend));
        expect(
          (await rejection(other.signIn({ identifier: account.email, password: account.password })))
            .code,
        ).toBe("invalid-credentials");
        await other.signIn({ identifier: account.email, password: NEW_PASSWORD });
      });

      it("refuses a password change with a wrong current password as invalid-credentials", async () => {
        const { tab } = await signedIn("change-wrong");
        const error = await rejection(
          tab.changePassword({
            currentPassword: "not the password",
            password: NEW_PASSWORD,
            passwordConfirmation: NEW_PASSWORD,
          }),
        );
        expect(error.code).toBe("invalid-credentials");
        expect(tab.getState()).toMatchObject({ status: "signed-in" });
      });

      it("resets a forgotten password with the code from the mail, and signs in", async () => {
        const account = await registered("reset");
        const tab = openTab(backend.servers.main, createBrowser(backend));
        expect(await tab.requestPasswordReset({ email: account.email })).toEqual({
          outcome: "accepted",
        });
        const code = await linkParameter(backend, account.email, "code");
        const user = await tab.resetPassword({
          code,
          password: NEW_PASSWORD,
          passwordConfirmation: NEW_PASSWORD,
        });
        expect(user.email).toBe(account.email);
        expect(tab.getState()).toMatchObject({ status: "signed-in" });
        const again = await rejection(
          tab.resetPassword({ code, password: PASSWORD, passwordConfirmation: PASSWORD }),
        );
        expect(again.code).toBe("invalid-credentials");
      });

      it("accepts a reset request for an unknown address the same way, and sends no mail", async () => {
        const unknown = freshAccount("nobody").email;
        const tab = openTab(backend.servers.main, createBrowser(backend));
        expect(await tab.requestPasswordReset({ email: unknown })).toEqual({ outcome: "accepted" });
        expect(await settledMailsTo(backend, unknown)).toEqual([]);
      });

      it("lists the account's sessions with this one current, and revokes another", async () => {
        // The registration opened a session too, on a device of its own.
        const { account, tab } = await signedIn("sessions");
        const before = await tab.listSessions();
        expect(before).toHaveLength(2);
        expect(before[0]?.current).toBe(true);
        expect(before.filter((session) => session.current)).toHaveLength(1);
        const phone = createBrowser(backend);
        const phoneTab = openTab(backend.servers.main, phone);
        await phoneTab.signIn({ identifier: account.email, password: account.password });
        const after = await tab.listSessions();
        expect(after).toHaveLength(3);
        const phoneSession = after.find((session) => !before.some((old) => old.id === session.id));
        expect(phoneSession?.current).toBe(false);
        await tab.revokeSession(phoneSession?.id ?? "");
        expect((await tab.listSessions()).map((session) => session.id)).toEqual(
          before.map((session) => session.id),
        );
        expect((await rejection(phoneTab.currentUser())).code).toBe("unauthorized");
        expect(await openTab(backend.servers.main, phone).restore()).toMatchObject({
          status: "signed-out",
        });
      });

      it("signs out: the server session ends, the cookie is cleared, and a reload stays signed out", async () => {
        const { browser, tab } = await signedIn("signout");
        expect(await tab.signOut()).toEqual({ outcome: "signed-out" });
        expect(tab.getState()).toMatchObject({ status: "signed-out" });
        expect(browser.jar.get(REFRESH_COOKIE)).toBeUndefined();
        expect(await openTab(backend.servers.main, browser).restore()).toMatchObject({
          status: "signed-out",
        });
      });

      it("signs out everywhere: every browser's session ends", async () => {
        const { account, tab } = await signedIn("everywhere");
        const laptop = createBrowser(backend);
        const laptopTab = openTab(backend.servers.main, laptop);
        await laptopTab.signIn({ identifier: account.email, password: account.password });
        expect(await tab.signOut({ everywhere: true })).toEqual({ outcome: "signed-out" });
        expect((await rejection(laptopTab.currentUser())).code).toBe("unauthorized");
        expect(await openTab(backend.servers.main, laptop).restore()).toMatchObject({
          status: "signed-out",
        });
      });

      it("refuses a wrong password and an unknown account with the same error", async () => {
        const account = await registered("wrong");
        const wrong = await rejection(
          openTab(backend.servers.main, createBrowser(backend)).signIn({
            identifier: account.email,
            password: "not the password",
          }),
        );
        const unknown = await rejection(
          openTab(backend.servers.main, createBrowser(backend)).signIn({
            identifier: freshAccount("nobody").email,
            password: "not the password",
          }),
        );
        const seen = (error: IdentityError) => ({
          code: error.code,
          message: error.message,
          retryAfterSeconds: error.retryAfterSeconds,
          fields: error.fields,
        });
        expect(wrong.code).toBe("invalid-credentials");
        expect(seen(unknown)).toEqual(seen(wrong));
      });
    });

    describe("with access tokens that outlive no request", () => {
      const server = () => backend.servers.shortLived;

      it("answers a request made with an expired access token by refreshing, rotating the cookie, and retrying", async () => {
        const account = await registered("expired", server());
        const browser = createBrowser(backend);
        const answers: { path: string; status: number }[] = [];
        const recording: typeof fetch = async (input, init) => {
          const response = await browser.fetch(input, init);
          answers.push({
            path: new URL(input instanceof Request ? input.url : input).pathname,
            status: response.status,
          });
          return response;
        };
        const tab = openTab(server(), browser, { fetch: recording });
        await tab.signIn({ identifier: account.email, password: account.password });
        const first = browser.jar.get(REFRESH_COOKIE)?.value;
        expect(first).toBeDefined();
        await new Promise((resolve) =>
          setTimeout(resolve, (server().accessTokenLifetimeSeconds + 1) * 1000),
        );
        answers.length = 0;
        expect((await tab.currentUser()).email).toBe(account.email);
        // Refused, refreshed, then retried; the client may read the user again after a refresh.
        expect(answers.slice(0, 3)).toEqual([
          { path: "/api/users/me", status: 401 },
          { path: "/api/auth/refresh", status: 200 },
          { path: "/api/users/me", status: 200 },
        ]);
        expect(answers.slice(3)).toEqual(
          answers.slice(3).map(() => ({ path: "/api/users/me", status: 200 })),
        );
        expect(browser.jar.get(REFRESH_COOKIE)?.value).not.toBe(first);
        expect(tab.getState()).toMatchObject({ status: "signed-in" });
      });
    });

    describe("with email confirmation", () => {
      const server = () => backend.servers.confirmation;

      it("registers to check-email, refuses sign-in until confirmed, then signs in", async () => {
        const account = freshAccount("confirm");
        const tab = openTab(server(), createBrowser(backend));
        expect(await tab.register(account)).toEqual({ outcome: "check-email" });
        expect(tab.getState()).not.toMatchObject({ status: "signed-in" });
        const early = await rejection(
          tab.signIn({ identifier: account.email, password: account.password }),
        );
        expect(early.code).toBe("email-not-confirmed");
        await tab.confirmEmail({
          confirmation: await linkParameter(backend, account.email, "confirmation"),
        });
        const user = await tab.signIn({ identifier: account.email, password: account.password });
        expect(user).toMatchObject({ email: account.email, confirmed: true });
      });

      it("answers a registration the same for a new address and a taken one", async () => {
        const taken = freshAccount("taken");
        const first = await openTab(server(), createBrowser(backend)).register(taken);
        const again = await openTab(server(), createBrowser(backend)).register(taken);
        const fresh = await openTab(server(), createBrowser(backend)).register(
          freshAccount("fresh"),
        );
        expect(again).toEqual(first);
        expect(again).toEqual(fresh);
      });

      it("answers a resend the same for unconfirmed, confirmed and unknown addresses", async () => {
        const pending = freshAccount("pending");
        const confirmed = freshAccount("confirmed");
        const tab = openTab(server(), createBrowser(backend));
        await tab.register(pending);
        await tab.register(confirmed);
        await tab.confirmEmail({
          confirmation: await linkParameter(backend, confirmed.email, "confirmation"),
        });
        const answers = await Promise.all(
          [pending.email, confirmed.email, freshAccount("nobody").email].map((email) =>
            tab.resendConfirmation({ email }),
          ),
        );
        expect(answers).toEqual([
          { outcome: "accepted" },
          { outcome: "accepted" },
          { outcome: "accepted" },
        ]);
      });

      it("refuses an unknown confirmation token as invalid-credentials", async () => {
        const tab = openTab(server(), createBrowser(backend));
        expect((await rejection(tab.confirmEmail({ confirmation: "f".repeat(40) }))).code).toBe(
          "invalid-credentials",
        );
      });
    });
  },
);

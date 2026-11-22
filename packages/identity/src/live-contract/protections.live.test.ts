import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { IdentityError } from "../identity-error.ts";
import {
  createBrowser,
  disposeTabs,
  FOREIGN_SITE,
  freshAccount,
  linkParameter,
  liveBackend,
  openTab,
  post,
  SKIP_NOTE,
  UNLISTED_SAME_SITE,
  type LiveBackend,
  type LiveServer,
} from "./live-backend.ts";

const backend = liveBackend ?? ({} as LiveBackend);
const REFRESH_COOKIE = "strapi_up_refresh";

const rejection = async (promise: Promise<unknown>): Promise<IdentityError> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof IdentityError) return error;
    throw error;
  }
  throw new Error("expected a rejection");
};

/**
 * An account registered straight on the server. Each `pnpm contract:live` boot makes fresh
 * databases and buckets, but a rerun against servers kept up (IDENTITY_LIVE_BACKEND set by hand)
 * within a minute of the last may find the throttled server's register bucket still full, so a
 * 429 waits out its window.
 */
const registered = async (server: LiveServer, label: string) => {
  const account = freshAccount(label);
  let answer = await post(server, "/api/auth/local/register", account);
  if (answer.status === 429) {
    await new Promise((resolve) => setTimeout(resolve, (answer.retryAfter + 1) * 1000));
    answer = await post(server, "/api/auth/local/register", account);
  }
  expect(answer.status).toBe(200);
  return account;
};

/** A browser signed in on the main server with the refresh cookie. */
const signedIn = async (label: string) => {
  const account = await registered(backend.servers.main, label);
  const browser = createBrowser(backend);
  await openTab(backend.servers.main, browser).signIn({
    identifier: account.email,
    password: account.password,
  });
  return { account, browser };
};

const errorName = (body: unknown): unknown =>
  (body as { error?: { name?: unknown } } | null)?.error?.name;

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

const timeSignIn = async (identifier: string): Promise<number> => {
  const start = performance.now();
  await post(backend.servers.main, "/api/auth/local", { identifier, password: "not the password" });
  return performance.now() - start;
};

afterEach(disposeTabs);

describe.skipIf(liveBackend === undefined)(
  `strapi-php's protections, as the SDK meets them ${liveBackend === undefined ? SKIP_NOTE : ""}`,
  () => {
    describe("throttling", () => {
      const server = () => backend.servers.throttled;

      it("maps a sign-in 429 to throttled, with the Retry-After CORS exposes", async () => {
        const identifier = freshAccount("throttle").email;
        for (let attempt = 0; attempt < server().throttlePerMinute; attempt += 1) {
          const answer = await post(server(), "/api/auth/local", {
            identifier,
            password: "not the password",
          });
          expect(answer.status).toBe(400);
        }
        const browser = createBrowser(backend);
        const tab = openTab(server(), browser);
        const error = await rejection(tab.signIn({ identifier, password: "not the password" }));
        expect(error.code).toBe("throttled");
        expect(error.retryAfterSeconds).toBeGreaterThan(0);
        expect(error.retryAfterSeconds).toBeLessThanOrEqual(60);
        expect(tab.retryAfterSeconds()).toBeGreaterThan(0);
        // The page itself can read Retry-After (CAMIS_CORS_EXPOSE), so the wait is the server's.
        const raw = await browser.fetch(`${server().url}/api/auth/local`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifier, password: "not the password" }),
        });
        expect(raw.status).toBe(429);
        expect(errorName(await raw.json())).toBe("RateLimitError");
        expect(Number(raw.headers.get("Retry-After"))).toBeGreaterThan(0);
      });

      it(
        "counts sign-ins per name given: another account is not locked out",
        { timeout: 90_000 },
        async () => {
          const victim = await registered(server(), "victim");
          const identifier = freshAccount("guessed").email;
          for (let attempt = 0; attempt <= server().throttlePerMinute; attempt += 1) {
            await post(server(), "/api/auth/local", { identifier, password: "not the password" });
          }
          const tab = openTab(server(), createBrowser(backend));
          const user = await tab.signIn({ identifier: victim.email, password: victim.password });
          expect(user.email).toBe(victim.email);
        },
      );

      it("refuses a refresh with a bad token once the failures fill the bucket, Retry-After exposed, yet still rotates a good cookie", async () => {
        const account = await registered(server(), "refresh-flood");
        const browser = createBrowser(backend);
        await openTab(server(), browser).signIn({
          identifier: account.email,
          password: account.password,
        });
        const badRefresh = () =>
          browser.fetch(`${server().url}/api/auth/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Requested-With": "identgineer" },
            body: JSON.stringify({ refreshToken: "not a refresh token" }),
          });
        // Only failures take a turn, one bucket per address: earlier tests may have taken some.
        const statuses: number[] = [];
        let refused: Response | undefined;
        while (refused === undefined && statuses.length <= server().refreshThrottlePerMinute) {
          const answer = await badRefresh();
          statuses.push(answer.status);
          if (answer.status === 429) refused = answer;
          else await answer.body?.cancel();
        }
        expect(statuses.slice(0, -1).every((status) => status === 401)).toBe(true);
        expect(refused?.status).toBe(429);
        expect(errorName(await refused?.json())).toBe("RateLimitError");
        expect(Number(refused?.headers.get("Retry-After"))).toBeGreaterThan(0);
        const before = browser.jar.get(REFRESH_COOKIE)?.value;
        expect(await openTab(server(), browser).restore()).toMatchObject({
          status: "signed-in",
          user: { email: account.email },
        });
        expect(browser.jar.get(REFRESH_COOKIE)?.value).not.toBe(before);
      });

      it("maps a registration 429 to throttled", async () => {
        // The register bucket counts per address; the victim above took one turn of it.
        let error: IdentityError | undefined;
        for (
          let attempt = 0;
          attempt <= server().throttlePerMinute && error === undefined;
          attempt += 1
        ) {
          const tab = openTab(server(), createBrowser(backend));
          error = await tab.register(freshAccount("flood")).then(
            () => undefined,
            (failure: unknown) => (failure instanceof IdentityError ? failure : undefined),
          );
        }
        expect(error?.code).toBe("throttled");
      });
    });

    describe("the refresh cookie (CSRF)", () => {
      // SameSite is the browser's to enforce, so this checks the simulated browser (its jar keeps
      // the cookie from a page of another site) and the server's answer to a refresh without it.
      it("is not sent from a page of another site by the simulated browser (SameSite=Strict), and the server refuses the refresh", async () => {
        const { browser } = await signedIn("samesite");
        const before = browser.jar.get(REFRESH_COOKIE)?.value;
        const foreign = createBrowser(backend, {
          pageOrigin: FOREIGN_SITE,
          cors: false,
          jar: browser.jar,
        });
        const answer = await foreign.fetch(`${backend.servers.main.url}/api/auth/refresh`, {
          method: "POST",
          credentials: "include",
          headers: { "x-strapi-refresh-cookie": "httpOnly" },
        });
        expect(answer.status).toBe(400);
        expect(errorName(await answer.json())).toBe("BadRequestError");
        expect(browser.jar.get(REFRESH_COOKIE)?.value).toBe(before);
      });

      it("is refused (403) from a same-site page CORS does not list, and the session lives on", async () => {
        const { account, browser } = await signedIn("unlisted");
        const before = browser.jar.get(REFRESH_COOKIE)?.value;
        const sibling = createBrowser(backend, {
          pageOrigin: UNLISTED_SAME_SITE,
          cors: false,
          jar: browser.jar,
        });
        const answer = await sibling.fetch(`${backend.servers.main.url}/api/auth/refresh`, {
          method: "POST",
          credentials: "include",
          headers: { "x-strapi-refresh-cookie": "httpOnly", "X-Requested-With": "identgineer" },
        });
        expect(answer.status).toBe(403);
        expect(errorName(await answer.json())).toBe("ForbiddenError");
        expect(browser.jar.get(REFRESH_COOKIE)?.value).toBe(before);
        expect(await openTab(backend.servers.main, browser).restore()).toMatchObject({
          status: "signed-in",
          user: { email: account.email },
        });
      });

      it("is refused (403) from a request with neither Origin nor the client's headers", async () => {
        const { browser } = await signedIn("no-origin");
        const cookie = browser.jar.get(REFRESH_COOKIE);
        const answer = await fetch(`${backend.servers.main.url}/api/auth/refresh`, {
          method: "POST",
          headers: { Cookie: `${REFRESH_COOKIE}=${cookie?.value ?? ""}` },
        });
        expect(answer.status).toBe(403);
        expect(errorName(await answer.json())).toBe("ForbiddenError");
      });

      it("cannot log out with the cookie alone: logout needs the access token", async () => {
        const { account, browser } = await signedIn("logout-cookie");
        const page = createBrowser(backend, { cors: false, jar: browser.jar });
        const answer = await page.fetch(`${backend.servers.main.url}/api/auth/logout`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", "X-Requested-With": "identgineer" },
          body: "{}",
        });
        expect([401, 403]).toContain(answer.status);
        expect(await openTab(backend.servers.main, browser).restore()).toMatchObject({
          status: "signed-in",
          user: { email: account.email },
        });
      });
    });

    describe("CORS", () => {
      it("lets a page of another site use nothing: its preflight is not allowed, so the SDK sees a network failure", async () => {
        const account = await registered(backend.servers.main, "cors");
        const tab = openTab(
          backend.servers.main,
          createBrowser(backend, { pageOrigin: FOREIGN_SITE }),
        );
        const error = await rejection(
          tab.signIn({ identifier: account.email, password: account.password }),
        );
        expect(error.code).toBe("network");
      });

      it("allows the listed page credentials and every header the SDK sends, and never answers with *", async () => {
        // The headers the SDK really sends, over a session's whole life.
        const account = await registered(backend.servers.main, "cors-headers");
        const browser = createBrowser(backend);
        const sentHeaders = new Set<string>();
        const recording: typeof fetch = (input, init) => {
          for (const name of new Headers(init?.headers).keys()) sentHeaders.add(name);
          return browser.fetch(input, init);
        };
        const tab = openTab(backend.servers.main, browser, { fetch: recording });
        await tab.signIn({ identifier: account.email, password: account.password });
        await tab.currentUser();
        await tab.listSessions();
        await openTab(backend.servers.main, browser, { fetch: recording }).restore();
        await tab.signOut();
        const asked = [...sentHeaders].filter((name) => name !== "accept").sort();
        expect(asked).toEqual(expect.arrayContaining(["authorization", "content-type"]));
        const answer = await fetch(`${backend.servers.main.url}/api/auth/refresh`, {
          method: "OPTIONS",
          headers: {
            Origin: backend.siteOrigin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": asked.join(","),
          },
        });
        expect(answer.headers.get("Access-Control-Allow-Origin")).toBe(backend.siteOrigin);
        expect(answer.headers.get("Access-Control-Allow-Credentials")).toBe("true");
        const allowed = (answer.headers.get("Access-Control-Allow-Headers") ?? "")
          .split(",")
          .map((name) => name.trim().toLowerCase());
        for (const name of asked) expect(allowed, name).toContain(name);
        const foreign = await fetch(`${backend.servers.main.url}/api/auth/refresh`, {
          method: "OPTIONS",
          headers: { Origin: FOREIGN_SITE, "Access-Control-Request-Method": "POST" },
        });
        expect(foreign.headers.get("Access-Control-Allow-Origin")).not.toBe(FOREIGN_SITE);
        expect(foreign.headers.get("Access-Control-Allow-Origin")).not.toBe("*");
      });
    });

    describe("account enumeration below the SDK", () => {
      type Answer = Awaited<ReturnType<typeof post>>;
      const seen: {
        registerNew?: Answer;
        registerTaken?: Answer;
        resendConfirmed?: Answer;
        resendUnknown?: Answer;
        signInKnown: number[];
        signInUnknown: number[];
      } = { signInKnown: [], signInUnknown: [] };

      beforeAll(async () => {
        const server = backend.servers.confirmation;
        const taken = freshAccount("enumerate");
        seen.registerNew = await post(server, "/api/auth/local/register", taken);
        seen.registerTaken = await post(server, "/api/auth/local/register", taken);

        const account = freshAccount("resend");
        await post(server, "/api/auth/local/register", account);
        const confirmation = await linkParameter(backend, account.email, "confirmation");
        const confirmed = await fetch(
          `${server.url}/api/auth/email-confirmation?confirmation=${confirmation}`,
          { redirect: "manual" },
        );
        if (confirmed.status !== 302)
          throw new Error(`confirmation answered ${String(confirmed.status)}`);
        seen.resendConfirmed = await post(server, "/api/auth/send-email-confirmation", {
          email: account.email,
        });
        seen.resendUnknown = await post(server, "/api/auth/send-email-confirmation", {
          email: freshAccount("nobody").email,
        });

        const known = await registered(backend.servers.main, "timing");
        for (let round = 0; round < 5; round += 1) {
          seen.signInKnown.push(await timeSignIn(known.email));
          seen.signInUnknown.push(await timeSignIn(freshAccount("nobody").email));
        }
      }, 60_000);

      const keys = (answer: Answer | undefined): string[] => Object.keys(answer?.body ?? {}).sort();

      // camis gap: POST /api/auth/local/register answers a taken username or email with 400
      // ApplicationError "Email or Username are already taken" (and at once, without hashing the
      // password), and a new one with 200, so a caller of the API learns that an account exists.
      // Strapi does the same; the SDK hides it with email confirmation on. Responsible:
      // users-permissions/auth.ts in camis' adapter-filament strapi-api (AuthController::register).
      it("answers a registration of a taken address with 400 ApplicationError today, a new one with 200 (camis gap: register discloses accounts)", () => {
        expect(seen.registerNew?.status).toBe(200);
        expect(seen.registerTaken).toMatchObject({
          status: 400,
          body: {
            error: { name: "ApplicationError", message: "Email or Username are already taken" },
          },
        });
      });

      it.fails("answers a registration of a taken address as one of a new address", () => {
        expect(seen.registerTaken?.status).toBe(seen.registerNew?.status);
        expect(keys(seen.registerTaken)).toEqual(keys(seen.registerNew));
      });

      // camis gap: POST /api/auth/send-email-confirmation answers an unknown address with 200
      // { email, sent: true } but a confirmed one with 400 ApplicationError "Already confirmed"
      // (and a blocked one with "User blocked"), so a caller learns that the account exists.
      // Strapi does the same; the SDK hides it. Responsible: users-permissions/auth.ts in camis'
      // adapter-filament strapi-api (AuthController::sendEmailConfirmation).
      it("answers a resend for a confirmed address with 400 Already confirmed today, an unknown one with 200 (camis gap: resend discloses accounts)", () => {
        expect(seen.resendUnknown).toMatchObject({ status: 200, body: { sent: true } });
        expect(seen.resendConfirmed).toMatchObject({
          status: 400,
          body: { error: { name: "ApplicationError", message: "Already confirmed" } },
        });
      });

      it.fails("answers a resend for a confirmed address as for an unknown one", () => {
        expect(seen.resendConfirmed?.status).toBe(seen.resendUnknown?.status);
        expect(keys(seen.resendConfirmed)).toEqual(keys(seen.resendUnknown));
      });

      // camis gap: POST /api/auth/local hashes the password only when the account exists, so a
      // wrong password for an existing account takes a bcrypt verification (about 0.2 s at
      // BCRYPT_ROUNDS=12) and an unknown account answers at once: the response time tells
      // whether an account exists. Strapi has the same flaw. Responsible: users-permissions/
      // auth.ts in camis' adapter-filament strapi-api (AuthController::login, the
      // `$user === null || … Hash::check` line).
      it("refuses an unknown account in under half the time of a wrong password today (camis gap: sign-in timing)", () => {
        expect(median(seen.signInUnknown)).toBeLessThan(median(seen.signInKnown) * 0.5);
      });

      it.fails("takes as long to refuse an unknown account as a wrong password", () => {
        expect(median(seen.signInUnknown)).toBeGreaterThan(median(seen.signInKnown) * 0.5);
      });
    });
  },
);

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import type { FakeRequest } from "./testing/fake-http.ts";
import { PASSWORD, setup } from "./test-harness.ts";

// The same convention as cms/scripts/camis.js: camis is a local checkout named by CAMIS_DIR,
// resolved against the working directory. CI has none, so these checks skip there.
const CAMIS_DIR = process.env.CAMIS_DIR;
const HAS_CAMIS = CAMIS_DIR !== undefined && CAMIS_DIR !== "";
const TITLE = HAS_CAMIS
  ? "the strapi-php contract in camis"
  : "the strapi-php contract in camis (skipped: set CAMIS_DIR to a camis checkout to run it)";
const STRAPI_API = "packages/adapter-filament/src/strapi-api";
const USERS_PERMISSIONS = `${STRAPI_API}/users-permissions`;
const CMS_MODEL = fileURLToPath(new URL("../../../cms/camis.json", import.meta.url));

const camisFile = (path: string): string => {
  const file = resolve(CAMIS_DIR ?? "", path);
  if (!existsSync(file)) throw new Error(`CAMIS_DIR does not hold a camis checkout: ${file}`);
  return readFileSync(file, "utf8");
};

interface Route {
  readonly method: string;
  readonly path: string;
  readonly guest: boolean;
}

/** `Route::post('/auth/local', …)->middleware(… ':guest')` lines of the generated routes file. */
const goldenRoutes = (): Route[] =>
  camisFile(`${STRAPI_API}/__golden__/strapi-api/routes.unsecured.api.php`)
    .split("\n")
    .flatMap((line) => {
      const match = /Route::(get|post|put|delete)\('\/?([^']+)'/.exec(line);
      if (match === null) return [];
      const [, method = "", path = ""] = match;
      return [
        { method: method.toUpperCase(), path: `/api/${path}`, guest: line.includes(":guest") },
      ];
    });

/** The SDK's request path with its variable segments as the routes file names them. */
const routeTemplate = (path: string): string =>
  path
    .replace(/^\/api\/auth\/sessions\/[^/]+$/, "/api/auth/sessions/{sessionId}")
    .replace(/^\/api\/connect\/[^/]+$/, "/api/connect/{provider}")
    .replace(/^\/api\/auth\/(?!local\b)[^/]+\/callback$/, "/api/auth/{provider}/callback");

/** Runs every client method against the fake API and returns the requests it made. */
const exerciseClient = async (): Promise<readonly FakeRequest[]> => {
  const { api, client, makeClient, signIn } = setup({ emailConfirmation: false });
  await client.register({ username: "grace", email: "grace@example.com", password: PASSWORD });
  await client.signOut();
  await signIn();
  await client.currentUser();
  await makeClient().signIn({ identifier: "ada", password: PASSWORD });
  await makeClient().restore();
  const other = (await client.listSessions()).find((session) => !session.current);
  await client.revokeSession(other?.id ?? "none");
  await client.saveProfile({ displayName: "Ada" });
  await client.saveProfile({ displayName: "Ada L." });
  await client.changePassword({
    currentPassword: PASSWORD,
    password: "another password",
    passwordConfirmation: "another password",
  });
  await client.requestPasswordReset({ email: "ada@example.com" });
  const code = api.findUser("ada@example.com")?.resetCode ?? "";
  await client.resetPassword({ code, password: PASSWORD, passwordConfirmation: PASSWORD });
  await client.resendConfirmation({ email: "ada@example.com" });
  await client.confirmEmail({ confirmation: "token" }).catch(() => undefined);
  api.completeProviderRoundTrip("github", "lin@example.com");
  await client.completeProviderSignIn("github", { search: "" });
  await client.signOut({ everywhere: true });
  return api.requests;
};

describe.skipIf(!HAS_CAMIS)(TITLE, () => {
  let requests: readonly FakeRequest[] = [];
  let authRequests: readonly FakeRequest[] = [];
  let routes: Route[] = [];
  let authEmitter = "";
  let sessionSources = "";

  beforeAll(async () => {
    routes = goldenRoutes();
    authEmitter = camisFile(`${USERS_PERMISSIONS}/auth.ts`);
    sessionSources =
      camisFile(`${USERS_PERMISSIONS}/php/app/Support/StrapiSessions.php`) +
      camisFile(`${USERS_PERMISSIONS}/php/app/Http/Controllers/Api/SessionController.php`);
    requests = await exerciseClient();
    authRequests = requests.filter((request) => !request.path.startsWith("/api/profiles"));
  });

  const routeOf = (request: FakeRequest): Route | undefined =>
    routes.find(
      (route) => route.method === request.method && route.path === routeTemplate(request.path),
    );

  it("exercises every auth route the SDK uses", () => {
    const used = new Set(
      authRequests.map((request) => `${request.method} ${routeTemplate(request.path)}`),
    );
    expect([...used].sort()).toEqual(
      [
        "DELETE /api/auth/sessions/{sessionId}",
        "GET /api/auth/email-confirmation",
        "GET /api/auth/sessions",
        "GET /api/auth/{provider}/callback",
        "GET /api/users/me",
        "POST /api/auth/change-password",
        "POST /api/auth/forgot-password",
        "POST /api/auth/local",
        "POST /api/auth/local/register",
        "POST /api/auth/logout",
        "POST /api/auth/refresh",
        "POST /api/auth/reset-password",
        "POST /api/auth/send-email-confirmation",
      ].sort(),
    );
  });

  it.each(["GET /api/connect/{provider}"])(
    "finds the route the URL builder points at: %s",
    (key) => {
      expect(routes.map((route) => `${route.method} ${route.path}`)).toContain(key);
    },
  );

  it("uses only routes strapi-php serves, with their methods", () => {
    for (const request of authRequests) {
      expect(routeOf(request), `${request.method} ${request.path}`).toBeDefined();
    }
  });

  it("sends no bearer token to a guest route, which refuses one", () => {
    for (const request of authRequests.filter((candidate) => routeOf(candidate)?.guest === true)) {
      expect(request.headers.has("authorization"), request.path).toBe(false);
    }
  });

  it("sends only body fields the auth controller reads", () => {
    for (const request of authRequests) {
      const source = /\/auth\/(refresh|logout)$/.test(request.path) ? sessionSources : authEmitter;
      const body = (request.body ?? {}) as Readonly<Record<string, unknown>>;
      for (const field of Object.keys(body)) {
        expect(source, `${request.path} reads "${field}"`).toMatch(
          new RegExp(`'${field}'|json\\('${field}'\\)`),
        );
      }
    }
  });

  it("confirms email with the query parameter the controller reads", () => {
    // The rule's other entries (a string check) may change; the parameter must stay required.
    const controller = camisFile(`${STRAPI_API}/__golden__/strapi-api/AuthController.php`);
    expect(controller).toMatch(/'confirmation' => \[[^\]]*'required'/);
    const request = authRequests.find(
      (candidate) => candidate.path === "/api/auth/email-confirmation",
    );
    expect([...(request?.query.keys() ?? [])]).toEqual(["confirmation"]);
  });

  it("asks for the refresh cookie with the header users-permissions reads", () => {
    expect(sessionSources).toContain("$request->header('x-strapi-refresh-cookie') === 'httpOnly'");
    const refresh = authRequests.find((request) => request.path === "/api/auth/refresh");
    expect(refresh?.headers.get("x-strapi-refresh-cookie")).toBe("httpOnly");
  });

  it("presents the refresh token as the controller looks for it: cookie, then body", () => {
    expect(sessionSources).toMatch(/cookie\(self::cookieName\(\)\)[\s\S]*json\('refreshToken'\)/);
  });

  it("reads the error envelope strapi-php answers with", () => {
    expect(camisFile(`${STRAPI_API}/core/php/app/Http/Middleware/StrapiErrors.php`)).toContain(
      "['data' => null, 'error' => ['status' => $status, 'name' => $name, 'message' => $message, 'details' => $details]]",
    );
  });

  it("uses the Profile route path camis derives from the model's plural", () => {
    const model = JSON.parse(readFileSync(CMS_MODEL, "utf8")) as {
      contentTypes: { name: string; names?: { plural?: string } }[];
    };
    const plural = model.contentTypes.find((type) => type.name === "Profile")?.names?.plural ?? "";
    expect(camisFile(`${STRAPI_API}/core/names.ts`)).toContain(
      'kebab(ct.kind === "single" ? ct.name : (ct.names?.plural ?? pluralize(ct.name)))',
    );
    const kebab = plural.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
    expect(`/api/${kebab}`).toBe("/api/profiles");
    const routesSource = camisFile(`${STRAPI_API}/core/routes.ts`);
    const profileRequests = requests.filter((request) => request.path.startsWith("/api/profiles"));
    const templates = new Set(
      profileRequests.map(
        (request) =>
          `${request.method} ${request.path.replace(/^\/api\/profiles\/[^/]+$/, "/api/profiles/{key}")}`,
      ),
    );
    expect([...templates].sort()).toEqual(
      ["GET /api/profiles", "POST /api/profiles", "PUT /api/profiles/{key}"].sort(),
    );
    expect(routesSource).toContain("Route::get('/${p}', [${c}, 'index'])");
    expect(routesSource).toContain("Route::post('/${p}', [${c}, 'store'])");
    expect(routesSource).toContain("Route::put('/${p}/{key}', [${c}, 'update'])");
  });
});

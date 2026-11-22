import { afterAll, describe, expect, it } from "vitest";
import { fake, NODE, removeFakes, runFake } from "./fake-php";
import { readCmsText } from "./model";

afterAll(removeFakes);

interface Setting {
  readonly value: string;
  /** Explained by the comment lines above it, or by the group of settings it closes up to. */
  readonly explained: boolean;
}

/** The strapi-php section of .env.example: each KEY=value, and whether a comment explains it. */
const strapiPhpSection = (): Map<string, Setting> => {
  const text = readCmsText(".env.example");
  const start = text.indexOf("# strapi-php");
  const end = text.indexOf("# Ingestion handlers");
  const lines = text.slice(start, end).split("\n");
  const settings = new Map<string, Setting>();
  let explained = false;
  for (const line of lines) {
    if (line.startsWith("# ")) explained = true;
    else if (/^[A-Z_]+=/.test(line)) {
      const [key = "", ...value] = line.split("=");
      settings.set(key, { value: value.join("="), explained });
    } else explained = false;
  }
  return settings;
};

const list = (value: string | undefined): string[] =>
  (value ?? "").split(",").map((item) => item.trim().toLowerCase());

/** The environment the live contract's main server runs with, booted on a stand-in php. */
const liveMainServer = (): Record<string, string> => {
  const setup = fake();
  const result = runFake(setup, [NODE, "-e", ""]);
  if (result.status !== 0) throw new Error(result.stderr);
  const main = setup
    .records("server.jsonl")
    .find((server) => server.env.DB_DATABASE?.endsWith("main.sqlite"));
  if (main === undefined) throw new Error("no main server");
  return main.env;
};

const positive = (value: string | undefined): number => {
  const number = Number(value);
  expect(Number.isInteger(number) && number > 0, `${String(value)} is a positive integer`).toBe(
    true,
  );
  return number;
};

// What packages/identity needs from a strapi-php deployment (its README, "Backend configuration").
const SDK_SETTINGS = {
  CAMIS_JWT_MANAGEMENT: "refresh",
  CAMIS_SESSIONS_COOKIE_SECURE: "true",
  CAMIS_SESSIONS_COOKIE_SAME_SITE: "strict",
  CAMIS_SESSIONS_COOKIE_PATH: "/api/auth",
  CAMIS_ACCESS_TOKEN_LIFESPAN: "600",
  CAMIS_CORS_EXPOSE: "Retry-After",
  CAMIS_AUTH_HIDE_ACCOUNT_EXISTENCE: "true",
};

describe(".env.example, strapi-php's deployment settings for the identity SDK", () => {
  const settings = strapiPhpSection();

  it.each(Object.entries(SDK_SETTINGS))("sets %s=%s", (key, value) => {
    expect(settings.get(key)?.value).toBe(value);
  });

  it("allows the SDK's request headers in CORS", () => {
    expect(list(settings.get("CAMIS_CORS_HEADERS")?.value)).toEqual(
      expect.arrayContaining([
        "content-type",
        "authorization",
        "x-requested-with",
        "x-strapi-refresh-cookie",
      ]),
    );
  });

  it("lists the site's origin for CORS, never *", () => {
    const origins = list(settings.get("CAMIS_CORS_ORIGIN")?.value);
    expect(origins.length).toBeGreaterThan(0);
    expect(origins).not.toContain("*");
    for (const origin of origins) expect(origin).toMatch(/^https:\/\/[^/]+$/);
  });

  it("turns email confirmation on, so the SDK can answer registrations alike", () => {
    expect(settings.get("CAMIS_EMAIL_CONFIRMATION")?.value).toBe("true");
  });

  it("keeps refresh tokens out of every body only when asked: the SDK asks on each sign-in", () => {
    expect(settings.get("CAMIS_SESSIONS_HTTP_ONLY")?.value).toBe("false");
  });

  it("sets each throttle to a positive rate, the address ceiling no lower than the credential rate", () => {
    const rate = positive(settings.get("CAMIS_AUTH_THROTTLE_PER_MINUTE")?.value);
    expect(
      positive(settings.get("CAMIS_AUTH_ADDRESS_THROTTLE_PER_MINUTE")?.value),
    ).toBeGreaterThanOrEqual(rate);
    positive(settings.get("CAMIS_REFRESH_THROTTLE_PER_MINUTE")?.value);
  });

  it("bounds account mail per recipient to a positive number an hour", () => {
    positive(settings.get("CAMIS_ACCOUNT_MAIL_PER_HOUR")?.value);
  });

  it("counts throttles and the mail bound in a cache store that counts atomically", () => {
    expect(["database", "redis", "memcached"]).toContain(settings.get("CACHE_STORE")?.value);
  });

  it("bounds sessions: access token shorter than the idle limit, idle no longer than the absolute one", () => {
    const access = positive(settings.get("CAMIS_ACCESS_TOKEN_LIFESPAN")?.value);
    const idle = positive(settings.get("CAMIS_IDLE_REFRESH_TOKEN_LIFESPAN")?.value);
    const absolute = positive(settings.get("CAMIS_MAX_REFRESH_TOKEN_LIFESPAN")?.value);
    expect(access).toBeLessThan(idle);
    expect(idle).toBeLessThanOrEqual(absolute);
  });

  it.each(["CAMIS_EMAIL_RESET_PASSWORD_URL", "CAMIS_EMAIL_CONFIRMATION_REDIRECTION"])(
    "points %s at the site over https",
    (key) => {
      expect(settings.get(key)?.value).toMatch(/^https:\/\/identgineer\.example\.com\//);
    },
  );

  // config/sanctum.php in the generated app has 'expiration' => null and reads no variable.
  it("does not set SANCTUM_TOKEN_EXPIRATION, which strapi-php does not read", () => {
    expect(settings.has("SANCTUM_TOKEN_EXPIRATION")).toBe(false);
  });

  it("explains every setting in a comment above it or above its group", () => {
    const unexplained = [...settings].filter(([, setting]) => !setting.explained);
    expect(unexplained.map(([key]) => key)).toEqual([]);
  });

  it("holds placeholders only: no key, password or salt has a value of its own", () => {
    for (const [key, { value }] of settings) {
      if (/(KEY|PASSWORD|SALT|SECRET)$/.test(key)) expect(value, key).toMatch(/^(replace-|$)/);
    }
  });

  it(
    "is what the live contract's main server runs with, for every setting the SDK needs",
    { timeout: 30_000 },
    () => {
      const live = liveMainServer();
      for (const [key, value] of Object.entries(SDK_SETTINGS)) expect(live[key], key).toBe(value);
      for (const key of ["CAMIS_ACCOUNT_MAIL_PER_HOUR", "CACHE_STORE"]) {
        expect(live[key], key).toBe(settings.get(key)?.value);
      }
      expect(list(live.CAMIS_CORS_HEADERS)).toEqual(
        list(settings.get("CAMIS_CORS_HEADERS")?.value),
      );
    },
  );
});

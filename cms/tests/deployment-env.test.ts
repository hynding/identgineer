import { describe, expect, it } from "vitest";
import { readCmsText } from "./model";

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

/** The settings cms/scripts/live-backend.js boots the test backend with. */
const liveSetting = (key: string): string | undefined =>
  new RegExp(`\\b${key}:\\s*\\n?\\s*"([^"]*)"`).exec(readCmsText("scripts/live-backend.js"))?.[1];

// What packages/identity needs from a strapi-php deployment (its README, "Backend configuration").
const SDK_SETTINGS = {
  CAMIS_JWT_MANAGEMENT: "refresh",
  CAMIS_SESSIONS_COOKIE_SECURE: "true",
  CAMIS_SESSIONS_COOKIE_SAME_SITE: "strict",
  CAMIS_SESSIONS_COOKIE_PATH: "/api/auth",
  CAMIS_ACCESS_TOKEN_LIFESPAN: "600",
  CAMIS_CORS_EXPOSE: "Retry-After",
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

  it.each([
    "CAMIS_AUTH_THROTTLE_PER_MINUTE",
    "CAMIS_AUTH_ADDRESS_THROTTLE_PER_MINUTE",
    "CAMIS_REFRESH_THROTTLE_PER_MINUTE",
    "CAMIS_MAX_REFRESH_TOKEN_LIFESPAN",
    "CAMIS_IDLE_REFRESH_TOKEN_LIFESPAN",
    "CAMIS_EMAIL_CONFIRMATION",
    "CAMIS_EMAIL_RESET_PASSWORD_URL",
    "CAMIS_EMAIL_CONFIRMATION_REDIRECTION",
  ])("names %s", (key) => {
    expect(settings.has(key)).toBe(true);
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

  it.each(Object.entries(SDK_SETTINGS))(
    "is what the live contract backend runs with: %s",
    (key, value) => {
      expect(liveSetting(key)).toBe(value);
    },
  );
});

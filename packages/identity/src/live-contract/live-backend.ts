import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  createIdentityClient,
  type IdentityClient,
  type IdentityClientOptions,
} from "../identity-client.ts";
import { createBrowserFetch } from "./browser-fetch.ts";
import { createCookieJar, type CookieJar } from "./cookie-jar.ts";

/** One running strapi-php server, as cms/scripts/live-backend.js describes it. */
export interface LiveServer {
  readonly name: "main" | "confirmation" | "throttled";
  readonly url: string;
  readonly emailConfirmation: boolean;
  readonly throttlePerMinute: number;
  readonly addressThrottlePerMinute: number;
  readonly refreshThrottlePerMinute: number;
}

export interface LiveBackend {
  /** The origin of the page the SDK runs on: listed in CAMIS_CORS_ORIGIN, same site as the API. */
  readonly siteOrigin: string;
  /** Laravel's log, where MAIL_MAILER=log writes each mail. */
  readonly mailLog: string;
  readonly servers: Readonly<Record<LiveServer["name"], LiveServer>>;
}

const DESCRIPTION = process.env.IDENTITY_LIVE_BACKEND;

/** The running backend, or undefined when IDENTITY_LIVE_BACKEND is not set (the suite skips). */
export const liveBackend: LiveBackend | undefined =
  DESCRIPTION === undefined || DESCRIPTION === ""
    ? undefined
    : (JSON.parse(readFileSync(DESCRIPTION, "utf8")) as LiveBackend);

export const SKIP_NOTE = "(skipped: run pnpm contract:live, or set IDENTITY_LIVE_BACKEND)";

export const PASSWORD = "correct horse battery staple";

/** A page of another site, and a page of this site that CORS does not list. */
export const FOREIGN_SITE = "https://evil.example";
export const UNLISTED_SAME_SITE = "http://127.0.0.1:6666";

/** Account names no earlier run has used, as the databases are only reset per boot. */
export const freshAccount = (label: string) => {
  const suffix = randomBytes(5).toString("hex");
  return {
    username: `${label}-${suffix}`,
    email: `${label}-${suffix}@example.test`,
    password: PASSWORD,
  };
};

export interface Browser {
  readonly jar: CookieJar;
  readonly fetch: typeof fetch;
}

/** A browser profile: one cookie jar shared by its tabs, on the page `pageOrigin`. */
export const createBrowser = (
  backend: LiveBackend,
  options: { readonly pageOrigin?: string; readonly cors?: boolean; readonly jar?: CookieJar } = {},
): Browser => {
  const jar = options.jar ?? createCookieJar();
  const { fetch } = createBrowserFetch({
    jar,
    pageOrigin: options.pageOrigin ?? backend.siteOrigin,
    cors: options.cors ?? true,
  });
  return { jar, fetch };
};

const clients: IdentityClient[] = [];
let channels = 0;

/** A tab: the real SDK on `browser`, on a channel of its own so tabs never hear each other. */
export const openTab = (
  server: LiveServer,
  browser: Browser,
  options: Partial<IdentityClientOptions> = {},
): IdentityClient => {
  channels += 1;
  const client = createIdentityClient({
    baseUrl: server.url,
    fetch: browser.fetch,
    channelName: `identgineer-live-${String(process.pid)}-${String(channels)}`,
    locks: null,
    onOnline: null,
    ...options,
  });
  clients.push(client);
  return client;
};

export const disposeTabs = (): void => {
  for (const client of clients.splice(0)) client.dispose();
};

/** The last mail logged to `to`, decoded from quoted-printable as far as links need. */
export const lastMailTo = (backend: LiveBackend, to: string): string | undefined => {
  const log = readFileSync(backend.mailLog, "utf8");
  const mails = log.split(/^\[\d{4}-\d\d-\d\d [\d:]+\] \w+\.DEBUG: /m);
  // Mail headers end their lines with CRLF.
  const mine = mails.filter((mail) => mail.split(/\r?\n/).includes(`To: ${to}`));
  return mine
    .at(-1)
    ?.replace(/=\r?\n/g, "")
    .replace(/=3D/gi, "=");
};

/** A query parameter of the first link in the last mail to `to`. */
export const linkParameter = (backend: LiveBackend, to: string, name: string): string => {
  const mail = lastMailTo(backend, to) ?? "";
  const value = new RegExp(`[?&]${name}=([A-Za-z0-9]+)`).exec(mail)?.[1];
  if (value === undefined) throw new Error(`no ${name} in a mail to ${to}`);
  return value;
};

/** Posts JSON straight to the server, outside any browser (for setting up accounts). */
export const post = async (
  server: LiveServer,
  path: string,
  body: unknown,
): Promise<{ status: number; body: unknown }> => {
  const response = await fetch(`${server.url}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as unknown };
};

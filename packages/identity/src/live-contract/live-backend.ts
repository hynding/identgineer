import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  createIdentityClient,
  type IdentityClient,
  type IdentityClientOptions,
} from "../identity-client.ts";
import { createBrowserFetch } from "./browser-fetch.ts";
import { createCookieJar, type CookieJar } from "./cookie-jar.ts";
import { linkParameterIn, mailsIn } from "./mail-log.ts";

/** One running strapi-php server, as cms/scripts/live-backend.js describes it. */
export interface LiveServer {
  readonly name: "main" | "confirmation" | "disclosing" | "throttled" | "shortLived";
  readonly url: string;
  readonly emailConfirmation: boolean;
  /** CAMIS_AUTH_HIDE_ACCOUNT_EXISTENCE: off only on the disclosing server, as Strapi answers. */
  readonly hideAccountExistence: boolean;
  /** CAMIS_ACCESS_TOKEN_LIFESPAN: 600 seconds, or 2 on the short-lived server. */
  readonly accessTokenLifetimeSeconds: number;
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

/** Every mail logged to `to` so far, oldest first. */
export const mailsTo = (backend: LiveBackend, to: string): string[] => {
  let log: string;
  try {
    log = readFileSync(backend.mailLog, "utf8");
  } catch {
    return [];
  }
  return mailsIn(log, to);
};

const pause = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * The mails to `to` that `keep` accepts, once at least `count` have been logged. camis sends
 * account mail after the answer, and PHP may flush its log later still, so a mail can land a
 * moment after its request.
 */
export const waitForMails = async (
  backend: LiveBackend,
  to: string,
  count: number,
  keep: (mail: string) => boolean = () => true,
): Promise<string[]> => {
  const deadline = Date.now() + 5_000;
  for (;;) {
    const mails = mailsTo(backend, to).filter(keep);
    if (mails.length >= count) return mails;
    if (Date.now() > deadline) throw new Error(`${String(count)} mails to ${to} never arrived`);
    await pause(50);
  }
};

/** Waits a moment for any mail still on its way, then the mails to `to`: for checking none came. */
export const settledMailsTo = async (backend: LiveBackend, to: string): Promise<string[]> => {
  await pause(500);
  return mailsTo(backend, to);
};

/**
 * A query parameter of the link in the `count`th mail to `to` that has one, waiting for that mail.
 * Other mails between (the notice a registration of a taken address sends) are passed over.
 */
export const linkParameter = async (
  backend: LiveBackend,
  to: string,
  name: string,
  count = 1,
): Promise<string> => {
  const mails = await waitForMails(
    backend,
    to,
    count,
    (mail) => linkParameterIn(mail, name) !== undefined,
  );
  const value = linkParameterIn(mails[count - 1] ?? "", name);
  if (value === undefined) throw new Error(`no ${name} in mail ${String(count)} to ${to}`);
  return value;
};

/** Posts JSON straight to the server, outside any browser (for setting up accounts). */
export const post = async (
  server: LiveServer,
  path: string,
  body: unknown,
): Promise<{ status: number; body: unknown; retryAfter: number }> => {
  const response = await fetch(`${server.url}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    body: (await response.json()) as unknown,
    retryAfter: Number(response.headers.get("Retry-After") ?? "0"),
  };
};

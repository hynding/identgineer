/**
 * A minimal browser-like cookie store for the live contract tests (Node's fetch keeps none): enough
 * of RFC 6265bis for the CMS's refresh cookie. Test code only; the SDK never reads cookies.
 */

export type SameSite = "strict" | "lax" | "none";

export interface StoredCookie {
  readonly name: string;
  readonly value: string;
  /** The host it was set by (host-only), or the Domain attribute's domain. */
  readonly domain: string;
  readonly hostOnly: boolean;
  readonly path: string;
  readonly secure: boolean;
  readonly httpOnly: boolean;
  readonly sameSite: SameSite;
  /** Epoch milliseconds; undefined for a session cookie. */
  readonly expiresAt: number | undefined;
}

export interface CookieJarOptions {
  readonly now?: () => number;
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Whether the URL is a secure context for cookies: https, or http on a loopback host, which
 * Chromium and Firefox treat as potentially trustworthy (they set and send Secure cookies there).
 */
export const isTrustworthy = (url: URL): boolean =>
  url.protocol === "https:" || (url.protocol === "http:" && LOOPBACK.has(url.hostname));

const isIpAddress = (host: string): boolean => /^[\d.]+$/.test(host) || host.startsWith("[");

/**
 * Schemeful same-site, approximated: the same scheme, and the same host or (for domain names) the
 * same last two labels. Enough for the test's hosts; it knows no public suffix list.
 */
export const isSameSite = (a: URL, b: URL): boolean => {
  if (a.protocol !== b.protocol) return false;
  if (a.hostname === b.hostname) return true;
  if (isIpAddress(a.hostname) || isIpAddress(b.hostname)) return false;
  const site = (host: string): string => host.split(".").slice(-2).join(".");
  return site(a.hostname) === site(b.hostname);
};

const domainMatches = (host: string, domain: string): boolean =>
  host === domain || (!isIpAddress(host) && host.endsWith(`.${domain}`));

const pathMatches = (requestPath: string, cookiePath: string): boolean =>
  requestPath === cookiePath ||
  (requestPath.startsWith(cookiePath) &&
    (cookiePath.endsWith("/") || requestPath.charAt(cookiePath.length) === "/"));

/** RFC 6265 5.1.4: the request path up to, not including, its last slash; "/" at most. */
const defaultPath = (url: URL): string => {
  const path = url.pathname;
  const last = path.lastIndexOf("/");
  return last <= 0 ? "/" : path.slice(0, last);
};

interface ParsedAttributes {
  domain?: string;
  path?: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: SameSite;
  maxAge?: number;
  expires?: number;
}

const parseAttributes = (parts: readonly string[]): ParsedAttributes => {
  // Browsers treat a cookie without SameSite as Lax.
  const result: ParsedAttributes = { secure: false, httpOnly: false, sameSite: "lax" };
  for (const part of parts) {
    const separator = part.indexOf("=");
    const key = (separator === -1 ? part : part.slice(0, separator)).trim().toLowerCase();
    const value = separator === -1 ? "" : part.slice(separator + 1).trim();
    if (key === "domain" && value !== "") result.domain = value.replace(/^\./, "").toLowerCase();
    else if (key === "path") result.path = value;
    else if (key === "secure") result.secure = true;
    else if (key === "httponly") result.httpOnly = true;
    else if (key === "samesite") {
      const mode = value.toLowerCase();
      if (mode === "strict" || mode === "lax" || mode === "none") result.sameSite = mode;
    } else if (key === "max-age" && /^-?\d+$/.test(value)) result.maxAge = Number(value);
    else if (key === "expires") {
      const time = Date.parse(value);
      if (!Number.isNaN(time)) result.expires = time;
    }
  }
  return result;
};

export const createCookieJar = (options: CookieJarOptions = {}) => {
  const now = options.now ?? Date.now;
  const cookies = new Map<string, StoredCookie>();
  const keyOf = (cookie: Pick<StoredCookie, "name" | "domain" | "path">): string =>
    `${cookie.domain};${cookie.path};${cookie.name}`;

  const live = (): StoredCookie[] => {
    const time = now();
    for (const [key, cookie] of cookies) {
      if (cookie.expiresAt !== undefined && cookie.expiresAt <= time) cookies.delete(key);
    }
    return [...cookies.values()];
  };

  /** Applies one `Set-Cookie` value the response to `url` carried; refused ones are dropped. */
  const store = (url: URL, header: string): void => {
    const [pair = "", ...attributes] = header.split(";");
    const separator = pair.indexOf("=");
    if (separator === -1) return;
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (name === "") return;
    const parsed = parseAttributes(attributes);
    const host = url.hostname.toLowerCase();
    if (parsed.domain !== undefined && !domainMatches(host, parsed.domain)) return;
    if (parsed.secure && !isTrustworthy(url)) return;
    if (parsed.sameSite === "none" && !parsed.secure) return;
    const cookie: StoredCookie = {
      name,
      value,
      domain: parsed.domain ?? host,
      hostOnly: parsed.domain === undefined,
      path: parsed.path?.startsWith("/") === true ? parsed.path : defaultPath(url),
      secure: parsed.secure,
      httpOnly: parsed.httpOnly,
      sameSite: parsed.sameSite,
      // Max-Age wins over Expires; zero or less expires the cookie at once.
      expiresAt: parsed.maxAge !== undefined ? now() + parsed.maxAge * 1000 : parsed.expires,
    };
    const key = keyOf(cookie);
    const existing = cookies.get(key);
    // An insecure origin cannot overwrite a Secure cookie.
    if (existing?.secure === true && !isTrustworthy(url)) return;
    if (cookie.expiresAt !== undefined && cookie.expiresAt <= now()) {
      cookies.delete(key);
      return;
    }
    cookies.set(key, cookie);
  };

  /**
   * The cookies a request to `url` made by a page of `pageOrigin` carries, as a `Cookie` header
   * value (undefined for none). A fetch is never a top-level navigation, so Lax and Strict
   * cookies both need the page to be same-site with the URL.
   */
  const header = (url: URL, pageOrigin: URL): string | undefined => {
    const host = url.hostname.toLowerCase();
    const sameSite = isSameSite(url, pageOrigin);
    const sent = live()
      .filter((cookie) =>
        cookie.hostOnly ? cookie.domain === host : domainMatches(host, cookie.domain),
      )
      .filter((cookie) => pathMatches(url.pathname, cookie.path))
      .filter((cookie) => !cookie.secure || isTrustworthy(url))
      .filter((cookie) => cookie.sameSite === "none" || sameSite)
      .sort((a, b) => b.path.length - a.path.length);
    return sent.length === 0
      ? undefined
      : sent.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
  };

  return {
    store,
    header,
    /** Every unexpired cookie, for assertions. */
    all: (): readonly StoredCookie[] => live(),
    get: (name: string): StoredCookie | undefined => live().find((cookie) => cookie.name === name),
    clear: (): void => {
      cookies.clear();
    },
  };
};

export type CookieJar = ReturnType<typeof createCookieJar>;

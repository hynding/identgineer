import type { CookieJar } from "./cookie-jar.ts";

/**
 * A `fetch` that behaves, for the parts the identity SDK relies on, as a browser page on
 * `pageOrigin` calling another origin: it sends `Origin`, keeps cookies in `jar` only for
 * `credentials: "include"`, preflights non-simple requests, refuses an answer CORS does not allow
 * (as `TypeError: Failed to fetch`), and hides response headers CORS does not expose. With
 * `cors: false` it skips the CORS checks, to see what the server itself answers. Test code only.
 */
export interface BrowserFetchOptions {
  readonly jar: CookieJar;
  readonly pageOrigin: string;
  readonly cors?: boolean;
  /** The browser's User-Agent; a desktop Firefox on Linux by default. */
  readonly userAgent?: string;
  /** The network below; global `fetch` by default. */
  readonly fetch?: typeof fetch;
}

export interface SentRequest {
  readonly method: string;
  readonly url: string;
  readonly status: number;
  readonly preflight: boolean;
}

const SIMPLE_METHODS = new Set(["GET", "HEAD", "POST"]);
const SAFELISTED_REQUEST_HEADERS = new Set([
  "accept",
  "accept-language",
  "content-language",
  "content-type",
]);
const SIMPLE_CONTENT_TYPES = new Set([
  "application/x-www-form-urlencoded",
  "multipart/form-data",
  "text/plain",
]);
const SAFELISTED_RESPONSE_HEADERS = [
  "cache-control",
  "content-language",
  "content-length",
  "content-type",
  "expires",
  "last-modified",
  "pragma",
];

// A browser always sends one; the CMS names each session's device from it.
const FIREFOX_ON_LINUX = "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0";

// Fetch's forbidden request headers: the browser sets these, never page script.
const FORBIDDEN_REQUEST_HEADERS = new Set([
  "accept-charset",
  "accept-encoding",
  "access-control-request-headers",
  "access-control-request-method",
  "connection",
  "content-length",
  "cookie",
  "cookie2",
  "date",
  "dnt",
  "expect",
  "host",
  "keep-alive",
  "origin",
  "referer",
  "set-cookie",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "via",
]);
const isForbidden = (name: string): boolean =>
  FORBIDDEN_REQUEST_HEADERS.has(name) || name.startsWith("proxy-") || name.startsWith("sec-");

/** What a browser hands page script for a redirect it was told not to follow. */
const opaqueRedirect = (): Response =>
  Object.defineProperties(new Response(null), {
    type: { value: "opaqueredirect" },
    status: { value: 0 },
    ok: { value: false },
    statusText: { value: "" },
  });

const failed = (): TypeError => new TypeError("Failed to fetch");

const list = (value: string | null): string[] =>
  (value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item !== "");

/** The request headers that make a request non-simple, lower-cased and sorted. */
const unsafeHeaders = (headers: Headers): string[] =>
  [...headers.entries()]
    .filter(([name, value]) => {
      if (!SAFELISTED_REQUEST_HEADERS.has(name)) return true;
      if (name !== "content-type") return false;
      return !SIMPLE_CONTENT_TYPES.has(value.split(";")[0]?.trim().toLowerCase() ?? "");
    })
    .map(([name]) => name)
    .sort();

const allowsOrigin = (response: Response, origin: string, credentials: boolean): boolean => {
  const allowed = response.headers.get("Access-Control-Allow-Origin");
  if (credentials) {
    return (
      allowed === origin && response.headers.get("Access-Control-Allow-Credentials") === "true"
    );
  }
  return allowed === "*" || allowed === origin;
};

export const createBrowserFetch = (options: BrowserFetchOptions) => {
  const network = options.fetch ?? globalThis.fetch;
  const page = new URL(options.pageOrigin);
  const cors = options.cors ?? true;
  const sent: SentRequest[] = [];

  const preflight = async (
    url: URL,
    method: string,
    headers: readonly string[],
    credentials: boolean,
  ): Promise<void> => {
    const answer = await network(url, {
      method: "OPTIONS",
      headers: {
        Origin: page.origin,
        "Access-Control-Request-Method": method,
        ...(headers.length === 0 ? {} : { "Access-Control-Request-Headers": headers.join(",") }),
      },
      redirect: "error",
    });
    sent.push({ method: "OPTIONS", url: url.href, status: answer.status, preflight: true });
    await answer.body?.cancel();
    if (answer.status < 200 || answer.status > 299) throw failed();
    if (!allowsOrigin(answer, page.origin, credentials)) throw failed();
    const methods = list(answer.headers.get("Access-Control-Allow-Methods"));
    const methodAllowed =
      SIMPLE_METHODS.has(method) ||
      methods.includes(method.toLowerCase()) ||
      (!credentials && methods.includes("*"));
    if (!methodAllowed) throw failed();
    const allowedHeaders = list(answer.headers.get("Access-Control-Allow-Headers"));
    for (const header of headers) {
      // A wildcard never covers Authorization, and means nothing with credentials.
      const wildcard = !credentials && header !== "authorization" && allowedHeaders.includes("*");
      if (!wildcard && !allowedHeaders.includes(header)) throw failed();
    }
  };

  /** The answer as page script sees it: only the headers CORS exposes, never `Set-Cookie`. */
  const exposed = (response: Response, credentials: boolean): Response => {
    const names = list(response.headers.get("Access-Control-Expose-Headers"));
    const visible = new Headers();
    for (const [name, value] of response.headers) {
      const listed = names.includes(name) || (!credentials && names.includes("*"));
      if (name !== "set-cookie" && (SAFELISTED_RESPONSE_HEADERS.includes(name) || listed)) {
        visible.set(name, value);
      }
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: visible,
    });
  };

  const browserFetch = async (
    input: RequestInfo | URL,
    init: RequestInit = {},
  ): Promise<Response> => {
    // The SDK passes a URL string; a Request's method, headers and body would be lost here.
    if (input instanceof Request) throw new TypeError("browser fetch takes a URL, not a Request");
    const url = new URL(String(input));
    const method = (init.method ?? "GET").toUpperCase();
    const headers = new Headers(init.headers);
    for (const name of [...headers.keys()]) if (isForbidden(name)) headers.delete(name);
    const crossOrigin = url.origin !== page.origin;
    const credentials =
      init.credentials === "include" || (!crossOrigin && init.credentials !== "omit");
    if (init.signal?.aborted === true) throw new DOMException("Aborted", "AbortError");
    const nonSimple = !SIMPLE_METHODS.has(method) || unsafeHeaders(headers).length > 0;
    if (cors && crossOrigin && nonSimple) {
      await preflight(url, method, unsafeHeaders(headers), credentials);
    }
    if (crossOrigin || method !== "GET") headers.set("Origin", page.origin);
    headers.set("User-Agent", options.userAgent ?? FIREFOX_ON_LINUX);
    const cookie = credentials ? options.jar.header(url, page) : undefined;
    if (cookie !== undefined) headers.set("Cookie", cookie);
    const manual = init.redirect === "manual";
    const response = await network(url, {
      method,
      headers,
      ...(init.body === undefined || init.body === null ? {} : { body: init.body }),
      redirect: manual ? "manual" : (init.redirect ?? "follow"),
      ...(init.signal === undefined || init.signal === null ? {} : { signal: init.signal }),
    });
    sent.push({ method, url: url.href, status: response.status, preflight: false });
    if (credentials) {
      for (const header of response.headers.getSetCookie()) options.jar.store(url, header, page);
    }
    // A redirect left unfollowed is opaque to page script: status 0, no headers or body.
    if (manual && response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      return opaqueRedirect();
    }
    if (cors && crossOrigin && !allowsOrigin(response, page.origin, credentials)) {
      await response.body?.cancel();
      throw failed();
    }
    return cors && crossOrigin ? exposed(response, credentials) : response;
  };

  return {
    fetch: browserFetch,
    /** Every request sent, preflights included, in order. */
    sent: sent as readonly SentRequest[],
  };
};

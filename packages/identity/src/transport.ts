import { endpointUrl } from "./base-url.ts";
import type { Clock } from "./clock.ts";
import { IdentityError } from "./identity-error.ts";
import { MAX_BODY_CHARACTERS, parseJson } from "./parse-json.ts";

/** Sent on every cookie request: a header no cross-site form can set, so the request is preflighted. */
export const CSRF_HEADER = "X-Requested-With";
export const CSRF_HEADER_VALUE = "identgineer";
/** Asks users-permissions to set the refresh token as an HttpOnly cookie instead of returning it. */
export const REFRESH_COOKIE_HEADER = "x-strapi-refresh-cookie";

export interface ApiRequest {
  readonly method: "GET" | "POST" | "PUT" | "DELETE";
  /** An API path under the base URL, starting with `/`, with any query already encoded. */
  readonly path: string;
  readonly body?: Readonly<Record<string, unknown>>;
  readonly accessToken?: string;
  /** Sends and accepts cookies (the refresh cookie, a provider round trip's session). */
  readonly cookie?: boolean;
  readonly redirect?: RequestRedirect;
}

export interface ApiResponse {
  readonly status: number;
  /** A 2xx answer, or a redirect that `redirect: "manual"` left unfollowed. */
  readonly ok: boolean;
  readonly body: unknown;
  readonly retryAfter: string | null;
}

export interface TransportOptions {
  readonly base: URL;
  readonly fetch: typeof globalThis.fetch;
  readonly clock: Clock;
  readonly timeoutMs: number;
}

export interface Transport {
  /** `signal` (a cookie section's) aborts the request as its timeout would. */
  readonly send: (request: ApiRequest, signal?: AbortSignal) => Promise<ApiResponse>;
}

const headersFor = (request: ApiRequest): Headers => {
  const headers = new Headers({ Accept: "application/json" });
  if (request.body !== undefined) headers.set("Content-Type", "application/json");
  if (request.accessToken !== undefined) {
    headers.set("Authorization", `Bearer ${request.accessToken}`);
  }
  if (request.cookie === true) {
    headers.set(CSRF_HEADER, CSRF_HEADER_VALUE);
    headers.set(REFRESH_COOKIE_HEADER, "httpOnly");
  }
  return headers;
};

/**
 * Redirects are refused unless a request asks to see one unfollowed; a request with the bearer
 * token never follows one, so the token cannot be carried to wherever it points.
 */
const redirectFor = (request: ApiRequest): RequestRedirect =>
  request.accessToken === undefined && request.redirect === "manual" ? "manual" : "error";

const isUnfollowedRedirect = (response: Response): boolean =>
  response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400);

const readBody = async (response: Response, ok: boolean): Promise<unknown> => {
  const declared = Number(response.headers.get("Content-Length") ?? "0");
  if (declared > MAX_BODY_CHARACTERS * 4) throw new IdentityError("unknown");
  if (response.type === "opaqueredirect") return undefined;
  const text = await response.text().catch(() => {
    throw new IdentityError("network");
  });
  if (ok) return parseJson(text);
  try {
    return parseJson(text);
  } catch {
    return undefined;
  }
};

/** Sends identity API requests: JSON in and out, a timeout, and credentials only when asked. */
export const createTransport = (options: TransportOptions): Transport => {
  const send = async (request: ApiRequest, signal?: AbortSignal): Promise<ApiResponse> => {
    if (signal?.aborted === true) throw new IdentityError("network");
    const controller = new AbortController();
    const abort = (): void => {
      controller.abort();
    };
    const timer = options.clock.setTimeout(abort, options.timeoutMs);
    signal?.addEventListener("abort", abort);
    try {
      let response: Response;
      try {
        response = await options.fetch(endpointUrl(options.base, request.path), {
          method: request.method,
          headers: headersFor(request),
          credentials: request.cookie === true ? "include" : "omit",
          cache: "no-store",
          redirect: redirectFor(request),
          signal: controller.signal,
          ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
        });
      } catch {
        throw new IdentityError("network");
      }
      const ok = response.ok || isUnfollowedRedirect(response);
      return {
        status: response.status,
        ok,
        body: await readBody(response, response.ok),
        retryAfter: response.headers.get("Retry-After"),
      };
    } finally {
      options.clock.clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  };
  return { send };
};

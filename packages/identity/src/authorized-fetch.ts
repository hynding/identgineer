import { endpointUrl } from "./base-url.ts";
import type { ClientContext } from "./client-context.ts";
import { IdentityError } from "./identity-error.ts";
import { requireObject } from "./input-checks.ts";

const ENCODED_SEPARATOR = /%(?:2f|5c|2e)/i;

/**
 * The request URL for a path under the base URL, or an absolute URL under it, checked after it is
 * resolved (so `..`, encoded dots and backslashes cannot climb out of the base path). Anything
 * else is refused, so the bearer token never reaches another origin or path.
 */
const resolveTarget = (base: URL, target: unknown): string => {
  const input = target instanceof URL ? target.href : target;
  if (typeof input !== "string") throw new IdentityError("validation");
  // Browsers read a backslash as a slash; refusing them keeps the input meaning what it says.
  if (input.startsWith("//") || input.includes("\\")) throw new IdentityError("validation");
  let url: URL;
  try {
    url = new URL(input.startsWith("/") ? endpointUrl(base, input) : input);
  } catch {
    throw new IdentityError("validation");
  }
  const prefix = base.pathname === "/" ? "/" : `${base.pathname}/`;
  // An encoded slash, backslash or dot may be decoded again by a server or proxy into a separator.
  if (
    url.origin !== base.origin ||
    !url.pathname.startsWith(prefix) ||
    ENCODED_SEPARATOR.test(url.pathname)
  ) {
    throw new IdentityError("validation");
  }
  return url.href;
};

/** The caller's headers, refused as a validation error when `Headers` cannot read them. */
const headersOf = (headers: unknown): Headers => {
  try {
    return new Headers(headers as HeadersInit | undefined);
  } catch {
    throw new IdentityError("validation");
  }
};

const isAbortSignal = (signal: unknown): signal is AbortSignal =>
  typeof signal === "object" &&
  signal !== null &&
  typeof (signal as Partial<AbortSignal>).aborted === "boolean" &&
  typeof (signal as Partial<AbortSignal>).addEventListener === "function" &&
  typeof (signal as Partial<AbortSignal>).removeEventListener === "function";

/** The caller's signal and the client's timeout, whichever aborts first. */
const timeoutSignal = (
  context: ClientContext,
  signal: AbortSignal | null | undefined,
): { signal: AbortSignal; done: () => void } => {
  const controller = new AbortController();
  const abort = (): void => {
    controller.abort();
  };
  const timer = context.clock.setTimeout(abort, context.timeoutMs);
  if (signal?.aborted === true) abort();
  signal?.addEventListener("abort", abort);
  return {
    signal: controller.signal,
    done: () => {
      context.clock.clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    },
  };
};

/**
 * `fetch` for other packages' requests to the CMS: adds the bearer token (never cookies), and on
 * a 401 refreshes once and retries. A request body must be re-sendable (not a stream).
 */
export const authorizedFetch =
  (context: ClientContext) =>
  async (input: string | URL, init: RequestInit = {}): Promise<Response> => {
    requireObject(init);
    const callerHeaders = headersOf(init.headers);
    if (init.signal != null && !isAbortSignal(init.signal)) throw new IdentityError("validation");
    const url = resolveTarget(context.base, input);
    const ticket = context.session.ticket("session");
    const attempt = async (): Promise<Response> => {
      const accessToken = await context.accessToken(ticket);
      const headers = new Headers(callerHeaders);
      headers.set("Authorization", `Bearer ${accessToken}`);
      const timeout = timeoutSignal(context, init.signal);
      try {
        return await context.fetch(url, {
          ...init,
          headers,
          credentials: "omit",
          redirect: "error",
          signal: timeout.signal,
        });
      } catch {
        throw new IdentityError("network");
      } finally {
        timeout.done();
      }
    };
    const response = await attempt();
    if (response.status !== 401) return response;
    // Never replayed under another session than the one it was sent in.
    if (!(await context.refreshSession(ticket))) return response;
    return attempt();
  };

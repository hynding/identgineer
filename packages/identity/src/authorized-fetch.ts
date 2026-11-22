import { endpointUrl } from "./base-url.ts";
import type { ClientContext } from "./client-context.ts";
import { IdentityError } from "./identity-error.ts";

/**
 * The request URL for a path under the base URL, or an absolute URL under it. Anything else is
 * refused, so the bearer token never reaches another origin.
 */
const resolveTarget = (base: URL, input: string): string => {
  if (input.startsWith("/") && !input.startsWith("//") && !input.startsWith("/\\")) {
    return endpointUrl(base, input);
  }
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new IdentityError("validation");
  }
  const prefix = base.pathname === "/" ? "/" : `${base.pathname}/`;
  if (url.origin !== base.origin || !url.pathname.startsWith(prefix)) {
    throw new IdentityError("validation");
  }
  return url.href;
};

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
  async (input: string, init: RequestInit = {}): Promise<Response> => {
    const url = resolveTarget(context.base, input);
    const attempt = async (): Promise<Response> => {
      const accessToken = context.session.accessToken();
      if (accessToken === undefined) throw new IdentityError("unauthorized");
      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${accessToken}`);
      const timeout = timeoutSignal(context, init.signal);
      try {
        return await context.fetch(url, {
          ...init,
          headers,
          credentials: "omit",
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
    const outcome = await context.refresher.refresh();
    if (outcome === "refreshed") return attempt();
    if (outcome === "rejected") context.signedOut("expired");
    return response;
  };

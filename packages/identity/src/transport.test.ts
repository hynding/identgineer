import { describe, expect, it, vi } from "vitest";
import { parseBaseUrl } from "./base-url.ts";
import { createManualClock } from "./testing/manual-clock.ts";
import { createTransport, type ApiRequest } from "./transport.ts";

interface Captured {
  readonly url: string;
  readonly init: RequestInit;
}

const setup = (respond: (url: string, init: RequestInit) => Promise<Response> | Response) => {
  const calls: Captured[] = [];
  const clock = createManualClock();
  const fetch = vi.fn((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(respond(url, init));
  });
  const transport = createTransport({
    base: parseBaseUrl("https://cms.example.com/cms"),
    fetch: fetch as unknown as typeof globalThis.fetch,
    clock,
    timeoutMs: 5000,
  });
  return { calls, clock, transport };
};

const json = (body: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });

const headersOf = (captured: Captured | undefined): Headers => new Headers(captured?.init.headers);

const POST_BODY: ApiRequest = {
  method: "POST",
  path: "/api/auth/forgot-password",
  body: { email: "a@b.c" },
};

describe("createTransport", () => {
  it("sends JSON under the base path and parses the answer", async () => {
    const { calls, transport } = setup(() => json({ ok: true }));
    const response = await transport.send(POST_BODY);
    expect(response).toMatchObject({ status: 200, body: { ok: true } });
    expect(calls[0]?.url).toBe("https://cms.example.com/cms/api/auth/forgot-password");
    expect(calls[0]?.init.method).toBe("POST");
    expect(calls[0]?.init.body).toBe('{"email":"a@b.c"}');
    expect(headersOf(calls[0]).get("content-type")).toBe("application/json");
    expect(headersOf(calls[0]).get("accept")).toBe("application/json");
    expect(calls[0]?.init.cache).toBe("no-store");
  });

  it("omits credentials and sends no CSRF or cookie headers by default", async () => {
    const { calls, transport } = setup(() => json({ ok: true }));
    await transport.send(POST_BODY);
    expect(calls[0]?.init.credentials).toBe("omit");
    expect(headersOf(calls[0]).has("x-requested-with")).toBe(false);
    expect(headersOf(calls[0]).has("x-strapi-refresh-cookie")).toBe(false);
    expect(headersOf(calls[0]).has("authorization")).toBe(false);
  });

  it("adds the bearer token when given one", async () => {
    const { calls, transport } = setup(() => json({}));
    await transport.send({ method: "GET", path: "/api/users/me", accessToken: "tok" });
    expect(headersOf(calls[0]).get("authorization")).toBe("Bearer tok");
    expect(calls[0]?.init.credentials).toBe("omit");
  });

  it("includes credentials only for cookie requests, with the CSRF header and the cookie mode", async () => {
    const { calls, transport } = setup(() => json({ jwt: "x" }));
    await transport.send({ method: "POST", path: "/api/auth/refresh", body: {}, cookie: true });
    expect(calls[0]?.init.credentials).toBe("include");
    expect(headersOf(calls[0]).get("x-requested-with")).toBe("identgineer");
    expect(headersOf(calls[0]).get("x-strapi-refresh-cookie")).toBe("httpOnly");
    expect(headersOf(calls[0]).get("content-type")).toBe("application/json");
  });

  it("sends no body or content type on a GET", async () => {
    const { calls, transport } = setup(() => json({}));
    await transport.send({ method: "GET", path: "/api/auth/sessions", accessToken: "t" });
    expect(calls[0]?.init.body).toBeUndefined();
    expect(headersOf(calls[0]).has("content-type")).toBe(false);
  });

  it("refuses redirects by default", async () => {
    const { calls, transport } = setup(() => json({}));
    await transport.send(POST_BODY);
    expect(calls[0]?.init.redirect).toBe("error");
  });

  it("never lets a bearer request follow a redirect", async () => {
    const { calls, transport } = setup(() => json({}));
    await transport.send({
      method: "GET",
      path: "/api/users/me",
      accessToken: "t",
      redirect: "follow",
    });
    expect(calls[0]?.init.redirect).toBe("error");
  });

  it("passes the redirect mode through", async () => {
    const { calls, transport } = setup(
      () => new Response(null, { status: 302, headers: { Location: "/" } }),
    );
    const response = await transport.send({
      method: "GET",
      path: "/api/auth/email-confirmation?confirmation=abc",
      redirect: "manual",
    });
    expect(calls[0]?.init.redirect).toBe("manual");
    expect(response.status).toBe(302);
    expect(response.body).toBeUndefined();
  });

  it("returns error answers with their body and Retry-After", async () => {
    const { transport } = setup(() =>
      json(
        {
          data: null,
          error: { status: 429, name: "HttpError", message: "Too Many Attempts.", details: {} },
        },
        { status: 429, headers: { "Retry-After": "17" } },
      ),
    );
    const response = await transport.send(POST_BODY);
    expect(response.status).toBe(429);
    expect(response.retryAfter).toBe("17");
  });

  it("turns a failed fetch into a network error that carries nothing from it", async () => {
    const { transport } = setup(() => Promise.reject(new TypeError("Failed to fetch secret")));
    const failure = await transport.send(POST_BODY).catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: "network" });
    expect(JSON.stringify(failure)).not.toContain("secret");
    expect(String(failure)).not.toContain("secret");
  });

  it("aborts a request that takes longer than the timeout", async () => {
    const { calls, clock, transport } = setup(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );
    const pending = transport.send(POST_BODY);
    expect(calls[0]?.init.signal?.aborted).toBe(false);
    clock.advance(5000);
    await expect(pending).rejects.toMatchObject({ code: "network" });
    expect(calls[0]?.init.signal?.aborted).toBe(true);
  });

  it("clears the timeout once answered", async () => {
    const { clock, transport } = setup(() => json({}));
    await transport.send(POST_BODY);
    expect(clock.pendingTimers()).toBe(0);
  });

  it("refuses a body that is not JSON", async () => {
    const { transport } = setup(() => new Response("<html>", { status: 200 }));
    await expect(transport.send(POST_BODY)).rejects.toMatchObject({ code: "unknown" });
  });

  it("treats an unparseable error body as no body", async () => {
    const { transport } = setup(() => new Response("<html>bad gateway</html>", { status: 502 }));
    await expect(transport.send(POST_BODY)).resolves.toMatchObject({
      status: 502,
      body: undefined,
    });
  });

  it("refuses an answer whose declared length is over the limit without reading it", async () => {
    const text = vi.fn(() => Promise.resolve("{}"));
    const response = {
      status: 200,
      ok: true,
      type: "basic",
      headers: new Headers({ "Content-Length": "5000000" }),
      text,
    };
    const { transport } = setup(() => response as unknown as Response);
    await expect(transport.send(POST_BODY)).rejects.toMatchObject({ code: "unknown" });
    expect(text).not.toHaveBeenCalled();
  });
});

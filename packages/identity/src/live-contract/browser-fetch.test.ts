import { describe, expect, it } from "vitest";
import { createBrowserFetch } from "./browser-fetch.ts";
import { createCookieJar } from "./cookie-jar.ts";

const PAGE = "http://127.0.0.1:5173";
const API = "http://127.0.0.1:8000";

interface Seen {
  readonly method: string;
  readonly url: string;
  readonly headers: Headers;
}

const CORS_OK = {
  "Access-Control-Allow-Origin": PAGE,
  "Access-Control-Allow-Credentials": "true",
};

/** A network answering preflights with `preflight` and every other request with `answer`. */
const network = (
  answer: () => Response,
  preflight: Record<string, string> = {
    ...CORS_OK,
    "Access-Control-Allow-Methods": "GET, POST, DELETE",
    "Access-Control-Allow-Headers": "content-type, authorization, x-requested-with",
  },
) => {
  const seen: Seen[] = [];
  const fetch = (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const method = init.method ?? "GET";
    const url = input instanceof Request ? input.url : input.toString();
    seen.push({ method, url, headers: new Headers(init.headers) });
    return Promise.resolve(
      method === "OPTIONS" ? new Response(null, { status: 204, headers: preflight }) : answer(),
    );
  };
  return { fetch, seen };
};

const json = (headers: Record<string, string> = {}, status = 200): Response =>
  new Response("{}", {
    status,
    headers: { "Content-Type": "application/json", ...CORS_OK, ...headers },
  });

describe("the live tests' browser-like fetch", () => {
  it("sends Origin and no preflight for a simple request", async () => {
    const net = network(() => json());
    const browser = createBrowserFetch({
      jar: createCookieJar(),
      pageOrigin: PAGE,
      fetch: net.fetch,
    });
    await browser.fetch(`${API}/api/users/me`);
    expect(net.seen.map((request) => request.method)).toEqual(["GET"]);
    expect(net.seen[0]?.headers.get("Origin")).toBe(PAGE);
    expect(net.seen[0]?.headers.get("User-Agent")).toContain("Firefox");
  });

  it("preflights a JSON post and fails like a browser when a header is not allowed", async () => {
    const net = network(() => json());
    const browser = createBrowserFetch({
      jar: createCookieJar(),
      pageOrigin: PAGE,
      fetch: net.fetch,
    });
    await browser.fetch(`${API}/api/auth/local`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Requested-With": "identgineer" },
      body: "{}",
    });
    expect(net.seen.map((request) => request.method)).toEqual(["OPTIONS", "POST"]);
    expect(net.seen[0]?.headers.get("Access-Control-Request-Headers")).toBe(
      "content-type,x-requested-with",
    );
    await expect(
      browser.fetch(`${API}/api/auth/refresh`, {
        method: "POST",
        headers: { "x-strapi-refresh-cookie": "httpOnly" },
      }),
    ).rejects.toThrow(TypeError);
  });

  it("refuses an answer whose Allow-Origin is not the page, or lacks Allow-Credentials when credentialed", async () => {
    const other = createBrowserFetch({
      jar: createCookieJar(),
      pageOrigin: PAGE,
      fetch: network(
        () =>
          new Response("{}", { headers: { "Access-Control-Allow-Origin": "https://x.example" } }),
      ).fetch,
    });
    await expect(other.fetch(`${API}/api/users/me`)).rejects.toThrow("Failed to fetch");
    const noCredentials = createBrowserFetch({
      jar: createCookieJar(),
      pageOrigin: PAGE,
      fetch: network(() => new Response("{}", { headers: { "Access-Control-Allow-Origin": PAGE } }))
        .fetch,
    });
    await expect(noCredentials.fetch(`${API}/api/users/me`)).resolves.toBeInstanceOf(Response);
    await expect(
      noCredentials.fetch(`${API}/api/users/me`, { credentials: "include" }),
    ).rejects.toThrow("Failed to fetch");
  });

  it("keeps and sends cookies only for credentials: include", async () => {
    const jar = createCookieJar();
    const net = network(() =>
      json({
        "Set-Cookie": "strapi_up_refresh=t1; Path=/api/auth; Secure; HttpOnly; SameSite=Strict",
      }),
    );
    const browser = createBrowserFetch({ jar, pageOrigin: PAGE, fetch: net.fetch });
    await browser.fetch(`${API}/api/auth/local`, { method: "POST", credentials: "omit" });
    expect(jar.all()).toEqual([]);
    await browser.fetch(`${API}/api/auth/local`, { method: "POST", credentials: "include" });
    expect(jar.get("strapi_up_refresh")?.value).toBe("t1");
    await browser.fetch(`${API}/api/auth/refresh`, { method: "POST" });
    expect(net.seen.at(-1)?.headers.get("Cookie")).toBeNull();
    await browser.fetch(`${API}/api/auth/refresh`, { method: "POST", credentials: "include" });
    expect(net.seen.at(-1)?.headers.get("Cookie")).toBe("strapi_up_refresh=t1");
  });

  it("shows page script only safelisted and exposed headers, never Set-Cookie", async () => {
    const hidden = createBrowserFetch({
      jar: createCookieJar(),
      pageOrigin: PAGE,
      fetch: network(() => json({ "Retry-After": "60", "Set-Cookie": "a=1" }, 429)).fetch,
    });
    const answer = await hidden.fetch(`${API}/api/auth/local`, { method: "POST" });
    expect(answer.status).toBe(429);
    expect(answer.headers.get("Retry-After")).toBeNull();
    expect(answer.headers.get("Content-Type")).toBe("application/json");
    const shown = createBrowserFetch({
      jar: createCookieJar(),
      pageOrigin: PAGE,
      fetch: network(() =>
        json(
          {
            "Retry-After": "60",
            "Set-Cookie": "a=1",
            "Access-Control-Expose-Headers": "Retry-After",
          },
          429,
        ),
      ).fetch,
    });
    const exposed = await shown.fetch(`${API}/api/auth/local`, { method: "POST" });
    expect(exposed.headers.get("Retry-After")).toBe("60");
    expect(exposed.headers.get("Set-Cookie")).toBeNull();
  });

  it("without CORS checks returns what the server answered", async () => {
    const browser = createBrowserFetch({
      jar: createCookieJar(),
      pageOrigin: PAGE,
      cors: false,
      fetch: network(() => new Response("{}", { status: 403, headers: { "Retry-After": "5" } }))
        .fetch,
    });
    const answer = await browser.fetch(`${API}/api/auth/refresh`, {
      method: "POST",
      headers: { "x-strapi-refresh-cookie": "httpOnly" },
    });
    expect(answer.status).toBe(403);
    expect(answer.headers.get("Retry-After")).toBe("5");
  });

  it("hides an unfollowed redirect's headers and body", async () => {
    const browser = createBrowserFetch({
      jar: createCookieJar(),
      pageOrigin: PAGE,
      fetch: network(
        () => new Response("moved", { status: 302, headers: { ...CORS_OK, Location: "/x" } }),
      ).fetch,
    });
    const answer = await browser.fetch(`${API}/api/auth/email-confirmation?confirmation=x`, {
      redirect: "manual",
      credentials: "include",
    });
    expect(answer.type).toBe("opaqueredirect");
    expect(answer.status).toBe(0);
    expect(answer.ok).toBe(false);
    expect(answer.headers.get("Location")).toBeNull();
    expect(await answer.text()).toBe("");
  });

  it("sets the headers a page may not set itself, whatever the caller passes", async () => {
    const jar = createCookieJar();
    const net = network(() => json());
    const browser = createBrowserFetch({ jar, pageOrigin: PAGE, fetch: net.fetch });
    await browser.fetch(`${API}/api/users/me`, {
      headers: {
        Cookie: "strapi_up_refresh=planted",
        Cookie2: "x",
        Origin: "https://evil.example",
        Host: "evil.example",
        Referer: "https://evil.example/",
        "Sec-Fetch-Site": "same-origin",
        "Proxy-Authorization": "x",
        Connection: "close",
        "Content-Length": "1",
        "Set-Cookie": "a=1",
        "Accept-Encoding": "identity",
        Authorization: "Bearer allowed",
      },
    });
    const sent = net.seen.at(-1)?.headers ?? new Headers();
    for (const name of [
      "cookie",
      "cookie2",
      "host",
      "referer",
      "sec-fetch-site",
      "proxy-authorization",
      "connection",
      "content-length",
      "set-cookie",
      "accept-encoding",
    ]) {
      expect(sent.get(name), name).toBeNull();
    }
    expect(sent.get("Origin")).toBe(PAGE);
    expect(sent.get("Authorization")).toBe("Bearer allowed");
  });

  it("refuses a Request as input rather than drop its method, headers and body", async () => {
    const browser = createBrowserFetch({
      jar: createCookieJar(),
      pageOrigin: PAGE,
      fetch: network(() => json()).fetch,
    });
    await expect(
      browser.fetch(new Request(`${API}/api/auth/local`, { method: "POST", body: "{}" })),
    ).rejects.toThrow(TypeError);
  });

  it("keeps no Strict or Lax cookie a cross-site page's request was answered with", async () => {
    const jar = createCookieJar();
    const browser = createBrowserFetch({
      jar,
      pageOrigin: "https://evil.example",
      cors: false,
      fetch: network(() => json({ "Set-Cookie": "strict=1; Path=/; Secure; SameSite=Strict" }))
        .fetch,
    });
    await browser.fetch(`${API}/api/auth/local`, { method: "POST", credentials: "include" });
    expect(jar.all()).toEqual([]);
  });

  it("fails an unfollowed cross-origin redirect CORS does not allow, keeping its cookies", async () => {
    const jar = createCookieJar();
    const browser = createBrowserFetch({
      jar,
      pageOrigin: PAGE,
      fetch: network(
        () =>
          new Response(null, {
            status: 302,
            headers: { Location: "/x", "Set-Cookie": "seen=1; Path=/; SameSite=Lax" },
          }),
      ).fetch,
    });
    await expect(
      browser.fetch(`${API}/api/auth/email-confirmation?confirmation=x`, {
        redirect: "manual",
        credentials: "include",
      }),
    ).rejects.toThrow(TypeError);
    expect(jar.get("seen")).toBeDefined();
  });

  it("drops a method-override header naming a forbidden method, and keeps any other", async () => {
    const net = network(() => json());
    const browser = createBrowserFetch({
      jar: createCookieJar(),
      pageOrigin: PAGE,
      cors: false,
      fetch: net.fetch,
    });
    await browser.fetch(`${API}/api/users/me`, {
      headers: {
        "X-HTTP-Method": "TRACE",
        "X-HTTP-Method-Override": "get, connect",
        "X-Method-Override": "track",
      },
    });
    const forbidden = net.seen.at(-1)?.headers ?? new Headers();
    expect(forbidden.get("X-HTTP-Method")).toBeNull();
    expect(forbidden.get("X-HTTP-Method-Override")).toBeNull();
    expect(forbidden.get("X-Method-Override")).toBeNull();
    await browser.fetch(`${API}/api/users/me`, { headers: { "X-HTTP-Method-Override": "DELETE" } });
    expect(net.seen.at(-1)?.headers.get("X-HTTP-Method-Override")).toBe("DELETE");
  });
});

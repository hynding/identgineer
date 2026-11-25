// The same rules as the identity SDK's base URL (packages/identity/src/base-url.ts), restated
// because this package may not depend on that one.

const DEVELOPMENT_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * The CMS's address: `https:`, or `http:` on the local machine for development. It carries no
 * credentials, query or fragment, and its path, if any, loses its trailing slash.
 */
export function parseStoreBaseUrl(value: unknown): URL {
  if (typeof value !== "string") throw new TypeError("baseUrl must be an absolute URL");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError("baseUrl must be an absolute URL");
  }
  const local = url.protocol === "http:" && DEVELOPMENT_HOSTS.has(url.hostname);
  if (url.protocol !== "https:" && !local) {
    throw new TypeError("baseUrl must use https: (http: is allowed for localhost only)");
  }
  if (url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") {
    throw new TypeError("baseUrl must not carry credentials, a query or a fragment");
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url;
}

/** An absolute URL for an API path (which starts with `/`) under the base URL. */
export function storeEndpoint(base: URL, path: string): string {
  return `${base.origin}${base.pathname === "/" ? "" : base.pathname}${path}`;
}

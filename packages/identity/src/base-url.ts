const DEVELOPMENT_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** `https:`, or `http:` on the local machine. */
export const isSecureOrLocal = (url: URL): boolean =>
  url.protocol === "https:" || (url.protocol === "http:" && DEVELOPMENT_HOSTS.has(url.hostname));

/**
 * The identity service's address: `https:`, or `http:` on the local machine for development. It
 * carries no credentials, query or fragment, and its path, if any, loses its trailing slash.
 */
export const parseBaseUrl = (value: string): URL => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError("baseUrl must be an absolute URL");
  }
  if (!isSecureOrLocal(url)) {
    throw new TypeError("baseUrl must use https: (http: is allowed for localhost only)");
  }
  if (url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") {
    throw new TypeError("baseUrl must not carry credentials, a query or a fragment");
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url;
};

/** An absolute URL for an API path (which starts with `/`) under the base URL. */
export const endpointUrl = (base: URL, path: string): string =>
  `${base.origin}${base.pathname === "/" ? "" : base.pathname}${path}`;

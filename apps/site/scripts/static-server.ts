import { createServer, type Server, type ServerResponse } from "node:http";
import { readFileSync, statSync } from "node:fs";
import { extname, join, normalize, posix, sep } from "node:path";
import { HEADERS_FILE } from "./security-headers.ts";

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

const NOT_FOUND_FILE = "404.html";

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** The file a path names inside the root, or undefined when it would leave the root. */
function resolveInside(root: string, pathname: string): string | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
  const relative = normalize(decoded).replace(/^[/\\]+/, "");
  const target = join(
    root,
    relative.endsWith(sep) || relative === "" ? `${relative}index.html` : relative,
  );
  return target === root || target.startsWith(root + sep) ? target : undefined;
}

/**
 * Serves a built site the way its deployment does: every response, errors included, carries the
 * headers the build wrote to `_headers.json`; a folder is served by its `index.html`, a folder
 * asked for without its slash is redirected to it, and anything else is the 404 page.
 */
export function startStaticServer(root: string, port: number, host = "127.0.0.1"): Promise<Server> {
  const headers = JSON.parse(readFileSync(join(root, HEADERS_FILE), "utf8")) as Record<
    string,
    string
  >;
  const send = (response: ServerResponse, status: number, path: string): void => {
    response
      .writeHead(status, {
        ...headers,
        "Cache-Control": "no-store",
        "Content-Type": CONTENT_TYPES[extname(path)] ?? "application/octet-stream",
      })
      .end(readFileSync(path));
  };
  const server = createServer((request, response) => {
    // Leading slashes are one: a request target that starts with two would be read as a host.
    const target = (request.url ?? "/").replace(/^\/+/, "/");
    const pathname = new URL(target, "http://localhost").pathname;
    const path = resolveInside(root, pathname);
    if (path !== undefined && isFile(path)) {
      send(response, 200, path);
    } else if (path !== undefined && isFile(join(path, "index.html"))) {
      // Tidied again, so the answer is never a path that starts with two slashes, another host.
      const folder = posix.normalize(pathname).replace(/^\/+/, "");
      response.writeHead(308, { ...headers, Location: `/${folder}/` }).end();
    } else {
      send(response, 404, join(root, NOT_FOUND_FILE));
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      resolve(server);
    });
  });
}

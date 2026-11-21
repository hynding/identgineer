import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { CONTENT_SECURITY_POLICY } from "./content-security-policy";

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

function resolveInside(root: string, urlPath: string): string | undefined {
  const relative = normalize(decodeURIComponent(urlPath)).replace(/^[/\\]+/, "");
  const target = join(
    root,
    relative.endsWith(sep) || relative === "" ? `${relative}index.html` : relative,
  );
  return target.startsWith(root + sep) ? target : undefined;
}

/** Serves a built directory with the strict policy on every response, errors included. */
export function startStaticServer(root: string, port: number): Promise<Server> {
  const server = createServer((request, response) => {
    const headers = {
      "Content-Security-Policy": CONTENT_SECURITY_POLICY,
      "Cache-Control": "no-store",
    };
    // Browsers ask for the icon unprompted, and a 404 would be logged as a console error.
    if (request.url === "/favicon.ico") {
      response.writeHead(204, headers).end();
      return;
    }
    const path = resolveInside(root, new URL(request.url ?? "/", "http://localhost").pathname);
    if (path === undefined) {
      response.writeHead(403, headers).end();
      return;
    }
    readFile(path).then(
      (body) => {
        const type = CONTENT_TYPES[extname(path)] ?? "application/octet-stream";
        response.writeHead(200, { ...headers, "Content-Type": type }).end(body);
      },
      () => {
        response.writeHead(404, headers).end();
      },
    );
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      resolve(server);
    });
  });
}

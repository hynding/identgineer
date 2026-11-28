import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import type { AddressInfo, Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HEADERS_FILE } from "./security-headers";
import { startStaticServer } from "./static-server";

interface Answer {
  readonly status: number;
  readonly location: string | undefined;
  readonly policy: string | undefined;
  readonly type: string | undefined;
}

/** Asks for a path exactly as written: fetch would tidy it first. */
function ask(port: number, path: string): Promise<Answer> {
  return new Promise((resolve, reject) => {
    request({ host: "127.0.0.1", port, path }, (response) => {
      response.resume();
      resolve({
        status: response.statusCode ?? 0,
        location: response.headers.location,
        policy: response.headers["content-security-policy"] as string | undefined,
        type: response.headers["content-type"],
      });
    })
      .on("error", reject)
      .end();
  });
}

describe("the static server", () => {
  let root: string;
  let server: Server;
  let port: number;

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), "site-www-"));
    writeFileSync(join(root, HEADERS_FILE), JSON.stringify({ "Content-Security-Policy": "x" }));
    writeFileSync(join(root, "index.html"), "home");
    writeFileSync(join(root, "404.html"), "missing");
    writeFileSync(join(root, "sitemap.xml"), "<urlset/>");
    writeFileSync(join(root, "robots.txt"), "User-agent: *");
    mkdirSync(join(root, "x"));
    writeFileSync(join(root, "x", "index.html"), "x");
    server = await startStaticServer(root, 0);
    port = (server.address() as AddressInfo).port;
  });

  afterAll(() => {
    server.close();
    rmSync(root, { recursive: true, force: true });
  });

  it("serves a folder by its index, with the headers the build wrote", async () => {
    expect(await ask(port, "/x/")).toEqual({
      status: 200,
      location: undefined,
      policy: "x",
      type: "text/html; charset=utf-8",
    });
  });

  it.each([
    ["/sitemap.xml", "application/xml; charset=utf-8"],
    ["/robots.txt", "text/plain; charset=utf-8"],
  ])("serves %s as %s", async (path, type) => {
    expect(await ask(port, path)).toMatchObject({ status: 200, type });
  });

  it("redirects a folder asked for without its slash to the folder", async () => {
    expect(await ask(port, "/x")).toMatchObject({ status: 308, location: "/x/" });
  });

  it.each(["//x", "/.//x", "///x", "/./x"])(
    "redirects %s to a path on this site, never to another host",
    async (path) => {
      expect(await ask(port, path)).toMatchObject({ status: 308, location: "/x/" });
    },
  );

  it("answers anything else with the 404 page and its status", async () => {
    expect(await ask(port, "/nothing")).toMatchObject({ status: 404, policy: "x" });
  });
});

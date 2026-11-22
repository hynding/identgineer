import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const PACKAGE = fileURLToPath(new URL("..", import.meta.url));
// What a consumer gets: the dist builds, and the lazy build the www output serves from /build.
const SHIPPED = ["dist", "www/build"].map((directory) => join(PACKAGE, directory));

function scripts(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return scripts(path);
    return /\.(?:js|cjs|mjs)$/.test(entry.name) ? [path] : [];
  });
}

// Strings only the identity SDK or its fake contain: the cookie lock's name, the refresh-cookie
// header, the fake's sign-in route table and its factory.
const SDK_MARKERS = [
  "identgineer-identity-cookie",
  "x-strapi-refresh-cookie",
  "RateLimitError",
  "createFakeIdentityApi",
];

// Stencil copies every script under src into the collection, the browser fixtures' included. The
// identity fixture imports the SDK and its fake by URL from the test server (/identity-sdk), so it
// names the fake's factory, but none of their code is in it.
const FIXTURES = join(PACKAGE, "dist", "collection", "fixtures");
const markersFor = (file: string) =>
  file.startsWith(FIXTURES)
    ? SDK_MARKERS.filter((marker) => marker !== "createFakeIdentityApi")
    : SDK_MARKERS;

// Reads the build output, so it needs the components built first (CI builds before it tests).
describe.skipIf(!SHIPPED.every((directory) => existsSync(directory)))(
  "the shipped component bundles, once built",
  () => {
    const files = SHIPPED.flatMap(scripts);

    it("are there, with the identity components in them", () => {
      expect(files.length).toBeGreaterThan(0);
      expect(files.some((file) => readFileSync(file, "utf8").includes("idg-sign-in"))).toBe(true);
    });

    it("contain no code of the identity SDK or its fake", () => {
      const leaking = files.flatMap((file) => {
        const code = readFileSync(file, "utf8");
        return markersFor(file)
          .filter((marker) => code.includes(marker))
          .map((marker) => `${file.slice(PACKAGE.length)}: ${marker}`);
      });
      expect(leaking).toEqual([]);
    });
  },
);

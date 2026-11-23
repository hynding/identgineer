import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
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

// Reads the build output, so it needs the components built first (CI builds before it tests).
describe.skipIf(!SHIPPED.every((directory) => existsSync(directory)))(
  "the shipped component bundles, once built",
  () => {
    const files = SHIPPED.flatMap(scripts);

    it("are there, with the identity components in them", () => {
      expect(files.length).toBeGreaterThan(0);
      expect(files.some((file) => readFileSync(file, "utf8").includes("idg-sign-in"))).toBe(true);
    });

    it("hold no browser fixture: the fixtures are test pages, served from www only", () => {
      const folders = (directory: string): string[] =>
        readdirSync(directory, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .flatMap((entry) => [
            join(directory, entry.name),
            ...folders(join(directory, entry.name)),
          ]);
      const fixtures = folders(join(PACKAGE, "dist"))
        .filter((folder) => basename(folder) === "fixtures")
        .map((folder) => folder.slice(PACKAGE.length));
      expect(fixtures).toEqual([]);
    });

    it("contain no code of the identity SDK or its fake", () => {
      const leaking = files.flatMap((file) => {
        const code = readFileSync(file, "utf8");
        return SDK_MARKERS.filter((marker) => code.includes(marker)).map(
          (marker) => `${file.slice(PACKAGE.length)}: ${marker}`,
        );
      });
      expect(leaking).toEqual([]);
    });
  },
);

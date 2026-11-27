import { describe, expect, it } from "vitest";
import {
  NOT_FOUND_PAGE,
  ROUTES,
  linkableRoutes,
  navigationRoutes,
  pageFile,
  prerenderedPages,
  type Route,
} from "./routes";

const live = ROUTES.filter((route) => route.status === "live");

describe("the route table", () => {
  it("has the home page at / and declares it live", () => {
    const home = ROUTES.find((route) => route.path === "/");
    expect(home?.status).toBe("live");
    expect(home?.status === "live" ? home.component : undefined).toBe("site-home");
  });

  it("names every path once", () => {
    const paths = ROUTES.map((route) => route.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it.each(ROUTES)("$path is a lower-case path that starts and ends with a slash", ({ path }) => {
    expect(path).toMatch(/^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)*$/);
  });

  it.each(ROUTES)("$path has a label, a title and a description of search length", (route) => {
    expect(route.label.trim()).not.toBe("");
    expect(route.title.trim()).not.toBe("");
    expect(route.description.length).toBeGreaterThanOrEqual(50);
    expect(route.description.length).toBeLessThanOrEqual(160);
  });

  it("lists the pages later tasks add as coming, so nothing links to them yet", () => {
    const coming = ROUTES.filter((route) => route.status === "coming").map((route) => route.path);
    expect(coming).toEqual(
      expect.arrayContaining([
        "/features/",
        "/identity/",
        "/tracking/",
        "/components/",
        "/variations/",
        "/docs/",
        "/sandbox/",
      ]),
    );
  });

  it("gives each live page a component of its own", () => {
    const components = live.map((route) => (route.status === "live" ? route.component : ""));
    expect(new Set(components).size).toBe(components.length);
  });
});

describe("the navigation", () => {
  it("holds the live routes in table order and nothing coming", () => {
    expect(navigationRoutes().map((route) => route.path)).toEqual(live.map((route) => route.path));
  });

  it("points the home page at every other route, live or coming", () => {
    const links = linkableRoutes();
    expect(links.every((route) => route.path !== "/")).toBe(true);
    expect(links.length).toBe(ROUTES.length - 1);
  });
});

describe("the prerendered files", () => {
  it.each([
    ["/", "index.html"],
    ["/docs/", "docs/index.html"],
    ["/docs/getting-started/", "docs/getting-started/index.html"],
  ] as const)("%s is written to %s", (path, file) => {
    expect(pageFile(path)).toBe(file);
  });

  it("are every live route and the not found page, each with its own file", () => {
    const files = prerenderedPages().map((page) => page.file);
    expect(files).toEqual([...live.map((route) => pageFile(route.path)), "404.html"]);
  });

  it("include the not found page, which has no address of its own", () => {
    expect(NOT_FOUND_PAGE.file).toBe("404.html");
    expect(NOT_FOUND_PAGE.path).toBeUndefined();
    expect(NOT_FOUND_PAGE.component).toBe("site-not-found");
  });

  it("carry their route's path, so the shell can mark the current page", () => {
    const home = prerenderedPages().find((page) => page.file === "index.html");
    expect(home?.path).toBe("/");
  });
});

// A compile-time check: a live route without a component is not a Route.
const missingComponent = {
  path: "/x/",
  label: "X",
  title: "X",
  description: "x".repeat(60),
  status: "live",
} as const;
// @ts-expect-error a live route must name its component
const rejected: Route = missingComponent;
void rejected;

import { describe, expect, it } from "vitest";
import {
  NOT_FOUND_PAGE,
  ROUTES,
  isOverview,
  linkableRoutes,
  livePaths,
  navigationRoutes,
  neighboursOf,
  pageFile,
  prerenderedPages,
  sectionOf,
  type LiveRoute,
  type Route,
} from "./routes";

const live = ROUTES.filter((route): route is LiveRoute => route.status === "live");

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
    expect(coming).toEqual(["/components/", "/variations/", "/sandbox/"]);
  });

  it("has the reading pages live, each drawn from the content page of its own slug", () => {
    const reading = live.filter((route) => route.component === "site-content-page");
    expect(reading.map((route) => route.path)).toEqual([
      "/features/",
      "/identity/",
      "/tracking/",
      "/docs/",
      "/docs/getting-started/",
      "/docs/theming/",
      "/docs/security/",
    ]);
    const slugs = reading.map((route) =>
      route.component === "site-content-page" ? route.content : "",
    );
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("puts a page under another only when that one is a live top-level page", () => {
    for (const route of ROUTES) {
      if (route.parent === undefined) continue;
      const parent = ROUTES.find((candidate) => candidate.path === route.parent);
      expect(parent?.status, route.path).toBe("live");
      expect(parent?.parent, route.path).toBeUndefined();
      expect(route.path.startsWith(route.parent), route.path).toBe(true);
    }
  });
});

describe("the docs section", () => {
  it("is the docs index and the guides under it, in table order", () => {
    expect(sectionOf("/docs/getting-started/").map((route) => route.path)).toEqual([
      "/docs/",
      "/docs/getting-started/",
      "/docs/theming/",
      "/docs/security/",
    ]);
    expect(sectionOf("/docs/").map((route) => route.path)).toEqual(
      sectionOf("/docs/security/").map((route) => route.path),
    );
  });

  it("is none for a page outside a section", () => {
    expect(sectionOf("/identity/")).toEqual([]);
    expect(sectionOf("/")).toEqual([]);
  });

  it("leads from each page to the one before and after it, and no further", () => {
    const paths = (path: "/docs/" | "/docs/theming/" | "/docs/security/") => {
      const { previous, next } = neighboursOf(path);
      return [previous?.path, next?.path];
    };
    expect(paths("/docs/")).toEqual([undefined, "/docs/getting-started/"]);
    expect(paths("/docs/theming/")).toEqual(["/docs/getting-started/", "/docs/security/"]);
    expect(paths("/docs/security/")).toEqual(["/docs/theming/", undefined]);
    expect(neighboursOf("/identity/")).toEqual({});
  });
});

describe("the navigation", () => {
  it("holds the live top-level routes in table order, nothing coming and no page of a section", () => {
    expect(navigationRoutes().map((route) => route.path)).toEqual([
      "/",
      "/features/",
      "/identity/",
      "/tracking/",
      "/docs/",
    ]);
  });

  it("knows every live path, a section's pages among them, which links may point to", () => {
    expect([...livePaths()]).toEqual(live.map((route) => route.path));
  });

  it("leads the home page's links with the overview of the features, live or coming", () => {
    const [first, ...rest] = linkableRoutes();
    expect(first?.path).toBe("/features/");
    expect(first && isOverview(first)).toBe(true);
    expect(rest.some(isOverview)).toBe(false);
    if (!first) return;
    expect(
      isOverview({ ...first, status: "live", component: "site-content-page", content: "x" }),
    ).toBe(true);
    expect(isOverview({ ...first, status: "coming" })).toBe(true);
  });

  it("points the home page at every other top-level route, live or coming", () => {
    const links = linkableRoutes();
    expect(links.every((route) => route.path !== "/" && route.parent === undefined)).toBe(true);
    expect(links.length).toBe(ROUTES.filter((route) => route.parent === undefined).length - 1);
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

  it("carry the slug of the content page a reading page is drawn from", () => {
    const theming = prerenderedPages().find((page) => page.path === "/docs/theming/");
    expect(theming?.component).toBe("site-content-page");
    expect(theming?.content).toBe("theming");
    expect(prerenderedPages().find((page) => page.path === "/")?.content).toBeUndefined();
  });
});

describe("the route type", () => {
  it("refuses a reading page without the slug of its content, at compile time", () => {
    const missingContent = {
      path: "/x/",
      label: "X",
      title: "X",
      description: "x".repeat(60),
      status: "live",
      component: "site-content-page",
    } as const;
    // @ts-expect-error a content route must name the page it draws
    const rejected: Route = missingContent;
    expect(rejected.status).toBe("live");
  });

  it("refuses a live route without a component, at compile time", () => {
    const missingComponent = {
      path: "/x/",
      label: "X",
      title: "X",
      description: "x".repeat(60),
      status: "live",
    } as const;
    // @ts-expect-error a live route must name its component
    const rejected: Route = missingComponent;
    expect(rejected.status).toBe("live");
  });
});

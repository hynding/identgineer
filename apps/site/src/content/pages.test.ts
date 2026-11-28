import { describe, expect, it } from "vitest";
import { ROUTES, livePaths } from "../routes.ts";
import { STATIC_PAGES } from "./pages/index.ts";
import { describeContentProblem, parseContentPage } from "./validate-content-page.ts";

const CONTEXT = { paths: livePaths() };

describe("the repository's reading pages", () => {
  it.each(STATIC_PAGES.map((page) => [page.slug, page] as const))(
    "%s is a valid content page",
    (_, page) => {
      const result = parseContentPage(page, CONTEXT);
      expect(result.ok ? "valid" : describeContentProblem(result.error)).toBe("valid");
    },
  );

  it("are one for each reading route not made from the library's documentation, and no more", () => {
    const routed = ROUTES.flatMap((route) =>
      route.status === "live" && route.component === "site-content-page" && !route.generated
        ? [route.content]
        : [],
    );
    expect(STATIC_PAGES.map((page) => page.slug)).toEqual(routed);
  });

  it.each(STATIC_PAGES.map((page) => [page.slug, page] as const))(
    "%s has sections to list in its table of contents",
    (_, page) => {
      expect(page.body.filter((block) => block.type === "heading").length).toBeGreaterThan(1);
    },
  );
});

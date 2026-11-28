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

  // Words that say a page is yet to come go stale the day the page is live. A page that is linked
  // from the writing is a page its writers have met, so each live page, but the home page, must be
  // linked from the body of a reading page, and a link is how a statement about it is kept true.
  it("link every live page but the home page from somewhere in their text", () => {
    const linked = new Set<string>();
    const visit = (node: unknown): void => {
      if (Array.isArray(node)) node.forEach(visit);
      else if (typeof node === "object" && node !== null) {
        const record = node as Record<string, unknown>;
        if (record.type === "link" && typeof record.href === "string") {
          linked.add(record.href.split("#")[0] ?? "");
        }
        Object.values(record).forEach(visit);
      }
    };
    STATIC_PAGES.forEach((page) => {
      visit(page.body);
    });
    const unlinked = ROUTES.flatMap((route) =>
      route.status === "live" && route.path !== "/" && !linked.has(route.path) ? [route.path] : [],
    );
    expect(unlinked).toEqual([]);
  });

  it.each(STATIC_PAGES.map((page) => [page.slug, page] as const))(
    "%s has sections to list in its table of contents",
    (_, page) => {
      expect(page.body.filter((block) => block.type === "heading").length).toBeGreaterThan(1);
    },
  );
});

import { describe, expect, it } from "vitest";
import { paginationRange, type PaginationToken } from "./pagination-range";

const GAP_START = "start-ellipsis";
const GAP_END = "end-ellipsis";

describe("paginationRange", () => {
  it("lists every page when they all fit", () => {
    expect(paginationRange({ page: 1, pageCount: 5 })).toEqual([1, 2, 3, 4, 5]);
    expect(paginationRange({ page: 4, pageCount: 7 })).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("lists no pages when there are none, and one page when there is one", () => {
    expect(paginationRange({ page: 1, pageCount: 0 })).toEqual([]);
    expect(paginationRange({ page: 1, pageCount: 1 })).toEqual([1]);
  });

  it("truncates the end when the current page is near the start", () => {
    expect(paginationRange({ page: 1, pageCount: 10 })).toEqual([1, 2, 3, 4, 5, GAP_END, 10]);
    expect(paginationRange({ page: 4, pageCount: 10 })).toEqual([1, 2, 3, 4, 5, GAP_END, 10]);
  });

  it("truncates both sides when the current page is in the middle", () => {
    expect(paginationRange({ page: 5, pageCount: 10 })).toEqual([
      1,
      GAP_START,
      4,
      5,
      6,
      GAP_END,
      10,
    ]);
    expect(paginationRange({ page: 6, pageCount: 20 })).toEqual([
      1,
      GAP_START,
      5,
      6,
      7,
      GAP_END,
      20,
    ]);
  });

  it("truncates the start when the current page is near the end", () => {
    expect(paginationRange({ page: 10, pageCount: 10 })).toEqual([1, GAP_START, 6, 7, 8, 9, 10]);
    expect(paginationRange({ page: 7, pageCount: 10 })).toEqual([1, GAP_START, 6, 7, 8, 9, 10]);
  });

  it("shows a page rather than an ellipsis that would stand for only that page", () => {
    expect(paginationRange({ page: 5, pageCount: 8 })).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("widens the window with siblings and boundaries", () => {
    expect(paginationRange({ page: 10, pageCount: 20, siblings: 2 })).toEqual([
      1,
      GAP_START,
      8,
      9,
      10,
      11,
      12,
      GAP_END,
      20,
    ]);
    expect(paginationRange({ page: 10, pageCount: 20, boundaries: 2 })).toEqual([
      1,
      2,
      GAP_START,
      9,
      10,
      11,
      GAP_END,
      19,
      20,
    ]);
  });

  it("can drop the boundary pages", () => {
    expect(paginationRange({ page: 5, pageCount: 10, boundaries: 0 })).toEqual([
      GAP_START,
      4,
      5,
      6,
      GAP_END,
    ]);
  });

  it("clamps a page outside the range and repairs unusable options", () => {
    expect(paginationRange({ page: 99, pageCount: 10 })).toEqual(
      paginationRange({ page: 10, pageCount: 10 }),
    );
    expect(paginationRange({ page: -3, pageCount: 10 })).toEqual(
      paginationRange({ page: 1, pageCount: 10 }),
    );
    expect(paginationRange({ page: Number.NaN, pageCount: 10 })).toEqual(
      paginationRange({ page: 1, pageCount: 10 }),
    );
    expect(paginationRange({ page: 5, pageCount: 10, siblings: -1, boundaries: 1.5 })).toEqual(
      paginationRange({ page: 5, pageCount: 10 }),
    );
    expect(paginationRange({ page: 1, pageCount: Number.NaN })).toEqual([]);
    expect(paginationRange({ page: 1, pageCount: 4.9 })).toEqual([1, 2, 3, 4]);
  });

  it("holds its invariants for every page of every size", () => {
    for (let pageCount = 0; pageCount <= 30; pageCount += 1) {
      for (let siblings = 0; siblings <= 2; siblings += 1) {
        for (let boundaries = 0; boundaries <= 2; boundaries += 1) {
          const slots = 2 * boundaries + 2 * siblings + 3;
          for (let page = 1; page <= Math.max(pageCount, 1); page += 1) {
            const tokens = paginationRange({ page, pageCount, siblings, boundaries });
            const where = JSON.stringify({ page, pageCount, siblings, boundaries, tokens });
            const pages = tokens.filter((token): token is number => typeof token === "number");

            expect(tokens.length, where).toBe(Math.min(pageCount, slots));
            expect(pages, where).toEqual([...new Set(pages)].sort((a, b) => a - b));
            if (pageCount > 0) expect(pages, where).toContain(page);
            if (pageCount > 0 && boundaries > 0) {
              expect(pages[0], where).toBe(1);
              expect(pages[pages.length - 1], where).toBe(pageCount);
            }
            tokens.forEach((token: PaginationToken, index) => {
              if (typeof token === "number") return;
              const before = tokens[index - 1];
              const after = tokens[index + 1];
              const from = typeof before === "number" ? before : 0;
              const to = typeof after === "number" ? after : pageCount + 1;
              // An ellipsis must hide at least two pages, or showing them would be no longer.
              expect(to - from - 1, where).toBeGreaterThanOrEqual(2);
            });
          }
        }
      }
    }
  });
});

import { describe, expect, it } from "vitest";
import {
  createCmsDashboardSource,
  type CmsDashboardErrorCode,
} from "@identgineer/tracking/dashboard";
import { DashboardError, type DashboardErrorCode, type DashboardSource } from "./dashboard-types";
import { validatedSource } from "./validated-source";

// The CMS source lives in @identgineer/tracking/dashboard, which may not import this package, so
// it restates the seam. These assertions are compile-time: `pnpm typecheck` fails the moment the
// CMS source stops being a DashboardSource or answers a code the dashboard does not know.
type Assignable<From, To> = [From] extends [To] ? true : false;

type CmsSource = ReturnType<typeof createCmsDashboardSource>;

const satisfied: {
  source: Assignable<CmsSource, DashboardSource>;
  codes: Assignable<CmsDashboardErrorCode, DashboardErrorCode>;
} = { source: true, codes: true };

// A source that lacks a call is refused, so the check above is not vacuous.
const refused: { partial: Assignable<Omit<CmsSource, "summary">, DashboardSource> } = {
  partial: false,
};

describe("the CMS dashboard source of @identgineer/tracking", () => {
  it("is a DashboardSource and answers only codes the dashboard knows, which the compiler checks", () => {
    expect(Object.values(satisfied).every(Boolean)).toBe(true);
    expect(refused.partial).toBe(false);
  });

  it("rejects through validatedSource with this package's DashboardError and the same code", async () => {
    const source = validatedSource(
      createCmsDashboardSource({
        baseUrl: "https://cms.example.com",
        fetch: () => Promise.resolve(new Response("{}", { status: 404 })),
      }),
    );
    const error: unknown = await source
      .summary("property0000000000000001", "7d")
      .catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(DashboardError);
    expect(error).toMatchObject({ code: "not-found" });
  });
});

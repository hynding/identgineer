import { describe, expect, it } from "vitest";
import { createTracker, type ConsentApi, type ConsentStatus } from "@identgineer/tracking";
import type * as Local from "./consent-types";

// The components declare the few members of the tracker's consent object they use, structurally,
// so the bundle needs no dependency on the tracking package and its built declarations never
// point at the package's TypeScript source. These assertions are compile-time: `pnpm typecheck`
// fails the moment the tracker's consent object stops satisfying what a component needs.
/* eslint-disable @typescript-eslint/no-unnecessary-type-parameters -- the standard type-equality check */
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assignable<From, To> = [From] extends [To] ? true : false;
/* eslint-enable @typescript-eslint/no-unnecessary-type-parameters */

type TrackerConsent = ReturnType<typeof createTracker>["consent"];

const satisfied: {
  trackerConsent: Assignable<TrackerConsent, Local.ConsentClient>;
  consentApi: Assignable<ConsentApi, Local.ConsentClient>;
  status: Equal<Local.ConsentStatusView, ConsentStatus>;
} = { trackerConsent: true, consentApi: true, status: true };

// An object that lacks a member a component calls is refused, so the checks above are not vacuous.
const refused: {
  readOnly: Assignable<Pick<ConsentApi, "get" | "onChange">, Local.ConsentClient>;
} = { readOnly: false };

describe("the consent type the components declare", () => {
  it("is satisfied by the tracker's consent object, which the compiler checks", () => {
    expect(Object.values(satisfied).every(Boolean)).toBe(true);
    expect(refused.readOnly).toBe(false);
  });
});

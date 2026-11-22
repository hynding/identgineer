import { describe, expect, it } from "vitest";
import {
  IDENTITY_ERROR_CODES,
  type IdentityClient,
  type IdentityErrorCode,
  type SignOutReason,
} from "@identgineer/identity";
import { IDENTITY_ERROR_CODES as LOCAL_ERROR_CODES } from "./identity-types";
import type * as Local from "./identity-types";

// The components declare the few members of the identity client they use, structurally, so the
// package needs no runtime dependency on the SDK and its built declarations never point at the
// SDK's TypeScript source. These assertions are compile-time: `pnpm typecheck` fails the moment
// the SDK's client stops satisfying what a component needs.
/* eslint-disable @typescript-eslint/no-unnecessary-type-parameters -- the standard identity check */
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assignable<From, To> = [From] extends [To] ? true : false;
/* eslint-enable @typescript-eslint/no-unnecessary-type-parameters */

const satisfied: {
  signIn: Assignable<IdentityClient, Local.SignInClient>;
  register: Assignable<IdentityClient, Local.RegisterClient>;
  passwordReset: Assignable<IdentityClient, Local.PasswordResetClient>;
  profile: Assignable<IdentityClient, Local.ProfileClient>;
  sessionGuard: Assignable<IdentityClient, Local.SessionGuardClient>;
  userMenu: Assignable<IdentityClient, Local.UserMenuClient>;
  codes: Equal<Local.IdentityErrorCode, IdentityErrorCode>;
  reasons: Equal<Local.SignOutReason, SignOutReason>;
} = {
  signIn: true,
  register: true,
  passwordReset: true,
  profile: true,
  sessionGuard: true,
  userMenu: true,
  codes: true,
  reasons: true,
};

// An object that lacks a member a component calls is refused, so the checks above are not vacuous.
const refused: {
  stateOnly: Assignable<Pick<IdentityClient, "getState" | "subscribe">, Local.SignInClient>;
} = { stateOnly: false };

describe("the identity client types the components declare", () => {
  it("are satisfied by the SDK's client, which the compiler checks", () => {
    expect(Object.values(satisfied).every(Boolean)).toBe(true);
    expect(refused.stateOnly).toBe(false);
  });

  it("know every error code the SDK has, in its order", () => {
    expect(LOCAL_ERROR_CODES).toEqual(IDENTITY_ERROR_CODES);
  });
});

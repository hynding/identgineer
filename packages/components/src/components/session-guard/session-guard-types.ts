import type { IdentityStatus, SignOutReason } from "../../identity/identity-types";

/** Detail of `idgSessionChange`: what the guard shows now, and why it is signed out. */
export type SessionChangeDetail =
  | { readonly status: Exclude<IdentityStatus, "signed-out"> }
  | { readonly status: "signed-out"; readonly reason: SignOutReason };

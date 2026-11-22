import type { IdentityStatus, SignOutReason } from "../../identity/identity-types";

/**
 * Detail of `idgSessionChange`: what the guard shows now, and why it is signed out.
 * `unreachable`: the restore could not reach the server, and the guard offers to try again.
 */
export type SessionChangeDetail =
  | { readonly status: Exclude<IdentityStatus, "signed-out"> | "unreachable" }
  | { readonly status: "signed-out"; readonly reason: SignOutReason };

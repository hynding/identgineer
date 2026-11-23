import type { IdentityUserDetail } from "../../identity/event-details";

/**
 * Detail of `idgRegistered`. `check-email` is the same for a new address and one already
 * registered; `signed-in` comes only from a backend that confirms no addresses.
 */
export type RegisteredDetail =
  | { readonly outcome: "check-email" }
  | { readonly outcome: "signed-in"; readonly user: IdentityUserDetail };

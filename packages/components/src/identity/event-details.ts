/** The account fields an event carries: enough to greet the user, never a credential or token. */
export interface IdentityUserDetail {
  readonly id: number;
  readonly username: string;
}

/** Detail of `idgSignedIn` and of the other events that end signed in. */
export interface SignedInDetail {
  readonly user: IdentityUserDetail;
}

/** Detail of `idgSignedOut`. `superseded`: another tab signed in since, and that session stands. */
export interface SignedOutDetail {
  readonly outcome: "signed-out" | "server-unreachable" | "superseded";
}

export function userDetail(user: {
  readonly id: number;
  readonly username: string;
}): SignedInDetail {
  return { user: { id: user.id, username: user.username } };
}

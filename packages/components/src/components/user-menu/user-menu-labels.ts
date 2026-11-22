/** Every string `idg-user-menu` shows. Pass a partial object as `labels` to translate some. */
export interface UserMenuLabels {
  /** The avatar button's name. `{name}` is the user's name. */
  readonly trigger: string;
  /** The heading of the account's items. `{name}` is the user's name. */
  readonly signedInAs: string;
  readonly signOut: string;
  /** Announced after a sign-out that ended the session everywhere it set out to. */
  readonly signedOut: string;
  /** Shown after a sign-out that could not reach the server: the session may live on there. */
  readonly serverUnreachable: string;
  /** Announced when another tab's newer sign-in stands, which is not an error. */
  readonly superseded: string;
  readonly errorUnknown: string;
  readonly dismiss: string;
  /**
   * The name of the menu's own box, which takes focus after a sign-out when the signed-out slot
   * holds nothing that takes focus itself.
   */
  readonly region: string;
}

export const USER_MENU_LABELS: UserMenuLabels = {
  trigger: "Account menu for {name}",
  signedInAs: "Signed in as {name}",
  signOut: "Sign out",
  signedOut: "You are signed out.",
  serverUnreachable:
    "You are signed out on this device, but the server could not be reached. Your session may stay active there until it expires.",
  superseded: "You are signed in from another tab.",
  errorUnknown: "Something went wrong. Try again later.",
  dismiss: "Dismiss",
  region: "Account",
};

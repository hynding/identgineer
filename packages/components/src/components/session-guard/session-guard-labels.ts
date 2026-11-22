/** The text of idg-session-guard's own notices. Override any of them through `labels`. */
export interface SessionGuardLabels {
  /** The restore could not reach the server, so the guard does not know who is signed in. */
  readonly unreachable: string;
  readonly retry: string;
  /** A sign-out of this device that could not reach the server. */
  readonly signOutUnreachable: string;
  /** "Sign out everywhere" that could not reach the server. */
  readonly signOutEverywhereUnreachable: string;
  readonly dismiss: string;
  /** The name of the guard's region, which takes focus when what had focus is taken away. */
  readonly region: string;
  /** Said when the guard shows its content in place of what had focus. */
  readonly signedIn: string;
  /** Said when the guard shows its fallback in place of what had focus. */
  readonly signedOut: string;
}

export const SESSION_GUARD_LABELS: SessionGuardLabels = {
  unreachable: "The service could not be reached. Check your connection and try again.",
  retry: "Try again",
  signOutUnreachable:
    "You are signed out on this device, but the server could not be reached. Your session may stay active there until it expires.",
  signOutEverywhereUnreachable:
    "You are signed out on this device, but the server could not be reached, so your other sessions may stay signed in until they expire. Sign in and try again once you are back online.",
  dismiss: "Dismiss",
  region: "Account",
  signedIn: "You are signed in.",
  signedOut: "You are signed out.",
};

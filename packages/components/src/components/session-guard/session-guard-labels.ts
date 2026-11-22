/** The text of idg-session-guard's own notices. Override any of them through `labels`. */
export interface SessionGuardLabels {
  /** The restore could not reach the server, so the guard does not know who is signed in. */
  readonly unreachable: string;
  readonly retry: string;
}

export const SESSION_GUARD_LABELS: SessionGuardLabels = {
  unreachable: "The service could not be reached. Check your connection and try again.",
  retry: "Try again",
};

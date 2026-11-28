/**
 * The clients the examples of the components that ask questions are given. Each answers the one
 * question the example shows, with nothing behind it: nobody is signed in, and nobody has chosen
 * whether to be tracked. They never reach a server, and a choice made in the example is not kept.
 */

const NOBODY = { status: "signed-out", reason: "no-session" } as const;

/** An identity client for a component that shows what a visitor sees while nobody is signed in. */
export const SIGNED_OUT_CLIENT = {
  getState: () => NOBODY,
  subscribe: () => () => undefined,
  restore: () => Promise.resolve(undefined),
  signOut: () => Promise.resolve({ outcome: "signed-out" as const }),
};

const UNDECIDED = { state: "unknown", decidedAt: null } as const;

/** A consent object for a component that shows the question before anyone has answered it. */
export const UNDECIDED_CONSENT = {
  get: () => UNDECIDED,
  grant: () => true,
  deny: () => true,
  reset: () => true,
  onChange: () => () => undefined,
};

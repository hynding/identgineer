import type { RestoreSource, StateSource } from "./identity-types";

/** How a restore went: `unreachable` when it failed and the state is still unknown. */
export type RestoreOutcome = "done" | "unreachable";

type Restorable = Pick<StateSource, "getState"> & RestoreSource;

// Shared by every component on the page, so a guard and a menu given the same client restore it
// once between them, and all hear how it went.
const running = new WeakMap<Restorable, Promise<RestoreOutcome>>();
const failed = new WeakSet<Restorable>();

function start(client: Restorable): Promise<RestoreOutcome> {
  let attempt: Promise<RestoreOutcome>;
  try {
    attempt = client.restore().then(
      (): RestoreOutcome => "done",
      (): RestoreOutcome => "unreachable",
    );
  } catch {
    // A disposed client throws at once; its state stays unknown.
    attempt = Promise.resolve("unreachable");
  }
  const settled = attempt.then((outcome) => {
    running.delete(client);
    if (outcome === "unreachable") failed.add(client);
    return outcome;
  });
  running.set(client, settled);
  return settled;
}

/**
 * Resumes the session from the refresh cookie when the client does not know yet whether anyone is
 * signed in, one attempt at a time per client. After a failure it does not try again by itself
 * (a component asking again would otherwise retry in a loop while the server is unreachable):
 * `retryRestore` does, when the user or the browser says to.
 */
export function restoreOnce(client: Restorable): Promise<RestoreOutcome> {
  if (client.getState().status !== "unknown") return Promise.resolve("done");
  const current = running.get(client);
  if (current) return current;
  if (failed.has(client)) return Promise.resolve("unreachable");
  return start(client);
}

/** Tries the restore again after a failure, sharing an attempt already under way. */
export function retryRestore(client: Restorable): Promise<RestoreOutcome> {
  failed.delete(client);
  return restoreOnce(client);
}

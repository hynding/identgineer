import type { Clock } from "./clock.ts";
import { IdentityError } from "./identity-error.ts";

/** The part of the Web Locks API (`navigator.locks`) the client uses. */
export interface LockManagerLike {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

/**
 * Held by every request that presents or sets the shared refresh cookie, so the page's tabs send
 * them one at a time: a request reads the cookie when sent and sets it when answered, and two in
 * flight at once would let the older answer overwrite the newer cookie.
 */
export const COOKIE_LOCK = "identgineer-identity-cookie";

/**
 * The given lock manager, or the browser's when the option is left out; `null` turns locking off.
 * Without one, each tab sends its cookie requests on its own, and a cookie refresh retries once
 * when another tab rotated first.
 */
export const resolveLocks = (
  option: LockManagerLike | null | undefined,
): LockManagerLike | null => {
  if (option !== undefined) return option;
  const navigator = (globalThis as { navigator?: { locks?: Partial<LockManagerLike> } }).navigator;
  const locks = navigator?.locks;
  return typeof locks?.request === "function" ? (locks as LockManagerLike) : null;
};

/**
 * What a task inside a cookie section is given: the cookie lock is held, or there is no working
 * lock manager to take it from. `signal` aborts at the section's deadline; every request the
 * section sends carries it.
 */
export interface CookieSection {
  readonly signal: AbortSignal;
}

export interface LockBounds {
  readonly clock: Clock;
  /** The longest a section may run: then its requests are aborted and the lock is let go. */
  readonly holdMs: number;
  /** The longest a task waits for the lock before failing closed. */
  readonly waitMs: number;
}

/**
 * Runs `task` within its deadline: once `holdMs` passes it rejects `network` at once, and the
 * section's signal aborts whatever the task still has in flight.
 */
const runSection = <T>(
  bounds: LockBounds,
  task: (section: CookieSection) => Promise<T>,
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const controller = new AbortController();
    const deadline = bounds.clock.setTimeout(() => {
      controller.abort();
      reject(new IdentityError("network"));
    }, bounds.holdMs);
    void (async () => task({ signal: controller.signal }))()
      .then(resolve, reject)
      .finally(() => {
        bounds.clock.clearTimeout(deadline);
      });
  });

/**
 * Runs `task` holding the lock, within the section's deadline. Not granted within `waitMs` (a
 * holder is cut off at its own deadline, so only a holder outside this client's bounds keeps it
 * that long), it fails closed with `network` and never runs: a cookie request sent beside
 * another would let the older answer overwrite the newer cookie. It runs without the lock only
 * when there is no lock manager, or the manager itself fails (a sandboxed frame's
 * SecurityError), whose error never reaches the caller.
 */
export const withLock = <T>(
  locks: LockManagerLike | null,
  name: string,
  bounds: LockBounds,
  task: (section: CookieSection) => Promise<T>,
): Promise<T> => {
  if (locks === null) return runSection(bounds, task);
  return new Promise<T>((resolve, reject) => {
    let waiting = true;
    const run = (): Promise<void> => {
      waiting = false;
      bounds.clock.clearTimeout(gaveUp);
      const running = runSection(bounds, task);
      running.then(resolve, reject);
      return running.then(
        () => undefined,
        () => undefined,
      );
    };
    // Cleared once the task runs, so it fires only while still waiting.
    const gaveUp = bounds.clock.setTimeout(() => {
      waiting = false;
      reject(new IdentityError("network"));
    }, bounds.waitMs);
    // A lock granted once the task ran without it, or gave up waiting, is let go at once.
    const granted = (): Promise<void> => (waiting ? run() : Promise.resolve());
    const managerFailed = (): void => {
      if (waiting) void run();
    };
    try {
      locks.request(name, granted).catch(managerFailed);
    } catch {
      managerFailed();
    }
  });
};

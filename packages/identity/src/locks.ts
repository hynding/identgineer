import type { Clock } from "./clock.ts";

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
 * Runs `task` holding the lock, or without it when the lock manager fails (a sandboxed frame's
 * SecurityError) or does not grant the lock within `waitMs`: the task then risks the race the lock
 * prevents (the cookie refresh's one retry covers the usual case) rather than never running.
 * Only the task's own outcome is passed on, never the lock manager's error.
 */
export const withLock = <T>(
  locks: LockManagerLike | null,
  name: string,
  wait: { readonly clock: Clock; readonly waitMs: number },
  task: () => Promise<T>,
): Promise<T> => {
  if (locks === null) return task();
  return new Promise<T>((resolve, reject) => {
    let started = false;
    const start = (): Promise<void> => {
      started = true;
      wait.clock.clearTimeout(timer);
      const running = task();
      running.then(resolve, reject);
      return running.then(
        () => undefined,
        () => undefined,
      );
    };
    const startUnlocked = (): void => {
      if (!started) void start();
    };
    const timer = wait.clock.setTimeout(startUnlocked, wait.waitMs);
    // A lock granted after the task already ran without it is let go at once.
    const granted = (): Promise<void> => (started ? Promise.resolve() : start());
    try {
      locks.request(name, granted).catch(startUnlocked);
    } catch {
      startUnlocked();
    }
  });
};

import type { LockManagerLike } from "../locks.ts";

/** An in-memory stand-in for `navigator.locks`: share one between clients to act as tabs. */
export const createMemoryLocks = (): LockManagerLike => {
  const tails = new Map<string, Promise<unknown>>();
  return {
    request: <T>(name: string, callback: () => Promise<T>): Promise<T> => {
      const previous = tails.get(name) ?? Promise.resolve();
      const run = previous.then(callback, callback);
      tails.set(
        name,
        run.catch(() => undefined),
      );
      return run;
    },
  };
};

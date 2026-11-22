import type { LockManagerLike } from "../locks.ts";

export interface MemoryLocksOptions {
  /**
   * Whether a request for a lock from within its own holder is caught (default true). It tracks
   * holders along async calls with Node's AsyncLocalStorage, which slows every promise in the
   * process: a test running many thousands of steps may turn it off.
   */
  readonly detectNested?: boolean;
  /**
   * Told of a request for a lock from within that lock's own holder. By default the error is
   * thrown again outside any promise, so the test run fails even though the client goes on.
   */
  readonly onNestedRequest?: (error: Error) => void;
}

/** The lock names held along the current chain of async calls. */
interface HeldLocks {
  run<R>(held: ReadonlySet<string>, callback: () => R): R;
  getStore(): ReadonlySet<string> | undefined;
}

/**
 * Node's AsyncLocalStorage, where the runtime has it (`process.getBuiltinModule`), so this module
 * imports nothing from Node and still loads in a browser, without the check.
 */
const heldLocks = (): HeldLocks | undefined => {
  const runtime = (globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } })
    .process;
  const hooks = runtime?.getBuiltinModule?.("node:async_hooks") as
    { AsyncLocalStorage?: new () => HeldLocks } | undefined;
  return hooks?.AsyncLocalStorage === undefined ? undefined : new hooks.AsyncLocalStorage();
};

const rethrowOutside = (error: Error): void => {
  queueMicrotask(() => {
    throw error;
  });
};

/**
 * An in-memory stand-in for `navigator.locks`: share one between clients to act as tabs. A lock
 * is not re-entrant, as in the browser, where a holder that requests its own lock waits for
 * itself forever; here such a request throws at once (the client then carries on as it does
 * when a lock manager fails) and is reported, so the mistake fails a test instead of hanging it.
 */
export const createMemoryLocks = (options: MemoryLocksOptions = {}): LockManagerLike => {
  const tails = new Map<string, Promise<unknown>>();
  const held = options.detectNested === false ? undefined : heldLocks();
  const onNestedRequest = options.onNestedRequest ?? rethrowOutside;
  return {
    request: <T>(name: string, callback: () => Promise<T>): Promise<T> => {
      const holding = held?.getStore() ?? new Set<string>();
      if (holding.has(name)) {
        const error = new Error(`a holder of the lock "${name}" already holds it`);
        onNestedRequest(error);
        throw error;
      }
      const granted = (): Promise<T> =>
        held === undefined ? callback() : held.run(new Set([...holding, name]), callback);
      const previous = tails.get(name) ?? Promise.resolve();
      const run = previous.then(granted, granted);
      tails.set(
        name,
        run.catch(() => undefined),
      );
      return run;
    },
  };
};

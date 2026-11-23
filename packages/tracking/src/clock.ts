/** Time and timers, injectable so tests do not depend on the wall clock. */
export interface Clock {
  readonly now: () => number;
  readonly setTimeout: (callback: () => void, delayMs: number) => unknown;
  readonly clearTimeout: (handle: unknown) => void;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle) => {
    globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>);
  },
};

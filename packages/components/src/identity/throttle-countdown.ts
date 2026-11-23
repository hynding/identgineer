/** Timers, injectable so a countdown can be tested without waiting. The SDK's `Clock` fits. */
export interface CountdownClock {
  readonly setTimeout: (callback: () => void, delayMs: number) => unknown;
  readonly clearTimeout: (handle: unknown) => void;
}

export const systemTimers: CountdownClock = {
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle) => {
    globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>);
  },
};

const TICK_MS = 1000;

function secondsFrom(read: () => number): number {
  try {
    const seconds = read();
    return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 0;
  } catch {
    return 0;
  }
}

/**
 * Reads how long credential requests are refused (the client's `retryAfterSeconds`) once a second,
 * and reports each reading, down to the zero that ends it. The client is the truth: its wait can
 * grow with another refused attempt, so the countdown never computes the time itself.
 */
export class ThrottleCountdown {
  private timer: unknown;
  private clock?: CountdownClock;

  constructor(private readonly onChange: (seconds: number) => void) {}

  start(read: () => number, clock: CountdownClock): void {
    this.stop();
    this.clock = clock;
    const tick = (): void => {
      this.timer = undefined;
      const seconds = secondsFrom(read);
      this.onChange(seconds);
      if (seconds > 0) this.timer = clock.setTimeout(tick, TICK_MS);
    };
    tick();
  }

  stop(): void {
    if (this.timer !== undefined) this.clock?.clearTimeout(this.timer);
    this.timer = undefined;
  }
}

const twoDigits = (value: number): string => String(value).padStart(2, "0");

/** A wait as a clock reads, `m:ss` or `h:mm:ss`, which needs no plural in any language. */
export function formatWait(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${String(hours)}:${twoDigits(minutes)}:${twoDigits(seconds)}`
    : `${String(minutes)}:${twoDigits(seconds)}`;
}

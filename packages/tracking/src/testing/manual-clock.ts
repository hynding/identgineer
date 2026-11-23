import type { Clock } from "../clock.ts";

export interface ManualClock extends Clock {
  /** Moves time forward, running every timer that comes due on the way, in order. */
  readonly advance: (ms: number) => void;
  /** Sets the clock forward or back without running a timer, as a user or a sync does. */
  readonly jump: (ms: number) => void;
  readonly pendingTimers: () => number;
}

interface Timer {
  readonly id: number;
  readonly due: number;
  readonly callback: () => void;
}

export const createManualClock = (start = 0): ManualClock => {
  let now = start;
  let nextId = 1;
  let timers: Timer[] = [];
  const nextDue = (until: number): Timer | undefined =>
    timers.filter((timer) => timer.due <= until).sort((a, b) => a.due - b.due || a.id - b.id)[0];
  return {
    now: () => now,
    setTimeout: (callback, delayMs) => {
      const id = nextId++;
      timers.push({ id, due: now + Math.max(0, delayMs), callback });
      return id;
    },
    clearTimeout: (handle) => {
      timers = timers.filter((timer) => timer.id !== handle);
    },
    advance: (ms) => {
      const until = now + ms;
      for (let timer = nextDue(until); timer !== undefined; timer = nextDue(until)) {
        const { id } = timer;
        timers = timers.filter((pending) => pending.id !== id);
        now = timer.due;
        timer.callback();
      }
      now = until;
    },
    jump: (ms) => {
      now += ms;
    },
    pendingTimers: () => timers.length,
  };
};
